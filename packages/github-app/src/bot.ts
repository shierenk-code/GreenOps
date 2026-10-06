import { GitHubConnector, GitHubMarkdownFormatter, PREvent } from '@codevitals/connectors';
import {
  PolicyApprover,
  SustainabilityReviewEngine,
  recordSustainabilityReview,
} from '@greenops/agent';
import { ConfigLoader } from '@codevitals/config';
import { rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { createPrWorkspace } from './pr-workspace.js';

export class CodeVitalsBot {
  private connector: GitHubConnector;

  constructor(connector?: GitHubConnector) {
    this.connector = connector || new GitHubConnector();
  }

  public async handleCommentCommand(pr: PREvent, repoPath = '.'): Promise<string> {
    const rawComment = (pr.commentBody || '').trim();
    const isBotMention =
      rawComment.toLowerCase().startsWith('@greenops-bot') ||
      rawComment.toLowerCase().startsWith('@greenops') ||
      rawComment.toLowerCase().startsWith('/greenops') ||
      rawComment.toLowerCase().startsWith('/codevitals');

    if (!isBotMention) {
      return '';
    }

    const tokens = rawComment.split(/\s+/);
    const cmd = (tokens[1] ? tokens[1].toLowerCase() : 'help').replace(/^--?/, '');

    if (cmd === 'review' || cmd === 're-review' || cmd === 'run') {
      const policy = ConfigLoader.load(repoPath).greenops!;
      if (!policy.enabled || !policy.pullRequest.enabled)
        return 'GreenOps PR reviews are disabled by repository policy.';
      let prFiles: Array<{ filename: string; content?: string }> = [];
      try {
        prFiles = await this.connector.fetchPRFiles(pr);
      } catch {
        // fallback
      }

      if (prFiles.length === 0) {
        return `> ⚠️ **GreenOps Re-Review**: Could not fetch changed files for PR #${pr.pullNumber} (${pr.owner}/${pr.repo}). Please ensure the GitHub App has repository read permissions.`;
      }

      const tempWorkspace = createPrWorkspace(prFiles);
      const analysisDir = tempWorkspace;

      try {
        const changedFilesList = prFiles.map((f) => f.filename);
        const sustainabilityReview = await new SustainabilityReviewEngine(
          undefined,
          undefined,
          new PolicyApprover(policy.fixes),
        ).review(analysisDir, {
          changedFiles: changedFilesList,
          commitSha: pr.headSha,
          minimumSeverity: policy.thresholds.minimumSeverity,
          minimumConfidence: policy.thresholds.minimumConfidence,
        });

        for (const finding of sustainabilityReview.findings) {
          if (finding.file.startsWith(tempWorkspace)) {
            finding.file = finding.file.slice(tempWorkspace.length).replace(/^[/\\]+/, '');
          }
        }

        recordSustainabilityReview(
          sustainabilityReview,
          resolve(repoPath, process.env.GREENOPS_LEDGER_PATH || 'greenops-ledger.json'),
          { source: 'github', pullRequest: pr.pullNumber },
        );

        if (policy.pullRequest.summaryComment)
          await this.connector.postSustainabilitySummary(pr, sustainabilityReview);
        const inlineComments =
          GitHubMarkdownFormatter.generateSustainabilityInlineComments(sustainabilityReview);
        if (policy.pullRequest.inlineComments && inlineComments.length > 0) {
          await this.connector.postInlineComments(pr, inlineComments);
        }
        if (policy.pullRequest.checkRun)
          await this.connector.createSustainabilityCheckRun(pr, sustainabilityReview);

        const responseMsg = `> 🔄 **GreenOps Re-Review Triggered**: Successfully refreshed sustainability analysis for commit \`${pr.headSha.slice(0, 7)}\` (${sustainabilityReview.summary.findings} finding(s) detected).`;
        return responseMsg;
      } finally {
        try {
          rmSync(tempWorkspace, { recursive: true, force: true });
        } catch {
          // ignore
        }
      }
    }

    if (cmd === 'fix') {
      const fixReply = `### 🛠️ GreenOps Sandbox Fix Guidance\n\nTo review supported sandbox fixes locally:\n\`\`\`bash\ngreenops review . --fix\n\`\`\`\nAn interactive terminal asks for explicit approval, a reviewer label and a reason. The source repository is not edited. Approving a GitHub check does not execute a change; remote remediation commits are not implemented.`;
      return fixReply;
    }

    const helpMessage = [
      '### 🌱 GreenOps Bot Commands',
      '',
      '- `@greenops-bot review` or `/greenops review` — Re-run full sustainability code review on this PR',
      '- `@greenops-bot fix` or `/greenops fix` — Display automated remediation instructions and patch guidance',
      '- `@greenops-bot help` — Display this command guide',
    ].join('\n');

    return helpMessage;
  }
}
