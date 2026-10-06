import { createHash } from 'node:crypto';
import {
  averageIntensity,
  timestamp,
  validateForecast,
  type GridCarbonProvider,
  type GridForecast,
} from './carbon-grid.js';

export interface CarbonRegion {
  id: string;
  gridRegionId: number;
  context: string;
  namespace: string;
  nodeRegion: string;
  residency: string;
  dataReady: boolean;
  expectedEnergyKwh: number;
  transferEnergyKwh: number;
  estimatedCostUsd: number;
  latencyMs: number;
}

export interface CarbonWorkload {
  id: string;
  sourceJob: string;
  sourceRegion: string;
  baselineStart: string;
  earliestStart: string;
  deadline: string;
  durationMinutes: number;
  maxDelayMinutes: number;
  maxCostUsd: number;
  maxLatencyMs: number;
  minReductionKgCo2?: number;
  minReductionPercent?: number;
  requiredResidency: string;
  allowRegionShift: boolean;
  idempotent: boolean;
  stateless: boolean;
  simulationOnly: boolean;
  energyEvidence: string;
  regions: CarbonRegion[];
}

export interface CarbonOption {
  regionId: string;
  start: string;
  finish: string;
  averageGramsCo2PerKwh: number;
  energyKwh: number;
  estimatedKgCo2: number;
  estimatedCostUsd: number;
}

export interface CarbonPlan {
  version: 1;
  id: string;
  createdAt: string;
  status: 'ready' | 'below-threshold' | 'no-benefit' | 'blocked';
  decisionReason: string;
  workload: CarbonWorkload;
  baseline: CarbonOption | null;
  selected: CarbonOption | null;
  options: CarbonOption[];
  forecasts: GridForecast[];
  exclusions: Array<{ regionId: string; reason: string }>;
  projectedReductionKgCo2: number | null;
  assumptions: string[];
}

export function fingerprint(value: unknown): string {
  const normalize = (item: unknown): unknown =>
    Array.isArray(item)
      ? item.map(normalize)
      : item && typeof item === 'object'
        ? Object.fromEntries(
            Object.entries(item)
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([k, v]) => [k, normalize(v)]),
          )
        : item;
  return createHash('sha256')
    .update(JSON.stringify(normalize(value)))
    .digest('hex');
}

/** Conservative demo defaults, not a scientific significance or uncertainty claim. */
export function carbonBenefitPolicy(workload: CarbonWorkload) {
  return {
    minReductionKgCo2: workload.minReductionKgCo2 ?? 0.01,
    minReductionPercent: workload.minReductionPercent ?? 5,
  };
}

export function meetsCarbonBenefit(
  workload: CarbonWorkload,
  baseline: number,
  after: number,
): boolean {
  const policy = carbonBenefitPolicy(workload);
  const reduction = baseline - after;
  return (
    Number.isFinite(baseline) &&
    Number.isFinite(after) &&
    baseline > 0 &&
    after >= 0 &&
    reduction > 0.000001 &&
    reduction + 1e-12 >= policy.minReductionKgCo2 &&
    (reduction / baseline) * 100 + 1e-12 >= policy.minReductionPercent
  );
}

export function validateWorkload(value: CarbonWorkload): void {
  const label = (s: unknown) =>
    typeof s === 'string' &&
    /^[a-z0-9][a-z0-9.-]{0,62}$/.test(s) &&
    !s.endsWith('-') &&
    !s.endsWith('.');
  const text = (s: unknown) =>
    typeof s === 'string' &&
    s.length > 0 &&
    s.length <= 250 &&
    ![...s].some((character) => character.charCodeAt(0) < 32) &&
    !s.startsWith('-');
  const number = (n: unknown, max: number, positive = false) =>
    typeof n === 'number' && Number.isFinite(n) && n >= (positive ? 0.001 : 0) && n <= max;
  if (
    !value ||
    !label(value.id) ||
    !label(value.sourceJob) ||
    !label(value.sourceRegion) ||
    !text(value.requiredResidency) ||
    !text(value.energyEvidence) ||
    !number(value.durationMinutes, 1440, true) ||
    !number(value.maxDelayMinutes, 2880) ||
    !number(value.maxCostUsd, 1e6) ||
    !number(value.maxLatencyMs, 1e6) ||
    (value.minReductionKgCo2 !== undefined && !number(value.minReductionKgCo2, 1e9)) ||
    (value.minReductionPercent !== undefined && !number(value.minReductionPercent, 100)) ||
    typeof value.allowRegionShift !== 'boolean' ||
    typeof value.simulationOnly !== 'boolean' ||
    value.idempotent !== true ||
    value.stateless !== true ||
    !Array.isArray(value.regions) ||
    value.regions.length < 1 ||
    value.regions.length > 8
  ) {
    throw new Error(
      'Invalid workload: require bounded inputs and an explicitly stateless, idempotent batch job.',
    );
  }
  const earliest = timestamp(value.earliestStart),
    baseline = timestamp(value.baselineStart),
    deadline = timestamp(value.deadline);
  if (
    baseline < earliest ||
    deadline <= baseline ||
    deadline - earliest > 48 * 60 * 60_000 ||
    baseline + value.durationMinutes * 60_000 > deadline
  )
    throw new Error('Invalid workload scheduling window.');
  const ids = new Set<string>();
  for (const r of value.regions) {
    if (
      !r ||
      !label(r.id) ||
      ids.has(r.id) ||
      !text(r.context) ||
      !label(r.namespace) ||
      !label(r.nodeRegion) ||
      !text(r.residency) ||
      !Number.isInteger(r.gridRegionId) ||
      r.gridRegionId < 1 ||
      r.gridRegionId > 17 ||
      typeof r.dataReady !== 'boolean' ||
      !number(r.expectedEnergyKwh, 1e9, true) ||
      !number(r.transferEnergyKwh, 1e9) ||
      !number(r.estimatedCostUsd, 1e6) ||
      !number(r.latencyMs, 1e6)
    ) {
      throw new Error(
        'Invalid or duplicate region configuration; explicit GB grid and Kubernetes mapping required.',
      );
    }
    ids.add(r.id);
  }
  if (!ids.has(value.sourceRegion)) throw new Error('Source region is not configured.');
}

export async function planCarbonWorkload(
  workload: CarbonWorkload,
  provider: GridCarbonProvider,
  now = new Date(),
): Promise<CarbonPlan> {
  validateWorkload(workload);
  if (
    timestamp(workload.baselineStart) < now.getTime() ||
    timestamp(workload.deadline) > now.getTime() + 48 * 60 * 60_000
  ) {
    throw new Error('Baseline must be in the future and deadline within the forecast horizon.');
  }
  const forecasts: GridForecast[] = [],
    options: CarbonOption[] = [],
    exclusions: CarbonPlan['exclusions'] = [];
  let baseline: CarbonOption | null = null;
  const forecastCache = new Map<number, GridForecast>();
  for (const region of workload.regions) {
    let reason = '';
    if (region.residency !== workload.requiredResidency) reason = 'Data residency is not allowed.';
    else if (!region.dataReady) reason = 'Data or dependencies are not ready in this region.';
    else if (region.estimatedCostUsd > workload.maxCostUsd) reason = 'Cost budget exceeded.';
    else if (region.latencyMs > workload.maxLatencyMs) reason = 'Latency constraint exceeded.';
    else if (region.id !== workload.sourceRegion && !workload.allowRegionShift)
      reason = 'Region movement is disabled.';
    if (reason) {
      exclusions.push({ regionId: region.id, reason });
      continue;
    }
    let forecast: GridForecast;
    try {
      forecast = validateForecast(
        forecastCache.get(region.gridRegionId) ??
          (await provider.forecast(region.gridRegionId, now)),
        region.gridRegionId,
        now,
      );
      if (!forecastCache.has(region.gridRegionId)) forecasts.push(forecast);
      forecastCache.set(region.gridRegionId, forecast);
    } catch {
      exclusions.push({ regionId: region.id, reason: 'Forecast unavailable, stale, or invalid.' });
      continue;
    }
    const evaluate = (start: number): CarbonOption | null => {
      const intensity = averageIntensity(forecast, start, workload.durationMinutes);
      if (intensity === null) return null;
      const energyKwh = region.expectedEnergyKwh + region.transferEnergyKwh;
      return {
        regionId: region.id,
        start: new Date(start).toISOString(),
        finish: new Date(start + workload.durationMinutes * 60_000).toISOString(),
        averageGramsCo2PerKwh: intensity,
        energyKwh,
        estimatedKgCo2: (energyKwh * intensity) / 1000,
        estimatedCostUsd: region.estimatedCostUsd,
      };
    };
    if (region.id === workload.sourceRegion) baseline = evaluate(timestamp(workload.baselineStart));
    const earliest = Math.max(timestamp(workload.earliestStart), now.getTime());
    const latest = Math.min(
      timestamp(workload.deadline) - workload.durationMinutes * 60_000,
      timestamp(workload.baselineStart) + workload.maxDelayMinutes * 60_000,
    );
    const starts = new Set([
      earliest,
      timestamp(workload.baselineStart),
      ...forecast.intervals.flatMap((row) => [
        timestamp(row.from),
        timestamp(row.to) - workload.durationMinutes * 60_000,
      ]),
    ]);
    let available = 0;
    for (const start of starts)
      if (start >= earliest && start <= latest) {
        const option = evaluate(start);
        if (option) {
          options.push(option);
          available++;
        }
      }
    if (!available)
      exclusions.push({
        regionId: region.id,
        reason: 'No complete forecast covers a permitted execution window.',
      });
  }
  options.sort(
    (a, b) =>
      a.estimatedKgCo2 - b.estimatedKgCo2 ||
      Number(b.regionId === workload.sourceRegion) - Number(a.regionId === workload.sourceRegion) ||
      a.start.localeCompare(b.start),
  );
  const selected = baseline && options.length ? options[0]! : null;
  const reduction = selected && baseline ? baseline.estimatedKgCo2 - selected.estimatedKgCo2 : null;
  const status: CarbonPlan['status'] =
    !baseline || !selected
      ? 'blocked'
      : reduction! <= 0.000001
        ? 'no-benefit'
        : meetsCarbonBenefit(workload, baseline.estimatedKgCo2, selected.estimatedKgCo2)
          ? 'ready'
          : 'below-threshold';
  const payload = {
    version: 1 as const,
    createdAt: now.toISOString(),
    status,
    decisionReason:
      status === 'ready'
        ? 'Projected reduction meets both minimum-benefit thresholds; human approval is required.'
        : status === 'below-threshold'
          ? 'Keep the existing schedule: projected reduction is below the configured minimum benefit.'
          : status === 'no-benefit'
            ? 'Keep the existing schedule: no beneficial change was found.'
            : 'Insufficient baseline or candidate evidence; no dispatch is permitted.',
    workload: { ...structuredClone(workload), ...carbonBenefitPolicy(workload) },
    baseline,
    selected,
    options,
    forecasts,
    exclusions,
    projectedReductionKgCo2: reduction,
    assumptions: [
      'Forecast-based electricity-generation CO2 only; not SCI, lifecycle CO2e, measured savings, or a verified outcome.',
      'Energy is a supplied estimate spread uniformly over execution; transfer energy is included at destination intensity.',
      'Runtime, energy, cost, latency, residency and data readiness are supplied constraints, not measured by this planner.',
      'Forecast freshness describes retrieval time; NESO does not provide an issuance timestamp in this response.',
      'Region movement means dispatching a never-started stateless Job to a preconfigured cluster, not migrating running pods or data.',
    ],
  };
  return { ...payload, id: `carbon-${fingerprint(payload).slice(0, 24)}` };
}

export function validatePlan(plan: CarbonPlan): void {
  const { id, ...payload } = plan;
  if (id !== `carbon-${fingerprint(payload).slice(0, 24)}`)
    throw new Error('Carbon plan was modified; create and review a new plan.');
  validateWorkload(plan.workload);
  if (
    plan.version !== 1 ||
    plan.status !== 'ready' ||
    !plan.selected ||
    !plan.baseline ||
    !(plan.projectedReductionKgCo2! > 0)
  )
    throw new Error('Plan does not have a beneficial, supported scheduling decision.');
  const workload = plan.workload;
  if (
    plan.baseline.regionId !== workload.sourceRegion ||
    timestamp(plan.baseline.start) !== timestamp(workload.baselineStart)
  ) {
    throw new Error('Plan baseline does not match the workload.');
  }
  for (const option of [plan.baseline, plan.selected]) {
    const region = workload.regions.find((r) => r.id === option.regionId);
    if (
      !region ||
      region.residency !== workload.requiredResidency ||
      !region.dataReady ||
      region.estimatedCostUsd > workload.maxCostUsd ||
      region.latencyMs > workload.maxLatencyMs ||
      (!workload.allowRegionShift && region.id !== workload.sourceRegion) ||
      timestamp(option.start) < timestamp(workload.earliestStart) ||
      timestamp(option.start) >
        timestamp(workload.baselineStart) + workload.maxDelayMinutes * 60_000 ||
      timestamp(option.finish) !== timestamp(option.start) + workload.durationMinutes * 60_000 ||
      timestamp(option.finish) > timestamp(workload.deadline)
    )
      throw new Error('Plan violates workload constraints.');
    const forecast = plan.forecasts.find((f) => f.gridRegionId === region.gridRegionId);
    if (!forecast) throw new Error('Plan is missing forecast evidence.');
    const intensity = averageIntensity(
      validateForecast(forecast, region.gridRegionId, new Date(plan.createdAt)),
      timestamp(option.start),
      workload.durationMinutes,
    );
    const energy = region.expectedEnergyKwh + region.transferEnergyKwh;
    if (
      intensity === null ||
      option.averageGramsCo2PerKwh !== intensity ||
      option.energyKwh !== energy ||
      option.estimatedKgCo2 !== (energy * intensity) / 1000 ||
      option.estimatedCostUsd !== region.estimatedCostUsd
    ) {
      throw new Error('Plan estimates do not match its evidence.');
    }
  }
  if (plan.projectedReductionKgCo2 !== plan.baseline.estimatedKgCo2 - plan.selected.estimatedKgCo2)
    throw new Error('Plan reduction is inconsistent.');
  if (!meetsCarbonBenefit(workload, plan.baseline.estimatedKgCo2, plan.selected.estimatedKgCo2))
    throw new Error('Plan does not meet the minimum-benefit policy.');
}
