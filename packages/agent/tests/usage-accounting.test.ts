import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SustainabilityBug } from '@greenops/detect';
import { SustainabilityLedger } from '@greenops/ledger';
import { GreenOpsAgent } from '../src/agent.js';
import type { Reasoner } from '../src/contracts.js';
import { OfflineReasoner } from '../src/offline-reasoner.js';
import { GeminiReasoner } from '../src/gemini-reasoner.js';
import { recordedTokens } from '../src/llm-investigation.js';
import type OpenAI from 'openai';
import { OpenAIReasoner } from '../src/openai-reasoner.js';
import { OllamaReasoner } from '../src/ollama-reasoner.js';

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

const bug: SustainabilityBug = {
  id: 'cache-finding',
  category: 'uncached-completion',
  severity: 'medium',
  title: 'Repeated prompt',
  rationale: 'Repeated inference',
  location: { filePath: 'synthetic.json', startLine: 1, endLine: 1 },
  evidence: { requests: 2 },
  estimatedWaste: { metric: 'tokens.avoided', perRun: 100, unit: 'tokens', assumptions: [] },
};
const guidance = {
  rootCause: 'Duplicate prompts',
  reasoning: 'Review a response cache.',
  recommendedStrategyId: 'add-response-cache',
};
function response(tokens?: unknown) {
  return new Response(
    JSON.stringify({
      candidates: [
        { finishReason: 'STOP', content: { parts: [{ text: JSON.stringify(guidance) }] } },
      ],
      ...(tokens === undefined ? {} : { usageMetadata: { totalTokenCount: tokens } }),
    }),
  );
}
async function run(reasoner: Reasoner, count = 1, maxRetries = 2) {
  const root = mkdtempSync(join(tmpdir(), 'greenops-usage-test-'));
  roots.push(root);
  const ledgerPath = join(root, 'ledger.json');
  const onEvent = vi.fn();
  await new GreenOpsAgent({
    targetPath: root,
    ledgerPath,
    reasoner,
    maxRetries,
    onEvent,
    approver: {
      name: 'human-review-required',
      decide: async () => ({ approved: false, approver: 'test-policy' }),
    },
    bugsProvider: () => ({
      scanned: { calls: count },
      bugs: Array.from({ length: count }, (_, i) => ({ ...bug, id: `${bug.id}-${i}` })),
    }),
  }).run();
  const ledger = new SustainabilityLedger(ledgerPath);
  return { outcome: ledger.allOutcomes()[0]!, entries: ledger.allEntries(), onEvent };
}

describe('provider usage is evidence, not a default zero', () => {
  it.each([undefined, null, -1, 1.5, NaN, Infinity, '42', Number.MAX_SAFE_INTEGER + 1])(
    'normalizes unknown/invalid value %s to null',
    (value) => {
      expect(recordedTokens(value)).toBeNull();
    },
  );
  it.each([0, 42])('preserves valid report %s', (value) =>
    expect(recordedTokens(value)).toBe(value),
  );

  describe.each(['openai', 'ollama', 'gemini'] as const)('%s usage normalization', (provider) => {
    it.each([undefined, null, -1, 1.5, '8', 0, 8])(
      'retains generated status with usage %s',
      async (tokens) => {
        const baseline = await new OfflineReasoner().investigate(bug);
        const content = JSON.stringify({
          rootCause: guidance.rootCause,
          reasoning: guidance.reasoning,
          recommendedStrategyId: baseline.recommendedStrategyId,
          strategies: baseline.strategies,
        });
        const usage = tokens === undefined ? {} : { usage: { total_tokens: tokens } };
        const reasoner =
          provider === 'gemini'
            ? new GeminiReasoner({ apiKey: 'test-key', fetcher: async () => response(tokens) })
            : provider === 'openai'
              ? new OpenAIReasoner({
                  apiKey: 'test-key',
                  client: {
                    responses: { create: async () => ({ output_text: content, ...usage }) },
                  } as unknown as OpenAI,
                })
              : new OllamaReasoner({
                  client: {
                    chat: {
                      completions: {
                        create: async () => ({
                          choices: [{ finish_reason: 'stop', message: { content } }],
                          ...usage,
                        }),
                      },
                    },
                  } as unknown as OpenAI,
                });
        const result = await reasoner.investigate(bug);
        expect(result.tokensUsed).toBe(recordedTokens(tokens));
        expect(result.analysis).toMatchObject({
          provider,
          status: 'generated',
          requestAttempted: true,
          tokensUsed: recordedTokens(tokens),
        });
      },
    );
  });

  it('retains a successful LLM response with missing usage and withholds net claims', async () => {
    const result = await run(
      new GeminiReasoner({ apiKey: 'test-key', fetcher: async () => response() }),
    );
    expect(
      result.entries.find((entry) => entry.stage === 'investigate')?.data.analysis,
    ).toMatchObject({ status: 'generated', tokensUsed: null, requestAttempted: true });
    expect(result.outcome.selfCost).toMatchObject({
      tokens: null,
      knownTokens: 0,
      usageComplete: false,
      llmCalls: 1,
      unknownLlmCalls: 1,
      toolCalls: 1,
      energyKwh: null,
      carbonKgCo2e: null,
    });
    expect(result.outcome.net).toEqual({ energyKwh: null, carbonKgCo2e: null, netPositive: null });
    expect(result.onEvent.mock.calls.flat().join(' ')).toContain('usage not reported');
  });

  it('does not count a circuit-breaker skip as another provider request', async () => {
    const fetcher = vi.fn(async () => new Response('private-provider-error', { status: 429 }));
    const result = await run(new GeminiReasoner({ apiKey: 'test-key', fetcher }), 3);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(result.outcome.selfCost).toMatchObject({
      tokens: null,
      knownTokens: 0,
      usageComplete: false,
      llmCalls: 1,
      unknownLlmCalls: 1,
      toolCalls: 3,
      retries: 0,
    });
    const entries = result.entries.filter((entry) => entry.stage === 'investigate');
    expect(entries.map((entry) => entry.data.tokensUsed)).toEqual([null, 0, 0]);
    expect(entries[1]?.data.analysis).toMatchObject({ requestAttempted: false });
  });

  it('reports a known subtotal for mixed complete and incomplete model responses', async () => {
    const fetcher = vi
      .fn()
      .mockImplementationOnce(async () => response(17))
      .mockImplementationOnce(async () => response())
      .mockImplementationOnce(async () => response(0));
    const result = await run(new GeminiReasoner({ apiKey: 'test-key', fetcher }), 3);
    expect(result.outcome.selfCost).toMatchObject({
      tokens: null,
      knownTokens: 17,
      usageComplete: false,
      llmCalls: 3,
      unknownLlmCalls: 1,
      toolCalls: 1,
    });
    expect(result.outcome.net.netPositive).toBeNull();
  });

  it('records explicit provider zero and explicit offline zero differently', async () => {
    const model = await run(
      new GeminiReasoner({ apiKey: 'test-key', fetcher: async () => response(0) }),
    );
    const offline = await run(new OfflineReasoner());
    expect(model.outcome.selfCost).toMatchObject({
      tokens: 0,
      usageComplete: true,
      llmCalls: 1,
      unknownLlmCalls: 0,
      toolCalls: 1,
    });
    expect(offline.outcome.selfCost).toMatchObject({
      tokens: 0,
      usageComplete: true,
      llmCalls: 0,
      unknownLlmCalls: 0,
      toolCalls: 2,
    });
  });

  it('accounts for failed attempts before a successful retry', async () => {
    const baseline = await new OfflineReasoner().investigate(bug);
    const investigate = vi
      .fn()
      .mockRejectedValueOnce(new Error('temporary model failure'))
      .mockResolvedValue({
        ...baseline,
        tokensUsed: 31,
        analysis: {
          provider: 'openai',
          status: 'generated',
          tokensUsed: 31,
          requestAttempted: true,
        },
      });
    const result = await run({ name: 'test-model', usesModel: true, investigate });
    expect(investigate).toHaveBeenCalledTimes(2);
    expect(result.outcome.selfCost).toMatchObject({
      tokens: null,
      knownTokens: 31,
      usageComplete: false,
      llmCalls: 2,
      unknownLlmCalls: 1,
      retries: 1,
    });
    expect(
      result.entries.find((entry) => entry.stage === 'investigate')?.data.usageAttempts,
    ).toEqual([
      { tokensUsed: null, requestAttempted: true },
      { tokensUsed: 31, requestAttempted: true },
    ]);
  });

  it('retains all exhausted model attempts and emits an outcome even when investigation fails', async () => {
    const investigate = vi.fn().mockRejectedValue(new Error('model failure'));
    const result = await run({ name: 'test-model', usesModel: true, investigate }, 1, 2);
    expect(investigate).toHaveBeenCalledTimes(3);
    expect(result.outcome.selfCost).toMatchObject({
      tokens: null,
      llmCalls: 3,
      unknownLlmCalls: 3,
      retries: 2,
    });
    expect(
      result.entries.find((entry) => entry.stage === 'investigate')?.data.usageAttempts,
    ).toHaveLength(3);
  });
});
