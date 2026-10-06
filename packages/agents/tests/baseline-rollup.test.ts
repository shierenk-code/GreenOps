import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { GreenOpsAgent, OfflineReasoner, PolicyApprover } from '../../agent/src/index.js';
import { SustainabilityLedger } from '../../ledger/src/index.js';
import { maturityGrade } from '../../measure/src/rollup.js';
import { buildBaselineRollup } from '../src/baseline-rollup.js';
import { loadBaselineBundle } from '../src/baseline-scan.js';
import { OrchestratorAgent } from '../src/orchestrator.js';

const baselinePath = resolve(__dirname, '../../../fixtures/azure-baseline/subscription.json');
const bundle = loadBaselineBundle(baselinePath);

function fleetBugs() {
  const orchestrator = new OrchestratorAgent();
  return orchestrator.run(orchestrator.list().map((agent) => ({ agent, sourcePath: baselinePath })))
    .bugs;
}

const usage = { energyKwh: 0.0002, carbonKgCo2e: 0.00008, usageComplete: true, knownTokens: 0 };

describe('buildBaselineRollup', () => {
  const bugs = fleetBugs();
  const rollup = buildBaselineRollup(bundle, bugs, { agentUsage: usage });

  it('reports a positive current burn and a smaller optimized burn', () => {
    expect(rollup.current.energyKwh!).toBeGreaterThan(0);
    expect(rollup.identifiedSaving.energyKwh!).toBeGreaterThan(0);
    expect(rollup.optimized.energyKwh!).toBeLessThan(rollup.current.energyKwh!);
    expect(rollup.optimized.energyKwh!).toBeGreaterThan(0);
    expect(rollup.optimized.energyKwh! + rollup.identifiedSaving.energyKwh!).toBeCloseTo(
      rollup.current.energyKwh!,
      6,
    );
    expect(rollup.savingSharePct!).toBeGreaterThan(0);
    expect(rollup.savingSharePct!).toBeLessThan(100);
  });

  it('labels everything with the synthetic baseline evidence kind', () => {
    expect(rollup.provenance).toBe('synthetic');
    expect(rollup.evidenceKind).toBe('synthetic');
    expect(rollup.gaps.join(' ')).toContain('not verified');
  });

  it('attributes savings to teams, regions and agents that add up to the total', () => {
    const sum = (xs: Array<{ saving: { kgCo2e: number | null } }>) =>
      xs.reduce((s, x) => s + (x.saving.kgCo2e ?? 0), 0);
    expect(sum(rollup.byTeam)).toBeCloseTo(rollup.identifiedSaving.kgCo2e!, 6);
    expect(sum(rollup.byRegion)).toBeCloseTo(rollup.identifiedSaving.kgCo2e!, 6);
    expect(sum(rollup.byAgent)).toBeCloseTo(rollup.identifiedSaving.kgCo2e!, 6);
    expect(rollup.byAgent.map((a) => a.agentId).sort()).toHaveLength(7);
    expect(rollup.byTeam.map((t) => t.team)).toEqual(
      expect.arrayContaining(['commerce', 'data', 'platform', 'ai-assistants', 'corp-it']),
    );
    expect(rollup.byRegion.map((r) => r.region).sort()).toEqual([
      'centralindia',
      'eastus',
      'northeurope',
    ]);
  });

  it('never credits a team more than a plausible share of its own footprint', () => {
    for (const t of rollup.byTeam) {
      if (t.saving.kgCo2e === null || t.current.kgCo2e === null) continue;
      expect(t.saving.kgCo2e).toBeLessThan(t.current.kgCo2e * 0.9);
    }
    // The shared AKS apps pool is shown back to the workload teams that request it.
    const commerce = rollup.byTeam.find((t) => t.team === 'commerce')!;
    const data = rollup.byTeam.find((t) => t.team === 'data')!;
    expect(commerce.current.kgCo2e!).toBeGreaterThan(116);
    expect(data.current.kgCo2e!).toBeGreaterThan(61);
  });

  it('combines findings on the same footprint instead of summing them', () => {
    const onSupport = bugs.filter(
      (b) =>
        b.location.symbol === 'support-assistant' &&
        b.estimatedWaste.metric === 'baseline.period_kwh',
    );
    expect(onSupport).toHaveLength(2);
    const before = Number(onSupport[0]!.evidence.beforeKwh);
    const fractions = onSupport.map((b) => b.estimatedWaste.perRun / before);
    const combined = before * (1 - fractions.reduce((p, s) => p * (1 - s), 1));
    const summed = onSupport.reduce((t, b) => t + b.estimatedWaste.perRun, 0);
    const ai = rollup.byTeam.find((t) => t.team === 'ai-assistants')!;
    const others = bugs
      .filter(
        (b) =>
          b.evidence.team === 'ai-assistants' &&
          b.location.symbol !== 'support-assistant' &&
          b.estimatedWaste.metric === 'baseline.period_kwh',
      )
      .reduce((t, b) => t + Math.max(0, b.estimatedWaste.perRun), 0);
    expect(combined).toBeLessThan(summed);
    expect(ai.saving.energyKwh!).toBeCloseTo(combined + others, 2);
  });

  it('scores maturity now and if every finding were applied', () => {
    const now = rollup.maturity.current;
    const then = rollup.maturity.projected;
    expect(now.criteria.map((c) => c.id)).toEqual([
      'remediation',
      'placement',
      'pipelines',
      'ai',
      'evidence',
      'accountability',
    ]);
    expect(now.criteria.reduce((s, c) => s + c.max, 0)).toBe(100);
    for (const c of now.criteria) {
      expect(c.points).toBeGreaterThanOrEqual(0);
      expect(c.points).toBeLessThanOrEqual(c.max);
    }
    expect(now.criteria.find((c) => c.id === 'remediation')!.points).toBe(0);
    expect(now.criteria.find((c) => c.id === 'evidence')!.points).toBe(0);
    expect(now.criteria.find((c) => c.id === 'accountability')!.points).toBe(10);
    expect(then.score).toBeGreaterThan(now.score);
    expect(now.grade).toBe(maturityGrade(now.score));
  });

  it('computes break-even against GreenOps own energy', () => {
    expect(rollup.breakEven.minutes!).toBeGreaterThan(0);
    const perMinute = rollup.identifiedSaving.energyKwh! / (720 * 60);
    expect(rollup.breakEven.minutes!).toBeCloseTo(usage.energyKwh / perMinute, 9);
  });

  it('reports unknown break-even when GreenOps usage is incomplete', () => {
    const incomplete = buildBaselineRollup(bundle, bugs, {
      agentUsage: { energyKwh: null, carbonKgCo2e: null, usageComplete: false, knownTokens: 120 },
    });
    expect(incomplete.breakEven.minutes).toBeNull();
    expect(
      incomplete.maturity.current.criteria.find((c) => c.id === 'accountability')!.points,
    ).toBe(5);
  });

  it('credits approved findings in the remediation criterion', () => {
    const top = [...bugs]
      .filter((b) => b.estimatedWaste.periodKgCo2e)
      .sort((a, z) => z.estimatedWaste.periodKgCo2e! - a.estimatedWaste.periodKgCo2e!)[0]!;
    const withApproval = buildBaselineRollup(bundle, bugs, {
      agentUsage: usage,
      approvedBugIds: [top.id],
    });
    expect(
      withApproval.maturity.current.criteria.find((c) => c.id === 'remediation')!.points,
    ).toBeGreaterThan(0);
  });
});

describe('maturityGrade', () => {
  it('maps scores to the A–F bands', () => {
    expect([85, 84.9, 70, 55, 40, 25, 24.9].map(maturityGrade)).toEqual([
      'A',
      'B',
      'B',
      'C',
      'D',
      'E',
      'F',
    ]);
  });
});

describe('rollup in the seven-stage loop', () => {
  const dir = mkdtempSync(join(tmpdir(), 'greenops-rollup-'));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it('stores the rollup on the run outcome', async () => {
    const ledgerPath = join(dir, 'ledger.json');
    const orchestrator = new OrchestratorAgent();
    const plan = orchestrator.list().map((agent) => ({ agent, sourcePath: baselinePath }));
    await new GreenOpsAgent({
      targetPath: dir,
      ledgerPath,
      reasoner: new OfflineReasoner(),
      approver: new PolicyApprover(),
      bugsProvider: () => {
        const result = orchestrator.run(plan);
        return { bugs: result.bugs, scanned: { agents: result.findings.length } };
      },
      rollupProvider: ({ bugs, approvedBugIds, selfCost }) =>
        buildBaselineRollup(bundle, bugs, { approvedBugIds, agentUsage: selfCost }),
    }).run();
    const outcome = new SustainabilityLedger(ledgerPath).allOutcomes().at(-1)!;
    expect(outcome.bugsDetected).toBe(31);
    expect(outcome.baselineRollup?.subscriptionId).toBe('sub-contoso-retail-01');
    expect(outcome.baselineRollup?.maturity.current.grade).toMatch(/^[A-F]$/);
  });
});
