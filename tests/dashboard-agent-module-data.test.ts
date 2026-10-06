import { describe, expect, it } from 'vitest';
import {
  AGENT_MODULE_IDS,
  buildAgentModule,
} from '../apps/CodeVitals-MCP/website/src/app/dashboard/agent-module-data';
import type { Finding } from '../apps/CodeVitals-MCP/website/src/app/dashboard/ledger-dashboard';
import type {
  LedgerEntry,
  SelectedRun,
} from '../apps/CodeVitals-MCP/website/src/app/dashboard/ledger-data';

const finding = (
  id = 'one',
  agentId = 'ai-efficiency',
  category = 'oversized-token-request',
  evidence: Record<string, unknown> = {},
): Finding => ({
  bugId: id,
  agentId,
  agentName: agentId,
  category,
  severity: 'high',
  title: `Finding ${id}`,
  state: 'in-progress',
  impactEnergyKwh: 9999,
  impactCarbonKg: 9999,
  confidence: 'high',
  effort: 'trivial',
  recommendationId: 'stale-option',
  recommendationTitle: 'Stale title from another run',
  recommendation: 'Stale description from another run',
  expectedReductionFactor: 0.9,
  reversible: true,
  entries: [
    {
      runId: 'current',
      bugId: id,
      seq: 1,
      stage: 'detect',
      timestamp: '2026-01-01T00:00:00Z',
      summary: `Finding ${id}`,
      data: {
        agentId,
        category,
        severity: 'high',
        evidence,
        location: {
          filePath: 'C:\\private\\fixtures\\usage.json',
          symbol: 'resource-1',
          startLine: 1,
        },
      },
    },
  ],
});
const add = (
  f: Finding,
  stage: LedgerEntry['stage'],
  data: Record<string, unknown>,
  runId = 'current',
) => {
  f.entries.push({
    runId,
    bugId: f.bugId,
    seq: f.entries.length + 1,
    stage,
    timestamp: '2026-01-01T01:00:00Z',
    summary: 'Do not expose raw summary',
    data,
  });
  return f;
};
const run = (findings: Finding[]): SelectedRun => ({
  runId: 'current',
  entries: findings.flatMap((f) => f.entries),
  timestamp: '2026-01-01T01:00:00Z',
  kind: 'run',
});
const moduleFor = (agent: string, findings: Finding[]) =>
  buildAgentModule(agent, findings, run(findings))!;

describe('specialist module recorded-evidence data', () => {
  it('uses the requested module sequence and carbon display name with stable IDs', () => {
    expect(AGENT_MODULE_IDS).toEqual([
      'carbon-incident',
      'digital-waste',
      'ai-efficiency',
      'architecture',
      'disaster-recovery',
      'collaboration',
      'pipeline-efficiency',
    ]);
    expect(buildAgentModule('carbon-incident', [], null)?.name).toBe('Carbon Efficiency');
  });

  it.each(AGENT_MODULE_IDS)(
    'provides a distinct %s module without fabricating missing inventory',
    (id) => {
      const module = buildAgentModule(id, [], null)!;
      expect(module.id).toBe(id);
      expect(module.goal.length).toBeGreaterThan(20);
      expect(module.inventoryTitle.length).toBeGreaterThan(5);
      expect(module.columns.length).toBeGreaterThan(2);
      expect(module.supportedChecks.length).toBeGreaterThan(0);
      expect(module.notAvailable.length).toBeGreaterThan(0);
      expect(module.statusLabel).toBe('No recorded findings');
      expect(module.counts.findings).toBe(0);
      expect(module.rows).toEqual([]);
      expect(module.metrics.every((metric) => metric.value === null)).toBe(true);
      expect(module.runId).toBeNull();
    },
  );

  it.each(['unknown', '__proto__', 'code-analysis', ''])('rejects unsupported module %s', (id) => {
    expect(buildAgentModule(id, [], null)).toBeNull();
  });

  it('uses only selected-run findings, deduplicates them, and ignores stale presentation fields', () => {
    const f = finding();
    add(
      f,
      'compare',
      { recommended: 'old', strategies: [{ id: 'old', title: 'Old recommendation' }] },
      'old-run',
    );
    add(f, 'verify', { confirmed: true }, 'old-run');
    const other = finding('other');
    other.entries[0].runId = 'old-run';
    const module = moduleFor('ai-efficiency', [f, f, other]);
    expect(module.rows).toHaveLength(1);
    expect(module.counts.findings).toBe(1);
    expect(module.rows[0].verified).toBe(false);
    expect(module.rows[0].recommendation.recorded).toBe(false);
    expect(module.rows[0].recommendation.confidence).toBe('unknown');
    expect(module.rows[0].recommendation.effort).toBe('unknown');
    expect(module.rows[0].recommendation.reversible).toBeNull();
    expect(JSON.stringify(module)).not.toContain('Stale');
    expect(JSON.stringify(module)).not.toContain('Old recommendation');
    expect(buildAgentModule('ai-efficiency', [f], null)!.rows).toEqual([]);
  });

  it('records sourced recommendation details and automated decision history without presenting them as human approval', () => {
    const f = finding();
    add(f, 'investigate', {
      analysis: { provider: 'gemini', status: 'generated', tokensUsed: 999 },
    });
    add(f, 'compare', {
      recommended: 'cache',
      strategies: [
        {
          id: 'cache',
          title: 'Cache public responses',
          description: 'Use a scoped response cache.',
          effort: 'small',
          reversible: true,
        },
      ],
    });
    add(f, 'approve', { approved: true, approver: 'policy-approver', reason: 'private reasoning' });
    const row = moduleFor('ai-efficiency', [f]).rows[0];
    expect(row.recommendation).toMatchObject({
      recorded: true,
      title: 'Cache public responses',
      description: 'Use a scoped response cache.',
      source: 'AI-assisted',
      effort: 'small',
      reversible: true,
    });
    expect(row.decision.kind).toBe('policy');
    expect(row.decision.humanRecorded).toBe(false);
    expect(row.decision.detail).toContain('not a human approval');
    expect(row.activity.map((activity) => activity.stage)).toEqual([
      'detect',
      'investigate',
      'compare',
      'approve',
    ]);
    expect(JSON.stringify(row)).not.toContain('private reasoning');
  });

  it('does not infer actual workload usage from headroom, potential tokens, or GreenOps reasoner usage', () => {
    const f = finding('allowance', 'ai-efficiency', 'oversized-token-request', {
      wastedHeadroom: 1000,
      wastedTokens: 900,
      maxTokens: 1200,
      tokensPerCall: 50,
    });
    add(f, 'investigate', {
      analysis: {
        provider: 'gemini',
        status: 'generated',
        model: 'analysis-model',
        tokensUsed: 999,
      },
    });
    const row = moduleFor('ai-efficiency', [f]).rows[0];
    expect(row.workloadUsage).toBeNull();
    expect(row.cells.model).toBeNull();
    expect(row.cells.tokens).toBeNull();
    expect(row.cells.allowance).toBe('1,000 tokens of allowance');
    expect(JSON.stringify(row)).not.toContain('analysis-model');
  });

  it('shows explicit per-finding workload token evidence without summing overlapping findings', () => {
    const records = [
      finding('limit', 'ai-efficiency', 'oversized-token-request', {
        promptTokens: 10,
        completionTokens: 0,
        totalTokens: 10,
        model: 'workload-model-1',
        latencyMs: 0,
      }),
      finding('retry', 'ai-efficiency', 'ai-retry-storm', {
        promptTokens: 10,
        completionTokens: 0,
        totalTokens: 10,
        retries: 0,
      }),
    ];
    const module = moduleFor('ai-efficiency', records);
    expect(module.rows[0].workloadUsage).toMatchObject({
      basis: 'per-finding-recorded',
      promptTokens: 10,
      completionTokens: 0,
      totalTokens: 10,
      model: 'workload-model-1',
      latencyMs: 0,
    });
    expect(module.rows[0].cells.tokens).toContain('Output: 0 tokens');
    expect(module.rows[1].cells.retries).toBe('0 attempts');
    expect(module.rows[0].workloadUsage!.scope).toContain('not summed');
    expect(module).not.toHaveProperty('workloadTokens');
  });

  it('accepts input/output aliases but does not invent an unrecorded total or pick contradictory aliases', () => {
    const alias = moduleFor('ai-efficiency', [
      finding('aliases', 'ai-efficiency', 'uncached-completion', {
        inputTokens: 5,
        outputTokens: 7,
      }),
    ]).rows[0].workloadUsage!;
    expect(alias.promptTokens).toBe(5);
    expect(alias.completionTokens).toBe(7);
    expect(alias.totalTokens).toBeNull();
    const bad = moduleFor('ai-efficiency', [
      finding('conflict', 'ai-efficiency', 'uncached-completion', {
        promptTokens: 5,
        inputTokens: 6,
        completionTokens: 4,
        totalTokens: 12,
      }),
    ]).rows[0].workloadUsage!;
    expect(bad.promptTokens).toBeNull();
    const invalidTotal = moduleFor('ai-efficiency', [
      finding('conflict-total', 'ai-efficiency', 'uncached-completion', {
        promptTokens: 5,
        completionTokens: 4,
        totalTokens: 12,
      }),
    ]).rows[0].workloadUsage!;
    expect(invalidTotal.totalTokens).toBeNull();
  });

  it.each([-1, NaN, Infinity, '10', 1.5])(
    'rejects invalid token quantities %s without defaulting to zero',
    (value) => {
      const row = moduleFor('ai-efficiency', [
        finding('invalid', 'ai-efficiency', 'uncached-completion', {
          promptTokens: value,
          completionTokens: value,
          totalTokens: value,
        }),
      ]).rows[0];
      expect(row.workloadUsage).toBeNull();
      expect(row.cells.tokens).toBeNull();
    },
  );

  it('keeps cloud units separate and supports logs as well as capacity, images and storage', () => {
    const rows = moduleFor('digital-waste', [
      finding('cpu', 'digital-waste', 'overprovisioned-compute', {
        requestedCpuCores: 4,
        usedCpuCores: 0,
      }),
      finding('disk', 'digital-waste', 'unattached-storage', { gb: 0 }),
      finding('image', 'digital-waste', 'oversized-image', { sizeMb: 1200 }),
      finding('logs', 'digital-waste', 'verbose-logging', { gbPerDay: 3, retentionDays: 90 }),
    ]).rows;
    expect(rows[0].cells.capacity).toBe('Requested: 4 cores · Used: 0 cores');
    expect(rows[1].cells.storage).toBe('0 GB');
    expect(rows[2].cells.image).toBe('1,200 MB');
    expect(rows[3].cells.logging).toBe('3 GB/day · 90 days retention');
  });

  it('derives a meaningful carbon anomaly ratio, not the unverified legacy ratio field', () => {
    const good = moduleFor('carbon-incident', [
      finding('spike', 'carbon-incident', 'carbon-anomaly', {
        energyKwh: 8,
        baselineKwh: 2,
        ratio: 99,
      }),
    ]).rows[0];
    expect(good.cells.deviation).toBe('4 × baseline');
    expect(good.evidenceFacts).toContainEqual({
      label: 'Baseline deviation',
      value: '4 × baseline',
    });
    const bad = moduleFor('carbon-incident', [
      finding('spike', 'carbon-incident', 'carbon-anomaly', {
        energyKwh: 8,
        baselineKwh: 0,
        ratio: 99,
      }),
    ]).rows[0];
    expect(bad.cells.deviation).toBeNull();
    expect(JSON.stringify(bad.evidenceFacts)).not.toContain('99');
  });

  it('shows architecture evidence with no compliance or migration success inferred', () => {
    const row = moduleFor('architecture', [
      finding('sizing', 'architecture', 'inefficient-sizing', {
        instanceCores: 8,
        neededCores: 2,
        autoscale: 'false',
        region: 'eu-west-1',
        gridIntensityKgPerKwh: 0.4,
      }),
    ]).rows[0];
    expect(row.cells).toMatchObject({
      capacity: 'Provisioned: 8 cores · Needed: 2 cores',
      autoscale: 'Disabled',
      region: 'eu-west-1',
      grid: '0.4 kg CO₂e/kWh',
    });
    expect(row.applied).toBe(false);
  });

  it('keeps RTO unknown for legacy RPO-only evidence and exposes only supported DR enum values', () => {
    const row = moduleFor('disaster-recovery', [
      finding('recovery', 'disaster-recovery', 'rto-rpo-mismatch', {
        rpoMinutes: 60,
        standbyMode: 'hot',
        standbyCores: 2,
        replicationMode: 'continuous',
        criticality: 'medium',
      }),
    ]).rows[0];
    expect(row.cells.recovery).toBe('RTO: not recorded · RPO: 60 minutes');
    expect(row.cells.standby).toBe('hot · 2 cores');
    expect(row.cells.replication).toBe('continuous');
    expect(
      moduleFor('disaster-recovery', [
        finding('bad', 'disaster-recovery', 'rto-rpo-mismatch', {
          replicationMode: 'secret private payload',
          standbyMode: 'Bearer secret',
        }),
      ]).rows[0].cells.replication,
    ).toBeNull();
  });

  it('shows collaboration size/retention without exposing duplicate recording content or asserting deletion approval', () => {
    const row = moduleFor('collaboration', [
      finding('media', 'collaboration', 'redundant-recording', {
        sizeGb: 1.5,
        retentionDays: 365,
        duplicateOf: 'private recording transcript text',
        hasTranscript: 'false',
      }),
    ]).rows[0];
    expect(row.cells).toEqual({
      size: '1.5 GB',
      retention: '365 days',
      duplicate: 'Flagged as a duplicate',
      transcript: 'No',
    });
    expect(row.decision.approved).toBeNull();
    expect(JSON.stringify(row)).not.toContain('private recording transcript');
  });

  it('requires application and verification evidence together, including latest failed verification', () => {
    const missingApply = add(finding('missing'), 'verify', { confirmed: true });
    const verified = add(add(finding('verified'), 'improve', { applied: true }), 'verify', {
      confirmed: true,
    });
    const failedAgain = add(
      add(add(finding('failed'), 'improve', { applied: true }), 'verify', { confirmed: true }),
      'verify',
      { confirmed: false },
    );
    const module = moduleFor('ai-efficiency', [missingApply, verified, failedAgain]);
    expect(module.counts.verified).toBe(1);
    expect(module.rows.find((row) => row.id === 'missing')!.verified).toBe(false);
    expect(module.rows.find((row) => row.id === 'failed')!.verified).toBe(false);
  });

  it('sanitizes credentials/URLs and never returns raw private prompts, reasoning, provider errors or full paths', () => {
    const f = finding('safe', 'ai-efficiency', 'uncached-completion', {
      prompt: 'private prompt content',
      reasoning: 'private reasoning content',
      apiKey: 'private key',
      model: 'https://private.host/sk-secret',
      completionTokens: 5,
    });
    f.entries[0].summary = 'Bearer abcsecret https://private.host api_key=secret';
    add(f, 'investigate', {
      error: 'raw provider payload',
      rootCause: 'private hidden reason',
      tokensUsed: 400,
    });
    add(f, 'compare', {
      recommendation: 'Check Bearer abcsecret https://private.host api_key=secret',
    });
    const module = moduleFor('ai-efficiency', [f]);
    const serialized = JSON.stringify(module);
    for (const text of [
      'private prompt content',
      'private reasoning content',
      'private key',
      'private.host',
      'abcsecret',
      'raw provider payload',
      'private hidden reason',
      'C:\\private',
    ])
      expect(serialized).not.toContain(text);
    expect(module.rows[0].source).toBe('usage.json');
    expect(module.rows[0].resource).toBe('resource-1');
    expect(module.rows[0].workloadUsage!.model).toBeNull();
  });

  it('supports safe search over every row and does not mutate input or shared metadata', () => {
    const findings = Array.from({ length: 15 }, (_, i) => finding(`finding-${i}`));
    const before = structuredClone(findings);
    const result = moduleFor('ai-efficiency', findings);
    expect(result.rows).toHaveLength(15);
    expect(result.rows.find((row) => row.title === 'Finding finding-14')).toBeDefined();
    result.columns[0].label = 'Changed';
    result.notAvailable.push('Changed');
    result.supportedChecks.push('Changed');
    const again = moduleFor('ai-efficiency', findings);
    expect(again.columns[0].label).not.toBe('Changed');
    expect(again.notAvailable).not.toContain('Changed');
    expect(again.supportedChecks).not.toContain('Changed');
    expect(findings).toEqual(before);
    expect(JSON.parse(JSON.stringify(again))).toEqual(again);
  });

  it('does not present a total smaller than a known token component', () => {
    const row = moduleFor('ai-efficiency', [
      finding('inconsistent', 'ai-efficiency', 'uncached-completion', {
        promptTokens: 10,
        totalTokens: 5,
      }),
    ]).rows[0];
    expect(row.workloadUsage!.promptTokens).toBe(10);
    expect(row.workloadUsage!.totalTokens).toBeNull();
  });

  it('does not round small positive native measurements down to zero', () => {
    const row = moduleFor('carbon-incident', [
      finding('small', 'carbon-incident', 'carbon-anomaly', {
        energyKwh: 0.00001,
        baselineKwh: 0.000005,
      }),
    ]).rows[0];
    expect(row.cells.observed).toBe('<0.001 kWh');
    expect(row.cells.baseline).toBe('<0.001 kWh');
    expect(row.cells.deviation).toBe('2 × baseline');
  });
});
