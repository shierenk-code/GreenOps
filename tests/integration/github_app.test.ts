import { afterAll, beforeAll, describe, it, expect } from 'vitest';
import { GitHubAppServer } from '../../packages/github-app/src/index.js';
import { GitHubConnector, GitHubMarkdownFormatter } from '../../packages/connectors/src/index.js';
import { PRReviewer } from '../../packages/review/src/index.js';
import { createTempGitRepo, type TempGitRepo } from '../helpers/temp-git-repo.js';

describe('GitHub App & Connector Integration', () => {
  let repo: TempGitRepo;
  beforeAll(() => {
    repo = createTempGitRepo();
  });
  afterAll(() => repo.cleanup());

  it('starts webhook server and verifies health check endpoint', async () => {
    const server = new GitHubAppServer({ port: 0 });
    const port = await server.start();
    expect(port).toBeGreaterThan(0);

    const res = await fetch(`http://localhost:${port}/health`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string; service: string };
    expect(body.status).toBe('ok');

    await server.stop();
  });

  it('generates CodeRabbit-style markdown summary and inline comment alerts', () => {
    const reviewer = new PRReviewer();
    const result = reviewer.review(repo.path, { diffSpec: 'HEAD~1' });

    const markdown = GitHubMarkdownFormatter.formatPRReviewMarkdown(result);
    expect(markdown).toContain('GreenOps AI Code Review');
    expect(markdown).toContain('PR Impact Summary');

    const inlineComments = GitHubMarkdownFormatter.generateInlineComments(result);
    expect(Array.isArray(inlineComments)).toBe(true);
  });
});
