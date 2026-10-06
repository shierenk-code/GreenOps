import { Command } from 'commander';
import { readFileSync, statSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { ConfigLoader } from '@codevitals/config';
import { GreenOpsAgent, OfflineReasoner } from '@greenops/agent';
import { ArchitectureAgent, validateArchitecture } from '@greenops/agents';
import type { SustainabilityBug } from '@greenops/detect';

export async function recordAssessment(
  source: string,
  ledger: string,
  bugs: SustainabilityBug[],
  scanned: Record<string, number>,
) {
  const cwd = process.env.INIT_CWD || process.cwd();
  const policy = ConfigLoader.load(cwd).greenops!;
  if (!policy.enabled || !policy.local.enabled)
    throw new Error('Repository policy disables this assessment.');
  const ledgerPath = resolve(cwd, ledger);
  if (ledgerPath.toLowerCase() === resolve(cwd, source).toLowerCase())
    throw new Error('The assessment ledger must not overwrite its input.');
  mkdirSync(dirname(ledgerPath), { recursive: true });
  await new GreenOpsAgent({
    targetPath: cwd,
    ledgerPath,
    reasoner: new OfflineReasoner(),
    approver: {
      name: 'assessment-only',
      decide: async () => ({
        approved: false,
        approver: 'assessment-only',
        reason: 'Human plan review required; this read-only assessment cannot apply changes.',
      }),
    },
    bugsProvider: () => ({ bugs, scanned }),
  }).run();
  console.log(
    `Assessment saved: ${ledgerPath}\n${bugs.length} findings. No resources changed. Import or sync this ledger to view it in the dashboard.`,
  );
}

export function registerArchitectureCommands(parent: Command) {
  parent
    .command('architecture')
    .description('Review normalized architecture records without changing infrastructure')
    .command('assess <file>')
    .option('--ledger <path>', 'Assessment ledger', './.tmp/architecture-review.json')
    .action(async (file: string, options: { ledger: string }) => {
      const source = resolve(process.env.INIT_CWD || process.cwd(), file);
      if (statSync(source).size > 1024 * 1024) throw new Error('Architecture input exceeds 1 MiB.');
      let input: unknown;
      try {
        input = JSON.parse(readFileSync(source, 'utf8'));
      } catch {
        throw new Error('Invalid architecture JSON. File contents are not logged.');
      }
      validateArchitecture(input);
      const result = new ArchitectureAgent().scan(source);
      await recordAssessment(
        source,
        options.ledger,
        result.bugs.map((bug) => ({
          ...bug,
          agentId: 'architecture',
          agentName: 'Architecture Agent',
        })),
        result.scanned,
      );
    });
}
