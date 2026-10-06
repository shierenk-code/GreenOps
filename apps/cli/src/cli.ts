#!/usr/bin/env node

import { Command } from 'commander';
import { resolve, basename } from 'node:path';
import { registerCloudCommands, monitorCloud } from './cloud-client.js';
import { loadProviderDefaults } from './provider-env.js';
import { fileURLToPath } from 'node:url';
import pc from 'picocolors';
import { RepositoryScanner, RepositoryAnalyzer } from '@codevitals/repository';
import { GitEngine } from '@codevitals/git';
import { PRReviewer } from '@codevitals/review';
import { GitHubAppServer } from '@codevitals/github-app';
import { Logger } from '@codevitals/logger';
import { CodeVitalsError } from '@codevitals/errors';
import { ConfigLoader } from '@codevitals/config';
import { ResultFormatter } from './formatter.js';
import { runGreenOps } from './greenops-command.js';
import { registerCarbonCommands } from './carbon-command.js';
import { registerWasteCommands } from './waste-command.js';
import { registerArchitectureCommands } from './architecture-command.js';
import { registerAzureCommands } from './azure-command.js';
import {
  SustainabilityReviewEngine,
  PolicyApprover,
  formatSustainabilityReview,
  recordSustainabilityReview,
  createReasonerFromEnv,
  type SustainabilityReviewFormat,
} from '@greenops/agent';

// pnpm filtered scripts execute from apps/cli. INIT_CWD preserves the directory
// where the user invoked the command, which is where repository-level secrets live.
ConfigLoader.loadEnv(process.env.INIT_CWD || process.cwd());
loadProviderDefaults(fileURLToPath(new URL('../../../', import.meta.url)));

export function createProgram(legacy = false): Command {
  const program = new Command();
  const resolveInputPath = (input?: string) =>
    legacy ? input || '.' : resolve(process.env.INIT_CWD || process.cwd(), input || '.');

  program
    .name(legacy ? 'codevitals' : 'greenops')
    .description('GreenOps Digital Sustainability Control Plane CLI')
    .version('0.14.0', '-v, --version', 'Output the current version of GreenOps');

  program
    .command('scan [path]')
    .description('Scan a repository and output repository health summary')
    .option('-f, --format <format>', 'Output format (text|json)', 'text')
    .option('--verbose', 'Enable verbose debug logging')
    .option('--quiet', 'Suppress non-error logs')
    .action(
      (repoPath?: string, options?: { format?: string; verbose?: boolean; quiet?: boolean }) => {
        const targetPath = resolveInputPath(repoPath);
        const format = (options?.format || 'text').toLowerCase();

        const logLevel = options?.verbose ? 'debug' : 'warn';
        const logger = new Logger({ level: logLevel });

        try {
          const scanner = new RepositoryScanner({ logger });
          const result = scanner.scan(targetPath);

          if (format === 'json') {
            // eslint-disable-next-line no-console
            console.log(ResultFormatter.formatJson(result));
          } else {
            // eslint-disable-next-line no-console
            console.log(ResultFormatter.formatText(result));
          }
        } catch (err: unknown) {
          if (err instanceof CodeVitalsError) {
            // eslint-disable-next-line no-console
            console.error(pc.red(err.toUserMessage()));
          } else {
            const msg = err instanceof Error ? err.message : String(err);
            // eslint-disable-next-line no-console
            console.error(pc.red(`Unexpected GreenOps error: ${msg}`));
          }
          process.exit(1);
        }
      },
    );

  program
    .command('analyze [path]')
    .description('Analyze repository code structure, AST, symbols, and dependency graph')
    .option('-f, --format <format>', 'Output format (text|json)', 'text')
    .option('--verbose', 'Enable verbose debug logging')
    .option('--quiet', 'Suppress non-error logs')
    .action(
      (repoPath?: string, options?: { format?: string; verbose?: boolean; quiet?: boolean }) => {
        const targetPath = resolveInputPath(repoPath);
        const format = (options?.format || 'text').toLowerCase();

        const logLevel = options?.verbose ? 'debug' : 'warn';
        const logger = new Logger({ level: logLevel });

        try {
          const analyzer = new RepositoryAnalyzer({ logger });
          const { result } = analyzer.analyze(targetPath);

          if (format === 'json') {
            // eslint-disable-next-line no-console
            console.log(ResultFormatter.formatAnalyzeJson(result));
          } else {
            // eslint-disable-next-line no-console
            console.log(ResultFormatter.formatAnalyzeText(result));
          }
        } catch (err: unknown) {
          if (err instanceof CodeVitalsError) {
            // eslint-disable-next-line no-console
            console.error(pc.red(err.toUserMessage()));
          } else {
            const msg = err instanceof Error ? err.message : String(err);
            // eslint-disable-next-line no-console
            console.error(pc.red(`Unexpected GreenOps error: ${msg}`));
          }
          process.exit(1);
        }
      },
    );

  const gitCmd = program.command('git').description('Git intelligence commands');

  gitCmd
    .command('status [path]')
    .description('Show git working tree status and changed files')
    .option('-f, --format <format>', 'Output format (text|json)', 'text')
    .action((repoPath?: string, options?: { format?: string }) => {
      const targetPath = resolveInputPath(repoPath);
      const format = (options?.format || 'text').toLowerCase();
      try {
        const engine = new GitEngine();
        const status = engine.getStatus(targetPath);
        if (format === 'json') {
          // eslint-disable-next-line no-console
          console.log(ResultFormatter.formatGitStatusJson(status));
        } else {
          // eslint-disable-next-line no-console
          console.log(ResultFormatter.formatGitStatusText(status));
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        // eslint-disable-next-line no-console
        console.error(pc.red(`Git status error: ${msg}`));
        process.exit(1);
      }
    });

  gitCmd
    .command('diff [path]')
    .description('Show parsed unified diff for working tree or between branches')
    .option('--base <base>', 'Base branch or commit', 'HEAD~1')
    .option('--head <head>', 'Head branch or commit', 'HEAD')
    .option('-f, --format <format>', 'Output format (text|json)', 'text')
    .action((repoPath?: string, options?: { base?: string; head?: string; format?: string }) => {
      const targetPath = resolveInputPath(repoPath);
      const format = (options?.format || 'text').toLowerCase();
      try {
        const engine = new GitEngine();
        const diffFiles = engine.getDiff(targetPath, options?.base, options?.head);
        if (format === 'json') {
          // eslint-disable-next-line no-console
          console.log(ResultFormatter.formatGitDiffJson(diffFiles));
        } else {
          // eslint-disable-next-line no-console
          console.log(ResultFormatter.formatGitDiffText(diffFiles));
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        // eslint-disable-next-line no-console
        console.error(pc.red(`Git diff error: ${msg}`));
        process.exit(1);
      }
    });

  const graphCmd = program
    .command('graph [path]')
    .description('Query or display dependency graph')
    .option('-f, --format <format>', 'Output format (text|json)', 'text')
    .action((repoPath?: string, options?: { format?: string }) => {
      const targetPath = resolveInputPath(repoPath);
      const format = (options?.format || 'text').toLowerCase();
      try {
        const analyzer = new RepositoryAnalyzer();
        const { graph } = analyzer.analyze(targetPath);
        if (format === 'json') {
          // eslint-disable-next-line no-console
          console.log(ResultFormatter.formatGraphOverviewJson(graph));
        } else {
          // eslint-disable-next-line no-console
          console.log(ResultFormatter.formatGraphOverviewText(graph));
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        // eslint-disable-next-line no-console
        console.error(pc.red(`Graph error: ${msg}`));
        process.exit(1);
      }
    });

  graphCmd
    .command('callers <symbol> [targetPath]')
    .description('Find callers of a given symbol')
    .option('--verbose', 'Enable verbose debug logging')
    .action((symbol: string, targetPath?: string, options?: { verbose?: boolean }) => {
      const path = resolveInputPath(targetPath);
      const logLevel = options?.verbose ? 'debug' : 'warn';
      const logger = new Logger({ level: logLevel });
      try {
        const analyzer = new RepositoryAnalyzer({ logger });
        const { traversal } = analyzer.analyze(path);
        const callers = traversal.findCallers(symbol);

        // eslint-disable-next-line no-console
        console.log(pc.bold(`Callers for symbol '${symbol}':`));
        if (callers.length === 0) {
          // eslint-disable-next-line no-console
          console.log(pc.dim('  (No callers found)'));
        } else {
          for (const node of callers) {
            // eslint-disable-next-line no-console
            console.log(`  - ${pc.cyan(node.name)} [${node.type}] (${node.id})`);
          }
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        // eslint-disable-next-line no-console
        console.error(pc.red(`Error finding callers: ${msg}`));
        process.exit(1);
      }
    });

  graphCmd
    .command('callees <symbol> [targetPath]')
    .description('Find callees of a given symbol')
    .option('--verbose', 'Enable verbose debug logging')
    .action((symbol: string, targetPath?: string, options?: { verbose?: boolean }) => {
      const path = resolveInputPath(targetPath);
      const logLevel = options?.verbose ? 'debug' : 'warn';
      const logger = new Logger({ level: logLevel });
      try {
        const analyzer = new RepositoryAnalyzer({ logger });
        const { traversal } = analyzer.analyze(path);
        const callees = traversal.findCallees(symbol);

        // eslint-disable-next-line no-console
        console.log(pc.bold(`Callees for symbol '${symbol}':`));
        if (callees.length === 0) {
          // eslint-disable-next-line no-console
          console.log(pc.dim('  (No callees found)'));
        } else {
          for (const node of callees) {
            // eslint-disable-next-line no-console
            console.log(`  - ${pc.cyan(node.name)} [${node.type}] (${node.id})`);
          }
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        // eslint-disable-next-line no-console
        console.error(pc.red(`Error finding callees: ${msg}`));
        process.exit(1);
      }
    });

  program
    .command(legacy ? 'review [path]' : 'code-review [path]')
    .description('Perform PR / Diff semantic review and blast-radius risk analysis')
    .option('--diff <spec>', 'Diff specifier or commit range', 'HEAD~1')
    .option('--base <base>', 'Base branch or commit')
    .option('--head <head>', 'Head branch or commit', 'HEAD')
    .option('-f, --format <format>', 'Output format (text|json)', 'text')
    .action(
      (
        targetPath?: string,
        options?: { diff?: string; base?: string; head?: string; format?: string },
      ) => {
        const repoPath = resolveInputPath(targetPath);
        const format = (options?.format || 'text').toLowerCase();

        try {
          const reviewer = new PRReviewer();
          const reviewResult = reviewer.review(repoPath, {
            diffSpec: options?.diff,
            base: options?.base,
            head: options?.head,
          });

          if (format === 'json') {
            // eslint-disable-next-line no-console
            console.log(ResultFormatter.formatReviewJson(reviewResult));
          } else {
            // eslint-disable-next-line no-console
            console.log(ResultFormatter.formatReviewText(reviewResult));
          }
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          // eslint-disable-next-line no-console
          console.error(pc.red(`Review error: ${msg}`));
          process.exit(1);
        }
      },
    );

  program
    .command('serve')
    .description('Start the GreenOps GitHub App Webhook Listener Server')
    .option('-p, --port <number>', 'Port to listen on', '3000')
    .option('-s, --secret <secret>', 'GitHub Webhook HMAC Secret')
    .option('-t, --token <token>', 'GitHub Personal Access Token or App Token')
    .action((options?: { port?: string; secret?: string; token?: string }) => {
      const port = parseInt(options?.port || '3000', 10);
      const server = new GitHubAppServer({
        port,
        webhookSecret: options?.secret || process.env.GITHUB_WEBHOOK_SECRET,
        githubToken: options?.token || process.env.GITHUB_TOKEN,
      });
      server
        .start()
        .then((listeningPort) => {
          // eslint-disable-next-line no-console
          console.log(
            pc.bold(
              pc.cyan(
                `GreenOps GitHub App Webhook Listener running on http://localhost:${listeningPort}/api/webhooks/github`,
              ),
            ),
          );
        })
        .catch((err: Error) => {
          // eslint-disable-next-line no-console
          console.error(pc.red(`Failed to start GitHub App server: ${err.message}`));
          process.exit(1);
        });
    });

  const greenopsCmd = legacy
    ? program
        .command('greenops')
        .description(
          'GreenOps Engineering — AI-assisted sustainability-bug detection and improvement loop',
        )
    : program;

  registerCloudCommands(greenopsCmd);
  registerArchitectureCommands(greenopsCmd);
  registerAzureCommands(greenopsCmd);
  let stopCloud: (() => Promise<void>) | undefined;
  greenopsCmd.hook('preAction', async (_thisCommand, actionCommand) => {
    if (!['run', 'review'].includes(actionCommand.name())) return;
    const options = actionCommand.opts();
    const target = resolve(process.env.INIT_CWD || process.cwd(), actionCommand.args[0] || '.');
    stopCloud = await monitorCloud(resolve(process.env.INIT_CWD || process.cwd(), options.ledger || './greenops-ledger.json'), basename(target), actionCommand.name());
  });
  greenopsCmd.hook('postAction', async () => { await stopCloud?.(); stopCloud = undefined; });

  greenopsCmd
    .command('review [path]')
    .description('Review a repository for Sustainability Bugs without changing source files')
    .option('--provider <provider>', 'AI recommendation provider (gemini|ollama|openai|offline)')
    .option('--diff', 'Limit findings to files changed in the local Git working tree', false)
    .option('--fix', 'Run the approval-gated improvement and verification workflow', false)
    .option('--verbose', 'Show the full finding detail instead of the concise priority list', false)
    .option('-f, --format <format>', 'Output format (text|json|markdown)', 'text')
    .option(
      '-l, --ledger <path>',
      'Path to the Sustainability Ledger JSON',
      './greenops-ledger.json',
    )
    .action(
      async (
        targetPath?: string,
        options?: {
          diff?: boolean;
          fix?: boolean;
          verbose?: boolean;
          format?: string;
          ledger?: string;
          provider?: string;
        },
      ) => {
        try {
          const repoPath = resolve(process.env.INIT_CWD || process.cwd(), targetPath || '.');
          const greenopsConfig = ConfigLoader.load(repoPath).greenops;
          if (!greenopsConfig?.enabled || !greenopsConfig.local.enabled) {
            throw new Error('Local GreenOps review is disabled by repository configuration.');
          }
          const format = (options?.format || 'text').toLowerCase();
          if (!['text', 'json', 'markdown'].includes(format)) {
            throw new Error(`Unsupported format '${format}'. Use text, json, or markdown.`);
          }
          const changedFiles = options?.diff
            ? new GitEngine().getStatus(repoPath).files.map((file) => file.path)
            : undefined;
          const reasoner = createReasonerFromEnv({ ...process.env, ...(options?.provider ? { GREENOPS_LLM_PROVIDER: options.provider } : {}) });
          console.error(`Reasoner configured: ${reasoner.name}. Findings and bounded source snippets are sent to the selected provider when it uses a model.`);
          const review = await new SustainabilityReviewEngine(
            undefined,
            reasoner,
            new PolicyApprover(greenopsConfig.fixes),
          ).review(repoPath, {
            changedFiles,
            minimumSeverity: greenopsConfig.thresholds.minimumSeverity,
            minimumConfidence: greenopsConfig.thresholds.minimumConfidence,
          });
          recordSustainabilityReview(
            review,
            resolve(
              process.env.INIT_CWD || process.cwd(),
              options?.ledger || './greenops-ledger.json',
            ),
            { source: 'local' },
          );
          const generated = review.findings.filter(finding => finding.analysis?.status === 'generated');
          const fallback = review.findings.filter(finding => finding.analysis?.status === 'fallback');
          console.error(`Model-generated investigations: ${generated.length}; fallback investigations: ${fallback.length}.`);
          for (const reason of new Set(fallback.map(finding => finding.analysis?.reason).filter(Boolean))) console.error(`Model fallback: ${reason}`);
          // eslint-disable-next-line no-console
          console.log(
            formatSustainabilityReview(review, format as SustainabilityReviewFormat, {
              verbose: options?.verbose,
            }),
          );

          if (options?.fix && !greenopsConfig.fixes.enabled) {
            throw new Error('GreenOps fixes are disabled by repository configuration.');
          }
          if (options?.fix) {
            // The existing seven-stage loop remains the only fix/apply/verify path.
            // Explicit terminal approval applies only supported sandbox fixes.
            await runGreenOps(repoPath, { ledger: options.ledger, approve: true });
          }
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          // eslint-disable-next-line no-console
          console.error(pc.red(`GreenOps review error: ${msg}`));
          process.exit(1);
        }
      },
    );

  greenopsCmd
    .command('run [path]')
    .description('Run the full Detect→Investigate→Compare→Simulate→Approve→Improve→Verify loop')
    .option(
      '-l, --ledger <path>',
      'Path to the Sustainability Ledger JSON',
      './greenops-ledger.json',
    )
    .option(
      '--auto',
      'Allow trivial reversible sandbox fixes only when repository policy permits automatic application',
      false,
    )
    .option('--approve', 'Prompt for explicit human approval of supported sandbox changes', false)
    .option(
      '--fleet',
      'Run the multi-agent orchestrator over mock fixtures (AI/cloud/carbon/IaC/DR/collab)',
      false,
    )
    .option('--mock-dir <path>', 'Directory of mock fixtures for --fleet (defaults to [path])')
    .option(
      '--provider <provider>',
      'AI recommendation provider (gemini|ollama|openai|offline; overrides environment)',
    )
    .action(
      async (
        targetPath?: string,
        options?: {
          ledger?: string;
          auto?: boolean;
          approve?: boolean;
          fleet?: boolean;
          mockDir?: string;
          provider?: string;
        },
      ) => {
        try {
          await runGreenOps(targetPath || '.', {
            ledger: options?.ledger,
            auto: options?.auto,
            approve: options?.approve,
            fleet: options?.fleet,
            mockDir: options?.mockDir,
            provider: options?.provider,
          });
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          // eslint-disable-next-line no-console
          console.error(pc.red(`GreenOps error: ${msg}`));
          process.exit(1);
        }
      },
    );

  registerCarbonCommands(greenopsCmd);
  registerWasteCommands(greenopsCmd);

  program.on('command:*', (operands: string[]) => {
    // eslint-disable-next-line no-console
    console.error(pc.red(`Error: Unknown command '${operands[0]}'.`));
    // eslint-disable-next-line no-console
    console.error(`Run ${pc.cyan(`${program.name()} --help`)} to see all available commands.`);
    process.exit(1);
  });

  return program;
}

// Retain the original entry point without executing it when the GreenOps CLI imports it.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  createProgram(true).parseAsync(process.argv).catch(() => { console.error('Command failed. Check your configuration and try again.'); process.exitCode = 1; });
}
