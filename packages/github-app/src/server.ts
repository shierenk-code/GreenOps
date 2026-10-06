import { createServer, Server, IncomingMessage, ServerResponse } from 'node:http';
import { ConfigLoader } from '@codevitals/config';
import type { GreenOpsConfig } from '@codevitals/config';
import { Logger } from '@codevitals/logger';
import { GitHubConnector, GitHubMarkdownFormatter } from '@codevitals/connectors';
import { CodeVitalsBot } from './bot.js';
import {
  PolicyApprover,
  SustainabilityReviewEngine,
  recordSustainabilityReview,
} from '@greenops/agent';
import { rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { createPrWorkspace } from './pr-workspace.js';

export const MAX_WEBHOOK_BYTES = 1024 * 1024;

export interface GitHubAppServerOptions {
  port?: number;
  webhookSecret?: string;
  githubToken?: string;
  repoPath?: string;
  logger?: Logger;
}

export class GitHubAppServer {
  private server?: Server;
  private port: number;
  private connector: GitHubConnector;
  private bot: CodeVitalsBot;
  private sustainabilityReviewer: SustainabilityReviewEngine;
  private repoPath: string;
  private logger: Logger;
  private greenopsConfig: GreenOpsConfig;

  constructor(options: GitHubAppServerOptions = {}) {
    this.repoPath = options.repoPath || '.';
    ConfigLoader.loadEnv(this.repoPath);
    this.greenopsConfig = ConfigLoader.load(this.repoPath).greenops!;
    this.port = options.port ?? parseInt(process.env.PORT || '3000', 10);
    this.logger = options.logger || new Logger({ level: 'info' });
    this.connector = new GitHubConnector({
      webhookSecret: options.webhookSecret,
      githubToken: options.githubToken,
    });
    this.sustainabilityReviewer = new SustainabilityReviewEngine(
      undefined,
      undefined,
      new PolicyApprover(this.greenopsConfig.fixes),
    );
    this.bot = new CodeVitalsBot(this.connector);
  }

  public start(): Promise<number> {
    return new Promise((resolve, reject) => {
      this.server = createServer((req, res) => this.handleRequest(req, res));
      this.server.listen(this.port, () => {
        const address = this.server?.address();
        if (address && typeof address !== 'string') this.port = address.port;
        this.logger.info(`GreenOps GitHub App Server listening on port ${this.port}`);
        resolve(this.port);
      });
      this.server.on('error', (err) => reject(err));
    });
  }

  public stop(): Promise<void> {
    return new Promise((resolve) => {
      if (this.server) {
        this.server.close(() => resolve());
      } else {
        resolve();
      }
    });
  }

  private async handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = req.url || '/';
    const method = req.method || 'GET';

    if (method === 'GET' && url === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok', service: 'codevitals-github-app' }));
      return;
    }

    if (method === 'POST' && url === '/api/webhooks/github') {
      const chunks: Buffer[] = [];
      let size = 0;
      req.setTimeout(15_000, () => {
        if (!res.writableEnded) {
          res.writeHead(408, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Webhook upload timed out' }));
        }
      });
      req.on('data', (chunk) => {
        if (res.writableEnded) return;
        const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        size += buffer.length;
        if (size > MAX_WEBHOOK_BYTES) {
          chunks.length = 0;
          res.writeHead(413, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Webhook payload too large' }));
          return;
        }
        chunks.push(buffer);
      });

      req.on('end', async () => {
        req.setTimeout(0);
        if (res.writableEnded) return;
        const body = Buffer.concat(chunks).toString('utf8');
        const sigHeader = (req.headers['x-hub-signature-256'] as string) || '';
        if (!this.connector.verifySignature(body, sigHeader)) {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Invalid HMAC signature' }));
          return;
        }

        try {
          const jsonBody = JSON.parse(body || '{}') as Record<string, unknown>;
          const headersObj: Record<string, string> = {};
          for (const [k, v] of Object.entries(req.headers)) {
            if (typeof v === 'string') headersObj[k] = v;
          }

          const prEvent = this.connector.parseWebhookEvent(headersObj, jsonBody);

          if (!prEvent) {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ message: 'Event ignored' }));
            return;
          }

          if (prEvent.action === 'comment') {
            const reply = await this.bot.handleCommentCommand(prEvent, this.repoPath);
            if (reply) {
              await this.connector.postComment(prEvent, reply);
            }
          } else if (
            prEvent.action === 'opened' ||
            prEvent.action === 'synchronize' ||
            prEvent.action === 'reopened'
          ) {
            let prFiles: Array<{ filename: string; content?: string }> = [];
            try {
              prFiles = await this.connector.fetchPRFiles(prEvent);
            } catch (fetchErr) {
              this.logger.warn(`Could not fetch PR files from GitHub API: ${String(fetchErr)}`);
            }

            if (prFiles.length === 0) {
              this.logger.warn(
                `No changed files retrieved for PR #${prEvent.pullNumber} (${prEvent.owner}/${prEvent.repo}). Skipping analysis to prevent unintended host filesystem scan.`,
              );
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ status: 'skipped', reason: 'No PR files retrieved' }));
              return;
            }

            const tempWorkspace = createPrWorkspace(prFiles);
            const analysisDir = tempWorkspace;

            try {
              const changedFilesList = prFiles.map((file) => file.filename);

              if (this.greenopsConfig.enabled && this.greenopsConfig.pullRequest.enabled) {
                const sustainabilityReview = await this.sustainabilityReviewer.review(analysisDir, {
                  changedFiles: changedFilesList,
                  commitSha: prEvent.headSha,
                  minimumSeverity: this.greenopsConfig.thresholds.minimumSeverity,
                  minimumConfidence: this.greenopsConfig.thresholds.minimumConfidence,
                });

                for (const finding of sustainabilityReview.findings) {
                  if (finding.file.startsWith(tempWorkspace)) {
                    finding.file = finding.file.slice(tempWorkspace.length).replace(/^[/\\]+/, '');
                  }
                }

                recordSustainabilityReview(
                  sustainabilityReview,
                  resolve(
                    this.repoPath,
                    process.env.GREENOPS_LEDGER_PATH || 'greenops-ledger.json',
                  ),
                  { source: 'github', pullRequest: prEvent.pullNumber },
                );
                if (this.greenopsConfig.pullRequest.summaryComment) {
                  await this.connector.postSustainabilitySummary(prEvent, sustainabilityReview);
                }
                if (this.greenopsConfig.pullRequest.inlineComments) {
                  const sustainabilityComments =
                    GitHubMarkdownFormatter.generateSustainabilityInlineComments(
                      sustainabilityReview,
                    );
                  if (sustainabilityComments.length > 0) {
                    await this.connector.postInlineComments(prEvent, sustainabilityComments);
                  }
                }
                if (this.greenopsConfig.pullRequest.checkRun) {
                  await this.connector.createSustainabilityCheckRun(prEvent, sustainabilityReview);
                }
              }
            } finally {
              try {
                rmSync(tempWorkspace, { recursive: true, force: true });
              } catch {
                // ignore cleanup error
              }
            }
          }

          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ status: 'success', pr: prEvent.pullNumber }));
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          this.logger.error(`Webhook processing error: ${msg}`);
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: msg }));
        }
      });
      return;
    }

    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
  }
}
