import { describe, expect, it, vi } from 'vitest';
import {
  carbonDemo,
  planCarbonWorkload,
  verifyCarbonEvidence,
  carbonEvidenceTemplate,
  type CarbonEvidence,
  type CarbonMeasurement,
  type CarbonReceipt,
  type CarbonKubeApi,
} from '../packages/agents/src/index.js';

const NOW = new Date('2026-10-05T10:00:00Z');
const END = new Date('2026-10-05T12:30:00Z');
async function fixture(synthetic = false) {
  const d = carbonDemo(NOW);
  d.workload.simulationOnly = synthetic;
  const provider = {
    forecast: async (id: number, at: Date) => ({
      ...(await d.provider.forecast(id, at)),
      provider: synthetic ? ('synthetic' as const) : ('neso' as const),
    }),
  };
  const plan = await planCarbonWorkload(d.workload, provider, NOW);
  const receipt: CarbonReceipt = {
    planId: plan.id,
    target: plan.workload.regions[1]!,
    jobName: `go-nightly-etl-${plan.id.slice(-24)}`,
    jobUid: 'after-job',
    mode: synthetic ? 'simulation' : 'kubernetes',
    dispatchedAt: plan.selected!.start,
    savingsVerified: false,
  };
  const m = (after: boolean): CarbonMeasurement => {
    const start = after ? '2026-10-05T11:00:00Z' : '2026-10-05T08:00:00Z';
    const finish = after ? '2026-10-05T12:00:00Z' : '2026-10-05T09:00:00Z';
    return {
      kind: synthetic ? 'synthetic' : 'measured',
      jobUid: after ? 'after-job' : 'historical-baseline-job',
      regionId: after ? 'south-wales' : 'south-england',
      start,
      finish,
      inputDigest: 'test-input-digest',
      boundary: 'batch plus transfer electricity',
      energyMethod: 'allocated meter intervals',
      functionalUnit: 'successful batch',
      successfulUnits: 1,
      quality: {
        criterion: 'output checksum matches reference',
        passed: true,
        source: 'test:quality-record',
      },
      includesTransferEnergy: true,
      energyUncertaintyPercent: 5,
      intensityUncertaintyPercent: 5,
      intervals: [
        {
          from: start,
          to: finish,
          energyKwh: after ? 2.1 : 2,
          gramsCo2PerKwh: after ? 80 : 300,
          intensityKind: synthetic ? 'synthetic' : 'actual',
          energySource: 'test:meter-record',
          intensitySource: 'test:actual-grid-record',
        },
      ],
    };
  };
  const evidence: CarbonEvidence = {
    version: 1,
    planId: plan.id,
    baseline: m(false),
    after: m(true),
  };
  const getJob = vi.fn(async () => ({
    apiVersion: 'batch/v1',
    kind: 'Job',
    metadata: {
      name: receipt.jobName,
      namespace: receipt.target.namespace,
      uid: receipt.jobUid,
      annotations: { 'greenops.dev/carbon-plan': plan.id },
    },
    spec: { suspend: false, template: { spec: {} } },
    status: {
      startTime: '2026-10-05T11:00:00Z',
      completionTime: '2026-10-05T12:00:00Z',
      conditions: [{ type: 'Complete', status: 'True' }],
    },
  }));
  const api: CarbonKubeApi = { ...d.api, mode: 'kubernetes', getJob };
  return { plan, receipt, evidence, api, getJob };
}

describe('carbon outcome verification', () => {
  it('allows a genuinely faster job when evidence covers its entire observed runtime', async () => {
    const s = await fixture();
    const job = await s.getJob();
    s.getJob.mockClear();
    job.status.completionTime = '2026-10-05T11:05:00Z';
    s.getJob.mockResolvedValue(job);
    s.evidence.after.finish = job.status.completionTime;
    s.evidence.after.intervals[0]!.to = job.status.completionTime;
    s.evidence.after.intervals[0]!.energyKwh = 0.2;
    expect((await verifyCarbonEvidence(s.plan, s.receipt, s.evidence, s.api, END)).status).toBe(
      'verified-from-supplied-evidence',
    );
  });
  it('rejects one minute of readings for a completed one-hour job', async () => {
    const s = await fixture();
    s.evidence.after.start = '2026-10-05T11:59:00Z';
    s.evidence.after.intervals[0]!.from = s.evidence.after.start;
    s.evidence.after.intervals[0]!.energyKwh = 0.01;
    const report = await verifyCarbonEvidence(s.plan, s.receipt, s.evidence, s.api, END);
    expect(report.status).toBe('not-verified');
    expect(report.savingsVerified).toBe(false);
    expect(report.reasons[0]).toContain('entire observed');
  });
  it.each(['missing', 'invalid', 'future', 'reversed', 'uncovered-finish'] as const)(
    'rejects %s execution timestamps',
    async (kind) => {
      const s = await fixture();
      const job = await s.getJob();
      s.getJob.mockClear();
      if (kind === 'missing') job.status.startTime = '';
      if (kind === 'invalid') job.status.completionTime = 'invalid';
      if (kind === 'future') job.status.completionTime = '2026-10-05T13:00:00Z';
      if (kind === 'reversed') job.status.completionTime = '2026-10-05T10:00:00Z';
      if (kind === 'uncovered-finish') job.status.completionTime = '2026-10-05T12:10:00Z';
      s.getJob.mockResolvedValue(job);
      expect(
        (await verifyCarbonEvidence(s.plan, s.receipt, s.evidence, s.api, END)).savingsVerified,
      ).toBe(false);
    },
  );
  it('creates an incomplete worksheet, not forecast values disguised as measurements', async () => {
    const s = await fixture();
    const template = carbonEvidenceTemplate(s.plan, s.receipt);
    expect(template.after.jobUid).toBe(s.receipt.jobUid);
    expect(template.after.intervals[0]!.energyKwh).toBeNull();
    expect(template.after.intervals[0]!.gramsCo2PerKwh).toBeNull();
    expect(template.after.quality.passed).toBe(false);
    const result = await verifyCarbonEvidence(
      s.plan,
      s.receipt,
      template as unknown as CarbonEvidence,
      s.api,
      END,
    );
    expect(result.savingsVerified).toBe(false);
    expect(s.getJob).not.toHaveBeenCalled();
  });
  it('checks comparable measured intervals, completed job, quality and uncertainty', async () => {
    const s = await fixture();
    const r = await verifyCarbonEvidence(s.plan, s.receipt, s.evidence, s.api, END);
    expect(r.status).toBe('verified-from-supplied-evidence');
    expect(r.savingsVerified).toBe(true);
    expect(r.metrics!.reductionKgCo2).toBeCloseTo(0.432);
    expect(r.metrics!.conservativeReductionKgCo2).toBeCloseTo(0.35628);
    expect(r.evidenceHash).toMatch(/^[a-f0-9]{64}$/);
    expect(s.getJob).toHaveBeenCalledTimes(1);
  });
  it('does not verify synthetic savings even when every simulated check passes', async () => {
    const s = await fixture(true);
    const r = await verifyCarbonEvidence(s.plan, s.receipt, s.evidence, undefined, END);
    expect(r.status).toBe('synthetic-comparison');
    expect(r.savingsVerified).toBe(false);
    expect(s.getJob).not.toHaveBeenCalled();
  });
  it.each([
    [
      'forecast',
      (e: CarbonEvidence) => {
        e.after.intervals[0]!.intensityKind = 'forecast';
      },
    ],
    [
      'failed quality',
      (e: CarbonEvidence) => {
        e.after.quality.passed = false;
      },
    ],
    [
      'no quality source',
      (e: CarbonEvidence) => {
        e.after.quality.source = '';
      },
    ],
    [
      'missing source',
      (e: CarbonEvidence) => {
        e.after.intervals[0]!.energySource = '';
      },
    ],
    [
      'different inputs',
      (e: CarbonEvidence) => {
        e.after.inputDigest = 'other-inputs';
      },
    ],
    [
      'different boundary',
      (e: CarbonEvidence) => {
        e.after.boundary = 'cpu only';
      },
    ],
    [
      'different method',
      (e: CarbonEvidence) => {
        e.after.energyMethod = 'estimate';
      },
    ],
    [
      'different units',
      (e: CarbonEvidence) => {
        e.after.functionalUnit = 'requests';
      },
    ],
    [
      'different work quantity',
      (e: CarbonEvidence) => {
        e.after.successfulUnits = 2;
      },
    ],
    [
      'different quality contract',
      (e: CarbonEvidence) => {
        e.after.quality.criterion = 'other';
      },
    ],
    [
      'zero work',
      (e: CarbonEvidence) => {
        e.after.successfulUnits = 0;
      },
    ],
    [
      'missing transfer',
      (e: CarbonEvidence) => {
        e.after.includesTransferEnergy = false;
      },
    ],
    [
      'invalid uncertainty',
      (e: CarbonEvidence) => {
        e.after.energyUncertaintyPercent = NaN;
      },
    ],
    [
      'invalid energy',
      (e: CarbonEvidence) => {
        e.after.intervals[0]!.energyKwh = -1;
      },
    ],
    [
      'zero energy',
      (e: CarbonEvidence) => {
        e.after.intervals[0]!.energyKwh = 0;
      },
    ],
    [
      'wrong job',
      (e: CarbonEvidence) => {
        e.after.jobUid = 'other-job';
      },
    ],
    [
      'wrong region',
      (e: CarbonEvidence) => {
        e.after.regionId = 'south-england';
      },
    ],
    [
      'wrong plan',
      (e: CarbonEvidence) => {
        e.planId = 'another';
      },
    ],
    [
      'gap',
      (e: CarbonEvidence) => {
        e.after.intervals[0]!.from = '2026-10-05T11:15:00Z';
      },
    ],
    [
      'overlap',
      (e: CarbonEvidence) => {
        e.after.intervals.push(e.after.intervals[0]!);
      },
    ],
    [
      'partial coverage',
      (e: CarbonEvidence) => {
        e.after.intervals[0]!.to = '2026-10-05T11:30:00Z';
      },
    ],
    [
      'missing readings',
      (e: CarbonEvidence) => {
        e.after.intervals = [];
      },
    ],
    [
      'future',
      (e: CarbonEvidence) => {
        e.after.finish = '2026-10-05T13:00:00Z';
      },
    ],
    [
      'mixed evidence',
      (e: CarbonEvidence) => {
        e.after.kind = 'synthetic';
      },
    ],
  ] as const)('rejects %s without a cluster read', async (_label, edit) => {
    const s = await fixture();
    edit(s.evidence);
    const r = await verifyCarbonEvidence(s.plan, s.receipt, s.evidence, s.api, END);
    expect(r.status).toBe('not-verified');
    expect(r.metrics).toBeNull();
    expect(r.savingsVerified).toBe(false);
    expect(s.getJob).not.toHaveBeenCalled();
  });
  it('requires actual matching completed job observation for real receipts', async () => {
    const s = await fixture();
    s.getJob.mockResolvedValueOnce(null as never);
    expect(
      (await verifyCarbonEvidence(s.plan, s.receipt, s.evidence, s.api, END)).savingsVerified,
    ).toBe(false);
    expect(
      (await verifyCarbonEvidence(s.plan, s.receipt, s.evidence, undefined, END)).savingsVerified,
    ).toBe(false);
  });
  it('reports regressions and reductions smaller than uncertainty without verified savings', async () => {
    const s = await fixture();
    s.evidence.after.intervals[0]!.gramsCo2PerKwh = 300;
    expect((await verifyCarbonEvidence(s.plan, s.receipt, s.evidence, s.api, END)).status).toBe(
      'no-reduction',
    );
    s.evidence.after.intervals[0]!.gramsCo2PerKwh = 280;
    const r = await verifyCarbonEvidence(s.plan, s.receipt, s.evidence, s.api, END);
    expect(r.status).toBe('inconclusive');
    expect(r.savingsVerified).toBe(false);
  });
  it('binds the receipt to destination and dispatch window', async () => {
    const s = await fixture();
    s.receipt.target = { ...s.receipt.target, context: 'other' };
    expect((await verifyCarbonEvidence(s.plan, s.receipt, s.evidence, s.api, END)).status).toBe(
      'not-verified',
    );
    expect(s.getJob).not.toHaveBeenCalled();
  });
});
