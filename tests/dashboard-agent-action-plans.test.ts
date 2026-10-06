import { describe, expect, it } from 'vitest';
import {
  actionCandidates,
  actionWorkbenchIdentity,
  formatActionNumber,
  previewArchitecturePlan,
  previewCarbonScenario,
  previewRecoveryTabletop,
  previewRetentionPlan,
} from '../apps/CodeVitals-MCP/website/src/app/dashboard/agent-action-plans';
import type { Finding } from '../apps/CodeVitals-MCP/website/src/app/dashboard/ledger-dashboard';
import type { SelectedRun } from '../apps/CodeVitals-MCP/website/src/app/dashboard/ledger-data';

function fixture(agentId = 'digital-waste', category = 'unattached-storage') {
  const finding: Finding = {
    bugId: 'finding-1',
    agentId,
    agentName: 'Specialist',
    category,
    severity: 'medium',
    title: 'Stale title',
    state: 'in-progress',
    impactEnergyKwh: 100,
    impactCarbonKg: 40,
    confidence: 'unknown',
    effort: 'unknown',
    recommendationId: '',
    recommendationTitle: '',
    recommendation: '',
    expectedReductionFactor: 0,
    reversible: false,
    entries: [],
  };
  const run: SelectedRun = {
    runId: 'r1',
    kind: 'review',
    timestamp: '',
    entries: [
      {
        runId: 'r1',
        bugId: finding.bugId,
        stage: 'detect',
        seq: 1,
        timestamp: '',
        summary: 'Recorded storage finding',
        data: {
          agentId,
          category,
          location: { symbol: 'volume-1', filePath: 'C:/private/source.json' },
          evidence: { prompt: 'PRIVATE_PROMPT', apiKey: 'PRIVATE_API_KEY' },
          reasoning: 'PRIVATE_REASONING',
        },
      },
    ],
  };
  return {
    findings: [finding],
    run,
    agentId,
    selectedIds: ['finding-1'],
    retentionDays: '30',
    action: 'review',
  };
}

describe('local specialist action planning', () => {
  it.each(['toString', 'constructor', '__proto__', 'hasOwnProperty'])(
    'ignores unsupported prototype-like agent %s',
    (agentId) => {
      const input = fixture();
      expect(() => actionCandidates(agentId, input.findings, input.run)).not.toThrow();
      expect(actionCandidates(agentId, input.findings, input.run)).toEqual([]);
      expect(previewRetentionPlan({ ...input, agentId }).ok).toBe(false);
    },
  );

  it('resets planning identity when resource or relevant evidence changes under the same run ID and timestamp', () => {
    const input = fixture();
    const identity = () => actionWorkbenchIdentity(input.agentId, input.findings, input.run);
    const first = identity();
    input.run.entries[0].data.location = { symbol: 'volume-2' };
    const changedResource = identity();
    expect(changedResource).not.toBe(first);
    input.run.entries[0].data.evidence = { gb: 100 };
    const changedEvidence = identity();
    expect(changedEvidence).not.toBe(changedResource);
    input.run.entries.push({
      ...input.run.entries[0],
      seq: 2,
      stage: 'compare',
      data: { recommendation: 'Review the new retention policy.' },
    });
    expect(identity()).not.toBe(changedEvidence);
    expect(input.run.runId).toBe('r1');
    expect(input.run.timestamp).toBe('');
  });

  it('keeps raw prompts, credentials and reasoning out of planning identity', () => {
    const input = fixture();
    const before = actionWorkbenchIdentity(input.agentId, input.findings, input.run);
    for (const secret of [
      'PRIVATE_PROMPT',
      'PRIVATE_API_KEY',
      'PRIVATE_REASONING',
      'private/source',
    ])
      expect(before).not.toContain(secret);
    input.run.entries[0].data.reasoning = 'OTHER_PRIVATE_REASONING';
    expect(actionWorkbenchIdentity(input.agentId, input.findings, input.run)).toBe(before);
  });

  it('uses selected-run detection evidence and excludes raw payloads from preview', () => {
    const input = fixture();
    const result = actionCandidates(input.agentId, input.findings, input.run);
    expect(result).toEqual([
      {
        findingId: 'finding-1',
        title: 'Recorded storage finding',
        resourceId: 'volume-1',
        category: 'unattached-storage',
      },
    ]);
    const plan = previewRetentionPlan(input);
    expect(plan.ok).toBe(true);
    for (const secret of [
      'PRIVATE_PROMPT',
      'PRIVATE_API_KEY',
      'PRIVATE_REASONING',
      'private/source',
      'Stale title',
    ])
      expect(JSON.stringify(plan)).not.toContain(secret);
  });

  it('does not borrow candidates from another run or specialist', () => {
    const input = fixture();
    input.run.entries.push({ ...input.run.entries[0], runId: 'other-run', summary: 'OTHER_RUN' });
    expect(
      JSON.stringify(actionCandidates(input.agentId, input.findings, input.run)),
    ).not.toContain('OTHER_RUN');
    expect(
      actionCandidates(input.agentId, input.findings, { ...input.run, runId: 'missing' }),
    ).toEqual([]);
    expect(previewRetentionPlan({ ...input, run: { ...input.run, runId: 'missing' } }).ok).toBe(
      false,
    );
    input.run.entries[0].data.agentId = 'collaboration';
    expect(actionCandidates(input.agentId, input.findings, input.run)).toEqual([]);
  });

  it('never treats compute findings as archive candidates', () => {
    const input = fixture('digital-waste', 'overprovisioned-compute');
    expect(actionCandidates(input.agentId, input.findings, input.run)).toEqual([]);
    expect(previewRetentionPlan(input).ok).toBe(false);
  });

  it.each([[], null, ['unknown'], [1]])('rejects empty or invalid selection %j', (selectedIds) => {
    expect(previewRetentionPlan({ ...fixture(), selectedIds }).ok).toBe(false);
  });

  it('rejects a missing run and counts deduplicated resource selections', () => {
    expect(previewRetentionPlan({ ...fixture(), run: null }).ok).toBe(false);
    const result = previewRetentionPlan({ ...fixture(), selectedIds: ['finding-1', 'finding-1'] });
    expect(result.ok && result.value.resources).toHaveLength(1);
  });

  it.each([undefined, '', ' ', 0, -1, 3651, 1.5, Infinity, NaN, true, '0x10'])(
    'rejects invalid retention days %j',
    (retentionDays) => {
      expect(previewRetentionPlan({ ...fixture(), retentionDays }).ok).toBe(false);
    },
  );

  it.each([1, 3650])('accepts retention boundary %i without applying changes', (retentionDays) => {
    const input = { ...fixture(), retentionDays, action: 'archive' };
    const before = JSON.stringify(input);
    const result = previewRetentionPlan(input);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.status).toBe('draft-only');
    expect(result.value.requiredChecks.join(' ')).toMatch(/legal holds/);
    expect(result.value.requiredChecks.join(' ')).toMatch(/test restoration/);
    expect(result.value.disclaimer).toContain('No data has been archived');
    expect(JSON.stringify(input)).toBe(before);
  });

  it('never accepts deletion or an unsupported action', () => {
    expect(previewRetentionPlan({ ...fixture(), action: 'delete' }).ok).toBe(false);
    expect(previewRetentionPlan({ ...fixture(), agentId: 'architecture' }).ok).toBe(false);
  });

  it('supports collaboration with the same approval and retention controls', () => {
    const result = previewRetentionPlan(fixture('collaboration', 'excessive-retention'));
    expect(result.ok && result.value.title).toBe('Retention policy review');
  });

  it('redacts credentials from titles and omits unsafe resource IDs', () => {
    const input = fixture();
    input.run.entries[0].summary = 'Storage api_key=SECRET_VALUE and Bearer TOKEN_VALUE';
    input.run.entries[0].data.location = { symbol: 'C:/private/resource' };
    const result = previewRetentionPlan(input);
    expect(JSON.stringify(result)).not.toMatch(/SECRET_VALUE|TOKEN_VALUE|private\/resource/);
    expect(result.ok && result.value.resources[0].resourceId).toBeNull();
  });

  it('creates architecture review steps, not fabricated code or a compliance result', () => {
    const input = fixture('architecture', 'high-carbon-region');
    const result = previewArchitecturePlan(input);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.status).toBe('draft-only');
    expect(result.value.steps.join(' ')).toContain('non-applying plan');
    expect(result.value.requiredChecks.join(' ')).toContain('Data residency');
    expect(result.value.disclaimer).toContain('No code, deployment or cloud resource has changed');
    expect(result.value).not.toHaveProperty('patch');
    expect(previewArchitecturePlan({ ...input, selectedIds: [] }).ok).toBe(false);
  });
});

describe('hypothetical operational carbon scenario', () => {
  it('formats tiny nonzero values without displaying zero', () => {
    expect(formatActionNumber(0)).toBe('0');
    expect(formatActionNumber(0.0000001)).toBe('1.00e-7');
    expect(formatActionNumber(-0.0000001)).toBe('-1.00e-7');
    expect(formatActionNumber(Number.MIN_VALUE)).not.toBe('0');
    expect(formatActionNumber(0.000001)).toBe('0.000001');
    expect(formatActionNumber(12.5)).toBe('12.5');
    expect(formatActionNumber(Infinity)).toBe('Not available');
  });
  it('converts grams to kg once, holds energy fixed, and preserves increases', () => {
    const result = previewCarbonScenario({
      energyKwh: '10',
      baselineGramsPerKwh: '400',
      targetGramsPerKwh: '500',
    });
    expect(result).toEqual({
      ok: true,
      value: {
        energyKwh: 10,
        baselineGramsPerKwh: 400,
        targetGramsPerKwh: 500,
        baselineKg: 4,
        targetKg: 5,
        reductionKg: -1,
      },
    });
  });
  it('retains explicit zero without interpreting missing inputs as zero', () => {
    const zero = previewCarbonScenario({
      energyKwh: 0,
      baselineGramsPerKwh: 0,
      targetGramsPerKwh: 500,
    });
    expect(zero.ok && zero.value.reductionKg).toBe(0);
    expect(
      previewCarbonScenario({ energyKwh: '', baselineGramsPerKwh: 0, targetGramsPerKwh: 500 }).ok,
    ).toBe(false);
  });
  it.each([Infinity, NaN, -1, true, null, '0x10', 1e308])(
    'rejects invalid energy %j',
    (energyKwh) => {
      expect(
        previewCarbonScenario({ energyKwh, baselineGramsPerKwh: 400, targetGramsPerKwh: 300 }).ok,
      ).toBe(false);
    },
  );
  it('rejects invalid intensity factors', () => {
    expect(
      previewCarbonScenario({ energyKwh: 1, baselineGramsPerKwh: '', targetGramsPerKwh: -1 }).ok,
    ).toBe(false);
  });
});

describe('hypothetical recovery tabletop', () => {
  it('compares recovery and data targets independently including equality', () => {
    const result = previewRecoveryTabletop({
      rtoMinutes: 30,
      rpoMinutes: 5,
      recoveryMinutes: 30,
      dataGapMinutes: 6,
    });
    expect(result.ok && result.value.meetsRecoveryTarget).toBe(true);
    expect(result.ok && result.value.meetsDataTarget).toBe(false);
    expect(result).not.toHaveProperty('slaVerified');
  });
  it('accepts explicit zero targets, but not absent targets', () => {
    const result = previewRecoveryTabletop({
      rtoMinutes: 0,
      rpoMinutes: 0,
      recoveryMinutes: 0,
      dataGapMinutes: 0,
    });
    expect(result.ok && result.value.meetsDataTarget).toBe(true);
    expect(
      previewRecoveryTabletop({
        rtoMinutes: '',
        rpoMinutes: 0,
        recoveryMinutes: 0,
        dataGapMinutes: 0,
      }).ok,
    ).toBe(false);
  });
  it.each([-1, Infinity, NaN, true, 525601])(
    'rejects invalid recovery estimate %j',
    (recoveryMinutes) => {
      expect(
        previewRecoveryTabletop({
          rtoMinutes: 30,
          rpoMinutes: 5,
          recoveryMinutes,
          dataGapMinutes: 1,
        }).ok,
      ).toBe(false);
    },
  );
});
