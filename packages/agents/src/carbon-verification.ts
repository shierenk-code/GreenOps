import { timestamp } from './carbon-grid.js';
import { fingerprint, validatePlan, type CarbonPlan } from './carbon-planner.js';
import { observeCarbonJob, type CarbonKubeApi, type CarbonReceipt } from './carbon-kubernetes.js';

export interface CarbonMeasurement {
  kind: 'measured' | 'synthetic';
  jobUid: string;
  regionId: string;
  start: string;
  finish: string;
  // Same input digest, measurement boundary, allocation method and quality contract on both sides.
  inputDigest: string;
  boundary: string;
  energyMethod: string;
  functionalUnit: string;
  successfulUnits: number;
  quality: { criterion: string; passed: boolean; source: string };
  includesTransferEnergy: boolean;
  energyUncertaintyPercent: number;
  intensityUncertaintyPercent: number;
  intervals: Array<{
    from: string;
    to: string;
    energyKwh: number;
    gramsCo2PerKwh: number;
    intensityKind: 'actual' | 'forecast' | 'synthetic';
    energySource: string;
    intensitySource: string;
  }>;
}

export interface CarbonEvidence {
  version: 1;
  planId: string;
  baseline: CarbonMeasurement;
  after: CarbonMeasurement;
}

/** Deliberately incomplete: never backfill outcome measurements from a plan's forecasts. */
export function carbonEvidenceTemplate(plan: CarbonPlan, receipt: CarbonReceipt) {
  validatePlan(plan);
  const target = plan.workload.regions.find((r) => r.id === plan.selected!.regionId)!;
  if (
    receipt.planId !== plan.id ||
    !receipt.jobUid ||
    !['simulation', 'kubernetes'].includes(receipt.mode) ||
    fingerprint(receipt.target) !== fingerprint(target)
  )
    throw new Error('A confirmed receipt matching this plan is required.');
  const blank = () => ({
    kind: receipt.mode === 'simulation' ? 'synthetic' : 'measured',
    start: '',
    finish: '',
    inputDigest: '',
    boundary: '',
    energyMethod: '',
    functionalUnit: '',
    successfulUnits: null,
    quality: { criterion: '', passed: false, source: '' },
    includesTransferEnergy: false,
    energyUncertaintyPercent: null,
    intensityUncertaintyPercent: null,
    intervals: [
      {
        from: '',
        to: '',
        energyKwh: null,
        gramsCo2PerKwh: null,
        intensityKind: receipt.mode === 'simulation' ? 'synthetic' : 'actual',
        energySource: '',
        intensitySource: '',
      },
    ],
  });
  return {
    version: 1,
    planId: plan.id,
    baseline: { ...blank(), regionId: plan.workload.sourceRegion, jobUid: '' },
    after: { ...blank(), regionId: target.id, jobUid: receipt.jobUid },
  };
}

export interface CarbonVerification {
  version: 1;
  planId: string;
  checkedAt: string;
  evidenceHash: string;
  status:
    | 'not-verified'
    | 'no-reduction'
    | 'inconclusive'
    | 'synthetic-comparison'
    | 'verified-from-supplied-evidence';
  savingsVerified: boolean;
  reasons: string[];
  metrics: null | {
    baselineKgCo2: number;
    afterKgCo2: number;
    reductionKgCo2: number;
    reductionPercent: number;
    conservativeReductionKgCo2: number;
    baselineKgCo2PerUnit: number;
    afterKgCo2PerUnit: number;
  };
  limitations: string[];
}

const text = (v: unknown): v is string => typeof v === 'string' && !!v.trim() && v.length <= 1000;
const bounded = (v: unknown, max: number): v is number =>
  typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= max;

function measurement(m: CarbonMeasurement, now: Date): number {
  if (
    !m ||
    !['measured', 'synthetic'].includes(m.kind) ||
    ![
      m.jobUid,
      m.regionId,
      m.inputDigest,
      m.boundary,
      m.energyMethod,
      m.functionalUnit,
      m.quality?.criterion,
      m.quality?.source,
    ].every(text) ||
    m.quality.passed !== true ||
    m.includesTransferEnergy !== true ||
    !bounded(m.successfulUnits, 1e12) ||
    m.successfulUnits === 0 ||
    !bounded(m.energyUncertaintyPercent, 100) ||
    !bounded(m.intensityUncertaintyPercent, 100) ||
    !Array.isArray(m.intervals) ||
    !m.intervals.length ||
    m.intervals.length > 2000
  )
    throw new Error(
      'Require complete measurements, passed quality evidence, successful units, transfer energy and explicit uncertainty.',
    );
  const start = timestamp(m.start),
    finish = timestamp(m.finish);
  if (finish <= start || finish > now.getTime() || finish - start > 48 * 3_600_000)
    throw new Error('Measurement window is invalid, incomplete or in the future.');
  let cursor = start,
    kg = 0,
    energy = 0;
  for (const row of m.intervals) {
    if (
      !row ||
      timestamp(row.from) !== cursor ||
      timestamp(row.to) <= cursor ||
      timestamp(row.to) > finish ||
      !bounded(row.energyKwh, 1e9) ||
      !bounded(row.gramsCo2PerKwh, 5000) ||
      !text(row.energySource) ||
      !text(row.intensitySource) ||
      row.intensityKind !== (m.kind === 'measured' ? 'actual' : 'synthetic')
    )
      throw new Error(
        'Require contiguous energy intervals with actual carbon factors and source references; forecasts are not outcome evidence.',
      );
    cursor = timestamp(row.to);
    energy += row.energyKwh;
    kg += (row.energyKwh * row.gramsCo2PerKwh) / 1000;
  }
  if (cursor !== finish || energy <= 0)
    throw new Error('Measurement coverage or energy is missing.');
  return kg;
}

/** Checks supplied evidence; does not acquire telemetry or independently attest source documents. */
export async function verifyCarbonEvidence(
  plan: CarbonPlan,
  receipt: CarbonReceipt,
  evidence: CarbonEvidence,
  api?: CarbonKubeApi,
  now = new Date(),
): Promise<CarbonVerification> {
  const report: CarbonVerification = {
    version: 1,
    planId: plan.id,
    checkedAt: now.toISOString(),
    evidenceHash: fingerprint(evidence ?? null),
    status: 'not-verified',
    savingsVerified: false,
    reasons: [],
    metrics: null,
    limitations: [
      'Electricity-generation CO2 comparison, not SCI, lifecycle CO2e, carbon offsets or avoided grid emissions.',
      'Energy, actual grid factors, uncertainty, comparability and quality evidence are user-supplied; source references are not independently attested.',
      'Hash identifies evidence content; it is not a signature. Report does not authenticate reviewer identity.',
      'GreenOps overhead is outside this workload comparison; no net system-wide savings claim is made.',
    ],
  };
  try {
    validatePlan(plan);
    const target = plan.workload.regions.find((r) => r.id === plan.selected!.regionId)!;
    if (
      !receipt ||
      receipt.planId !== plan.id ||
      !text(receipt.jobUid) ||
      receipt.jobName !== `go-${plan.workload.sourceJob.slice(0, 20)}-${plan.id.slice(-24)}` ||
      fingerprint(receipt.target) !== fingerprint(target) ||
      !['simulation', 'kubernetes'].includes(receipt.mode) ||
      timestamp(receipt.dispatchedAt) < timestamp(plan.selected!.start) ||
      timestamp(receipt.dispatchedAt) > timestamp(plan.selected!.start) + 60_000 ||
      !evidence ||
      evidence.version !== 1 ||
      evidence.planId !== plan.id
    )
      throw new Error(
        'Receipt and evidence must match the approved plan, destination and dispatch window.',
      );
    const b = evidence.baseline,
      a = evidence.after;
    const baselineKgCo2 = measurement(b, now),
      afterKgCo2 = measurement(a, now);
    if (
      b.kind !== a.kind ||
      b.inputDigest !== a.inputDigest ||
      b.boundary !== a.boundary ||
      b.energyMethod !== a.energyMethod ||
      b.functionalUnit !== a.functionalUnit ||
      b.successfulUnits !== a.successfulUnits ||
      b.quality.criterion !== a.quality.criterion ||
      b.regionId !== plan.workload.sourceRegion ||
      a.regionId !== target.id ||
      a.jobUid !== receipt.jobUid ||
      b.jobUid === a.jobUid ||
      timestamp(b.finish) > timestamp(receipt.dispatchedAt) ||
      timestamp(a.start) < timestamp(receipt.dispatchedAt) - 60_000 ||
      timestamp(a.finish) > timestamp(plan.workload.deadline)
    )
      throw new Error(
        'Baseline and after-change evidence are not comparable or do not match the dispatched workload.',
      );
    const synthetic = receipt.mode === 'simulation';
    if (
      (synthetic && a.kind !== 'synthetic') ||
      (!synthetic &&
        (a.kind !== 'measured' ||
          plan.workload.simulationOnly ||
          plan.forecasts.some((f) => f.provider !== 'neso') ||
          !api ||
          api.mode !== 'kubernetes'))
    )
      throw new Error(
        'Synthetic evidence cannot verify real savings; real receipts require measured evidence and live job observation.',
      );
    if (!synthetic) {
      const observed = await observeCarbonJob(receipt, api!);
      if (observed.status !== 'completed')
        throw new Error('The matching Kubernetes job has not been observed as completed.');
      if (!observed.executionWindow)
        throw new Error(
          'Actual Job startTime and completionTime are required to verify full measurement coverage.',
        );
      const start = timestamp(observed.executionWindow.start),
        finish = timestamp(observed.executionWindow.finish);
      if (
        finish <= start ||
        finish > now.getTime() ||
        start < timestamp(receipt.dispatchedAt) - 60_000 ||
        finish > timestamp(plan.workload.deadline) ||
        timestamp(a.start) > start ||
        timestamp(a.finish) < finish
      )
        throw new Error(
          'Measurement intervals must cover the entire observed Job execution window.',
        );
    }
    const reductionKgCo2 = baselineKgCo2 - afterKgCo2;
    const conservativeReductionKgCo2 =
      baselineKgCo2 *
        (1 - b.energyUncertaintyPercent / 100) *
        (1 - b.intensityUncertaintyPercent / 100) -
      afterKgCo2 *
        (1 + a.energyUncertaintyPercent / 100) *
        (1 + a.intensityUncertaintyPercent / 100);
    report.metrics = {
      baselineKgCo2,
      afterKgCo2,
      reductionKgCo2,
      reductionPercent: baselineKgCo2 > 0 ? (reductionKgCo2 / baselineKgCo2) * 100 : 0,
      conservativeReductionKgCo2,
      baselineKgCo2PerUnit: baselineKgCo2 / b.successfulUnits,
      afterKgCo2PerUnit: afterKgCo2 / a.successfulUnits,
    };
    report.status = synthetic
      ? 'synthetic-comparison'
      : reductionKgCo2 <= 0
        ? 'no-reduction'
        : conservativeReductionKgCo2 <= 0
          ? 'inconclusive'
          : 'verified-from-supplied-evidence';
    report.savingsVerified = report.status === 'verified-from-supplied-evidence';
    report.reasons = [
      synthetic
        ? 'Synthetic calculation only; no real savings are verified.'
        : report.status === 'no-reduction'
          ? 'Observed emissions did not decrease.'
          : report.status === 'inconclusive'
            ? 'The reduction does not exceed the supplied uncertainty bounds.'
            : 'Matching job completion, comparable successful work, quality checks and supplied measurement bounds passed.',
    ];
  } catch (error) {
    report.reasons = [error instanceof Error ? error.message : 'Evidence validation failed.'];
  }
  return report;
}
