import { Command } from 'commander';
import { readFileSync, statSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { withCarbonReceipt } from './carbon-receipt-store.js';
import { withOperationalRun } from './operational-run.js';
import { ConfigLoader } from '@codevitals/config';
import { SustainabilityLedger, type LedgerStage } from '@greenops/ledger';
import {
  OrchestratorAgent,
  observeGrid,
  observeCarbonApi,
  NesoGridCarbonProvider,
  KubectlCarbonApi,
  carbonDemo,
  captureCarbonSource,
  executeCarbonPlan,
  observeCarbonJob,
  validateWorkload,
  carbonBenefitPolicy,
  verifyCarbonEvidence,
  carbonEvidenceTemplate,
  type CarbonEvidence,
  type CarbonPlan,
  type CarbonWorkload,
  type CarbonReceipt,
} from '@greenops/agents';

const pathFor = (file: string) => resolve(process.env.INIT_CWD || process.cwd(), file);
function distinctPaths(...files: Array<string | undefined>): void {
  const paths = files
    .filter((f): f is string => !!f)
    .map((f) => {
      const path = pathFor(f);
      return process.platform === 'win32' ? path.toLowerCase() : path;
    });
  if (new Set(paths).size !== paths.length)
    throw new Error('Use separate paths for inputs, outputs and the audit ledger.');
}
function readJson<T>(file: string): T {
  const path = pathFor(file);
  if (statSync(path).size > 2 * 1024 * 1024) throw new Error('Carbon input exceeds 2 MiB.');
  const content = readFileSync(path, 'utf8');
  try {
    return JSON.parse(content) as T;
  } catch {
    throw new Error('Invalid carbon input JSON; input contents are not logged.');
  }
}
function save(file: string, value: unknown): void {
  const path = pathFor(file);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(value, null, 2), { encoding: 'utf8', flag: 'wx' });
}
function enabled(execute = false): void {
  const policy = ConfigLoader.load(process.env.INIT_CWD || process.cwd()).greenops!;
  if (!policy.enabled || !policy.local.enabled || (execute && !policy.fixes.enabled))
    throw new Error('Repository policy disables this operation.');
}
function journal(file: string, plan: CarbonPlan) {
  const ledger = new SustainabilityLedger(pathFor(file));
  return (stage: string, data: Record<string, unknown>) =>
    ledger.append({
      runId: plan.id,
      bugId: plan.workload.id,
      stage: stage as LedgerStage,
      summary: `Carbon scheduling: ${stage}`,
      data,
    });
}
function summary(plan: CarbonPlan): void {
  // eslint-disable-next-line no-console
  console.log(
    JSON.stringify(
      {
        planId: plan.id,
        status: plan.status,
        decisionReason: plan.decisionReason,
        benefitPolicy: carbonBenefitPolicy(plan.workload),
        workload: plan.workload.id,
        baseline: plan.baseline,
        recommendation: plan.status === 'ready' ? plan.selected : null,
        ...(plan.status === 'ready' ? {} : { bestCandidate: plan.selected }),
        projectedReductionKgCo2: plan.projectedReductionKgCo2,
        exclusions: plan.exclusions,
        note: 'Forecast estimate only. No change or verified savings until separately executed and measured.',
      },
      null,
      2,
    ),
  );
}
const safely = (fn: () => Promise<void>) =>
  fn().catch((error: unknown) => {
    // Errors are sanitized in network/execution adapters. Do not print inputs or credentials.
    // eslint-disable-next-line no-console
    console.error(error instanceof Error ? error.message : 'Carbon command failed.');
    process.exitCode = 1;
  });

export function registerCarbonCommands(parent: Command): void {
  const carbon = parent
    .command('carbon')
    .description('Carbon-aware Kubernetes batch planning, approval, dispatch and observation');
  carbon
    .command('evidence-template <plan> <receipt>')
    .description(
      'Create an incomplete measurement worksheet; never substitute forecast numbers for actual evidence',
    )
    .requiredOption('--output <path>', 'Save editable evidence worksheet (new file only)')
    .option('--ledger <path>', 'Audit ledger', './.tmp/carbon-ledger.json')
    .action((planFile, receiptFile, options) =>
      safely(async () => {
        enabled();
        distinctPaths(planFile, receiptFile, options.output, options.ledger);
        return withOperationalRun(
          pathFor(options.ledger),
          'carbon-incident',
          'evidence-template',
          'local',
          async (run) => {
            const plan = readJson<CarbonPlan>(planFile);
            run.relatedPlanId = plan.id;
            save(
              options.output,
              carbonEvidenceTemplate(plan, readJson<CarbonReceipt>(receiptFile)),
            );
            // eslint-disable-next-line no-console
            console.log(
              'Evidence worksheet created. Complete actual measurements, provenance, quality checks and uncertainty before verification.',
            );
          },
        );
      }),
    );
  carbon
    .command('forecast')
    .requiredOption('--region <id>', 'NESO GB grid region ID (1–17)')
    .option('--output <path>', 'Save forecast JSON (new file only)')
    .option('--ledger <path>', 'Audit ledger', './.tmp/carbon-ledger.json')
    .action((options) =>
      safely(async () => {
        enabled();
        distinctPaths(options.output, options.ledger);
        return withOperationalRun(
          pathFor(options.ledger),
          'carbon-incident',
          'forecast',
          'live-read',
          async (run) => {
            const result = await observeGrid(new NesoGridCarbonProvider(), run).forecast(
              Number(options.region),
              new Date(),
            );
            if (options.output) save(options.output, result);
            // eslint-disable-next-line no-console
            console.log(
              JSON.stringify(
                {
                  provider: result.provider,
                  gridRegionId: result.gridRegionId,
                  retrievedAt: result.retrievedAt,
                  source: result.source,
                  unit: result.unit,
                  intervals: result.intervals.length,
                  first: result.intervals[0],
                  last: result.intervals.at(-1),
                },
                null,
                2,
              ),
            );
          },
        );
      }),
    );
  carbon
    .command('plan <workload>')
    .description('Fetch live forecasts and compare allowed windows/regions; no cluster writes')
    .requiredOption('--output <path>', 'Save reviewable plan (new file only)')
    .option('--ledger <path>', 'Audit ledger', './.tmp/carbon-ledger.json')
    .action((file, options) =>
      safely(async () => {
        enabled();
        const workload = readJson<CarbonWorkload>(file);
        distinctPaths(file, options.output, options.ledger);
        validateWorkload(workload);
        return withOperationalRun(
          pathFor(options.ledger),
          'carbon-incident',
          'plan',
          'live-read',
          async (run) => {
            const plan = await new OrchestratorAgent().runOperational(
              { kind: 'carbon-plan', workload, provider: new NesoGridCarbonProvider() },
              run,
            );
            run.relatedPlanId = plan.id;
            save(options.output, plan);
            journal(options.ledger, plan)('simulate', {
              plan,
              applied: false,
              savingsVerified: false,
            });
            summary(plan);
          },
        );
      }),
    );
  carbon
    .command('execute <plan>')
    .description(
      'Explicit human approval, foreground wait, fresh checks, then dispatch a queued Job',
    )
    .requiredOption('--approve', 'Enable interactive approval; never automatically approves')
    .requiredOption('--receipt <path>', 'Write execution receipt (new file only)')
    .option('--ledger <path>', 'Audit ledger', './.tmp/carbon-ledger.json')
    .action((file, options) =>
      safely(async () => {
        enabled(true);
        distinctPaths(file, options.receipt, options.ledger);
        if (!options.approve || !stdin.isTTY || !stdout.isTTY)
          throw new Error('Interactive human approval is mandatory.');
        return withOperationalRun(
          pathFor(options.ledger),
          'carbon-incident',
          'execute',
          'live-execution',
          async (run) => {
            const plan = readJson<CarbonPlan>(file),
              api = observeCarbonApi(new KubectlCarbonApi(), run);
            run.relatedPlanId = plan.id;
            const source = await captureCarbonSource(plan, api);
            summary(plan);
            // eslint-disable-next-line no-console
            console.log(
              JSON.stringify(
                {
                  sourceSnapshot: source,
                  destination: plan.workload.regions.find((r) => r.id === plan.selected?.regionId),
                  warning:
                    'This starts a real batch Job at the approved time. The original remains suspended. Reviewer identity is self-declared.',
                },
                null,
                2,
              ),
            );
            const terminal = createInterface({ input: stdin, output: stdout });
            let reviewer: string, reason: string;
            try {
              if (
                (await terminal.question('Type APPROVE to dispatch this exact plan: ')).trim() !==
                'APPROVE'
              )
                throw new Error('Not approved; no cluster writes.');
              reviewer = (await terminal.question('Reviewer label: ')).trim();
              reason = (await terminal.question('Decision reason: ')).trim();
            } finally {
              terminal.close();
            }
            const event = journal(options.ledger, plan);
            await withCarbonReceipt(
              pathFor(options.receipt),
              {
                planId: plan.id,
                target: plan.workload.regions.find((r) => r.id === plan.selected!.regionId),
                jobName: `go-${plan.workload.sourceJob.slice(0, 20)}-${plan.id.slice(-24)}`,
                source,
              },
              async (persist) => {
                let dispatchConfirmed = false;
                try {
                  const receipt = await executeCarbonPlan(
                    plan,
                    {
                      planId: plan.id,
                      approvedAt: new Date().toISOString(),
                      reviewer,
                      reason,
                      source,
                    },
                    api,
                    observeGrid(new NesoGridCarbonProvider(), run),
                    {
                      event: (stage, data) => {
                        // Save confirmed dispatch before a subsequent audit/status error can hide the receipt.
                        if (data.state === 'dispatched') {
                          persist(data);
                          dispatchConfirmed = true;
                        }
                        event(stage, data);
                      },
                    },
                  );
                  persist(receipt);
                  // eslint-disable-next-line no-console
                  console.log(
                    JSON.stringify(
                      { receipt, status: await observeCarbonJob(receipt, api) },
                      null,
                      2,
                    ),
                  );
                } catch (error) {
                  event('verify', {
                    status: dispatchConfirmed
                      ? 'dispatch-confirmed-follow-up-failed'
                      : 'dispatch-not-confirmed',
                    savingsVerified: false,
                    note: 'Inspect source claim and any suspended target before retrying. No automatic cleanup or duplicate dispatch.',
                  });
                  throw error;
                }
              },
            );
          },
        );
      }),
    );
  carbon
    .command('verify <plan> <receipt> <evidence>')
    .description(
      'Check supplied before/after energy, actual carbon factors, quality and job completion; no cluster writes',
    )
    .requiredOption('--output <path>', 'Save evidence report (new file only)')
    .option('--ledger <path>', 'Audit ledger', './.tmp/carbon-ledger.json')
    .action((planFile, receiptFile, evidenceFile, options) =>
      safely(async () => {
        enabled();
        distinctPaths(planFile, receiptFile, evidenceFile, options.output, options.ledger);
        const plan = readJson<CarbonPlan>(planFile);
        const receipt = readJson<CarbonReceipt>(receiptFile);
        return withOperationalRun(
          pathFor(options.ledger),
          'carbon-incident',
          'verify',
          receipt.mode === 'kubernetes' ? 'live-read' : 'synthetic',
          async (run) => {
            run.relatedPlanId = plan.id;
            const report = await verifyCarbonEvidence(
              plan,
              receipt,
              readJson<CarbonEvidence>(evidenceFile),
              receipt.mode === 'kubernetes'
                ? observeCarbonApi(new KubectlCarbonApi(), run)
                : undefined,
            );
            save(options.output, report);
            journal(options.ledger, plan)('verify', { ...report });
            // eslint-disable-next-line no-console
            console.log(JSON.stringify(report, null, 2));
            if (report.status === 'not-verified')
              throw new Error(
                'Verification requirements were not met; see the exported evidence report.',
              );
          },
        );
      }),
    );
  carbon
    .command('status <receipt>')
    .description('Read Job completion status; never claims measured carbon savings')
    .option('--ledger <path>', 'Audit ledger', './.tmp/carbon-ledger.json')
    .action((file, options) =>
      safely(async () => {
        enabled();
        distinctPaths(file, options.ledger);
        return withOperationalRun(
          pathFor(options.ledger),
          'carbon-incident',
          'status',
          'live-read',
          async (run) => {
            const receipt = readJson<CarbonReceipt>(file);
            run.relatedPlanId = receipt.planId;
            if (receipt.mode !== 'kubernetes')
              throw new Error('Synthetic receipts are not live Kubernetes jobs.');
            // eslint-disable-next-line no-console
            console.log(
              JSON.stringify(
                await observeCarbonJob(receipt, observeCarbonApi(new KubectlCarbonApi(), run)),
                null,
                2,
              ),
            );
          },
        );
      }),
    );
  carbon
    .command('demo')
    .description('Synthetic UK workload; optional public forecasts; never touches a real cluster')
    .option(
      '--live-forecast',
      'Use public NESO forecasts with the synthetic workload (planning only)',
    )
    .option(
      '--simulate',
      'Run simulated approval, dispatch and Job completion (not a real human approval)',
    )
    .option('--output <path>', 'Save the demo plan (new file only)')
    .option(
      '--workload-output <path>',
      'Save editable synthetic workload configuration (new file only)',
    )
    .option('--ledger <path>', 'Audit ledger', './.tmp/carbon-demo-ledger.json')
    .action((options) =>
      safely(async () => {
        enabled();
        if (options.simulate && options.liveForecast)
          throw new Error(
            'Use either live-forecast planning or the accelerated synthetic simulation, not both.',
          );
        distinctPaths(options.output, options.workloadOutput, options.ledger);
        return withOperationalRun(
          pathFor(options.ledger),
          'carbon-incident',
          'demo',
          options.liveForecast ? 'live-read' : 'synthetic',
          async (run) => {
            let clock = new Date();
            const demo = carbonDemo(clock);
            if (options.workloadOutput) save(options.workloadOutput, demo.workload);
            const provider = options.liveForecast ? new NesoGridCarbonProvider() : demo.provider;
            const plan = await new OrchestratorAgent().runOperational(
              { kind: 'carbon-plan', workload: demo.workload, provider, now: clock },
              run,
            );
            run.relatedPlanId = plan.id;
            if (options.output) save(options.output, plan);
            summary(plan);
            const event = journal(options.ledger, plan);
            event('simulate', { mode: 'synthetic', plan, appliedToRealInfrastructure: false });
            if (options.simulate) {
              const api = observeCarbonApi(demo.api, run);
              const source = await captureCarbonSource(plan, api);
              const receipt = await executeCarbonPlan(
                plan,
                {
                  planId: plan.id,
                  approvedAt: clock.toISOString(),
                  reviewer: 'synthetic-test-not-a-human',
                  reason: 'Simulated approval for local demonstration only',
                  source,
                },
                api,
                observeGrid(demo.provider, run),
                {
                  now: () => clock,
                  wait: async (ms) => {
                    clock = new Date(clock.getTime() + ms);
                  },
                  event,
                },
              );
              const result = await observeCarbonJob(receipt, api);
              event('verify', { mode: 'simulation', ...result, measuredSavings: null });
              // eslint-disable-next-line no-console
              console.log(JSON.stringify({ receipt, result, realCloudChanges: 0 }, null, 2));
            }
          },
        );
      }),
    );
}
