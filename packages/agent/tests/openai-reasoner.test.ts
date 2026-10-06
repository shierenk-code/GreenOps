import { describe, expect, it, vi } from 'vitest';
import type OpenAI from 'openai';
import type { SustainabilityBug } from '@greenops/detect';
import { createReasonerFromEnv, OpenAIReasoner } from '../src/openai-reasoner.js';

const bug: SustainabilityBug = {
  id: 'bug_ai_retry',
  agentId: 'ai-efficiency',
  agentName: 'AI Efficiency Agent',
  category: 'ai-retry-storm',
  severity: 'high',
  title: "Call 'safe-call-id' retried 5 times",
  location: { filePath: 'private/ai-usage.json', startLine: 1, endLine: 1 },
  rationale: 'A privacy-safe retry storm was detected.',
  evidence: { retries: 5, tokensPerAttempt: 1500, promptFingerprint: 'abc123def456' },
  estimatedWaste: { metric: 'tokens.avoided', perRun: 7500, unit: 'tokens', assumptions: [] },
};

describe('OpenAIReasoner', () => {
  it('returns structured AI guidance and accounts for model tokens', async () => {
    const create = vi.fn().mockResolvedValue({
      output_text: JSON.stringify({
        rootCause: 'Transient failures are retried without a bounded policy.',
        strategies: [
          {
            id: 'backoff-circuit-breaker',
            title: 'Bound retries and add a circuit breaker',
            description:
              'Retry transient failures with jitter and stop after a strict attempt budget.',
            expectedReductionFactor: 0.8,
            effort: 'small',
            reversible: true,
          },
        ],
        recommendedStrategyId: 'backoff-circuit-breaker',
        reasoning:
          'Five retries resend 1,500 tokens each, so bounded retries target the measured waste.',
      }),
      usage: { total_tokens: 321 },
    });
    const client = { responses: { create } } as unknown as OpenAI;
    const reasoner = new OpenAIReasoner({ apiKey: 'test-key', model: 'test-model', client });
    const result = await reasoner.investigate(bug);

    expect(result.tokensUsed).toBe(321);
    expect(result.analysis).toEqual({
      provider: 'openai',
      model: 'test-model',
      status: 'generated',
      tokensUsed: 321,
      requestAttempted: true,
    });
    expect(result.recommendedStrategyId).toBe('backoff-circuit-breaker');
    expect(reasoner.name).toBe('openai-responses:test-model');
    const request = create.mock.calls[0]?.[0];
    expect(request.input).not.toContain('private/ai-usage.json');
    expect(request.input).toContain('abc123def456');
  });

  it('uses the offline reasoner when no real API key is configured', () => {
    expect(createReasonerFromEnv({}).name).toBe('offline-rule-reasoner');
    expect(createReasonerFromEnv({ OPENAI_API_KEY: 'sk-project-your-key-here' }).name).toBe(
      'offline-rule-reasoner',
    );
  });

  it('labels API failures as offline fallback instead of claiming LLM usage', async () => {
    const client = {
      responses: { create: vi.fn().mockRejectedValue(new Error('provider unavailable')) },
    } as unknown as OpenAI;
    const reasoner = new OpenAIReasoner({ apiKey: 'test-key', model: 'test-model', client });

    const result = await reasoner.investigate(bug);

    expect(result.tokensUsed).toBeNull();
    expect(result.reasoning).toContain('deterministic fallback');
    expect(reasoner.name).toBe('offline-fallback:test-model');
    expect(result.analysis).toMatchObject({
      provider: 'openai',
      status: 'fallback',
      tokensUsed: null,
      requestAttempted: true,
    });
  });

  it('records consumed tokens even when model output is invalid', async () => {
    const client = {
      responses: {
        create: vi.fn().mockResolvedValue({ output_text: 'not JSON', usage: { total_tokens: 82 } }),
      },
    } as unknown as OpenAI;
    const result = await new OpenAIReasoner({ apiKey: 'test-key', client }).investigate(bug);
    expect(result.analysis).toMatchObject({
      provider: 'openai',
      status: 'fallback',
      tokensUsed: 82,
    });
    expect(result.tokensUsed).toBe(82);
  });
});
