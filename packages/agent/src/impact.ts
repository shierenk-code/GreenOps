import type { SustainabilityBug } from '@greenops/detect';
import { GreenOpsMeasure } from '@greenops/measure';

export interface SimulatedSavings {
  energyKwh: number;
  carbonKgCo2e: number;
  resources: Record<string, number>;
  baseline: number;
}

/** Shared impact calculation used by the seven-stage loop and review adapters. */
export function simulateSustainabilityImpact(
  bug: SustainabilityBug,
  reductionFactor: number,
  measure = new GreenOpsMeasure(),
): SimulatedSavings {
  if (!Number.isFinite(reductionFactor) || reductionFactor < 0 || reductionFactor > 1) {
    throw new Error('Reduction factor must be a finite fraction between 0 and 1.');
  }
  // Azure-baseline findings carry a saving already modeled by the translation engine
  // for one specific remediation, over the baseline period, using the resource's
  // region. Credit that modeled delta once (no generic reduction factor, no
  // recurrence multiplier) when the recommended strategy has any effect; unknown
  // carbon is credited as zero rather than invented.
  if (bug.estimatedWaste.metric === 'baseline.period_kwh') {
    const credited = reductionFactor > 0;
    const kwh = credited ? Math.max(0, bug.estimatedWaste.perRun) : 0;
    const kg = credited ? Math.max(0, bug.estimatedWaste.periodKgCo2e ?? 0) : 0;
    return {
      energyKwh: kwh,
      carbonKgCo2e: kg,
      resources: { 'baseline.period_kwh': kwh },
      baseline: bug.estimatedWaste.perRun,
    };
  }
  // Handle the category first so old ledgers using carbon-equivalent CPU hours
  // cannot accidentally claim electricity savings from changing grid regions.
  if (bug.category === 'high-carbon-region') {
    const source = bug.evidence.gridIntensityKgPerKwh;
    const destination = bug.evidence.targetGridIntensityKgPerKwh;
    const cores = bug.evidence.instanceCores;
    const valid = [source, destination, cores].every(
      (value) => typeof value === 'number' && Number.isFinite(value) && value >= 0,
    );
    if (!valid) return { energyKwh: 0, carbonKgCo2e: 0, resources: {}, baseline: 0 };
    const horizon = measure.listAssumptions().find((a) => a.key === 'workload.horizon_days')!.value;
    const baselineEnergy = measure.fromCpuCoreHours((cores as number) * 24 * horizon).energyKwh;
    return {
      energyKwh: 0,
      carbonKgCo2e:
        baselineEnergy *
        Math.max(0, (source as number) - (destination as number)) *
        reductionFactor,
      resources: { 'energy.kwh_unchanged': baselineEnergy },
      baseline: baselineEnergy,
    };
  }
  // Output limits are not usage or hardware-allocation measurements. Guard by
  // category as well as metric so legacy "equivalent requests" findings cannot
  // turn this headroom into projected token, energy, or carbon savings.
  // These zeros mean no savings credited, not measured zero consumption.
  if (
    (bug.category === 'oversized-token-request' &&
      bug.estimatedWaste.metric !== 'tokens.headroom') ||
    bug.estimatedWaste.metric === 'tokens.unused_allowance'
  ) {
    return { energyKwh: 0, carbonKgCo2e: 0, resources: {}, baseline: 0 };
  }

  const perRunRemoved = bug.estimatedWaste.perRun * reductionFactor;
  const { multiplier } = measure.recurrenceMultiplier();
  const recurrence = bug.category === 'dead-code' ? 1 : multiplier;
  const removedUnits = perRunRemoved * recurrence;
  let energy = { energyKwh: 0, carbonKgCo2e: 0 };
  const metric = bug.estimatedWaste.metric;

  if (metric === 'tokens.headroom') {
    return {
      energyKwh: 0,
      carbonKgCo2e: 0,
      resources: { [metric]: removedUnits },
      baseline: bug.estimatedWaste.perRun * recurrence,
    };
  } else if (metric === 'tokens.avoided') {
    energy = measure.fromTokens(removedUnits);
  } else if (metric === 'requests.redundant') {
    energy = measure.fromTokens(removedUnits * measure.tokensPerRequest().value);
  } else if (metric === 'energy.kwh_direct') {
    const directKwh = perRunRemoved;
    const converted = measure.energyToCarbon(directKwh);
    return {
      energyKwh: converted.energyKwh,
      carbonKgCo2e: converted.carbonKgCo2e,
      resources: { [metric]: directKwh },
      baseline: bug.estimatedWaste.perRun,
    };
  } else if (metric === 'cpu.core_hours') {
    const horizonDays = measure.recurrenceMultiplier().multiplier / measure.executionsPerDay();
    const coreHours = perRunRemoved * horizonDays;
    energy = measure.fromCpuCoreHours(coreHours);
    return {
      energyKwh: energy.energyKwh,
      carbonKgCo2e: energy.carbonKgCo2e,
      resources: { [metric]: coreHours },
      baseline: bug.estimatedWaste.perRun,
    };
  } else if (metric === 'storage.gb_months') {
    energy = measure.fromStorageGbMonths(perRunRemoved);
    return {
      energyKwh: energy.energyKwh,
      carbonKgCo2e: energy.carbonKgCo2e,
      resources: { [metric]: perRunRemoved },
      baseline: bug.estimatedWaste.perRun,
    };
  } else if (bug.category === 'redundant-call') {
    energy = measure.fromCpuCoreHours(removedUnits * 0.0000005);
  } else if (bug.category === 'dead-code' || bug.category === 'duplicate-import') {
    energy = measure.fromCpuCoreHours(removedUnits * 0.00000002);
  }

  return {
    energyKwh: energy.energyKwh,
    carbonKgCo2e: energy.carbonKgCo2e,
    resources: { [metric]: removedUnits },
    baseline: bug.estimatedWaste.perRun * recurrence,
  };
}
