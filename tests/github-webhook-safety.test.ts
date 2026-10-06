import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { createHmac } from 'node:crypto';
import { GitHubConnector } from '../packages/connectors/src/github.js';
import { GitHubAppServer, MAX_WEBHOOK_BYTES } from '../packages/github-app/src/server.js';
import { createPrWorkspace, MAX_PR_FILE_BYTES } from '../packages/github-app/src/pr-workspace.js';

afterEach(() => vi.unstubAllEnvs());

describe('GitHub webhook safety', () => {
  it('fails closed when the webhook secret is absent', () => {
    vi.stubEnv('GITHUB_WEBHOOK_SECRET', '');
    expect(new GitHubConnector().verifySignature('{}', '')).toBe(false);
  });
  it('rejects malformed, truncated, and incorrect signatures', () => {
    const connector = new GitHubConnector({ webhookSecret: 'test-secret' });
    const sig = 'sha256=' + createHmac('sha256', 'test-secret').update('{}').digest('hex');
    expect(connector.verifySignature('{}', sig)).toBe(true);
    expect(connector.verifySignature('{}', sig + 'zz')).toBe(false);
    expect(connector.verifySignature('{}', sig.slice(0, -1))).toBe(false);
    expect(connector.verifySignature('{ }', sig)).toBe(false);
  });
  it('returns 401 for unsigned requests and 413 for oversized payloads', async () => {
    vi.stubEnv('GREENOPS_LLM_PROVIDER', 'offline');
    const server = new GitHubAppServer({ port: 0, webhookSecret: 'test-secret' });
    const port = await server.start();
    try {
      const endpoint = `http://127.0.0.1:${port}/api/webhooks/github`;
      expect((await fetch(endpoint, { method: 'POST', body: '{}' })).status).toBe(401);
      expect(
        (await fetch(endpoint, { method: 'POST', body: 'x'.repeat(MAX_WEBHOOK_BYTES + 1) })).status,
      ).toBe(413);
      const body = '{}';
      const sig = 'sha256=' + createHmac('sha256', 'test-secret').update(body).digest('hex');
      expect(
        (await fetch(endpoint, { method: 'POST', body, headers: { 'x-hub-signature-256': sig } }))
          .status,
      ).toBe(200);
    } finally {
      await server.stop();
    }
  });
});

describe('bounded PR file staging', () => {
  it.each([
    '../escape.ts',
    '/escape.ts',
    'C:/escape.ts',
    'C:escape.ts',
    'src/../../escape.ts',
    'src\\escape.ts',
    'src/file.ts:stream',
    'src/NUL',
    'src/file.',
  ])('rejects unsafe path %s', (filename) => {
    expect(() => createPrWorkspace([{ filename, content: 'test' }])).toThrow('Unsafe');
  });
  it('rejects oversized content and case-colliding filenames', () => {
    expect(() =>
      createPrWorkspace([{ filename: 'a.ts', content: 'x'.repeat(MAX_PR_FILE_BYTES + 1) }]),
    ).toThrow('limit');
    expect(() => createPrWorkspace([{ filename: 'a.ts' }, { filename: 'A.ts' }])).toThrow(
      'Duplicate',
    );
  });
  it('writes safe nested paths in a temporary workspace', () => {
    const workspace = createPrWorkspace([
      { filename: 'src/test.ts', content: 'export const x = 1;' },
    ]);
    try {
      expect(readFileSync(join(workspace, 'src/test.ts'), 'utf8')).toContain('export const x');
    } finally {
      rmSync(workspace, { recursive: true, force: true });
    }
  });
});
