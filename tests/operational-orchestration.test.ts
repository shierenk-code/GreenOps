import { describe, expect, it, vi, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { OperationalRun, SustainabilityLedger } from '../packages/ledger/src/index.js';
import {
  OrchestratorAgent,
  carbonDemo,
  wasteDemo,
  observeCarbonApi,
  captureCarbonSource,
  executeCarbonPlan,
} from '../packages/agents/src/index.js';
import { withOperationalRun } from '../apps/cli/src/operational-run.js';

const NOW = new Date('2026-10-05T10:00:00Z');
const dirs: string[] = [];
const ledgerPath = () => {
  const dir = mkdtempSync(join(tmpdir(), 'greenops-operational-'));
  dirs.push(dir);
  return join(dir, 'ledger.json');
};
afterEach(() => {
  vi.restoreAllMocks();
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('shared operational delegation', () => {
  it('delegates Carbon planning and accounts for grid lookups without claiming footprint or savings', async () => {
    const d = carbonDemo(NOW),
      run = new OperationalRun('carbon-incident', 'plan', 'synthetic');
    const plan = await new OrchestratorAgent().runOperational(
      { kind: 'carbon-plan', workload: d.workload, provider: d.provider, now: NOW },
      run,
    );
    run.relatedPlanId = plan.id;
    const result = run.finish('completed');
    expect(result.relatedPlanId).toBe(plan.id);
    expect(result.selfCost.totalToolCalls).toBe(2);
    expect(result.selfCost.totalTokens).toBe(0);
    expect(result.selfCost.llmCalls).toBe(0);
    expect(result.selfCost.energyKwh).toBeNull();
    expect(result.selfCost.carbonKgCo2e).toBeNull();
    expect(result.workloadSavings.energyKwh).toBeNull();
    expect(result.trace.map((t) => t.tool)).toEqual(['grid.forecast', 'grid.forecast']);
  });
  it('records failed tool invocations even if the planner returns a blocked result', async () => {
    const d = carbonDemo(NOW),
      run = new OperationalRun('carbon-incident', 'plan', 'live-read');
    const plan = await new OrchestratorAgent().runOperational(
      {
        kind: 'carbon-plan',
        workload: d.workload,
        provider: {
          forecast: async () => {
            throw new Error('SECRET provider detail');
          },
        },
        now: NOW,
      },
      run,
    );
    expect(plan.status).toBe('blocked');
    const result = run.finish('completed');
    expect(result.selfCost.totalToolCalls).toBe(2);
    expect(result.toolFailures).toBe(2);
    expect(JSON.stringify(result)).not.toContain('SECRET');
  });
  it('delegates scoped Waste discovery and counts all six adapter queries', async () => {
    const run = new OperationalRun('digital-waste', 'discover', 'live-read');
    const list = vi.fn(async () => ({ items: [] }));
    const inventory = await new OrchestratorAgent().runOperational(
      {
        kind: 'waste-discover',
        target: { context: 'synthetic-test', namespace: 'demo' },
        reader: { list },
        now: NOW,
      },
      run,
    );
    expect(list).toHaveBeenCalledTimes(6);
    expect(inventory.coverage.metrics).toBe('complete');
    expect(run.finish('completed').selfCost.totalToolCalls).toBe(6);
  });
  it('local Waste planning does not invent tool or model calls', async () => {
    const d = wasteDemo(NOW),
      run = new OperationalRun('digital-waste', 'plan', 'local');
    const plan = await new OrchestratorAgent().runOperational(
      { kind: 'waste-plan', ...d, now: NOW },
      run,
    );
    expect(plan.findings.length).toBe(4);
    const result = run.finish('completed');
    expect(result.selfCost.totalToolCalls).toBe(0);
    expect(result.selfCost.totalTokens).toBe(0);
  });
  it('does not silently substitute an unregistered operational agent', async () => {
    const d = wasteDemo(NOW),
      run = new OperationalRun('digital-waste', 'plan', 'local');
    await expect(
      new OrchestratorAgent([]).runOperational({ kind: 'waste-plan', ...d, now: NOW }, run),
    ).rejects.toThrow('not registered');
  });
  it('tracks approved synthetic dispatch calls and does not bypass its safety boundary', async () => {
    const d = carbonDemo(NOW),
      run = new OperationalRun('carbon-incident', 'demo', 'synthetic');
    const plan = await new OrchestratorAgent().runOperational(
      { kind: 'carbon-plan', workload: d.workload, provider: d.provider, now: NOW },
      run,
    );
    const api = observeCarbonApi(d.api, run);
    const source = await captureCarbonSource(plan, api);
    let clock = NOW;
    await executeCarbonPlan(
      plan,
      {
        planId: plan.id,
        approvedAt: NOW.toISOString(),
        reviewer: 'synthetic',
        reason: 'test',
        source,
      },
      api,
      d.provider,
      {
        now: () => clock,
        wait: async (ms) => {
          clock = new Date(clock.getTime() + ms);
        },
        event: () => {},
      },
    );
    const result = run.finish('completed');
    expect(result.trace.some((t) => t.tool === 'kubernetes.claim')).toBe(true);
    expect(result.trace.some((t) => t.tool === 'kubernetes.resume-job')).toBe(true);
    expect(result.workloadSavings.carbonKgCo2e).toBeNull();
  });
  it('refuses accounting mutation after completion', async () => {
    const run = new OperationalRun('digital-waste', 'plan', 'local');
    run.finish('completed');
    expect(() => run.finish('completed')).toThrow('already complete');
    await expect(run.tool('extra', async () => null)).rejects.toThrow('already complete');
  });
});

describe('operational outcomes share ledger storage without inventing applied savings', () => {
  it('retains stage events written during execution and records a linked outcome', async () => {
    const path = ledgerPath();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    await withOperationalRun(path, 'digital-waste', 'plan', 'local', async (run) => {
      run.relatedPlanId = 'plan-test';
      new SustainabilityLedger(path).append({
        runId: 'plan-test',
        bugId: 'test',
        stage: 'detect',
        summary: 'test',
        data: {},
      });
      return 7;
    });
    const ledger = new SustainabilityLedger(path);
    expect(ledger.allEntries()).toHaveLength(1);
    expect(ledger.allOutcomes()).toHaveLength(0);
    expect(ledger.allOperationalOutcomes()[0]).toMatchObject({
      status: 'completed',
      relatedPlanId: 'plan-test',
    });
    expect(ledger.allOperationalOutcomes()[0]!.workloadSavings.carbonKgCo2e).toBeNull();
  });
  it('records failures and refuses duplicate outcomes', async () => {
    const path = ledgerPath();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    await expect(
      withOperationalRun(path, 'carbon-incident', 'forecast', 'live-read', async (run) => {
        await run.tool('grid.forecast', async () => {
          throw new Error('sanitized failure');
        });
      }),
    ).rejects.toThrow('sanitized failure');
    const ledger = new SustainabilityLedger(path),
      outcome = ledger.allOperationalOutcomes()[0]!;
    expect(outcome.status).toBe('failed');
    expect(outcome.toolFailures).toBe(1);
    expect(outcome.selfCost.totalToolCalls).toBe(1);
    expect(() => ledger.recordOperationalOutcome(outcome)).toThrow('already recorded');
  });
  it('does not mutate persisted data through outcome accessors', () => {
    const ledger = new SustainabilityLedger(ledgerPath());
    const outcome = new OperationalRun('digital-waste', 'plan', 'local').finish('completed');
    ledger.recordOperationalOutcome(outcome);
    outcome.status = 'failed';
    const read = ledger.allOperationalOutcomes();
    read[0]!.status = 'failed';
    expect(ledger.allOperationalOutcomes()[0]!.status).toBe('completed');
  });
});
