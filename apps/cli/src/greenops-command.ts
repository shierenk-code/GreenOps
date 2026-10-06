import { existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import pc from 'picocolors';
import { GreenOpsAgent, createReasonerFromEnv } from '@greenops/agent';
import { ConfigLoader } from '@codevitals/config';
import { selectRunApprover } from './terminal-approver.js';
import { SustainabilityLedger } from '@greenops/ledger';
import {
  OrchestratorAgent,
  buildBaselineRollup,
  loadBaselineBundle,
  type PlanItem,
} from '@greenops/agents';
import type { BaselineRollup } from '@greenops/measure';

export interface GreenOpsCommandOptions {
  ledger?: string;
  auto?: boolean;
  approve?: boolean;
  format?: string;
  /** Run the full specialized-agent fleet over mock fixtures instead of the code detector. */
  fleet?: boolean;
  /** Directory holding the mock fixtures (defaults to <target>). */
  mockDir?: string;
  /** Explicit selection takes precedence over GREENOPS_LLM_PROVIDER. */
  provider?: string;
}

/** Map each specialized agent to its mock fixture filename. */
const FLEET_FIXTURES: Record<string, string> = {
  'ai-efficiency': 'ai-usage.json',
  'digital-waste': 'cloud-inventory.json',
  'carbon-incident': 'carbon-timeseries.json',
  architecture: 'iac-resources.json',
  'disaster-recovery': 'dr-config.json',
  collaboration: 'collab-catalog.json',
  'pipeline-efficiency': 'pipelines.json',
};

/** A directory containing this file is an Azure subscription baseline shared by every agent. */
const BASELINE_FILE = 'subscription.json';

/**
 * `greenops run [path]` — execute the full Detect->Verify sustainability loop and
 * write the Sustainability Ledger. Runs fully offline by default (no API key).
 *
 * With --fleet, the multi-agent ORCHESTRATOR runs every specialized agent against
 * its mock fixture, aggregates the findings, and feeds them through the SAME loop.
 */
export async function runGreenOps(
  targetPath: string,
  options: GreenOpsCommandOptions,
): Promise<void> {
  // pnpm runs filtered package scripts from the package directory. INIT_CWD keeps
  // paths supplied to the root-level `pnpm codevitals ...` command relative to
  // the directory in which the operator actually invoked it.
  const invocationDirectory = process.env.INIT_CWD || process.cwd();
  const path = resolve(invocationDirectory, targetPath || '.');
  const ledgerPath = resolve(invocationDirectory, options.ledger || './greenops-ledger.json');
  const policy = ConfigLoader.load(path).greenops!;
  if (!policy.enabled || !policy.local.enabled)
    throw new Error('Local GreenOps runs are disabled by repository policy.');
  const approver = selectRunApprover(policy.fixes, options);
  const reasoner = createReasonerFromEnv({
    ...process.env,
    ...(options.provider ? { GREENOPS_LLM_PROVIDER: options.provider } : {}),
  });

  // eslint-disable-next-line no-console
  console.log(pc.bold(pc.green('GreenOps Engineering — Sustainability Loop')));
  // eslint-disable-next-line no-console
  console.log(
    pc.dim(`Mode:   ${options.fleet ? 'multi-agent fleet (mock data)' : 'code analysis'}`),
  );
  // eslint-disable-next-line no-console
  console.log(pc.dim(`Target: ${path}`));
  // eslint-disable-next-line no-console
  console.log(pc.dim(`Ledger: ${ledgerPath}`));
  // Configuration is not proof of a successful model response; each result is recorded separately.
  // eslint-disable-next-line no-console
  console.log(pc.dim(`Reasoner configured: ${reasoner.name}`));
  if (options.fleet) {
    // eslint-disable-next-line no-console
    console.log(
      pc.yellow(
        'Scope:  assessment and decision simulation over synthetic fixtures; operational changes are not applied.',
      ),
    );
  }
  // eslint-disable-next-line no-console
  console.log('');

  // Build the orchestrator bugsProvider when --fleet is set.
  let bugsProvider:
    | (() => {
        bugs: import('@greenops/detect').SustainabilityBug[];
        scanned: Record<string, number>;
      })
    | undefined;
  let rollupProvider: ConstructorParameters<typeof GreenOpsAgent>[0]['rollupProvider'] | undefined;
  if (options.fleet) {
    const mockDir = resolve(invocationDirectory, options.mockDir || path);
    const orchestrator = new OrchestratorAgent();
    const baselinePath = join(mockDir, BASELINE_FILE);
    const useBaseline = existsSync(baselinePath);
    if (useBaseline) {
      // eslint-disable-next-line no-console
      console.log(pc.dim(`Source: Azure subscription baseline ${baselinePath}`));
    }
    const plan: PlanItem[] = orchestrator.list().map((agent) => ({
      agent,
      sourcePath: useBaseline
        ? baselinePath
        : join(mockDir, FLEET_FIXTURES[agent.id] ?? `${agent.id}.json`),
    }));
    bugsProvider = () => {
      const result = orchestrator.run(plan, (msg) => {
        // eslint-disable-next-line no-console
        console.log(pc.magenta('  ⟐'), msg);
      });
      const scanned: Record<string, number> = { agents: result.findings.length };
      for (const f of result.findings) scanned[f.agentId] = f.bugs.length;
      return { bugs: result.bugs, scanned, trace: result.trace };
    };
    if (useBaseline) {
      rollupProvider = ({ bugs, approvedBugIds, selfCost }) =>
        buildBaselineRollup(loadBaselineBundle(baselinePath), bugs, {
          approvedBugIds,
          agentUsage: selfCost,
        });
    }
  }

  const agent = new GreenOpsAgent({
    targetPath: path,
    ledgerPath,
    approver,
    reasoner,
    bugsProvider,
    rollupProvider,
    onEvent: (msg) => {
      // eslint-disable-next-line no-console
      console.log(pc.cyan('  ›'), msg);
    },
  });

  await agent.run();

  const ledger = new SustainabilityLedger(ledgerPath);
  const outcomes = ledger.allOutcomes();
  const last = outcomes[outcomes.length - 1];

  // eslint-disable-next-line no-console
  console.log('');
  // eslint-disable-next-line no-console
  console.log(pc.bold('Run Summary'));
  if (last) {
    const kwh = (n: number | null) => (n === null ? 'unknown' : n.toPrecision(3));
    // eslint-disable-next-line no-console
    console.log(`  Bugs detected:   ${last.bugsDetected}`);
    // eslint-disable-next-line no-console
    console.log(`  Bugs improved:   ${last.bugsImproved}`);
    // eslint-disable-next-line no-console
    console.log(
      `  Energy avoided:  ${kwh(last.savings.energyKwh)} kWh ` +
        (last.bugsImproved > 0
          ? '(estimated conversion of verified changes)'
          : '(no change was applied and verified)'),
    );
    // eslint-disable-next-line no-console
    console.log(`  Carbon avoided:  ${kwh(last.savings.carbonKgCo2e)} kgCO2e`);
    // eslint-disable-next-line no-console
    console.log(
      `  GreenOps cost:   ${kwh(last.selfCost.energyKwh)} kWh (${last.selfCost.tokens === null ? `${last.selfCost.knownTokens} reported tokens; usage missing for ${last.selfCost.unknownLlmCalls} model attempt(s)` : `${last.selfCost.tokens} tokens`}, ${last.selfCost.toolCalls} tool calls, ${last.selfCost.retries} retries)`,
    );
    // eslint-disable-next-line no-console
    console.log(
      last.net.energyKwh === null
        ? `  ${pc.bold('NET:')}            unknown — provider usage is incomplete; no net-impact claim.`
        : `  ${pc.bold('Estimated NET:')}  ${last.net.energyKwh >= 0 ? pc.green('+' + kwh(last.net.energyKwh)) : pc.red(kwh(last.net.energyKwh))} kWh ` +
            `(${last.net.netPositive ? pc.green('net positive ✓') : pc.red('not net positive')})`,
    );
  }
  if (last?.baselineRollup) printRollup(last.baselineRollup);
  // eslint-disable-next-line no-console
  console.log('');
  // eslint-disable-next-line no-console
  console.log(pc.dim(`Full traceable journey written to ${ledgerPath}`));
}

const fmt = (n: number | null, digits = 3) => (n === null ? 'unknown' : n.toPrecision(digits));

/** Executive summary of an Azure subscription baseline run (modeled, not verified). */
function printRollup(r: BaselineRollup): void {
  const lines: string[] = [
    '',
    pc.bold(`Subscription rollup — ${r.organization} (${r.subscriptionId})`),
    pc.yellow(
      `  Evidence: ${r.evidenceKind}${r.provenance === 'synthetic' ? ' subscription' : ''}; modeled for ${r.period.hours} h, not verified.`,
    ),
    `  Current burn:      ${fmt(r.current.energyKwh)} kWh, ${fmt(r.current.kgCo2e)} kgCO2e`,
    `  Identified saving: ${fmt(r.identifiedSaving.energyKwh)} kWh, ${fmt(r.identifiedSaving.kgCo2e)} kgCO2e` +
      (r.savingSharePct === null ? '' : ` (${r.savingSharePct}% of carbon)`),
    `  Optimized burn:    ${fmt(r.optimized.energyKwh)} kWh, ${fmt(r.optimized.kgCo2e)} kgCO2e`,
    `  Maturity:          ${r.maturity.current.grade} (${r.maturity.current.score}/100) now -> ${r.maturity.projected.grade} (${r.maturity.projected.score}/100) if all findings are applied`,
    `  Break-even:        ${r.breakEven.note}`,
    '  Top teams by identified saving:',
    ...r.byTeam
      .filter((t) => (t.saving.kgCo2e ?? 0) > 0)
      .slice(0, 5)
      .map(
        (t) =>
          `    ${t.team.padEnd(14)} ${fmt(t.saving.kgCo2e)} kgCO2e of ${fmt(t.current.kgCo2e)} (${t.findings} findings)`,
      ),
  ];
  // eslint-disable-next-line no-console
  console.log(lines.join('\n'));
}
