import { describe, it, expect } from 'vitest';
import { GitHubConnector, GitHubMarkdownFormatter } from '../src/index.js';
import { PRReviewResult } from '@codevitals/review';
import { createHmac } from 'node:crypto';
import { SustainabilityReviewEngine } from '@greenops/agent';
import { join } from 'node:path';

describe('GitHubConnector & Markdown Formatter', () => {
  it('verifies HMAC-SHA256 webhook signatures', () => {
    const secret = 'my-webhook-secret';
    const connector = new GitHubConnector({ webhookSecret: secret });

    const body = JSON.stringify({ action: 'opened', pull_request: { number: 42 } });
    const signature = 'sha256=' + createHmac('sha256', secret).update(body).digest('hex');

    expect(connector.verifySignature(body, signature)).toBe(true);
    expect(connector.verifySignature(body, 'sha256=invalid')).toBe(false);
  });

  it('formats shared GreenOps findings for PR summaries and inline comments', async () => {
    const review = await new SustainabilityReviewEngine().review(
      join(process.cwd(), 'fixtures', 'greenops-sample'),
    );
    const markdown = GitHubMarkdownFormatter.formatSustainabilityReview(review);
    const comments = GitHubMarkdownFormatter.generateSustainabilityInlineComments(review);

    expect(markdown).toContain('Summary by GreenOps');
    expect(markdown).toContain(review.analysisId);
    expect(comments).toHaveLength(review.findings.length);
    expect(comments[0]?.body).toContain('Sustainability Review');
  });

  it('formats PR review results into CodeRabbit-style markdown summary', () => {
    const mockResult: PRReviewResult = {
      repositoryPath: '/repo',
      diffSpec: 'HEAD~1',
      semanticDiff: {
        changedFiles: [{ path: 'src/user.ts', status: 'modified', additions: 10, deletions: 2 }],
        changedSymbols: [
          {
            name: 'getUser',
            qualifiedName: 'UserService.getUser',
            kind: 'method',
            filePath: 'src/user.ts',
            changeType: 'modified',
            startLine: 12,
            endLine: 24,
            exported: true,
          },
        ],
        addedSymbolsCount: 0,
        removedSymbolsCount: 0,
        modifiedSymbolsCount: 1,
      },
      blastRadius: {
        affectedCallers: [{ id: 'sym_caller1', name: 'handleRequest', type: 'function' }],
        affectedCallees: [],
        affectedTests: [{ id: 'test_user', name: 'user.test.ts', type: 'test' }],
        affectedModules: ['src'],
        dependencyImpact: [],
        totalImpactedNodesCount: 2,
      },
      riskAnalysis: {
        score: 45,
        level: 'medium',
        factors: ['Public export modified.'],
        recommendations: ['Run user.test.ts test suite.'],
      },
      status: '✓ Review completed',
    };

    const markdown = GitHubMarkdownFormatter.formatPRReviewMarkdown(mockResult);
    expect(markdown).toContain('GreenOps AI Code Review');
    expect(markdown).toContain('Risk_Level-MEDIUM');
    expect(markdown).toContain('UserService.getUser');
    expect(markdown).toContain('handleRequest');

    const inlineComments = GitHubMarkdownFormatter.generateInlineComments(mockResult);
    expect(inlineComments).toHaveLength(1);
    expect(inlineComments[0].path).toBe('src/user.ts');
  });
});
