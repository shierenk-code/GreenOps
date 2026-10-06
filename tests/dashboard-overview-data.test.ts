import { describe, expect, it } from 'vitest';
import {
  buildOverviewData,
  type DashboardRun,
} from '../apps/CodeVitals-MCP/website/src/app/dashboard/overview-data';
import type { Finding } from '../apps/CodeVitals-MCP/website/src/app/dashboard/ledger-dashboard';
import type { LedgerEntry } from '../apps/CodeVitals-MCP/website/src/app/dashboard/ledger-data';

const finding = (
  id: string,
  agentId = 'ai-efficiency',
  category = 'uncached-completion',
  evidence: Record<string, unknown> = {},
  severity = 'medium',
): Finding => ({
  bugId: id,
  agentId,
  agentName: agentId,
  category,
  severity,
  title: `Finding ${id}`,
  state: 'in-progress',
  impactEnergyKwh: 9999,
  impactCarbonKg: 9999,
  confidence: 'unknown',
  effort: 'unknown',
  recommendationId: '',
  recommendationTitle: '',
  recommendation: '',
  expectedReductionFactor: 0,
  reversible: false,
  entries: [
    {
      runId: 'run-1',
      bugId: id,
      seq: 1,
      stage: 'detect',
      timestamp: '2026-01-01T00:00:00Z',
      summary: `Finding ${id}`,
      data: { agentId, category, severity, evidence },
    },
  ],
});
const add = (
  f: Finding,
  stage: LedgerEntry['stage'],
  data: Record<string, unknown> = {},
  runId = 'run-1',
) => {
  f.entries.push({
    runId,
    bugId: f.bugId,
    seq: f.entries.length + 1,
    stage,
    timestamp: '2026-01-01T01:00:00Z',
    summary: 'internal raw activity must not leak',
    data,
  });
  return f;
};
const run = (findings: Finding[], id = 'run-1'): DashboardRun => ({
  runId: id,
  entries: findings.flatMap((f) => f.entries),
  timestamp: '2026-01-01T01:00:00Z',
  kind: 'run',
});
const model = (findings: Finding[]) => buildOverviewData(findings, run(findings));
const metric = (data: ReturnType<typeof model>, agent: string, id: string) =>
  data.agents.find((a) => a.id === agent)!.metrics.find((m) => m.id === id)!;

describe('recorded-evidence orchestrator overview', () => {
  it('always returns seven specialist cards, with no invented healthy or active state', () => {
    const data = buildOverviewData([], null);
    expect(data.agents).toHaveLength(7);
    expect(data.agents.map((agent) => agent.name)).toEqual([
      'Carbon Efficiency',
      'Digital Waste',
      'AI Efficiency',
      'Architecture',
      'Disaster Recovery',
      'Collaboration',
      'Pipeline Efficiency',
    ]);
    expect(data.summary.findings).toBe(0);
    expect(data.summary.specialistsWithFindings).toBe(0);
    expect(data.runKind).toBeNull();
    for (const agent of data.agents) {
      expect(agent.statusLabel).toBe('No recorded findings');
      expect(agent.metrics.every((m) => m.value === null)).toBe(true);
    }
    expect(JSON.stringify(data)).not.toMatch(
      /healthy|SLA|sustainabilityScore|dailyTrend|activeAgents/,
    );
  });

  it('counts all seven specialties and an optional code-review card independently', () => {
    const findings = [
      finding('ai'),
      finding('dw', 'digital-waste', 'unattached-storage', { gb: 10 }),
      finding('carbon', 'carbon-incident', 'carbon-anomaly'),
      finding('arch', 'architecture', 'no-autoscale'),
      finding('dr', 'disaster-recovery', 'idle-standby'),
      finding('collab', 'collaboration', 'redundant-recording'),
      finding('pipe', 'pipeline-efficiency', 'pipeline-cache-miss', { cacheHitRatePct: 22 }),
      finding('code', 'code-analysis', 'duplicate-import'),
    ];
    const data = model(findings);
    expect(data.summary.findings).toBe(8);
    expect(data.summary.specialistsWithFindings).toBe(7);
    expect(data.summary.specialistCount).toBe(7);
    expect(data.agents).toHaveLength(8);
    const pipeline = data.agents.find((agent) => agent.id === 'pipeline-efficiency')!;
    expect(pipeline.categories).toEqual([
      { id: 'pipeline-cache-miss', label: 'Cache misses', count: 1 },
    ]);
    expect(pipeline.metrics.find((m) => m.id === 'highest-cache-miss')!.value).toBe(78);
    expect(data.agents.every((a) => a.count === 1)).toBe(true);
  });

  it('uses selected-run entries only and deduplicates finding IDs', () => {
    const f = finding('one', 'ai-efficiency', 'uncached-completion', { wastedTokens: 50 });
    add(f, 'verify', { confirmed: true }, 'different-run');
    const other = finding('two');
    other.entries[0].runId = 'different-run';
    const data = model([f, f, other]);
    expect(data.summary.findings).toBe(1);
    expect(data.summary.verified).toBe(0);
    expect(data.stages.find((s) => s.id === 'verify')!.count).toBe(0);
    expect(metric(data, 'ai-efficiency', 'wasted-tokens').value).toBe(50);
    expect(buildOverviewData([f], null).summary.findings).toBe(0);
  });

  it('does not trust stale Finding state over the recorded application / verification evidence', () => {
    const f = finding('pending');
    f.state = 'verified';
    const failed = add(add(finding('failed'), 'improve', { applied: false }), 'verify', {
      confirmed: false,
    });
    const applied = add(finding('applied'), 'improve', { applied: true });
    const verified = add(add(finding('verified'), 'improve', { applied: true }), 'verify', {
      confirmed: true,
    });
    const data = model([f, failed, applied, verified]);
    expect(data.summary.applied).toBe(2);
    expect(data.summary.verified).toBe(1);
    expect(data.summary.awaitingAction).toBe(2);
    expect(data.stages.find((s) => s.id === 'improve')!.count).toBe(3);
    expect(data.stages.find((s) => s.id === 'verify')!.count).toBe(2);
  });

  it('prioritizes unresolved high/critical findings without inventing unknown severity', () => {
    const findings = [
      finding('low', 'ai-efficiency', 'uncached-completion', {}, 'low'),
      finding('high', 'ai-efficiency', 'uncached-completion', {}, 'HIGH'),
      finding('critical', 'ai-efficiency', 'uncached-completion', {}, 'critical'),
      finding('unknown', 'ai-efficiency', 'uncached-completion', {}, 'emergency'),
    ];
    findings.push(
      add(
        add(
          finding('resolved', 'ai-efficiency', 'uncached-completion', {}, 'critical'),
          'improve',
          { applied: true },
        ),
        'verify',
        {
          confirmed: true,
        },
      ),
    );
    const data = model(findings);
    expect(data.summary.highPriority).toBe(2);
    expect(data.priorityFindings[0].findingId).toBe('critical');
    expect(data.priorityFindings[1].findingId).toBe('high');
    expect(data.priorityFindings.find((f) => f.findingId === 'unknown')!.severity).toBe('unknown');
  });

  it('separates estimated duplicate/retry tokens from output-limit headroom and ignores energy guesses', () => {
    const data = model([
      finding('dup', 'ai-efficiency', 'uncached-completion', { wastedTokens: 400 }),
      finding('retry', 'ai-efficiency', 'ai-retry-storm', { wastedTokens: 100, retries: 3 }),
      finding('allowance', 'ai-efficiency', 'oversized-token-request', {
        wastedHeadroom: 999,
        wastedTokens: 99999,
      }),
    ]);
    expect(metric(data, 'ai-efficiency', 'wasted-tokens').value).toBe(500);
    expect(metric(data, 'ai-efficiency', 'unused-allowance').value).toBe(999);
    expect(metric(data, 'ai-efficiency', 'retry-attempts').value).toBe(3);
    expect(JSON.stringify(data)).not.toContain('9999');
    expect(
      data.agents.find((agent) => agent.id === 'ai-efficiency')!.categories.map((c) => c.count),
    ).toEqual([1, 1, 1]);
  });

  it.each([undefined, null, -1, NaN, Infinity, '20', 2.5])(
    'keeps invalid/unknown count %s unknown instead of treating as zero',
    (value) => {
      const data = model([
        finding('one', 'ai-efficiency', 'uncached-completion', { wastedTokens: value }),
      ]);
      expect(metric(data, 'ai-efficiency', 'wasted-tokens').value).toBeNull();
    },
  );

  it('preserves an explicitly recorded zero and guards sum overflow / partial coverage', () => {
    expect(
      metric(
        model([finding('zero', 'ai-efficiency', 'uncached-completion', { wastedTokens: 0 })]),
        'ai-efficiency',
        'wasted-tokens',
      ).value,
    ).toBe(0);
    const partial = metric(
      model([
        finding('one', 'digital-waste', 'unattached-storage', { gb: 1 }),
        finding('two', 'digital-waste', 'unattached-storage'),
      ]),
      'digital-waste',
      'unattached-storage',
    );
    expect(partial.value).toBeNull();
    expect(partial.evidenceCount).toBe(1);
    expect(partial.applicableFindings).toBe(2);
    expect(
      metric(
        model([
          finding('one', 'digital-waste', 'unattached-storage', { gb: Number.MAX_VALUE }),
          finding('two', 'digital-waste', 'unattached-storage', { gb: Number.MAX_VALUE }),
        ]),
        'digital-waste',
        'unattached-storage',
      ).value,
    ).toBeNull();
  });

  it('never mixes storage, image, and core units into one environmental number', () => {
    const data = model([
      finding('cpu', 'digital-waste', 'overprovisioned-compute', { wastedCores: 2.5 }),
      finding('storage', 'digital-waste', 'unattached-storage', { gb: 50 }),
      finding('image', 'digital-waste', 'oversized-image', { excessMb: 100 }),
    ]);
    expect(
      data.agents.find((a) => a.id === 'digital-waste')!.metrics.map((m) => [m.value, m.unit]),
    ).toEqual([
      [2.5, 'cores'],
      [50, 'GB'],
      [100, 'MB'],
    ]);
  });

  it('derives anomaly ratios only from matching recorded energy and positive baseline', () => {
    const data = model([
      finding('spike', 'carbon-incident', 'carbon-anomaly', {
        energyKwh: 2,
        baselineKwh: 0.5,
        ratio: 99,
      }),
    ]);
    expect(metric(data, 'carbon-incident', 'peak-baseline-ratio').value).toBe(4);
    expect(
      data.agents.find((a) => a.id === 'carbon-incident')!.topEvidence[0].facts,
    ).toContainEqual({ label: 'Baseline ratio', value: '4' });
    const zero = model([
      finding('spike', 'carbon-incident', 'carbon-anomaly', {
        energyKwh: 2,
        baselineKwh: 0,
        ratio: 99,
      }),
    ]);
    expect(metric(zero, 'carbon-incident', 'peak-baseline-ratio').value).toBeNull();
    expect(
      zero.agents
        .find((a) => a.id === 'carbon-incident')!
        .topEvidence[0].facts.some((f) => f.label === 'Baseline ratio'),
    ).toBe(false);
  });

  it('shows region evidence without treating unrecorded regions as covered', () => {
    const findings = [
      finding('region1', 'architecture', 'high-carbon-region', {
        region: 'west-europe',
        gridIntensityKgPerKwh: 0.4,
      }),
      finding('region2', 'architecture', 'high-carbon-region', {
        region: 'west-europe',
        gridIntensityKgPerKwh: 0.8,
      }),
    ];
    expect(metric(model(findings), 'architecture', 'regions').value).toBe(1);
    findings.push(
      finding('unknown', 'architecture', 'high-carbon-region', {
        region: 'https://private.example/key?token=secret',
      }),
    );
    expect(metric(model(findings), 'architecture', 'regions').value).toBeNull();
    expect(JSON.stringify(model(findings))).not.toContain('private.example');
  });

  it('shows real recorded recovery / collaboration evidence, not imaginary RTO values', () => {
    const data = model([
      finding('dr', 'disaster-recovery', 'rto-rpo-mismatch', { rpoMinutes: 60 }),
      finding('retention', 'collaboration', 'excessive-retention', {
        retentionDays: 365,
        sizeGb: 1.5,
      }),
    ]);
    expect(metric(data, 'disaster-recovery', 'recovery-point').value).toBe(60);
    expect(
      data.agents
        .find((a) => a.id === 'disaster-recovery')!
        .topEvidence[0].facts.some((f) => f.label.includes('RTO')),
    ).toBe(false);
    expect(metric(data, 'collaboration', 'longest-retention').value).toBe(365);
    expect(metric(data, 'collaboration', 'retention-size').value).toBe(1.5);
  });

  it('counts only recorded selected recommendations and keeps fallback distinct', () => {
    const generated = add(
      add(finding('generated'), 'investigate', {
        analysis: { provider: 'gemini', status: 'generated' },
      }),
      'compare',
      { recommended: 'cache', strategies: [{ id: 'cache', title: 'Cache' }] },
    );
    const fallback = add(
      add(finding('fallback'), 'investigate', {
        analysis: { provider: 'gemini', status: 'fallback' },
      }),
      'compare',
      { recommendation: 'Review retention' },
    );
    const candidateOnly = add(finding('candidate'), 'compare', { strategies: [{ id: 'cache' }] });
    expect(model([generated, fallback, candidateOnly]).summary.recommendations).toEqual({
      total: 2,
      modelGenerated: 1,
      fallback: 1,
      ruleBased: 0,
      unconfirmed: 0,
      notRecorded: 1,
    });
  });

  it('does not leak reasoning, prompts, provider errors, URLs or credentials into rows', () => {
    const f = finding('safe', 'ai-efficiency', 'uncached-completion', {
      wastedTokens: 10,
      prompt: 'private input',
      reasoning: 'hidden thoughts',
      headers: { Authorization: 'Bearer supersecret' },
      location: 'private location',
    });
    f.entries[0].summary = 'Bearer supersecret https://example.test api_key=secret';
    add(f, 'investigate', { reasoning: 'secret raw reasoning', error: 'raw endpoint failure' });
    const serialized = JSON.stringify(model([f]));
    for (const forbidden of [
      'supersecret',
      'private input',
      'hidden thoughts',
      'example.test',
      'secret raw reasoning',
      'raw endpoint failure',
    ])
      expect(serialized).not.toContain(forbidden);
    expect(serialized).toContain('[redacted]');
  });

  it('preserves unassigned counts and does not attribute unknown agents to a real specialist', () => {
    const data = model([finding('other', 'future-agent', 'new-check')]);
    expect(data.summary.findings).toBe(1);
    expect(data.summary.unassignedFindings).toBe(1);
    expect(data.summary.specialistsWithFindings).toBe(0);
    expect(data.agents.every((a) => a.count === 0)).toBe(true);
  });

  it('does not mutate source findings/run and returns JSON-safe finite data', () => {
    const findings = [
      finding('two'),
      finding('one', 'ai-efficiency', 'uncached-completion', { wastedTokens: Infinity }, 'high'),
    ];
    const selected = run(findings);
    const before = structuredClone({ findings, selected });
    const data = buildOverviewData(findings, selected);
    expect({ findings, selected }).toEqual(before);
    expect(JSON.parse(JSON.stringify(data))).toEqual(data);
  });

  it('does not claim verification without a recorded successful application', () => {
    const withoutApplication = add(
      finding('not-applied', 'ai-efficiency', 'uncached-completion', {}, 'high'),
      'verify',
      { confirmed: true },
    );
    const failedApplication = add(
      add(finding('failed-application'), 'improve', { applied: false }),
      'verify',
      { confirmed: true },
    );
    const data = model([withoutApplication, failedApplication]);
    expect(data.summary.verified).toBe(0);
    expect(data.summary.highPriority).toBe(1);
    expect(data.priorityFindings).toHaveLength(2);
    expect(data.priorityFindings.every((f) => !f.verified)).toBe(true);
  });

  it('omits successfully applied and verified rows from the attention list', () => {
    const verified = add(add(finding('done'), 'improve', { applied: true }), 'verify', {
      confirmed: true,
    });
    const data = model([verified]);
    expect(data.summary.verified).toBe(1);
    expect(data.priorityFindings).toEqual([]);
    expect(data.agents.find((agent) => agent.id === 'ai-efficiency')!.topEvidence).toHaveLength(1);
  });

  it('keeps every public row searchable before the view caps displayed results', () => {
    const findings = Array.from({ length: 20 }, (_, i) => finding(`finding-${i}`));
    const data = model(findings);
    expect(data.priorityFindings).toHaveLength(20);
    expect(data.agents.find((agent) => agent.id === 'ai-efficiency')!.topEvidence).toHaveLength(20);
    expect(data.priorityFindings.find((f) => f.title === 'Finding finding-19')).toBeDefined();
    expect(
      data.agents
        .find((agent) => agent.id === 'ai-efficiency')!
        .topEvidence.find((f) => f.title === 'Finding finding-19'),
    ).toBeDefined();
  });
});
