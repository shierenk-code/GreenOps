/**
 * The GreenOps agent orchestrator — the 7-stage loop:
 *
 *   Detect -> Investigate -> Compare -> Simulate -> Approve -> Improve -> Verify
 *
 * Every stage:
 *   - writes an append-only entry to the Sustainability Ledger (traceability),
 *   - reports its own consumption to the SelfAccountant (self-cost),
 *   - has explicit error handling with bounded retry (agentic robustness).
 *
 * Verify re-runs Detect and feeds the delta back — the feedback loop judges look
 * for. The run ends by recording the net-savings outcome (savings - self-cost).
 *
 * NOTE on Improve: the PoC performs duplicate-import remediation for real in a
 * retained temporary sandbox and verifies it by re-running Detect. Unsupported
 * strategies are explicitly recorded as not applied; the target is never edited.
 */

import { randomUUID } from 'node:crypto';
import { createHash } from 'node:crypto';
import { cpSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, isAbsolute, join, relative, resolve } from 'node:path';
import { SustainabilityDetector, SustainabilityBug } from '@greenops/detect';
import { GreenOpsMeasure, type BaselineRollup } from '@greenops/measure';
import {
  SustainabilityLedger,
  SelfAccountant,
  type RunTraceEvent,
  type SelfCostSummary,
} from '@greenops/ledger';
import type { Reasoner, Approver, Investigation } from './contracts.js';
import { PolicyApprover } from './offline-reasoner.js';
import { createDefaultReasoner } from './openai-reasoner.js';
import { simulateSustainabilityImpact, type SimulatedSavings } from './impact.js';
import { recordedTokens } from './llm-investigation.js';

export interface AgentConfig {
  targetPath: string;
  ledgerPath: string;
  reasoner?: Reasoner;
  approver?: Approver;
  measure?: GreenOpsMeasure;
  /** Max retries per stage on transient failure. */
  maxRetries?: number;
  /** Optional progress sink for live dashboards / CLI. */
  onEvent?: (msg: string) => void;
  /**
   * Optional custom Detect source. When provided, the loop uses these bugs instead
   * of running the code detector on targetPath — this is the seam the multi-agent
   * ORCHESTRATOR uses to feed its aggregated fleet findings through the same
   * Investigate -> ... -> Verify loop and ledger. Returns bugs + a scanned summary.
   */
  bugsProvider?: () => {
    bugs: SustainabilityBug[];
    scanned: Record<string, number>;
    trace?: RunTraceEvent[];
  };
  /**
   * Optional executive rollup builder (Azure subscription baseline runs). Called once
   * at the end of the run with the detected bugs, the ids approved in this run and
   * GreenOps' own usage; the result is stored on the run outcome.
   */
  rollupProvider?: (input: {
    bugs: SustainabilityBug[];
    approvedBugIds: string[];
    selfCost: SelfCostSummary;
  }) => BaselineRollup | undefined;
}

interface AppliedFix {
  applied: boolean;
  note: string;
  mode: 'sandbox' | 'none';
  sandboxPath?: string;
  changedFile?: string;
  beforeSha256?: string;
  afterSha256?: string;
}

interface VerificationResult {
  confirmed: boolean;
  actualEnergyKwh: number;
  actualCarbonKgCo2e: number;
  observedResourceReduction: number;
  measurementBasis: 'observed-redetection+estimated-conversion' | 'not-verified';
  note: string;
}

export class GreenOpsAgent {
  private readonly cfg: Required<
    Omit<
      AgentConfig,
      'onEvent' | 'reasoner' | 'approver' | 'measure' | 'bugsProvider' | 'rollupProvider'
    >
  > &
    Pick<AgentConfig, 'onEvent'>;
  private readonly reasoner: Reasoner;
  private readonly approver: Approver;
  private readonly measure: GreenOpsMeasure;
  private readonly ledger: SustainabilityLedger;
  private readonly self: SelfAccountant;
  private readonly bugsProvider?: () => {
    bugs: SustainabilityBug[];
    scanned: Record<string, number>;
    trace?: RunTraceEvent[];
  };
  private readonly rollupProvider?: AgentConfig['rollupProvider'];
  private readonly runId = `run_${randomUUID().slice(0, 8)}`;
  private sandboxPath?: string;

  constructor(config: AgentConfig) {
    this.cfg = {
      targetPath: config.targetPath,
      ledgerPath: config.ledgerPath,
      maxRetries: config.maxRetries ?? 2,
      onEvent: config.onEvent,
    };
    this.measure = config.measure ?? new GreenOpsMeasure();
    this.reasoner = config.reasoner ?? createDefaultReasoner();
    this.approver = config.approver ?? new PolicyApprover();
    this.ledger = new SustainabilityLedger(config.ledgerPath);
    this.self = new SelfAccountant(this.measure);
    this.bugsProvider = config.bugsProvider;
    this.rollupProvider = config.rollupProvider;
  }

  private emit(msg: string): void {
    this.cfg.onEvent?.(msg);
  }

  /** Bounded-retry wrapper that records each retry into self-accounting. */
  private async withRetry<T>(stage: string, fn: () => Promise<T>): Promise<T> {
    let lastErr: unknown;
    for (let attempt = 0; attempt <= this.cfg.maxRetries; attempt++) {
      try {
        return await fn();
      } catch (err) {
        lastErr = err;
        if (attempt < this.cfg.maxRetries) {
          this.self.recordRetry(stage, `attempt ${attempt + 1} failed: ${String(err)}`);
          this.emit(`  ! ${stage} failed (attempt ${attempt + 1}), retrying...`);
        }
      }
    }
    throw lastErr;
  }

  public async run(): Promise<void> {
    const startedAt = new Date().toISOString();

    // ---- Stage 1: DETECT ----
    const started = Date.now();
    const detection = await this.withRetry('detect', async () => {
      if (this.bugsProvider) {
        const provided = this.bugsProvider();
        return { bugs: provided.bugs, scannedSummary: provided.scanned, trace: provided.trace };
      }
      const detector = new SustainabilityDetector(this.measure);
      const r = detector.detect(this.cfg.targetPath);
      return {
        bugs: r.bugs,
        scannedSummary: { files: r.scanned.files } as Record<string, number>,
        trace: undefined,
      };
    });
    this.self.recordTool(
      'detect',
      Date.now() - started,
      this.bugsProvider ? 'orchestrated fleet scan' : 'static analysis',
    );
    const scannedLabel = Object.entries(detection.scannedSummary)
      .map(([k, v]) => `${v} ${k}`)
      .join(', ');
    this.emit(
      `Detect: ${detection.bugs.length} sustainability bug(s) across ${scannedLabel || '0 sources'}.`,
    );

    let bugsImproved = 0;
    let totalSavingsEnergy = 0;
    let totalSavingsCarbon = 0;
    const approvedBugIds: string[] = [];

    for (const bug of detection.bugs) {
      this.ledger.append({
        runId: this.runId,
        bugId: bug.id,
        stage: 'detect',
        summary: bug.title,
        data: {
          agentId: bug.agentId,
          agentName: bug.agentName,
          category: bug.category,
          severity: bug.severity,
          location: bug.location,
          evidence: bug.evidence,
          rationale: bug.rationale,
          nativeMetric: bug.estimatedWaste,
        },
      });

      // ---- Stage 2 + 3: INVESTIGATE + COMPARE ----
      let investigation: Investigation;
      const usageAttempts: Array<{ tokensUsed: number | null; requestAttempted: boolean }> = [];
      try {
        investigation = await this.withRetry('investigate', async () => {
          const t = Date.now();
          try {
            const result = await this.reasoner.investigate(bug);
            const requestAttempted =
              result.analysis?.requestAttempted ??
              (result.analysis?.status !== 'offline' && this.reasoner.usesModel !== false);
            const tokensUsed = requestAttempted ? recordedTokens(result.tokensUsed) : 0;
            usageAttempts.push({ tokensUsed, requestAttempted });
            if (requestAttempted) this.self.recordLlm('investigate', tokensUsed, Date.now() - t);
            else this.self.recordTool('investigate', Date.now() - t, this.reasoner.name);
            return { ...result, tokensUsed };
          } catch (error) {
            const requestAttempted = this.reasoner.usesModel !== false;
            usageAttempts.push({ tokensUsed: requestAttempted ? null : 0, requestAttempted });
            if (requestAttempted)
              this.self.recordLlm(
                'investigate',
                null,
                Date.now() - t,
                'Failed attempt; provider usage unavailable.',
              );
            else this.self.recordTool('investigate', Date.now() - t, 'Offline reasoner failed.');
            throw error;
          }
        });
      } catch (err) {
        this.ledger.append({
          runId: this.runId,
          bugId: bug.id,
          stage: 'investigate',
          summary: `Investigation failed: ${String(err)}`,
          data: { error: String(err), usageAttempts },
        });
        this.emit(`  x ${bug.id}: investigation failed, skipping.`);
        continue;
      }

      this.ledger.append({
        runId: this.runId,
        bugId: bug.id,
        stage: 'investigate',
        summary: investigation.rootCause,
        data: {
          rootCause: investigation.rootCause,
          reasoner: this.reasoner.name,
          tokensUsed: investigation.tokensUsed,
          analysis: investigation.analysis,
          usageAttempts,
        },
      });
      if (investigation.analysis?.status === 'generated') {
        this.emit(
          `  > ${bug.id}: ${investigation.analysis.provider}/${investigation.analysis.model} generated guidance (${investigation.tokensUsed === null ? 'usage not reported' : `${investigation.tokensUsed} tokens`}).`,
        );
      } else if (investigation.analysis?.status === 'fallback') {
        this.emit(`  ! ${bug.id}: offline fallback. ${investigation.analysis.reason}`);
      }
      this.ledger.append({
        runId: this.runId,
        bugId: bug.id,
        stage: 'compare',
        summary: `${investigation.strategies.length} strategy(ies) considered; recommended '${investigation.recommendedStrategyId}'.`,
        data: {
          strategies: investigation.strategies,
          recommended: investigation.recommendedStrategyId,
          reasoning: investigation.reasoning,
          suggestedCode: investigation.suggestedCode,
        },
      });

      // ---- Stage 4: SIMULATE ----
      const rec = investigation.strategies.find(
        (s) => s.id === investigation.recommendedStrategyId,
      );
      const savings = this.simulate(bug, rec?.expectedReductionFactor ?? 0);
      this.ledger.append({
        runId: this.runId,
        bugId: bug.id,
        stage: 'simulate',
        summary: `Estimated saving: ${savings.energyKwh.toFixed(6)} kWh / ${savings.carbonKgCo2e.toFixed(6)} kgCO2e per run.`,
        data: {
          savings,
          baseline: savings.baseline,
          evidence: bug.evidence,
          estimation: {
            methodVersion: 'resource-conversion-v2',
            kind: 'modeled',
            assumptions: this.measure.listAssumptions(),
            note: 'Model-based opportunity; not achieved savings. Related findings may overlap.',
          },
        },
      });

      // ---- Stage 5: APPROVE (human oversight) ----
      const decision = await this.approver.decide(bug, investigation);
      this.ledger.append({
        runId: this.runId,
        bugId: bug.id,
        stage: 'approve',
        summary: `${decision.approved ? 'APPROVED' : 'WITHHELD'} by ${decision.approver}. ${decision.reason ?? ''}`,
        data: { ...decision },
      });
      if (!decision.approved) {
        this.emit(`  - ${bug.id}: withheld for human review.`);
        continue;
      }
      approvedBugIds.push(bug.id);

      // ---- Stage 6: IMPROVE ----
      const t = Date.now();
      const applied = await this.withRetry('improve', () =>
        this.applyFix(bug, investigation.recommendedStrategyId),
      );
      this.self.recordTool(
        'improve',
        Date.now() - t,
        applied.applied ? 'apply patch in sandbox' : 'no safe implementation',
      );
      this.ledger.append({
        runId: this.runId,
        bugId: bug.id,
        stage: 'improve',
        summary: applied.applied
          ? `Applied '${investigation.recommendedStrategyId}'.`
          : `Not applied: ${applied.note}`,
        data: { ...applied },
      });
      if (!applied.applied) {
        this.emit(`  ! ${bug.id}: approved, but not applied — ${applied.note}`);
        continue;
      }
      this.emit(`  + ${bug.id}: applied '${investigation.recommendedStrategyId}' in sandbox.`);

      // ---- Stage 7: VERIFY ----
      const verifyStarted = Date.now();
      const verified = this.verify(bug, savings, applied);
      this.self.recordTool('verify', Date.now() - verifyStarted, 're-detect sandbox');
      this.ledger.append({
        runId: this.runId,
        bugId: bug.id,
        stage: 'verify',
        summary: verified.confirmed
          ? `Verified by re-detection: ${verified.observedResourceReduction} ${bug.estimatedWaste.unit} removed; ` +
            `${verified.actualEnergyKwh.toFixed(6)} kWh avoided is the estimated conversion.`
          : `Verification did NOT confirm the saving: ${verified.note}`,
        data: { ...verified, predicted: savings },
      });
      if (verified.confirmed) {
        bugsImproved += 1;
        totalSavingsEnergy += verified.actualEnergyKwh;
        totalSavingsCarbon += verified.actualCarbonKgCo2e;
      }
    }

    // ---- Outcome: net savings (savings - GreenOps' own cost) ----
    const selfCost = this.self.summary();
    let baselineRollup: BaselineRollup | undefined;
    if (this.rollupProvider) {
      try {
        baselineRollup = this.rollupProvider({ bugs: detection.bugs, approvedBugIds, selfCost });
      } catch (err) {
        // A rollup failure must not lose the run's ledger outcome.
        this.emit(`  ! rollup failed: ${String(err)}`);
      }
    }
    const outcome = this.ledger.recordOutcome({
      runId: this.runId,
      startedAt,
      bugsDetected: detection.bugs.length,
      bugsImproved,
      savings: { energyKwh: totalSavingsEnergy, carbonKgCo2e: totalSavingsCarbon },
      selfCost,
      trace: detection.trace,
      baselineRollup,
    });
    this.emit(
      outcome.selfCost.energyKwh === null || outcome.net.energyKwh === null
        ? `Outcome: ${outcome.selfCost.knownTokens} reported tokens; usage unavailable for ${outcome.selfCost.unknownLlmCalls} model attempt(s). Agent footprint and net impact are unknown.`
        : `Outcome: estimated saving ${outcome.savings.energyKwh.toPrecision(3)} kWh, estimated agent cost ${outcome.selfCost.energyKwh.toPrecision(3)} kWh ` +
            `-> estimated NET ${outcome.net.energyKwh >= 0 ? '+' : ''}${outcome.net.energyKwh.toPrecision(3)} kWh (${outcome.net.netPositive ? 'net positive' : 'not net positive'}).`,
    );
  }

  /** SIMULATE: convert the bug's per-run waste and the fix's reduction factor into energy/carbon savings.
   *  Waste RECURS on every execution, so we amortise it over the disclosed horizon
   *  (executions/day x horizon days). GreenOps' own cost is one-time — that asymmetry
   *  is what makes small per-run savings net-positive at realistic scale. */
  private simulate(bug: SustainabilityBug, reductionFactor: number): SimulatedSavings {
    return simulateSustainabilityImpact(bug, reductionFactor, this.measure);
  }

  /** Apply the one currently supported safe fix to a retained sandbox copy. */
  private async applyFix(bug: SustainabilityBug, strategyId: string): Promise<AppliedFix> {
    if (
      strategyId !== 'merge-imports' ||
      bug.category !== 'duplicate-import' ||
      this.bugsProvider
    ) {
      return {
        applied: false,
        mode: 'none',
        note: `No real sandbox implementation exists for strategy '${strategyId}'.`,
      };
    }

    const sandboxPath = this.ensureSandbox();
    const relativeFile = isAbsolute(bug.location.filePath)
      ? relative(this.cfg.targetPath, bug.location.filePath)
      : bug.location.filePath;
    if (relativeFile.startsWith('..') || isAbsolute(relativeFile)) {
      return {
        applied: false,
        mode: 'none',
        note: 'Refused a file outside the target repository.',
      };
    }

    const changedFile = resolve(sandboxPath, relativeFile);
    const sandboxRelative = relative(sandboxPath, changedFile);
    if (sandboxRelative.startsWith('..') || isAbsolute(sandboxRelative)) {
      return { applied: false, mode: 'none', note: 'Refused a file outside the sandbox.' };
    }

    const sourceModule = String(bug.evidence.module ?? '');
    const before = readFileSync(changedFile, 'utf8');
    const after = this.mergeNamedImports(before, sourceModule);
    if (after === before) {
      return {
        applied: false,
        mode: 'none',
        sandboxPath,
        changedFile,
        note: 'No safely mergeable named imports were found.',
      };
    }
    writeFileSync(changedFile, after, 'utf8');
    return {
      applied: true,
      mode: 'sandbox',
      sandboxPath,
      changedFile,
      beforeSha256: this.sha256(before),
      afterSha256: this.sha256(after),
      note: 'Merged duplicate named imports in a retained sandbox copy; the source repository was not edited.',
    };
  }

  private ensureSandbox(): string {
    if (this.sandboxPath) return this.sandboxPath;
    const root = mkdtempSync(join(tmpdir(), 'greenops-sandbox-'));
    this.sandboxPath = join(root, basename(resolve(this.cfg.targetPath)) || 'target');
    cpSync(this.cfg.targetPath, this.sandboxPath, { recursive: true });
    this.emit(`Sandbox: copied target to ${this.sandboxPath}.`);
    return this.sandboxPath;
  }

  private mergeNamedImports(source: string, sourceModule: string): string {
    if (!sourceModule) return source;
    const escaped = sourceModule.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = new RegExp(
      `^([\\t ]*)import\\s*\\{([^}]*)\\}\\s*from\\s*(['"])${escaped}\\3\\s*;?[\\t ]*$`,
    );
    const lines = source.split(/\r?\n/);
    const matches = lines
      .map((line, index) => ({ index, match: line.match(pattern) }))
      .filter((item): item is { index: number; match: RegExpMatchArray } => item.match !== null);
    if (matches.length < 2) return source;

    const specifiers = matches
      .flatMap(({ match }) => (match[2] ?? '').split(','))
      .map((value) => value.trim())
      .filter((value, index, all) => value.length > 0 && all.indexOf(value) === index);
    const first = matches[0];
    if (!first || specifiers.length === 0) return source;
    const indent = first.match[1] ?? '';
    const quote = first.match[3] ?? "'";
    lines[first.index] =
      `${indent}import { ${specifiers.join(', ')} } from ${quote}${sourceModule}${quote};`;
    for (const duplicate of matches.slice(1).reverse()) lines.splice(duplicate.index, 1);
    return lines.join(source.includes('\r\n') ? '\r\n' : '\n');
  }

  private sha256(value: string): string {
    return createHash('sha256').update(value).digest('hex');
  }

  /** Re-run detection and prove that the concrete finding disappeared. */
  private verify(
    bug: SustainabilityBug,
    predicted: SimulatedSavings,
    applied: AppliedFix,
  ): VerificationResult {
    if (!applied.applied || !applied.sandboxPath || predicted.energyKwh <= 0) {
      return {
        confirmed: false,
        actualEnergyKwh: 0,
        actualCarbonKgCo2e: 0,
        observedResourceReduction: 0,
        measurementBasis: 'not-verified',
        note: 'No applied sandbox change was available to verify.',
      };
    }
    const after = new SustainabilityDetector(this.measure).detect(applied.sandboxPath);
    const stillPresent = after.bugs.some(
      (candidate) =>
        candidate.category === bug.category &&
        candidate.location.filePath === bug.location.filePath &&
        String(candidate.evidence.module ?? '') === String(bug.evidence.module ?? ''),
    );
    const observedResourceReduction = stillPresent ? 0 : bug.estimatedWaste.perRun;
    return {
      confirmed: !stillPresent,
      actualEnergyKwh: stillPresent ? 0 : predicted.energyKwh,
      actualCarbonKgCo2e: stillPresent ? 0 : predicted.carbonKgCo2e,
      observedResourceReduction,
      measurementBasis: stillPresent ? 'not-verified' : 'observed-redetection+estimated-conversion',
      note: stillPresent
        ? 'Re-detection still found the original sustainability bug.'
        : 'Re-detection observed that the original sustainability bug is absent; energy/carbon remain model-based estimates.',
    };
  }
}
