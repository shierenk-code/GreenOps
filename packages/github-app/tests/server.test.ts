import { describe, it, expect, afterAll } from 'vitest';
import { GitHubAppServer } from '../src/index.js';

describe('GitHubAppServer Integration', () => {
  let server: GitHubAppServer;
  let port = 0;

  it('starts server and responds to /health requests', async () => {
    server = new GitHubAppServer({ port: 0 }); // Random port assignment
    port = await server.start();
    expect(port).toBeGreaterThan(0);

    const res = await fetch(`http://localhost:${port}/health`);
    expect(res.status).toBe(200);
    const data = (await res.json()) as { status: string; service: string };
    expect(data.status).toBe('ok');
    expect(data.service).toBe('codevitals-github-app');
  });

  afterAll(async () => {
    if (server) {
      await server.stop();
    }
  });
});
