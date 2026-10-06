import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildBaselineRollup } from '../packages/agents/src/baseline-rollup.js';
import { loadBaselineBundle } from '../packages/agents/src/baseline-scan.js';
import { OrchestratorAgent } from '../packages/agents/src/orchestrator.js';
import {
  parseBaselineRollup,
  rollupForOutcome,
} from '../apps/CodeVitals-MCP/website/src/app/dashboard/baseline-rollup';
import type { RunOutcome } from '../apps/CodeVitals-MCP/website/src/app/dashboard/ledger-data';

const baselinePath = resolve(__dirname, '../fixtures/azure-baseline/subscription.json');

function engineRollup() {
  const orchestrator = new OrchestratorAgent();
  const { bugs } = orchestrator.run(
    orchestrator.list().map((agent) => ({ agent, sourcePath: baselinePath })),
  );
  return buildBaselineRollup(loadBaselineBundle(baselinePath), bugs, {
    agentUsage: { energyKwh: 2e-7, carbonKgCo2e: 8e-8, usageComplete: true, knownTokens: 0 },
  });
}

describe('dashboard baseline rollup parser', () => {
  // A JSON round trip matches what the dashboard reads from the ledger file.
  const written = JSON.parse(JSON.stringify(engineRollup()));

  it('accepts the rollup the engine writes, without changing its numbers', () => {
    const parsed = parseBaselineRollup(written)!;
    expect(parsed).not.toBeNull();
    expect(parsed.subscriptionId).toBe('sub-contoso-retail-01');
    expect(parsed.provenance).toBe('synthetic');
    expect(parsed.evidenceKind).toBe('synthetic');
    expect(parsed.current).toEqual(written.current);
    expect(parsed.identifiedSaving).toEqual(written.identifiedSaving);
    expect(parsed.byTeam).toHaveLength(written.byTeam.length);
    expect(parsed.maturity.current.grade).toBe(written.maturity.current.grade);
    expect(parsed.maturity.projected.criteria).toHaveLength(6);
    expect(parsed.breakEven.minutes).toBe(written.breakEven.minutes);
  });

  it('reads the rollup from a run outcome and ignores outcomes without one', () => {
    const outcome = { runId: 'r', baselineRollup: written } as unknown as RunOutcome;
    expect(rollupForOutcome(outcome)?.organization).toBe(written.organization);
    expect(rollupForOutcome({ runId: 'r' } as unknown as RunOutcome)).toBeNull();
    expect(rollupForOutcome(undefined)).toBeNull();
  });

  it('keeps unknown amounts null instead of turning them into zero', () => {
    const copy = structuredClone(written);
    copy.current.kgCo2e = null;
    expect(parseBaselineRollup(copy)!.current.kgCo2e).toBeNull();
  });

  /** Set a nested value in an untyped JSON copy; `undefined` deletes the key. */
  function corrupt(path: Array<string | number>, value: unknown) {
    const copy = structuredClone(written) as Record<string | number, unknown>;
    let node = copy;
    for (const key of path.slice(0, -1)) node = node[key] as Record<string | number, unknown>;
    const last = path.at(-1)!;
    if (value === undefined) delete node[last];
    else node[last] = value;
    return copy;
  }

  it.each([
    ['an unknown schema version', ['schemaVersion'], 2],
    ['a non-numeric amount', ['current', 'energyKwh'], '555'],
    ['an infinite amount', ['optimized', 'kgCo2e'], Infinity],
    ['an unknown grade', ['maturity', 'current', 'grade'], 'A+'],
    ['criterion points above their maximum', ['maturity', 'current', 'criteria', 0, 'points'], 999],
    ['an unknown evidence kind', ['evidenceKind'], 'verified'],
    ['a missing team list', ['byTeam'], undefined],
  ] as Array<[string, Array<string | number>, unknown]>)(
    'drops a rollup with %s',
    (_label, path, value) => {
      expect(parseBaselineRollup(corrupt(path, value))).toBeNull();
    },
  );
});
