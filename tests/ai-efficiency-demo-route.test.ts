import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  GET,
  POST,
} from '../apps/CodeVitals-MCP/website/src/app/dashboard/ai-efficiency-demo/api/route';

vi.mock('server-only', () => ({}));
vi.mock('../apps/CodeVitals-MCP/website/src/app/dashboard/ai-efficiency-demo/demo-config', () => ({
  demoCredentials: async () => ({ apiKey: '', model: 'test-model' }),
  publicDemoConfig: () => ({ geminiAvailable: false, model: null, liveRequestLimit: 13 }),
}));
const state = vi.hoisted(() => ({ perform: vi.fn(), current: vi.fn().mockResolvedValue(null) }));
vi.mock(
  '../apps/CodeVitals-MCP/website/src/app/dashboard/ai-efficiency-demo/demo-service',
  async (importOriginal) => ({
    ...(await importOriginal<object>()),
    createDemoService: () => ({ ...state, busy: () => false }),
  }),
);
const requireWebsite = createRequire(
  resolve(__dirname, '../apps/CodeVitals-MCP/website/package.json'),
);
const { NextRequest } = requireWebsite('next/server');
const url = 'http://localhost:3000/dashboard/ai-efficiency-demo/api';
beforeEach(() => vi.clearAllMocks());

describe('Local demo API request guards', () => {
  it('returns only safe configuration with a strict HttpOnly session cookie', async () => {
    const result = await GET(new NextRequest(url));
    expect(result.status).toBe(200);
    expect(result.headers.get('cache-control')).toBe('no-store');
    expect(result.headers.get('set-cookie')).toMatch(/HttpOnly/i);
    expect(result.headers.get('set-cookie')).toMatch(/SameSite=strict/i);
    const body = await result.json();
    expect(body.config.geminiAvailable).toBe(false);
    expect(JSON.stringify(body)).not.toContain('apiKey');
    expect(body.dataset).toHaveLength(8);
  });
  it('rejects non-local hosts and cross-site fetches', async () => {
    expect((await GET(new NextRequest(url.replace('localhost', 'public.example')))).status).toBe(
      403,
    );
    expect(
      (await GET(new NextRequest(url, { headers: { 'sec-fetch-site': 'cross-site' } }))).status,
    ).toBe(403);
  });
  it('requires same Origin, JSON and a custom action header before any mutation', async () => {
    for (const headers of [
      {},
      { origin: 'http://evil.example', 'content-type': 'application/json', 'x-greenops-demo': '1' },
      { origin: 'http://localhost:3000', 'content-type': 'text/plain', 'x-greenops-demo': '1' },
      { origin: 'http://localhost:3000', 'content-type': 'application/json' },
    ]) {
      expect(
        (
          await POST(
            new NextRequest(url, {
              method: 'POST',
              headers,
              body: '{"action":"start","mode":"fixture"}',
            }),
          )
        ).status,
      ).toBe(403);
    }
    expect(state.perform).not.toHaveBeenCalled();
  });
  it('rejects invalid and overlarge bodies before mutation', async () => {
    const headers = {
      origin: 'http://localhost:3000',
      'content-type': 'application/json',
      'x-greenops-demo': '1',
    };
    expect(
      (await POST(new NextRequest(url, { method: 'POST', headers, body: 'invalid' }))).status,
    ).toBe(400);
    expect(
      (await POST(new NextRequest(url, { method: 'POST', headers, body: ' '.repeat(5000) })))
        .status,
    ).toBe(413);
    expect(state.perform).not.toHaveBeenCalled();
  });
  it('accepts the original loopback Host when Next normalizes the request URL', async () => {
    state.perform.mockResolvedValue(null);
    for (const host of ['localhost:3000', '127.0.0.1:3000', '[::1]:3000']) {
      const response = await POST(
        new NextRequest(url, {
          method: 'POST',
          headers: {
            host,
            origin: `http://${host}`,
            'content-type': 'application/json',
            'x-greenops-demo': '1',
          },
          body: '{"action":"start","mode":"fixture"}',
        }),
      );
      expect(response.status).toBe(200);
    }
    expect(state.perform).toHaveBeenCalledTimes(3);
  });
  it('rejects spoofed Host authorities, mismatched origins, and forwarded-host overrides', async () => {
    for (const [host, origin] of [
      ['evil.example', 'http://evil.example'],
      ['localhost:3000@evil.example', 'http://evil.example'],
      ['127.0.0.1:3000', 'http://localhost:3000'],
      ['localhost:3000', 'http://evil.example'],
      ['localhost:3000/path', 'http://localhost:3000'],
    ]) {
      const response = await POST(
        new NextRequest(url, {
          method: 'POST',
          headers: {
            host,
            origin,
            'x-forwarded-host': 'localhost:3000',
            'content-type': 'application/json',
            'x-greenops-demo': '1',
          },
          body: '{"action":"start","mode":"fixture"}',
        }),
      );
      expect(response.status).toBe(403);
    }
    expect(state.perform).not.toHaveBeenCalled();
  });
});
