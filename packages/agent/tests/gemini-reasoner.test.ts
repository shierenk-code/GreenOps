import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SustainabilityBug } from '@greenops/detect';
import { GeminiReasoner } from '../src/gemini-reasoner.js';
import { createDefaultReasoner } from '../src/openai-reasoner.js';

const bug: SustainabilityBug = {
  id: 'bug_duplicate-import_test',
  category: 'duplicate-import',
  severity: 'low',
  title: 'Duplicate import',
  location: { filePath: 'src/example.ts', startLine: 2, endLine: 2 },
  rationale: 'The same module is imported twice.',
  evidence: { importCount: 2 },
  estimatedWaste: { metric: 'imports.redundant', perRun: 1, unit: 'imports', assumptions: [] },
};

const validResult = {
  rootCause: 'Duplicate edits added the same import twice.',
  reasoning: 'Merging the imports removes the redundant resolution work.',
  recommendedStrategyId: 'merge-imports',
  suggestedCode: "import { first, second } from './module.js';",
};

function completion(content: unknown = validResult, tokens: unknown = 55): Response {
  return new Response(
    JSON.stringify({
      candidates: [
        { finishReason: 'STOP', content: { parts: [{ text: JSON.stringify(content) }] } },
      ],
      usageMetadata: { totalTokenCount: tokens },
    }),
    { status: 200 },
  );
}

afterEach(() => vi.useRealTimers());

describe('GeminiReasoner', () => {
  it('uses the Gemini API response while preserving the trusted strategy catalog', async () => {
    const reasoner = new GeminiReasoner({
      apiKey: 'gemini-test-key',
      model: 'gemini-2.5-flash',
      fetcher: async (input, init) => {
        expect(input).toBe(
          'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent',
        );
        expect((init?.headers as Record<string, string>)['x-goog-api-key']).toBe('gemini-test-key');
        expect(init?.redirect).toBe('error');
        const body = JSON.parse(String(init?.body));
        expect(body.generationConfig.responseSchema.properties.recommendedStrategyId.enum).toEqual([
          'merge-imports',
        ]);
        expect(body.generationConfig.maxOutputTokens).toBe(4096);
        expect(String(init?.body)).not.toContain('gemini-test-key');
        expect(String(init?.body)).toContain('merge-imports');
        expect(String(init?.body)).toContain('original source snippet');
        return completion({
          ...validResult,
          strategies: [{ id: 'merge-imports', effort: 'unsafe' }],
        });
      },
    });

    const investigation = await reasoner.investigate(bug, 'original source snippet');

    expect(investigation.recommendedStrategyId).toBe('merge-imports');
    expect(investigation.tokensUsed).toBe(55);
    expect(investigation.strategies.map((strategy) => strategy.id)).toEqual(['merge-imports']);
    expect(investigation.strategies[0]).toMatchObject({ effort: 'trivial', reversible: true });
    expect(investigation.suggestedCode).toBe(validResult.suggestedCode);
    expect(investigation.analysis).toEqual({
      provider: 'gemini',
      model: 'gemini-2.5-flash',
      status: 'generated',
      tokensUsed: 55,
      requestAttempted: true,
    });
  });

  it.each([
    ['unknown strategy', { ...validResult, recommendedStrategyId: 'invented' }],
    ['missing root cause', { recommendedStrategyId: 'merge-imports' }],
    ['empty explanation', { ...validResult, reasoning: '  ' }],
    ['invalid suggested code', { ...validResult, suggestedCode: 42 }],
    ['null output', null],
  ])('records rejected tokens and sanitized fallback for %s', async (_label, content) => {
    const fetcher = vi
      .fn()
      .mockImplementationOnce(async () => completion(content, 79))
      .mockImplementationOnce(async () => completion());
    const reasoner = new GeminiReasoner({
      apiKey: 'gemini-test-key',
      fetcher,
    });

    const investigation = await reasoner.investigate(bug);

    expect(investigation.recommendedStrategyId).toBe('merge-imports');
    expect(investigation.tokensUsed).toBe(79);
    expect(investigation.reasoning).toContain('deterministic fallback');
    expect(investigation.suggestedCode).toBeUndefined();
    expect(investigation.analysis).toEqual({
      provider: 'gemini',
      model: 'gemini-3.8-flash',
      status: 'fallback',
      tokensUsed: 79,
      requestAttempted: true,
      reason: 'Model output was incomplete or failed structured validation.',
    });
    expect((await reasoner.investigate(bug)).analysis?.status).toBe('generated');
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it.each(['{secret-provider-output', ''])(
    'retains usage for malformed or empty output',
    async (content) => {
      const reasoner = new GeminiReasoner({
        apiKey: 'gemini-test-key',
        fetcher: async () =>
          new Response(
            JSON.stringify({
              candidates: [{ finishReason: 'STOP', content: { parts: [{ text: content }] } }],
              usageMetadata: { totalTokenCount: 21 },
            }),
          ),
      });
      const investigation = await reasoner.investigate(bug);
      expect(investigation.analysis).toMatchObject({
        provider: 'gemini',
        status: 'fallback',
        tokensUsed: 21,
      });
      expect(JSON.stringify(investigation)).not.toContain('secret-provider-output');
    },
  );

  it.each(['MAX_TOKENS', 'SAFETY', undefined])(
    'rejects incomplete %s output even when JSON is valid',
    async (finishReason) => {
      const reasoner = new GeminiReasoner({
        apiKey: 'gemini-test-key',
        fetcher: async () =>
          new Response(
            JSON.stringify({
              candidates: [
                { finishReason, content: { parts: [{ text: JSON.stringify(validResult) }] } },
              ],
              usageMetadata: { totalTokenCount: 23 },
            }),
          ),
      });
      expect((await reasoner.investigate(bug)).analysis).toMatchObject({
        status: 'fallback',
        tokensUsed: 23,
      });
    },
  );

  it.each([
    [401, 'Model service rejected access; check the provider credentials or permissions.'],
    [403, 'Model service rejected access; check the provider credentials or permissions.'],
    [404, 'Model or API route was not found; check the configured model and endpoint.'],
    [
      429,
      'Model service reported a quota or rate limit; further requests are skipped for this run.',
    ],
    [503, 'Model service failed; further requests are skipped for this run.'],
  ])(
    'stops further requests after HTTP %i without retaining the response body',
    async (status, reason) => {
      const fetcher = vi.fn(async () => new Response('secret-key-in-error-body', { status }));
      const reasoner = new GeminiReasoner({ apiKey: 'gemini-test-key', fetcher });
      const first = await reasoner.investigate(bug);
      const next = await reasoner.investigate(bug);
      expect(first.analysis).toMatchObject({
        provider: 'gemini',
        status: 'fallback',
        reason,
        tokensUsed: null,
        requestAttempted: true,
      });
      expect(next.analysis).toEqual({ ...first.analysis, tokensUsed: 0, requestAttempted: false });
      expect(fetcher).toHaveBeenCalledTimes(1);
      expect(JSON.stringify(first)).not.toContain('secret-key-in-error-body');
    },
  );

  it('sanitizes connection errors and stops further requests on this instance', async () => {
    const fetcher = vi.fn().mockRejectedValue(new TypeError('secret-key-in-connection-error'));
    const reasoner = new GeminiReasoner({ apiKey: 'gemini-test-key', fetcher });
    const first = await reasoner.investigate(bug);
    await reasoner.investigate(bug);
    expect(first.analysis).toMatchObject({
      provider: 'gemini',
      status: 'fallback',
      tokensUsed: null,
      requestAttempted: true,
      reason:
        'Model service could not be reached; further model requests are skipped for this run.',
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(first)).not.toContain('secret-key-in-connection-error');
    const freshReasoner = new GeminiReasoner({
      apiKey: 'gemini-test-key',
      fetcher: async () => completion(),
    });
    expect((await freshReasoner.investigate(bug)).analysis?.status).toBe('generated');
  });

  it('aborts timed out requests and skips later findings', async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn(
      (_input: Parameters<typeof fetch>[0], init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new Error('secret-timeout-detail')));
        }),
    );
    const reasoner = new GeminiReasoner({ apiKey: 'gemini-test-key', fetcher, timeoutMs: 10 });
    const pending = reasoner.investigate(bug);
    await vi.advanceTimersByTimeAsync(10);
    const first = await pending;
    await reasoner.investigate(bug);
    expect(first.analysis).toMatchObject({
      provider: 'gemini',
      status: 'fallback',
      tokensUsed: null,
      requestAttempted: true,
      reason: 'Model request timed out; further model requests are skipped for this run.',
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(first)).not.toContain('secret-timeout-detail');
  });

  it.each([-1, 1.5, '55', null])('does not record invalid usage %s', async (tokens) => {
    const reasoner = new GeminiReasoner({
      apiKey: 'gemini-test-key',
      fetcher: async () => completion(validResult, tokens),
    });
    const investigation = await reasoner.investigate(bug);
    expect(investigation.tokensUsed).toBeNull();
    expect(investigation.analysis?.tokensUsed).toBeNull();
    expect(investigation.analysis?.requestAttempted).toBe(true);
  });

  it('selects GeminiReasoner in createDefaultReasoner when GEMINI_API_KEY is present', () => {
    const reasoner = createDefaultReasoner({ GEMINI_API_KEY: 'AQ.TestKey123' });
    expect(reasoner.name).toBe('gemini-reasoner');
  });

  it('ignores thought parts and records total usage including thinking', async () => {
    const reasoner = new GeminiReasoner({
      apiKey: 'test-key',
      fetcher: async () =>
        new Response(
          JSON.stringify({
            candidates: [
              {
                finishReason: 'STOP',
                content: {
                  parts: [
                    { thought: true, text: 'PRIVATE_THOUGHT' },
                    { text: JSON.stringify(validResult) },
                  ],
                },
              },
            ],
            usageMetadata: { totalTokenCount: 123 },
          }),
        ),
    });
    const result = await reasoner.investigate(bug);
    expect(result.analysis).toMatchObject({ status: 'generated', tokensUsed: 123 });
    expect(JSON.stringify(result)).not.toContain('PRIVATE_THOUGHT');
  });

  it('rejects blocked prompts even if a candidate is supplied', async () => {
    const reasoner = new GeminiReasoner({
      apiKey: 'test-key',
      fetcher: async () =>
        new Response(
          JSON.stringify({
            promptFeedback: { blockReason: 'SAFETY' },
            candidates: [
              { finishReason: 'STOP', content: { parts: [{ text: JSON.stringify(validResult) }] } },
            ],
            usageMetadata: { totalTokenCount: 9 },
          }),
        ),
    });
    expect((await reasoner.investigate(bug)).analysis).toMatchObject({
      status: 'fallback',
      tokensUsed: 9,
    });
  });

  it('preserves explicitly configured OpenAI-compatible endpoints', async () => {
    const reasoner = new GeminiReasoner({
      apiKey: 'test-key',
      endpoint: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
      fetcher: async (_input, init) => {
        expect((init?.headers as Record<string, string>).Authorization).toBe('Bearer test-key');
        expect(JSON.parse(String(init?.body)).messages).toHaveLength(2);
        return new Response(
          JSON.stringify({
            choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(validResult) } }],
            usage: { total_tokens: 55 },
          }),
        );
      },
    });
    expect((await reasoner.investigate(bug)).analysis).toMatchObject({
      status: 'generated',
      tokensUsed: 55,
    });
  });

  it('keeps placeholder credentials on the offline path', () => {
    expect(createDefaultReasoner({ GEMINI_API_KEY: 'your_gemini_api_key_here' }).name).toBe(
      'offline-rule-reasoner',
    );
  });
});
