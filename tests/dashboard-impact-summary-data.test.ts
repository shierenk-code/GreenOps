import { describe, expect, it } from 'vitest';
import { buildImpactSummary } from '../apps/CodeVitals-MCP/website/src/app/dashboard/impact-summary-data';
import type { Finding } from '../apps/CodeVitals-MCP/website/src/app/dashboard/ledger-dashboard';
import type {
  LedgerEntry,
  RunOutcome,
  SelectedRun,
} from '../apps/CodeVitals-MCP/website/src/app/dashboard/ledger-data';

const finding = (id = 'one'): Finding => ({
  bugId: id,
  agentId: 'ai-efficiency',
  agentName: 'AI Efficiency',
  category: 'uncached-completion',
  severity: 'high',
  title: 'Repeated requests',
  state: 'verified',
  impactEnergyKwh: 999,
  impactCarbonKg: 777,
  confidence: 'unknown',
  effort: '',
  recommendationId: '',
  recommendationTitle: '',
  recommendation: '',
  expectedReductionFactor: 0,
  reversible: false,
  entries: [
    {
      runId: 'selected',
      bugId: id,
      seq: 1,
      timestamp: '',
      stage: 'detect',
      summary: 'Repeated requests',
      data: {
        category: 'uncached-completion',
        agentId: 'ai-efficiency',
        severity: 'high',
        evidence: { wastedTokens: 1000 },
      },
    },
  ],
});
const add = (
  f: Finding,
  stage: LedgerEntry['stage'],
  data: Record<string, unknown>,
  runId = 'selected',
) => {
  f.entries.push({
    runId,
    bugId: f.bugId,
    seq: f.entries.length + 1,
    timestamp: '',
    stage,
    summary: '',
    data,
  });
  return f;
};
const outcome = (usage: 'complete' | 'partial' | 'legacy' = 'complete'): RunOutcome => ({
  runId: 'selected',
  startedAt: '',
  finishedAt: '',
  bugsDetected: 1,
  bugsImproved: 100,
  savings: { energyKwh: 999, carbonKgCo2e: 777 },
  selfCost: {
    energyKwh: usage === 'partial' ? null : 0.01,
    carbonKgCo2e: usage === 'partial' ? null : 0.004,
    tokens: usage === 'partial' ? null : 50,
    toolCalls: 2,
    retries: 0,
    ...(usage === 'legacy'
      ? {}
      : {
          knownTokens: 50,
          usageComplete: usage === 'complete',
          llmCalls: 2,
          unknownLlmCalls: usage === 'partial' ? 1 : 0,
        }),
  },
  net:
    usage === 'partial'
      ? { energyKwh: null, carbonKgCo2e: null, netPositive: null }
      : { energyKwh: 998.99, carbonKgCo2e: 776.996, netPositive: true },
});
const run = (findings: Finding[], recordedOutcome?: RunOutcome): SelectedRun => ({
  runId: 'selected',
  entries: findings.flatMap((f) => f.entries),
  timestamp: '',
  kind: recordedOutcome ? 'run' : 'in-progress',
  outcome: recordedOutcome,
});

describe('overview impact and agent-footprint summary', () => {
  it('does not turn an absent run or unavailable approval count into a zero footprint', () => {
    const summary = buildImpactSummary([finding()], null);
    expect(summary.agentUsage).toMatchObject({
      completeness: 'not-recorded',
      totalTokens: null,
      knownTokens: null,
      llmCalls: null,
      toolCalls: null,
    });
    expect(summary.pendingReviews).toBeNull();
    expect(summary.verifiedChanges).toBe(0);
    expect(summary.recordedEstimates).toEqual([]);
    expect(summary.netCarbonBenefit.valueKg).toBeNull();
  });

  it('counts applied-and-followed-up changes, not stale Finding.state or outcome count', () => {
    const empty = finding('empty');
    const verifyOnly = add(finding('verify-only'), 'verify', { confirmed: true });
    const applied = add(finding('applied'), 'improve', { applied: true });
    const verified = add(add(finding('verified'), 'improve', { applied: true }), 'verify', {
      confirmed: true,
    });
    const findings = [empty, verifyOnly, applied, verified, verified];
    const summary = buildImpactSummary(findings, run(findings, outcome()));
    expect(summary.appliedChanges).toBe(2);
    expect(summary.verifiedChanges).toBe(1);
    expect(summary.netCarbonBenefit.status).toBe('not-established');
    expect(summary.netCarbonBenefit.valueKg).toBeNull();
  });

  it('requires verification to follow the latest application and respect the selected run', () => {
    const stale = add(
      add(add(finding('stale'), 'improve', { applied: true }), 'verify', { confirmed: true }),
      'improve',
      { applied: true },
    );
    const other = add(
      add(finding('other'), 'improve', { applied: true }),
      'verify',
      { confirmed: true },
      'another-run',
    );
    const failed = add(add(finding('failed'), 'improve', { applied: false }), 'verify', {
      confirmed: true,
    });
    const findings = [stale, other, failed];
    expect(buildImpactSummary(findings, run(findings, outcome())).verifiedChanges).toBe(0);
  });

  it('keeps agent analysis tokens separate from the workload estimate and raw net carbon', () => {
    const f = finding();
    const summary = buildImpactSummary([f], run([f], outcome()));
    expect(summary.agentUsage).toMatchObject({
      completeness: 'complete',
      totalTokens: 50,
      knownTokens: 50,
      llmCalls: 2,
      unknownLlmCalls: 0,
      toolCalls: 2,
      retries: 0,
    });
    expect(summary.recordedEstimates.map((e) => [e.value, e.basis])).toEqual([
      [0.01, 'modeled'],
      [0.004, 'modeled'],
    ]);
    expect(JSON.stringify(summary)).not.toContain('776.996');
    expect(summary).not.toHaveProperty('savingsRatio');
  });

  it('displays incomplete usage as a known subtotal without converting it into energy or a net benefit', () => {
    const f = finding();
    const summary = buildImpactSummary([f], run([f], outcome('partial')));
    expect(summary.agentUsage).toMatchObject({
      completeness: 'partial',
      totalTokens: null,
      knownTokens: 50,
      unknownLlmCalls: 1,
    });
    expect(summary.agentUsage.explanation).toContain('subtotal');
    expect(summary.recordedEstimates).toEqual([]);
    expect(summary.measurementGaps.some((gap) => gap.includes('failed or interrupted'))).toBe(true);
  });

  it('does not infer completeness or model-call counts from legacy numeric outcomes', () => {
    const summary = buildImpactSummary([], run([], outcome('legacy')));
    expect(summary.agentUsage).toMatchObject({
      completeness: 'legacy-unconfirmed',
      totalTokens: null,
      knownTokens: 50,
      llmCalls: null,
      unknownLlmCalls: null,
    });
    expect(summary.recordedEstimates).toEqual([]);
  });

  it('preserves an explicitly complete zero-token, zero-call run', () => {
    const o = outcome();
    Object.assign(o.selfCost, {
      tokens: 0,
      knownTokens: 0,
      llmCalls: 0,
      energyKwh: 0,
      carbonKgCo2e: 0,
    });
    const summary = buildImpactSummary([], run([], o), 0);
    expect(summary.agentUsage.totalTokens).toBe(0);
    expect(summary.agentUsage.llmCalls).toBe(0);
    expect(summary.pendingReviews).toBe(0);
    expect(summary.recordedEstimates[0].value).toBe(0);
    expect(summary.netCarbonBenefit.valueKg).toBeNull();
  });

  it('ignores a mismatched outcome rather than borrowing its footprint', () => {
    const o = outcome();
    o.runId = 'other';
    const summary = buildImpactSummary([], run([], o));
    expect(summary.agentUsage.completeness).toBe('not-recorded');
    expect(summary.agentUsage.knownTokens).toBeNull();
    expect(summary.agentUsage.toolCalls).toBeNull();
    expect(summary.recordedEstimates).toEqual([]);
  });

  it.each([undefined, -1, NaN, Infinity, 1.5])(
    'keeps unavailable/invalid pending review count %s unknown',
    (value) => {
      expect(buildImpactSummary([], run([]), value).pendingReviews).toBeNull();
    },
  );

  it('fails closed on contradictory usage metadata even if called without ledger validation', () => {
    const o = outcome();
    o.selfCost.unknownLlmCalls = 1;
    const summary = buildImpactSummary([], run([], o));
    expect(summary.agentUsage.totalTokens).toBeNull();
    expect(summary.agentUsage.knownTokens).toBeNull();
    expect(summary.recordedEstimates).toEqual([]);
  });
});

it('counts review model requests and preserves unknown usage without inventing energy', () => {
  const run: SelectedRun = { runId: 'review-usage', kind: 'review', timestamp: '', entries: [
    { runId: 'review-usage', bugId: 'one', seq: 1, stage: 'investigate', summary: '', timestamp: '', data: { analysis: { provider: 'gemini', model: 'gemini-3.5-flash', status: 'generated', requestAttempted: true, tokensUsed: 438 } } },
    { runId: 'review-usage', bugId: 'two', seq: 2, stage: 'investigate', summary: '', timestamp: '', data: { analysis: { provider: 'gemini', status: 'fallback', requestAttempted: true, tokensUsed: null } } },
    { runId: 'review-usage', bugId: 'three', seq: 3, stage: 'investigate', summary: '', timestamp: '', data: { analysis: { provider: 'gemini', status: 'fallback', requestAttempted: false, tokensUsed: 0 } } },
  ] };
  const summary = buildImpactSummary([], run);
  expect(summary.agentUsage).toMatchObject({ completeness: 'partial', knownTokens: 438, totalTokens: null, llmCalls: 2, unknownLlmCalls: 1 });
  expect(summary.recordedEstimates).toEqual([]);
  run.entries.splice(1);
  expect(buildImpactSummary([], run).agentUsage).toMatchObject({ completeness: 'complete', totalTokens: 438, llmCalls: 1 });
});
