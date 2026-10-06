import { describe, expect, it } from 'vitest';
import { summarizeRecommendationSources } from '../apps/CodeVitals-MCP/website/src/app/dashboard/recommendation-source.js';

const finding = (data: Record<string, unknown>) => ({ entries: [{ stage: 'investigate', data }] });

describe('Dashboard recommendation sources', () => {
  it.each([null, -1, 2.5, Number.MAX_SAFE_INTEGER + 1])(
    'does not replace explicit unknown or invalid usage with an entry-level zero (%s)',
    (tokensUsed) => {
      const summary = summarizeRecommendationSources([
        finding({
          tokensUsed: 0,
          analysis: { provider: 'gemini', status: 'fallback', tokensUsed },
        }),
        finding({ analysis: { provider: 'gemini', status: 'generated', tokensUsed: 18 } }),
      ]);
      expect(summary).toMatchObject({ tokens: 18, missingTokenCounts: 1 });
    },
  );
  it('counts each recommendation source and includes tokens spent on rejected model output', () => {
    const summary = summarizeRecommendationSources([
      finding({
        analysis: { provider: 'ollama', model: 'gpt-oss:20b', status: 'generated', tokensUsed: 84 },
      }),
      finding({
        analysis: {
          provider: 'ollama',
          model: 'gpt-oss:20b',
          status: 'fallback',
          tokensUsed: 37,
          reason: 'Model output was incomplete or failed structured validation.',
        },
      }),
      finding({ analysis: { provider: 'offline', status: 'offline', tokensUsed: 0 } }),
    ]);

    expect(summary).toMatchObject({
      engine: 'Ollama (local)',
      generated: 1,
      fallback: 1,
      offline: 1,
      tokens: 121,
      missingTokenCounts: 0,
      localAttempted: true,
    });
    expect(summary.models).toEqual(['Ollama (local): gpt-oss:20b']);
    expect(summary.reasons).toEqual([
      { count: 1, message: 'The model output was incomplete or could not be used safely.' },
    ]);
  });

  it('shows Not run with no AI findings or no investigation entries', () => {
    expect(summarizeRecommendationSources([])).toMatchObject({
      engine: 'Not run',
      generated: 0,
      fallback: 0,
      tokens: 0,
    });
    expect(
      summarizeRecommendationSources([{ entries: [{ stage: 'detect', data: {} }] }]),
    ).toMatchObject({ engine: 'Not run', notRun: 1 });
  });

  it('does not infer a successful call or complete usage from legacy engine names', () => {
    const summary = summarizeRecommendationSources([
      finding({ reasoner: 'openai-responses:gpt-5' }),
      finding({ reasoner: 'openai-responses:gpt-5', tokensUsed: 0 }),
      finding({ reasoner: 'ollama-chat:gpt-oss:20b' }),
      finding({ reasoner: 'offline-fallback:gpt-5' }),
    ]);

    expect(summary).toMatchObject({
      generated: 0,
      unconfirmed: 3,
      fallback: 1,
      tokens: 0,
      missingTokenCounts: 3,
    });
    expect(summary.models).toEqual(['OpenAI: gpt-5', 'Ollama (local): gpt-oss:20b']);
    expect(
      summarizeRecommendationSources([
        finding({ reasoner: 'openai-responses:gpt-5', tokensUsed: 22 }),
      ]),
    ).toMatchObject({ generated: 1, tokens: 22 });
  });

  it('honors explicit generated metadata even when usage is zero and supports mixed providers', () => {
    const summary = summarizeRecommendationSources([
      finding({
        analysis: { provider: 'openai', model: 'gpt-5', status: 'generated', tokensUsed: 0 },
      }),
      finding({
        analysis: { provider: 'ollama', model: 'gpt-oss:20b', status: 'generated' },
        tokensUsed: 42,
      }),
    ]);

    expect(summary).toMatchObject({
      engine: 'Multiple models',
      generated: 2,
      tokens: 42,
      missingTokenCounts: 0,
    });
  });

  it('explains insufficient local memory without claiming a model response', () => {
    const summary = summarizeRecommendationSources([
      finding({
        analysis: {
          provider: 'ollama',
          model: 'gpt-oss:20b',
          status: 'fallback',
          tokensUsed: 0,
          reason:
            'Local model could not load because there is not enough memory; free memory or use a larger machine.',
        },
      }),
    ]);

    expect(summary).toMatchObject({
      engine: 'Offline fallback',
      generated: 0,
      fallback: 1,
      tokens: 0,
    });
    expect(summary.reasons).toEqual([
      {
        count: 1,
        message:
          'There was not enough memory to load the local model. Free memory or use a machine with more RAM.',
      },
    ]);
  });

  it('never renders raw provider errors from uploaded ledgers', () => {
    const summary = summarizeRecommendationSources([
      finding({
        analysis: {
          provider: 'ollama',
          status: 'fallback',
          reason: 'https://private.example?api_key=secret-value',
          tokensUsed: -1,
        },
      }),
    ]);

    expect(summary.reasons).toEqual([
      { count: 1, message: 'The model was unavailable; a rule-based recommendation was used.' },
    ]);
    expect(JSON.stringify(summary)).not.toContain('secret-value');
    expect(summary).toMatchObject({ tokens: 0, missingTokenCounts: 1 });
    expect(
      summarizeRecommendationSources([
        finding({ analysis: { provider: 'ollama', status: 'fallback', reason: '__proto__' } }),
      ]).reasons,
    ).toEqual([
      { count: 1, message: 'The model was unavailable; a rule-based recommendation was used.' },
    ]);
  });

  it('recognizes recorded Gemini generation, model usage, and fallback metadata', () => {
    const summary = summarizeRecommendationSources([
      finding({
        analysis: { provider: 'gemini', model: 'gemini-test', status: 'generated', tokensUsed: 86 },
      }),
      finding({
        analysis: {
          provider: 'gemini',
          model: 'gemini-test',
          status: 'fallback',
          tokensUsed: 12,
          reason: 'Model service failed; further requests are skipped for this run.',
        },
      }),
    ]);

    expect(summary).toMatchObject({
      engine: 'Gemini',
      generated: 1,
      fallback: 1,
      tokens: 98,
      providers: ['gemini'],
      localAttempted: false,
    });
    expect(summary.models).toEqual(['Gemini: gemini-test']);
    expect(summary.reasons).toEqual([
      {
        count: 1,
        message: 'The model service failed; further requests were skipped for this run.',
      },
    ]);
  });

  it('honors explicit Gemini generation without assuming missing usage is zero', () => {
    expect(
      summarizeRecommendationSources([
        finding({ analysis: { provider: 'gemini', status: 'generated' } }),
        finding({ analysis: { provider: 'gemini', status: 'generated', tokensUsed: 0 } }),
        finding({ analysis: { provider: 'gemini', status: 'generated', tokensUsed: null } }),
      ]),
    ).toMatchObject({ engine: 'Gemini', generated: 3, tokens: 0, missingTokenCounts: 2 });
  });

  it('recovers legacy Gemini usage that was hidden by offline baseline metadata', () => {
    expect(
      summarizeRecommendationSources([
        finding({
          reasoner: 'gemini-reasoner',
          tokensUsed: 153,
          analysis: { provider: 'offline', status: 'offline', tokensUsed: 0 },
        }),
        finding({ reasoner: 'gemini-reasoner', tokensUsed: 47 }),
      ]),
    ).toMatchObject({
      engine: 'Gemini',
      generated: 2,
      offline: 0,
      tokens: 200,
      providers: ['gemini'],
    });
  });

  it('keeps legacy Gemini without positive usage or fallback evidence unconfirmed', () => {
    const summary = summarizeRecommendationSources([
      finding({
        reasoner: 'gemini-reasoner',
        analysis: { provider: 'offline', status: 'offline', tokensUsed: 0 },
      }),
      finding({ reasoner: 'gemini-reasoner', tokensUsed: 0 }),
      finding({ reasoner: 'gemini-reasoner' }),
      finding({}),
    ]);
    expect(summary).toMatchObject({
      engine: 'Unconfirmed',
      generated: 0,
      fallback: 0,
      offline: 0,
      unconfirmed: 4,
      tokens: 0,
      missingTokenCounts: 3,
    });
  });

  it.each([
    ['TypeError: fetch failed', 'Could not connect to the model service.'],
    ['APIConnectionError: Connection error.', 'Could not connect to the model service.'],
    ['Error: connect ECONNREFUSED', 'Could not connect to the model service.'],
    ['AbortError: This operation was aborted', 'The model did not respond within the time limit.'],
    ['TimeoutError: The operation timed out', 'The model did not respond within the time limit.'],
    ['Error: Gemini request failed with HTTP 503', 'The model service failed.'],
    [
      'Error: Gemini request failed with HTTP 401',
      'The model service rejected access. Check provider credentials or permissions.',
    ],
    [
      'Error: Gemini request failed with HTTP 404',
      'The requested model or endpoint was not found.',
    ],
    [
      'Error: Gemini request failed with HTTP 429',
      'The model service reported a quota or rate limit.',
    ],
    [
      'Error: unrecognized provider failure',
      'The model was unavailable; a rule-based recommendation was used.',
    ],
  ])('classifies legacy Gemini failure safely: %s', (error, message) => {
    const summary = summarizeRecommendationSources([
      {
        entries: [
          {
            stage: 'investigate',
            data: {
              reasoner: 'gemini-reasoner',
              tokensUsed: 0,
              analysis: { provider: 'offline', status: 'offline', tokensUsed: 0 },
            },
          },
          {
            stage: 'compare',
            data: {
              reasoning: `Gemini unavailable; used the offline reasoner. ${error} https://private.example?api_key=secret-value`,
            },
          },
        ],
      },
    ]);
    expect(summary).toMatchObject({
      engine: 'Offline fallback',
      generated: 0,
      fallback: 1,
      offline: 0,
      tokens: 0,
      providers: ['gemini'],
      reasons: [{ count: 1, message }],
    });
    expect(JSON.stringify(summary)).not.toContain('secret-value');
    expect(JSON.stringify(summary)).not.toContain('private.example');
  });

  it('uses explicit Gemini metadata before legacy comparison text', () => {
    const summary = summarizeRecommendationSources([
      {
        entries: [
          {
            stage: 'investigate',
            data: {
              reasoner: 'gemini-reasoner',
              analysis: { provider: 'gemini', status: 'generated', tokensUsed: 22 },
            },
          },
          {
            stage: 'compare',
            data: {
              reasoning: 'Gemini unavailable; used the offline reasoner. Error: stale failure',
            },
          },
        ],
      },
    ]);
    expect(summary).toMatchObject({ engine: 'Gemini', generated: 1, fallback: 0, tokens: 22 });
  });

  it('ignores malformed provider and status fields without coercing uploaded objects', () => {
    expect(
      summarizeRecommendationSources([
        finding({ analysis: { provider: { toString: {} } } }),
        finding({ analysis: { provider: 'gemini', status: { toString: {} } } }),
      ]),
    ).toMatchObject({ generated: 0, unconfirmed: 2 });
  });
});
