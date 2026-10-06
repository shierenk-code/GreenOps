import { describe, expect, it } from 'vitest';
import { resolve } from 'node:path';
import { AiEfficiencyAgent } from '../src/ai-efficiency.js';
import { OrchestratorAgent } from '../src/orchestrator.js';

describe('AiEfficiencyAgent', () => {
  const fixture = resolve(process.cwd(), 'fixtures/greenops-mock/ai-usage.json');

  it('reports token-accurate waste without exposing prompt content', () => {
    const result = new AiEfficiencyAgent().scan(fixture);
    const duplicate = result.bugs.find((bug) => bug.category === 'uncached-completion');
    expect(duplicate?.estimatedWaste).toMatchObject({ metric: 'tokens.avoided', perRun: 400 });
    expect(duplicate?.evidence.promptFingerprint).toMatch(/^[a-f0-9]{12}$/);
    expect(JSON.stringify(duplicate)).not.toContain('Summarize ticket #100');
  });

  it('accounts for input and output tokens across retries', () => {
    const result = new AiEfficiencyAgent().scan(fixture);
    const retry = result.bugs.find((bug) => bug.category === 'ai-retry-storm');
    expect(retry?.estimatedWaste).toMatchObject({ metric: 'tokens.avoided', perRun: 7500 });
    expect(retry?.evidence).toMatchObject({
      retries: 5,
      tokensPerAttempt: 1500,
      retryBackoffMs: 0,
    });
  });

  it('records oversized output allowance as an opportunity, not avoided usage', () => {
    const result = new AiEfficiencyAgent().scan(fixture);
    const headroom = result.bugs.find((bug) => bug.category === 'oversized-token-request');
    expect(headroom?.estimatedWaste.metric).toBe('tokens.headroom');
    expect(headroom?.estimatedWaste.unit).toBe('unused output tokens');
  });

  it('preserves specialist attribution when the orchestrator aggregates findings', () => {
    const agent = new AiEfficiencyAgent();
    const result = new OrchestratorAgent([agent]).run([{ agent, sourcePath: fixture }]);
    expect(result.bugs).not.toHaveLength(0);
    expect(result.bugs.every((bug) => bug.agentId === 'ai-efficiency')).toBe(true);
    expect(result.bugs.every((bug) => bug.agentName === 'AI Efficiency Agent')).toBe(true);
    expect(result.trace.map((event) => event.status)).toEqual([
      'planned',
      'started',
      'completed',
      'completed',
    ]);
  });
});
