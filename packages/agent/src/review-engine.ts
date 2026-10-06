import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { isAbsolute, relative, resolve } from 'node:path';
import {
  SustainabilityDetector,
  type SustainabilityBug,
  type SustainabilityFinding,
  type SustainabilityReviewResult,
  type Severity,
} from '@greenops/detect';
import { GreenOpsMeasure } from '@greenops/measure';
import type { Approver, Reasoner } from './contracts.js';
import { PolicyApprover } from './offline-reasoner.js';
import { createDefaultReasoner } from './openai-reasoner.js';
import { simulateSustainabilityImpact } from './impact.js';

export interface SustainabilityReviewOptions {
  changedFiles?: string[];
  commitSha?: string;
  minimumSeverity?: Severity;
  minimumConfidence?: SustainabilityFinding['confidence'];
}

export class SustainabilityReviewEngine {
  public constructor(
    private readonly detector = new SustainabilityDetector(),
    private readonly reasoner: Reasoner = createDefaultReasoner(),
    private readonly approver: Approver = new PolicyApprover(),
    private readonly measure = new GreenOpsMeasure(),
  ) {}

  public async review(
    targetPath: string,
    options: SustainabilityReviewOptions = {},
  ): Promise<SustainabilityReviewResult> {
    const repositoryPath = resolve(targetPath);
    const detection = this.detector.detect(repositoryPath);
    const changed = options.changedFiles
      ? new Set(options.changedFiles.map((path) => normalizePath(path)))
      : undefined;
    const bugs = changed
      ? detection.bugs.filter((bug) =>
          changed.has(toRepositoryPath(repositoryPath, bug.location.filePath)),
        )
      : detection.bugs;

    const allFindings: SustainabilityFinding[] = [];
    for (const bug of bugs) allFindings.push(await this.toFinding(repositoryPath, bug));
    const severityRank: Record<Severity, number> = { low: 1, medium: 2, high: 3 };
    const confidenceRank: Record<SustainabilityFinding['confidence'], number> = {
      low: 1,
      medium: 2,
      high: 3,
    };
    const minimumSeverity = options.minimumSeverity ?? 'low';
    const minimumConfidence = options.minimumConfidence ?? 'low';
    const findings = allFindings.filter(
      (finding) =>
        severityRank[finding.severity] >= severityRank[minimumSeverity] &&
        confidenceRank[finding.confidence] >= confidenceRank[minimumConfidence],
    );

    const severity: Record<Severity, number> = { low: 0, medium: 0, high: 0 };
    let estimatedEnergyKwh = 0;
    let estimatedCarbonKgCo2e = 0;
    for (const finding of findings) {
      severity[finding.severity] += 1;
      estimatedEnergyKwh += finding.impact?.energyKwh ?? 0;
      estimatedCarbonKgCo2e += finding.impact?.carbonKgCo2e ?? 0;
    }

    const generatedAt = new Date().toISOString();
    const identity = options.commitSha
      ? `${repositoryPath}:${options.commitSha}`
      : `${repositoryPath}:working-tree:${generatedAt}`;
    return {
      analysisId: `review_${createHash('sha256').update(identity).digest('hex').slice(0, 12)}`,
      repositoryPath,
      mode: changed ? 'diff' : 'repository',
      commitSha: options.commitSha,
      generatedAt,
      findings,
      summary: {
        filesAnalyzed: changed?.size ?? detection.scanned.files,
        findings: findings.length,
        severity,
        fixesAvailable: findings.filter((finding) => finding.fix.available).length,
        approvalRequired: findings.filter(
          (finding) => finding.fix.available && finding.fix.requiresApproval,
        ).length,
        estimatedEnergyKwh,
        estimatedCarbonKgCo2e,
        verified: findings.filter((finding) => finding.status === 'verified').length,
      },
    };
  }

  private async toFinding(
    repositoryPath: string,
    bug: SustainabilityBug,
  ): Promise<SustainabilityFinding> {
    let codeSnippet: string | undefined;
    try {
      const fullPath = isAbsolute(bug.location.filePath)
        ? bug.location.filePath
        : resolve(repositoryPath, bug.location.filePath);
      if (existsSync(fullPath)) {
        const rawContent = readFileSync(fullPath, 'utf8');
        const lines = rawContent.split(/\r?\n/);
        const start = Math.max(1, bug.location.startLine - 2);
        const end = Math.min(lines.length, (bug.location.endLine || bug.location.startLine) + 2);
        codeSnippet = lines
          .slice(start - 1, end)
          .map((l, i) => {
            const lineNum = start + i;
            const isTarget =
              lineNum >= bug.location.startLine &&
              lineNum <= (bug.location.endLine || bug.location.startLine);
            return `${isTarget ? '>' : ' '} ${String(lineNum).padStart(4, ' ')} | ${l}`;
          })
          .join('\n');
      }
    } catch {
      // ignore read error
    }

    const investigation = await this.reasoner.investigate(bug, codeSnippet);
    const strategy = investigation.strategies.find(
      (candidate) => candidate.id === investigation.recommendedStrategyId,
    );
    const approval = await this.approver.decide(bug, investigation);
    const impact = strategy
      ? simulateSustainabilityImpact(bug, strategy.expectedReductionFactor, this.measure)
      : undefined;
    const available = Boolean(strategy && strategy.expectedReductionFactor > 0);
    const file = toRepositoryPath(repositoryPath, bug.location.filePath);

    return {
      id: bug.id,
      agentId: bug.agentId,
      agentName: bug.agentName,
      category: bug.category,
      severity: bug.severity,
      confidence: bug.category === 'redundant-call' ? 'medium' : 'high',
      file,
      line: bug.location.startLine,
      endLine: bug.location.endLine,
      title: bug.title,
      description: bug.rationale,
      evidence: bug.evidence,
      rootCause: investigation.rootCause,
      reasoning: investigation.reasoning,
      tokensUsed: investigation.tokensUsed,
      analysis: investigation.analysis,
      codeSnippet,
      suggestedCode: investigation.suggestedCode,
      impact: impact
        ? { energyKwh: impact.energyKwh, carbonKgCo2e: impact.carbonKgCo2e }
        : undefined,
      recommendation: strategy?.description,
      blastRadius:
        strategy?.effort === 'moderate' ? 'high' : strategy?.effort === 'small' ? 'medium' : 'low',
      fix: {
        available,
        strategyId: strategy?.id,
        requiresApproval: available && !approval.approved,
        trivial: strategy?.effort === 'trivial',
        reversible: strategy?.reversible ?? false,
      },
      status: available ? (approval.approved ? 'fix_proposed' : 'awaiting_approval') : 'detected',
      verification: 'not_run',
    };
  }
}

function normalizePath(path: string): string {
  return path.replaceAll('\\', '/').replace(/^\.\//, '');
}

function toRepositoryPath(repositoryPath: string, filePath: string): string {
  return normalizePath(isAbsolute(filePath) ? relative(repositoryPath, filePath) : filePath);
}
