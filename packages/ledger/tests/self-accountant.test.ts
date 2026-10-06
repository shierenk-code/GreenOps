import { describe, expect, it } from 'vitest';
import { GreenOpsMeasure } from '@greenops/measure';
import { SelfAccountant } from '../src/self-accountant.js';

describe('honest agent usage accounting', () => {
  it('keeps explicit no-model work at zero tokens', () => {
    const meter = new SelfAccountant(new GreenOpsMeasure());
    meter.recordTool('offline-analysis', 50);
    expect(meter.summary()).toMatchObject({
      totalTokens: 0,
      knownTokens: 0,
      usageComplete: true,
      llmCalls: 0,
      unknownLlmCalls: 0,
      totalToolCalls: 1,
    });
    expect(meter.summary().energyKwh).toBeTypeOf('number');
  });

  it('records a zero-token provider report as an LLM call, not a tool call', () => {
    const meter = new SelfAccountant(new GreenOpsMeasure());
    meter.recordLlm('investigate', 0);
    expect(meter.summary()).toMatchObject({
      totalTokens: 0,
      knownTokens: 0,
      usageComplete: true,
      llmCalls: 1,
      unknownLlmCalls: 0,
      totalToolCalls: 0,
    });
  });

  it.each([null, undefined, -1, 1.5, NaN, Infinity, '12', Number.MAX_SAFE_INTEGER + 1])(
    'preserves missing/invalid usage %s as unknown',
    (tokens) => {
      const meter = new SelfAccountant(new GreenOpsMeasure());
      meter.recordLlm('investigate', tokens as number | null, 10);
      expect(meter.summary()).toMatchObject({
        totalTokens: null,
        knownTokens: 0,
        usageComplete: false,
        llmCalls: 1,
        unknownLlmCalls: 1,
        energyKwh: null,
        carbonKgCo2e: null,
      });
    },
  );

  it('exposes the reported subtotal without calling it the total after missing usage or retries', () => {
    const meter = new SelfAccountant(new GreenOpsMeasure());
    meter.recordLlm('investigate', null, 5);
    meter.recordRetry('investigate');
    meter.recordLlm('investigate', 47, 15);
    meter.recordLlm('investigate', 0, 10);
    meter.recordTool('detect', 20);
    expect(meter.summary()).toMatchObject({
      totalTokens: null,
      knownTokens: 47,
      usageComplete: false,
      llmCalls: 3,
      unknownLlmCalls: 1,
      totalRetries: 1,
      totalToolCalls: 1,
      totalDurationMs: 50,
      energyKwh: null,
      carbonKgCo2e: null,
    });
  });

  it('does not silently round an unrepresentable aggregate', () => {
    const meter = new SelfAccountant(new GreenOpsMeasure());
    meter.recordLlm('investigate', Number.MAX_SAFE_INTEGER);
    meter.recordLlm('investigate', 1);
    expect(meter.summary()).toMatchObject({
      totalTokens: null,
      knownTokens: Number.MAX_SAFE_INTEGER,
      usageComplete: false,
      llmCalls: 2,
      unknownLlmCalls: 1,
    });
  });
});
