import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { BaselineFactors, SubscriptionBaseline } from '../src/baseline.js';
import {
  compareFootprints,
  footprintOfResource,
  sumFootprints,
  translateCompute,
  translateStorage,
  translateTokens,
  weakestKind,
} from '../src/translate.js';

const dir = resolve(__dirname, '../../../fixtures/azure-baseline');
const factors = JSON.parse(readFileSync(resolve(dir, 'factors.json'), 'utf8')) as BaselineFactors;
const baseline = JSON.parse(
  readFileSync(resolve(dir, 'subscription.json'), 'utf8'),
) as SubscriptionBaseline;

/*
 * Hand calculations with fixtures/azure-baseline/factors.json:
 *   minW 0.78, maxW 3.76 per vCPU; memory 0.392 W/GB; PUE 1.185
 *   grid centralindia 680, eastus 380 gCO2e/kWh
 *   embodied 1200 kg per 48-vCPU host over 35,040 h
 */
describe('translateCompute', () => {
  // vm-legacy-batch-01: 8 vCPU, 32 GB, 720 h at 4.2% CPU in centralindia.
  // W/vCPU = 0.78 + 0.042 x 2.98 = 0.90516; IT W = 8 x 0.90516 + 32 x 0.392 = 19.78528
  // kWh = 19.78528 x 720 / 1000 x 1.185 = 16.880800; operational = x 0.68 = 11.478944 kg
  // embodied = 1200 x 720/35040 x 8/48 = 4.109589 kg
  const idleVm = {
    vCpu: 8,
    memoryGb: 32,
    hours: 720,
    cpuAvgPct: 4.2,
    region: 'centralindia',
  };

  it('uses utilization-based power, PUE and the region grid factor', () => {
    const fp = translateCompute(idleVm, factors, 'synthetic');
    expect(fp.energyKwh).toBeCloseTo(16.8808, 3);
    expect(fp.operationalKgCo2e).toBeCloseTo(11.47894, 3);
    expect(fp.embodiedKgCo2e).toBeCloseTo(4.109589, 4);
    expect(fp.totalKgCo2e).toBeCloseTo(15.58853, 3);
    expect(fp.boundary).toEqual({ operational: true, embodied: true });
    expect(fp.gaps).toEqual([]);
  });

  it('charges an idle machine near minimum power, not full power', () => {
    const idle = translateCompute(idleVm, factors, 'synthetic').energyKwh!;
    const busy = translateCompute({ ...idleVm, cpuAvgPct: 100 }, factors, 'synthetic').energyKwh!;
    // Full utilization: (8 x 3.76 + 32 x 0.392) = 42.624 W x 720 h / 1000 x 1.185 = 36.366797 kWh
    expect(busy).toBeCloseTo(36.366797, 4);
    expect(idle).toBeLessThan(busy / 2);
  });

  it('multiplies by instances', () => {
    const one = translateCompute(idleVm, factors, 'synthetic');
    const four = translateCompute({ ...idleVm, instances: 4 }, factors, 'synthetic');
    expect(four.energyKwh!).toBeCloseTo(one.energyKwh! * 4, 6);
    expect(four.embodiedKgCo2e!).toBeCloseTo(one.embodiedKgCo2e! * 4, 6);
  });

  it('returns unknown, not zero, when utilization is missing', () => {
    const fp = translateCompute({ ...idleVm, cpuAvgPct: null }, factors, 'synthetic');
    expect(fp.energyKwh).toBeNull();
    expect(fp.operationalKgCo2e).toBeNull();
    expect(fp.totalKgCo2e).toBeNull();
    expect(fp.gaps.join(' ')).toContain('No CPU utilization');
  });

  it('returns unknown carbon for a region without a grid factor', () => {
    const fp = translateCompute({ ...idleVm, region: 'mars-central' }, factors, 'synthetic');
    expect(fp.energyKwh).not.toBeNull();
    expect(fp.operationalKgCo2e).toBeNull();
    expect(fp.gaps.join(' ')).toContain("'mars-central'");
  });

  it('lists every assumption with a source', () => {
    const fp = translateCompute(idleVm, factors, 'synthetic');
    const keys = fp.assumptions.map((a) => a.key);
    expect(keys).toEqual(
      expect.arrayContaining([
        'compute.min_watts_per_vcpu',
        'compute.max_watts_per_vcpu',
        'compute.memory_watts_per_gb',
        'infra.pue',
        'embodied.host_kgco2e',
        'carbon.grid.centralindia',
      ]),
    );
    expect(fp.assumptions.every((a) => a.source.length > 0)).toBe(true);
  });
});

describe('translateStorage', () => {
  // disk-snap-restore-04: 1024 GB Premium SSD LRS for 720 h in eastus.
  // kWh = 1.024 TB x 1.2 Wh x 3 copies x 720 h / 1000 x 1.185 = 3.145236
  // operational = 3.145236 x 0.38 = 1.195190 kg
  it('uses capacity, media, replication and PUE', () => {
    const fp = translateStorage(
      { sizeGb: 1024, media: 'ssd', redundancy: 'Premium_LRS', hours: 720, region: 'eastus' },
      factors,
      'synthetic',
    );
    expect(fp.energyKwh).toBeCloseTo(3.145236, 5);
    expect(fp.operationalKgCo2e).toBeCloseTo(1.19519, 4);
    expect(fp.boundary.embodied).toBe(false);
    expect(fp.totalKgCo2e).toBeCloseTo(fp.operationalKgCo2e!, 9);
    expect(fp.gaps.join(' ')).toContain('Embodied');
  });

  it('returns unknown energy for an unknown redundancy', () => {
    const fp = translateStorage(
      { sizeGb: 10, media: 'ssd', redundancy: 'Mystery', hours: 720, region: 'eastus' },
      factors,
      'synthetic',
    );
    expect(fp.energyKwh).toBeNull();
    expect(fp.gaps.join(' ')).toContain("'Mystery'");
  });
});

describe('translateTokens', () => {
  // support-assistant: 45,440,000 + 9,656,000 tokens on gpt-4o (large, 0.3 Wh / 1k) in eastus.
  // kWh = 55,096 x 0.3 x 1.185 / 1000 = 19.586628; operational = x 0.38 = 7.442919 kg
  it('converts tokens using the model tier factor', () => {
    const fp = translateTokens(
      { inputTokens: 45_440_000, outputTokens: 9_656_000, model: 'gpt-4o', region: 'eastus' },
      factors,
      'synthetic',
    );
    expect(fp.energyKwh).toBeCloseTo(19.586628, 5);
    expect(fp.operationalKgCo2e).toBeCloseTo(7.442919, 4);
    expect(fp.kind).toBe('synthetic');
  });

  it('a small model uses less energy for the same tokens', () => {
    const usage = { inputTokens: 1_000_000, outputTokens: 0, region: 'eastus' };
    const large = translateTokens({ ...usage, model: 'gpt-4o' }, factors, 'synthetic').energyKwh!;
    const small = translateTokens(
      { ...usage, model: 'gpt-4o-mini' },
      factors,
      'synthetic',
    ).energyKwh!;
    expect(small / large).toBeCloseTo(0.04 / 0.3, 6);
  });

  it('returns unknown for a model without a tier', () => {
    const fp = translateTokens(
      { inputTokens: 10, outputTokens: 10, model: 'unknown-model', region: 'eastus' },
      factors,
      'synthetic',
    );
    expect(fp.energyKwh).toBeNull();
    expect(fp.gaps.join(' ')).toContain("'unknown-model'");
  });
});

describe('evidence kinds', () => {
  it('the weakest input kind wins', () => {
    expect(weakestKind('measured', 'modeled')).toBe('modeled');
    expect(weakestKind('measured', 'modeled', 'synthetic')).toBe('synthetic');
    expect(weakestKind('measured')).toBe('measured');
  });

  it('measured metrics with modeled factors are modeled, never measured', () => {
    const fp = translateCompute(
      { vCpu: 2, memoryGb: 8, hours: 10, cpuAvgPct: 50, region: 'eastus' },
      factors,
      'measured',
    );
    // compute factors are modeled; the eastus grid factor is synthetic in the demo factors.
    expect(fp.kind).toBe('synthetic');
  });
});

describe('compareFootprints', () => {
  const idleVm = { vCpu: 8, memoryGb: 32, hours: 720, cpuAvgPct: 4.2, region: 'centralindia' };

  it('reports the full footprint as saved when an idle VM is shut down', () => {
    const before = translateCompute(idleVm, factors, 'synthetic');
    const after = translateCompute({ ...idleVm, hours: 0 }, factors, 'synthetic');
    const saving = compareFootprints(before, after, 'shutdown');
    expect(saving.deltaKwh).toBeCloseTo(16.8808, 3);
    expect(saving.deltaKgCo2e).toBeCloseTo(15.58853, 3);
    expect(saving.method).toBe('shutdown');
  });

  it('refuses to compare different boundaries', () => {
    const compute = translateCompute(idleVm, factors, 'synthetic');
    const storage = translateStorage(
      { sizeGb: 100, media: 'ssd', redundancy: 'LRS', hours: 720, region: 'centralindia' },
      factors,
      'synthetic',
    );
    const saving = compareFootprints(compute, storage, 'invalid');
    expect(saving.deltaKgCo2e).toBeNull();
    expect(saving.gaps.join(' ')).toContain('different carbon boundaries');
  });

  it('gives an unknown delta when either side is unknown', () => {
    const before = translateCompute({ ...idleVm, cpuAvgPct: null }, factors, 'synthetic');
    const after = translateCompute({ ...idleVm, hours: 0 }, factors, 'synthetic');
    expect(compareFootprints(before, after, 'shutdown').deltaKwh).toBeNull();
  });
});

describe('subscription baseline', () => {
  it('produces a known footprint for every compute, cluster and disk resource', () => {
    const footprints = baseline.resources
      .map((r) => ({ r, fp: footprintOfResource(r, baseline.period.hours, factors, 'synthetic') }))
      .filter((x) => x.fp !== null);
    expect(footprints.length).toBeGreaterThanOrEqual(19);
    for (const { r, fp } of footprints) {
      expect(fp!.energyKwh, r.name).not.toBeNull();
      expect(fp!.totalKgCo2e, r.name).not.toBeNull();
      expect(fp!.energyKwh!, r.name).toBeGreaterThan(0);
    }
  });

  it('includes DR replicas in a database footprint', () => {
    const db = baseline.resources.find((r) => r.name === 'reporting-db')!;
    const withReplicas = footprintOfResource(db, 720, factors, 'synthetic')!;
    const { dr: _dr, ...withoutDr } = db as typeof db & { dr?: unknown };
    const primaryOnly = footprintOfResource(withoutDr as typeof db, 720, factors, 'synthetic')!;
    expect(withReplicas.energyKwh!).toBeGreaterThan(primaryOnly.energyKwh!);
  });

  it('sums the subscription and flags the mixed embodied boundary', () => {
    const all = baseline.resources
      .map((r) => footprintOfResource(r, baseline.period.hours, factors, 'synthetic'))
      .filter((fp): fp is NonNullable<typeof fp> => fp !== null);
    const total = sumFootprints(all);
    expect(total.energyKwh!).toBeGreaterThan(0);
    expect(total.kind).toBe('synthetic');
    expect(total.boundary.embodied).toBe(false);
    expect(total.gaps.join(' ')).toContain('embodied carbon for some items only');
  });
});
