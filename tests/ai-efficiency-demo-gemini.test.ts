import { describe, expect, it, vi } from 'vitest';
import { createGeminiDemoProvider } from '../apps/CodeVitals-MCP/website/src/app/dashboard/ai-efficiency-demo/demo-gemini';
const item = {
  id: 'synthetic',
  prompt: 'Public question',
  expectedAnswer: 'Public answer',
  cacheable: true,
};
const evidence = {
  requests: 8,
  duplicateRequests: 4,
  excludedRequests: 2,
  uniqueCacheablePrompts: 2,
};
const response = (content: string, tokens: unknown = 10) =>
  new Response(
    JSON.stringify({
      choices: [{ finish_reason: 'stop', message: { content } }],
      usage: { total_tokens: tokens },
    }),
    { status: 200 },
  );
describe('Bounded Gemini demo adapter', () => {
  it('uses only the official endpoint and returns provider usage', async () => {
    const fetcher = vi.fn().mockResolvedValue(response('{"answer":"Public answer"}', 34));
    const provider = createGeminiDemoProvider({
      apiKey: 'test-only',
      model: 'test-model',
      fetcher,
    });
    expect(await provider.complete(item)).toEqual({ answer: 'Public answer', tokens: 34 });
    expect(fetcher.mock.calls[0][0]).toBe(
      'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
    );
    const request = fetcher.mock.calls[0][1];
    expect(request.redirect).toBe('error');
    expect(JSON.parse(request.body).max_tokens).toBe(1024);
    expect(JSON.parse(request.body).messages[1].content).not.toContain('test-only');
  });
  it('does not fabricate missing or invalid token usage', async () => {
    for (const tokens of [null, -1, '100', 1.5]) {
      const provider = createGeminiDemoProvider({
        apiKey: 'test',
        model: 'test',
        fetcher: vi.fn().mockResolvedValue(response('{"answer":"Public answer"}', tokens)),
      });
      expect((await provider.complete(item)).tokens).toBeNull();
    }
  });
  it('retains reported usage from invalid output and fails quality instead of substituting fixtures', async () => {
    const provider = createGeminiDemoProvider({
      apiKey: 'test',
      model: 'test',
      fetcher: vi.fn().mockResolvedValue(response('broken JSON', 45)),
    });
    expect(await provider.complete(item)).toEqual({
      answer: '[Invalid model response]',
      tokens: 45,
    });
  });
  it('does not echo service error bodies or network exceptions', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response('SECRET-CANARY', { status: 429 }));
    const provider = createGeminiDemoProvider({ apiKey: 'test', model: 'test', fetcher });
    await expect(provider.complete(item)).rejects.toThrow('quota');
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('distinguishes request incompatibility from service failure without exposing provider details', async () => {
    for (const [status, category] of [
      [400, 'request parameters'],
      [500, 'service error'],
      [503, 'service error'],
    ] as const) {
      const fetcher = vi.fn().mockResolvedValue(new Response('SECRET-CANARY', { status }));
      const provider = createGeminiDemoProvider({ apiKey: 'test', model: 'test', fetcher });
      await expect(provider.complete(item)).rejects.toThrow(category);
      expect(fetcher).toHaveBeenCalledTimes(1);
    }
  });
  it('records model recommendation provenance, and invalid advice falls back with usage', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(
        response(
          '{"strategy":"exact-match-cache","explanation":"Reuse identical public answers.","risk":"Exclude private answers."}',
          70,
        ),
      );
    let provider = createGeminiDemoProvider({ apiKey: 'test', model: 'test', fetcher });
    expect(await provider.recommend(evidence)).toMatchObject({ source: 'model', tokens: 70 });
    provider = createGeminiDemoProvider({
      apiKey: 'test',
      model: 'test',
      fetcher: vi.fn().mockResolvedValue(response('{"strategy":"execute-arbitrary-code"}', 66)),
    });
    expect(await provider.recommend(evidence)).toMatchObject({
      source: 'fallback',
      tokens: 66,
      strategy: 'exact-match-cache',
    });
  });
  it('enforces a per-action request budget', async () => {
    const fetcher = vi
      .fn()
      .mockImplementation(() => Promise.resolve(response('{"answer":"Public answer"}')));
    const provider = createGeminiDemoProvider({ apiKey: 'test', model: 'test', fetcher });
    for (let i = 0; i < 9; i++) await provider.complete(item);
    await expect(provider.complete(item)).rejects.toThrow('limit');
    expect(fetcher).toHaveBeenCalledTimes(9);
  });
});
