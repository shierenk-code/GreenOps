import { createHmac, createSign, timingSafeEqual } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PRReviewResult } from '@codevitals/review';
import {
  CodeVitalsConnector,
  ConnectorConfig,
  PREvent,
  InlineComment,
  CheckRunPayload,
  CheckRunAnnotation,
} from './types.js';
import { GitHubMarkdownFormatter } from './markdown-formatter.js';
import type { SustainabilityReviewResult } from '@greenops/detect';

export class GitHubConnector implements CodeVitalsConnector {
  private token?: string;
  private webhookSecret?: string;
  private baseUrl: string;
  private appId?: string;
  private appPrivateKey?: string;
  private installationTokenCache = new Map<string, { token: string; expiresAt: number }>();

  constructor(config: ConnectorConfig = {}) {
    this.token = config.githubToken || process.env.GITHUB_TOKEN;
    this.webhookSecret = config.webhookSecret || process.env.GITHUB_WEBHOOK_SECRET;
    this.baseUrl = config.baseUrl || 'https://api.github.com';
    this.appId = config.appId || process.env.GITHUB_APP_ID;

    this.appPrivateKey = config.appPrivateKey || process.env.GITHUB_APP_PRIVATE_KEY;
    if (!this.appPrivateKey) {
      const explicitPath = config.appPrivateKeyPath || process.env.GITHUB_APP_PRIVATE_KEY_PATH;
      const keyCandidates: string[] = [];
      if (explicitPath) {
        keyCandidates.push(resolve(explicitPath));
        keyCandidates.push(resolve(process.cwd(), explicitPath));
      }

      // Check standard PEM filenames across directory hierarchy
      const pemNames = [
        'greenops-bot.2026-10-01.private-key.pem',
        'private-key.pem',
        'github-app.pem',
      ];
      let cur = resolve(process.cwd());
      for (let i = 0; i < 6; i++) {
        for (const name of pemNames) {
          keyCandidates.push(resolve(cur, name));
        }
        const parent = resolve(cur, '..');
        if (parent === cur) break;
        cur = parent;
      }

      for (const candidate of keyCandidates) {
        if (existsSync(candidate)) {
          try {
            this.appPrivateKey = readFileSync(candidate, 'utf-8');
            break;
          } catch {
            // ignore
          }
        }
      }
    }
  }

  public verifySignature(rawBody: string, signatureHeader: string): boolean {
    if (!this.webhookSecret?.trim()) return false;
    if (!/^sha256=[a-fA-F0-9]{64}$/.test(signatureHeader)) return false;

    const signature = signatureHeader.slice(7);
    const expected = createHmac('sha256', this.webhookSecret)
      .update(rawBody, 'utf-8')
      .digest('hex');

    try {
      return timingSafeEqual(Buffer.from(signature, 'hex'), Buffer.from(expected, 'hex'));
    } catch {
      return false;
    }
  }

  public parseWebhookEvent(
    headers: Record<string, string>,
    body: Record<string, unknown>,
  ): PREvent | null {
    const eventType = headers['x-github-event'] || headers['X-GitHub-Event'];

    if (eventType === 'pull_request') {
      const action = String(body.action || '');
      const pr = body.pull_request as Record<string, unknown> | undefined;
      const repository = body.repository as Record<string, unknown> | undefined;
      const sender = body.sender as Record<string, unknown> | undefined;
      const installation = body.installation as Record<string, unknown> | undefined;

      if (!pr || !repository) return null;

      const head = pr.head as Record<string, unknown> | undefined;
      const base = pr.base as Record<string, unknown> | undefined;

      return {
        action: action as PREvent['action'],
        pullNumber: Number(pr.number || 0),
        owner: String((repository.owner as Record<string, unknown> | undefined)?.login || ''),
        repo: String(repository.name || ''),
        headSha: String(head?.sha || 'HEAD'),
        baseSha: String(base?.sha || 'HEAD~1'),
        title: String(pr.title || ''),
        sender: String(sender?.login || 'bot'),
        installationId: installation?.id ? Number(installation.id) : undefined,
      };
    }

    if (eventType === 'issue_comment') {
      const issue = body.issue as Record<string, unknown> | undefined;
      const comment = body.comment as Record<string, unknown> | undefined;
      const repository = body.repository as Record<string, unknown> | undefined;
      const sender = body.sender as Record<string, unknown> | undefined;
      const installation = body.installation as Record<string, unknown> | undefined;

      if (!issue || !issue.pull_request || !comment || !repository) return null;

      return {
        action: 'comment',
        pullNumber: Number(issue.number || 0),
        owner: String((repository.owner as Record<string, unknown> | undefined)?.login || ''),
        repo: String(repository.name || ''),
        headSha: 'HEAD',
        baseSha: 'HEAD~1',
        title: String(issue.title || ''),
        sender: String(sender?.login || 'user'),
        commentBody: String(comment.body || ''),
        installationId: installation?.id ? Number(installation.id) : undefined,
      };
    }

    return null;
  }

  public async postReviewSummary(
    pr: PREvent,
    reviewResult: PRReviewResult,
  ): Promise<{ commentId: number }> {
    const markdown = GitHubMarkdownFormatter.formatPRReviewMarkdown(reviewResult);
    const url = `${this.baseUrl}/repos/${pr.owner}/${pr.repo}/issues/${pr.pullNumber}/comments`;
    const headers = await this.headers(pr.owner, pr.repo, pr.installationId);
    if (!headers.Authorization) {
      return { commentId: 0 };
    }

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({ body: markdown }),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Failed to post GitHub PR comment [${response.status}]: ${errText}`);
    }

    const data = (await response.json()) as { id: number };
    return { commentId: data.id };
  }

  public async postComment(pr: PREvent, body: string): Promise<{ commentId: number }> {
    const url = `${this.baseUrl}/repos/${pr.owner}/${pr.repo}/issues/${pr.pullNumber}/comments`;
    const headers = await this.headers(pr.owner, pr.repo, pr.installationId);
    if (!headers.Authorization) return { commentId: 0 };

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({ body }),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Failed to post comment [${response.status}]: ${errText}`);
    }

    const data = (await response.json()) as { id: number };
    return { commentId: data.id };
  }

  /** Upsert one GreenOps summary so new PR commits do not leave stale summaries current. */
  public async postSustainabilitySummary(
    pr: PREvent,
    reviewResult: SustainabilityReviewResult,
  ): Promise<{ commentId: number }> {
    const markdown = GitHubMarkdownFormatter.formatSustainabilityReview(reviewResult);
    const headers = await this.headers(pr.owner, pr.repo, pr.installationId);
    if (!headers.Authorization) return { commentId: 0 };

    const commentsUrl = `${this.baseUrl}/repos/${pr.owner}/${pr.repo}/issues/${pr.pullNumber}/comments`;
    const existingResponse = await fetch(commentsUrl, { headers });
    if (!existingResponse.ok) {
      throw new Error(
        `Failed to list GitHub PR comments [${existingResponse.status}]: ${await existingResponse.text()}`,
      );
    }
    const comments = (await existingResponse.json()) as Array<{ id: number; body?: string }>;
    const existing = comments.find((comment) =>
      comment.body?.includes('<!-- greenops-sustainability-review -->'),
    );
    const url = existing
      ? `${this.baseUrl}/repos/${pr.owner}/${pr.repo}/issues/comments/${existing.id}`
      : commentsUrl;
    const response = await fetch(url, {
      method: existing ? 'PATCH' : 'POST',
      headers,
      body: JSON.stringify({ body: markdown }),
    });
    if (!response.ok) {
      throw new Error(
        `Failed to upsert GreenOps PR summary [${response.status}]: ${await response.text()}`,
      );
    }
    const data = (await response.json()) as { id: number };
    return { commentId: data.id };
  }

  public async postInlineComments(
    pr: PREvent,
    comments: InlineComment[],
    summaryBody?: string,
  ): Promise<void> {
    if (comments.length === 0 && !summaryBody) return;
    const headers = await this.headers(pr.owner, pr.repo, pr.installationId);
    if (!headers.Authorization) return;

    const url = `${this.baseUrl}/repos/${pr.owner}/${pr.repo}/pulls/${pr.pullNumber}/reviews`;
    const reviewComments = comments.map((c) => ({
      path: c.path,
      line: c.line,
      body: c.body,
      side: c.side || 'RIGHT',
    }));

    const payload: Record<string, unknown> = {
      commit_id: pr.headSha,
      event: 'COMMENT',
      comments: reviewComments,
    };
    if (summaryBody) {
      payload.body = summaryBody;
    }

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Failed to post inline comments [${response.status}]: ${errText}`);
    }
  }

  public async createCheckRun(
    pr: PREvent,
    reviewResult: PRReviewResult,
  ): Promise<{ checkRunId: number }> {
    const r = reviewResult.riskAnalysis;
    const sd = reviewResult.semanticDiff;
    const url = `${this.baseUrl}/repos/${pr.owner}/${pr.repo}/check-runs`;
    const headers = await this.headers(pr.owner, pr.repo, pr.installationId);
    if (!headers.Authorization) {
      return { checkRunId: 0 };
    }

    const conclusion: CheckRunPayload['conclusion'] =
      r.level === 'critical' ? 'failure' : r.level === 'high' ? 'neutral' : 'success';

    const annotations: CheckRunAnnotation[] = sd.changedSymbols
      .filter((s) => s.exported)
      .slice(0, 50)
      .map((s) => ({
        path: s.filePath,
        start_line: s.startLine,
        end_line: s.endLine,
        annotation_level: r.level === 'critical' || r.level === 'high' ? 'warning' : 'notice',
        message: `Public export ${s.name} (${s.kind}) modified in PR. Risk Score: ${r.score}/100.`,
        title: `GreenOps Symbol Analysis: ${s.name}`,
      }));

    const payload: CheckRunPayload = {
      name: 'GreenOps PR Intelligence',
      head_sha: pr.headSha,
      status: 'completed',
      conclusion,
      output: {
        title: `GreenOps Risk Assessment: ${r.level.toUpperCase()} (${r.score}/100)`,
        summary: GitHubMarkdownFormatter.formatPRReviewMarkdown(reviewResult),
        annotations,
      },
    };

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Failed to create GitHub Check Run [${response.status}]: ${errText}`);
    }

    const data = (await response.json()) as { id: number };
    return { checkRunId: data.id };
  }

  public async createSustainabilityCheckRun(
    pr: PREvent,
    reviewResult: SustainabilityReviewResult,
  ): Promise<{ checkRunId: number }> {
    const annotations: CheckRunAnnotation[] = reviewResult.findings.slice(0, 50).map((finding) => ({
      path: finding.file,
      start_line: finding.line ?? 1,
      end_line: finding.endLine ?? finding.line ?? 1,
      annotation_level: finding.severity === 'high' ? 'warning' : 'notice',
      message: `${finding.description} Recommendation: ${finding.recommendation ?? 'Manual review required.'}`,
      title: `GreenOps: ${finding.title}`,
    }));
    const payload: CheckRunPayload = {
      name: 'GreenOps Sustainability Analysis',
      head_sha: pr.headSha,
      status: 'completed',
      conclusion: reviewResult.summary.findings > 0 ? 'neutral' : 'success',
      output: {
        title:
          reviewResult.summary.findings > 0
            ? `${reviewResult.summary.findings} Sustainability Bug${reviewResult.summary.findings === 1 ? '' : 's'} detected`
            : 'No significant Sustainability Bugs detected',
        summary: GitHubMarkdownFormatter.formatSustainabilityReview(reviewResult),
        annotations,
      },
    };
    const headers = await this.headers(pr.owner, pr.repo, pr.installationId);
    if (!headers.Authorization) return { checkRunId: 0 };
    const response = await fetch(`${this.baseUrl}/repos/${pr.owner}/${pr.repo}/check-runs`, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      throw new Error(
        `Failed to create GreenOps Check Run [${response.status}]: ${await response.text()}`,
      );
    }
    const data = (await response.json()) as { id: number };
    return { checkRunId: data.id };
  }

  public async fetchPRFiles(
    pr: PREvent,
  ): Promise<Array<{ filename: string; content?: string; patch?: string; status: string }>> {
    const headers = await this.headers(pr.owner, pr.repo, pr.installationId);
    if (!headers.Authorization) return [];

    let headOwner = pr.owner;
    let headRepo = pr.repo;
    let headSha = pr.headSha;

    try {
      const prDetailsUrl = `${this.baseUrl}/repos/${pr.owner}/${pr.repo}/pulls/${pr.pullNumber}`;
      const prDetailsRes = await fetch(prDetailsUrl, { headers });
      if (prDetailsRes.ok) {
        const prDetails = (await prDetailsRes.json()) as {
          head?: { sha?: string; repo?: { owner?: { login?: string }; name?: string } };
        };
        if (prDetails.head?.sha) {
          headSha = prDetails.head.sha;
          pr.headSha = headSha;
        }
        if (prDetails.head?.repo?.owner?.login) {
          headOwner = prDetails.head.repo.owner.login;
        }
        if (prDetails.head?.repo?.name) {
          headRepo = prDetails.head.repo.name;
        }
      }
    } catch {
      // ignore
    }

    const filesUrl = `${this.baseUrl}/repos/${pr.owner}/${pr.repo}/pulls/${pr.pullNumber}/files?per_page=100`;
    const response = await fetch(filesUrl, { headers });
    if (!response.ok) {
      return [];
    }
    const files = (await response.json()) as Array<{
      filename: string;
      patch?: string;
      status: string;
      raw_url?: string;
      contents_url?: string;
    }>;

    const result: Array<{ filename: string; content?: string; patch?: string; status: string }> =
      [];
    for (const file of files) {
      if (file.status === 'removed') continue;
      let text: string | undefined;

      // 1. Try fetching via contents API on base repo
      try {
        const contentRes = await fetch(
          `${this.baseUrl}/repos/${pr.owner}/${pr.repo}/contents/${file.filename}?ref=${headSha}`,
          {
            headers: {
              ...headers,
              Accept: 'application/vnd.github.raw',
            },
          },
        );
        if (contentRes.ok) {
          text = await contentRes.text();
        }
      } catch {
        // fallback
      }

      // 2. Try fetching via head repo (if from a fork)
      if (!text && (headOwner !== pr.owner || headRepo !== pr.repo)) {
        try {
          const forkContentRes = await fetch(
            `${this.baseUrl}/repos/${headOwner}/${headRepo}/contents/${file.filename}?ref=${headSha}`,
            {
              headers: {
                ...headers,
                Accept: 'application/vnd.github.raw',
              },
            },
          );
          if (forkContentRes.ok) {
            text = await forkContentRes.text();
          }
        } catch {
          // fallback
        }
      }

      // 3. Try raw_url if contents API didn't succeed
      if (!text && file.raw_url) {
        try {
          const rawRes = await fetch(file.raw_url, { headers });
          if (rawRes.ok) {
            text = await rawRes.text();
          }
        } catch {
          // fallback
        }
      }

      // 4. If file content could not be fetched directly, reconstruct from patch if available
      if (!text && file.patch) {
        const patchLines = file.patch.split('\n');
        const reconstructed = patchLines
          .filter(
            (l) =>
              (l.startsWith('+') && !l.startsWith('+++')) ||
              (!l.startsWith('-') && !l.startsWith('@@')),
          )
          .map((l) => (l.startsWith('+') ? l.slice(1) : l))
          .join('\n');
        if (reconstructed.trim()) {
          text = reconstructed;
        }
      }

      result.push({
        filename: file.filename,
        content: text,
        patch: file.patch,
        status: file.status,
      });
    }
    return result;
  }

  private generateAppJwt(): string {
    if (!this.appId || !this.appPrivateKey) {
      throw new Error('GitHub App ID and Private Key are required for App authentication');
    }
    const now = Math.floor(Date.now() / 1000);
    const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
    const payload = Buffer.from(
      JSON.stringify({
        iat: now - 60,
        exp: now + 600,
        iss: this.appId,
      }),
    ).toString('base64url');

    const signer = createSign('RSA-SHA256');
    signer.update(`${header}.${payload}`);
    const signature = signer.sign(this.appPrivateKey, 'base64url');
    return `${header}.${payload}.${signature}`;
  }

  private async getAuthToken(
    owner?: string,
    repo?: string,
    installationId?: number,
  ): Promise<string | undefined> {
    if (this.appId && this.appPrivateKey) {
      const cacheKey = installationId
        ? `inst_${installationId}`
        : owner && repo
          ? `${owner}/${repo}`
          : 'app';
      const cached = this.installationTokenCache.get(cacheKey);
      if (cached && cached.expiresAt > Date.now() + 60_000) {
        return cached.token;
      }

      try {
        const jwt = this.generateAppJwt();
        let targetInstallId = installationId;

        if (!targetInstallId && owner && repo) {
          const installRes = await fetch(`${this.baseUrl}/repos/${owner}/${repo}/installation`, {
            headers: {
              Authorization: `Bearer ${jwt}`,
              Accept: 'application/vnd.github+json',
              'User-Agent': 'GreenOps-Bot',
            },
          });

          if (installRes.ok) {
            const installData = (await installRes.json()) as { id: number };
            targetInstallId = installData.id;
          }
        }

        if (targetInstallId) {
          const tokenRes = await fetch(
            `${this.baseUrl}/app/installations/${targetInstallId}/access_tokens`,
            {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${jwt}`,
                Accept: 'application/vnd.github+json',
                'User-Agent': 'GreenOps-Bot',
              },
            },
          );

          if (tokenRes.ok) {
            const tokenData = (await tokenRes.json()) as { token: string; expires_at: string };
            this.installationTokenCache.set(cacheKey, {
              token: tokenData.token,
              expiresAt: new Date(tokenData.expires_at).getTime(),
            });
            return tokenData.token;
          }
        }
      } catch {
        // Fallback to token
      }
    }

    return this.token;
  }

  private async headers(
    owner?: string,
    repo?: string,
    installationId?: number,
  ): Promise<Record<string, string>> {
    const token = await this.getAuthToken(owner, repo, installationId);
    return {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      'Content-Type': 'application/json',
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'GreenOps-Bot',
    };
  }
}
