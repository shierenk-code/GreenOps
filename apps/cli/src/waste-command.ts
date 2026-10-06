import { Command } from 'commander';
import { mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { ConfigLoader } from '@codevitals/config';
import { SustainabilityLedger } from '@greenops/ledger';
import { withOperationalRun } from './operational-run.js';
import {
  OrchestratorAgent,
  KubectlWasteReader,
  reviewWastePlan,
  simulateWastePlan,
  wasteDemo,
  type WasteInventory,
  type WasteUsage,
  type WastePlan,
  type WasteDecision,
} from '@greenops/agents';

const pathFor = (s: string) => resolve(process.env.INIT_CWD || process.cwd(), s);
function read<T>(s: string): T {
  const path = pathFor(s);
  if (statSync(path).size > 4 * 1024 * 1024) throw new Error('Waste input exceeds 4 MiB.');
  const content = readFileSync(path, 'utf8');
  try {
    return JSON.parse(content) as T;
  } catch {
    throw new Error('Invalid waste input JSON; contents are not logged.');
  }
}
function save(s: string, value: unknown) {
  const path = pathFor(s);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(value, null, 2), {
    encoding: 'utf8',
    flag: 'wx',
    mode: 0o600,
  });
}
function separate(...files: Array<string | undefined>) {
  const paths = files
    .filter((s): s is string => !!s)
    .map((s) => (process.platform === 'win32' ? pathFor(s).toLowerCase() : pathFor(s)));
  if (new Set(paths).size !== paths.length)
    throw new Error('Inputs, outputs and audit ledger must use separate paths.');
}
function enabled() {
  const policy = ConfigLoader.load(process.env.INIT_CWD || process.cwd()).greenops!;
  if (!policy.enabled || !policy.local.enabled)
    throw new Error('Repository policy disables this operation.');
}
function print(value: unknown) {
  // eslint-disable-next-line no-console
  console.log(JSON.stringify(value, null, 2));
}
const safe = (fn: () => Promise<void> | void) =>
  Promise.resolve()
    .then(() => {
      enabled();
      return fn();
    })
    .catch((error: unknown) => {
      // eslint-disable-next-line no-console
      console.error(error instanceof Error ? error.message : 'Digital Waste command failed.');
      process.exitCode = 1;
    });
function audit(
  path: string,
  plan: WastePlan,
  stage: 'detect' | 'approve' | 'simulate',
  data: Record<string, unknown>,
) {
  new SustainabilityLedger(pathFor(path)).append({
    runId: plan.id,
    bugId: typeof data.findingId === 'string' ? data.findingId : 'digital-waste-inventory',
    stage,
    summary: `Digital Waste: ${stage}`,
    data,
  });
}
function summary(plan: WastePlan) {
  return {
    planId: plan.id,
    mode: plan.inventory.mode,
    realExecutionEnabled: false,
    coverage: plan.inventory.coverage,
    warnings: plan.inventory.warnings,
    readyForReview: plan.findings.filter((f) => f.status === 'ready-for-review').length,
    needsEvidence: plan.findings.filter((f) => f.status === 'needs-evidence').length,
    findings: plan.findings,
    note: 'Plan and review only. No live deletion or resizing is available; resource capacity is not measured carbon savings.',
  };
}

export function registerWasteCommands(parent: Command) {
  const waste = parent
    .command('waste')
    .description(
      'Read-only AKS inventory, evidence-backed waste plans and approved synthetic simulations',
    );
  waste
    .command('discover')
    .requiredOption('--context <name>')
    .requiredOption('--namespace <name>')
    .requiredOption('--output <path>')
    .option('--ledger <path>', 'Local audit file', './.tmp/waste-ledger.json')
    .action((options) =>
      safe(async () => {
        separate(options.output, options.ledger);
        return withOperationalRun(
          pathFor(options.ledger),
          'digital-waste',
          'discover',
          'live-read',
          async (run) => {
            const result = await new OrchestratorAgent().runOperational(
              {
                kind: 'waste-discover',
                target: { context: options.context, namespace: options.namespace },
                reader: new KubectlWasteReader(),
              },
              run,
            );
            save(options.output, result);
            print({
              mode: result.mode,
              workloads: result.workloads.length,
              volumes: result.volumes.length,
              coverage: result.coverage,
              warnings: result.warnings,
            });
            if (Object.values(result.coverage).every((value) => value === 'unavailable'))
              throw new Error(
                'All inventory queries were unavailable; see the saved coverage report.',
              );
          },
        );
      }),
    );
  waste
    .command('plan <inventory>')
    .option('--usage <path>', 'Historical utilization JSON; no single-snapshot rightsizing')
    .requiredOption('--output <path>')
    .option('--ledger <path>', 'Local audit file', './.tmp/waste-ledger.json')
    .action((file, options) =>
      safe(() => {
        separate(file, options.usage, options.output, options.ledger);
        return withOperationalRun(
          pathFor(options.ledger),
          'digital-waste',
          'plan',
          'local',
          async (run) => {
            const plan = await new OrchestratorAgent().runOperational(
              {
                kind: 'waste-plan',
                inventory: read<WasteInventory>(file),
                usage: options.usage ? read<WasteUsage[]>(options.usage) : [],
              },
              run,
            );
            run.relatedPlanId = plan.id;
            save(options.output, plan);
            audit(options.ledger, plan, 'detect', { plan, realCloudChanges: 0 });
            print(summary(plan));
          },
        );
      }),
    );
  waste
    .command('review <plan>')
    .requiredOption('--finding <id>')
    .requiredOption('--decision <approve|reject>')
    .requiredOption(
      '--reviewer <label>',
      'Self-declared local reviewer; not authenticated identity',
    )
    .requiredOption('--reason <text>')
    .requiredOption('--output <path>')
    .option('--ledger <path>', 'Local audit file', './.tmp/waste-ledger.json')
    .action((file, options) =>
      safe(() => {
        separate(file, options.output, options.ledger);
        return withOperationalRun(
          pathFor(options.ledger),
          'digital-waste',
          'review',
          'local',
          async (run) => {
            const plan = read<WastePlan>(file);
            run.relatedPlanId = plan.id;
            const decision = reviewWastePlan(
              plan,
              options.finding,
              options.decision,
              options.reviewer,
              options.reason,
            );
            save(options.output, decision);
            audit(options.ledger, plan, 'approve', {
              ...decision,
              applied: false,
              identity: 'self-declared',
            });
            print(decision);
          },
        );
      }),
    );
  waste
    .command('simulate <plan> <decision> <inventory>')
    .requiredOption('--output <path>')
    .option('--ledger <path>', 'Local audit file', './.tmp/waste-ledger.json')
    .action((file, decisionFile, inventoryFile, options) =>
      safe(() => {
        separate(file, decisionFile, inventoryFile, options.output, options.ledger);
        return withOperationalRun(
          pathFor(options.ledger),
          'digital-waste',
          'simulate',
          'synthetic',
          async (run) => {
            const plan = read<WastePlan>(file);
            run.relatedPlanId = plan.id;
            const result = simulateWastePlan(
              plan,
              read<WasteDecision>(decisionFile),
              read<WasteInventory>(inventoryFile),
            );
            save(options.output, result);
            audit(options.ledger, plan, 'simulate', result);
            print(result);
          },
        );
      }),
    );
  waste
    .command('demo')
    .option(
      '--simulate',
      'Simulate review and changes in memory; no real human approval or cloud writes',
    )
    .option('--output <path>', 'Save plan to a new JSON file')
    .option('--inventory-output <path>')
    .option('--usage-output <path>')
    .option('--ledger <path>', 'Local audit file', './.tmp/waste-demo-ledger.json')
    .action((options) =>
      safe(() => {
        separate(options.output, options.inventoryOutput, options.usageOutput, options.ledger);
        return withOperationalRun(
          pathFor(options.ledger),
          'digital-waste',
          'demo',
          'synthetic',
          async (run) => {
            const now = new Date(),
              demo = wasteDemo(now),
              plan = await new OrchestratorAgent().runOperational(
                { kind: 'waste-plan', inventory: demo.inventory, usage: demo.usage, now },
                run,
              );
            run.relatedPlanId = plan.id;
            if (options.inventoryOutput) save(options.inventoryOutput, demo.inventory);
            if (options.usageOutput) save(options.usageOutput, demo.usage);
            if (options.output) save(options.output, plan);
            audit(options.ledger, plan, 'detect', { plan, realCloudChanges: 0 });
            print(summary(plan));
            if (options.simulate)
              for (const finding of plan.findings.filter((f) => f.status === 'ready-for-review')) {
                const decision = reviewWastePlan(
                  plan,
                  finding.id,
                  'approve',
                  'synthetic-review-not-a-human',
                  'Demonstration only; not actual authorization',
                  now,
                );
                audit(options.ledger, plan, 'approve', { ...decision, mode: 'simulation' });
                // Independent scenarios: each starts from the same original snapshot, not an aggregate savings total.
                const result = simulateWastePlan(plan, decision, demo.inventory, now);
                audit(options.ledger, plan, 'simulate', result);
                print({
                  findingId: finding.id,
                  mode: result.mode,
                  potentialImpact: result.potentialImpact,
                  realCloudChanges: 0,
                  savingsVerified: false,
                  note: result.note,
                });
              }
          },
        );
      }),
    );
}
