import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  validateBaseline,
  type BaselineFactors,
  type SubscriptionBaseline,
} from '../src/baseline.js';

const dir = resolve(__dirname, '../../../fixtures/azure-baseline');
const load = <T>(name: string): T => JSON.parse(readFileSync(resolve(dir, name), 'utf8')) as T;
const factors = load<BaselineFactors>('factors.json');
const fresh = () => load<SubscriptionBaseline>('subscription.json');

describe('Azure subscription baseline fixture', () => {
  it('is valid against its factors', () => {
    const result = validateBaseline(fresh(), factors);
    expect(result.errors).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it('is synthetic and covers every agent input', () => {
    const b = fresh();
    expect(b.provenance).toBe('synthetic');
    const types = new Set(b.resources.map((r) => r.type));
    for (const t of [
      'Microsoft.Compute/virtualMachines',
      'Microsoft.Compute/virtualMachineScaleSets',
      'Microsoft.Web/serverFarms',
      'Microsoft.ContainerService/managedClusters',
      'Microsoft.Compute/disks',
      'Microsoft.ContainerRegistry/registries',
      'Microsoft.OperationalInsights/workspaces',
      'Microsoft.Sql/servers/databases',
      'Microsoft.Cache/redis',
      'Microsoft.CognitiveServices/accounts',
    ])
      expect(types.has(t)).toBe(true);
    expect(b.pipelines.length).toBeGreaterThanOrEqual(3);
    expect(b.aiWorkloads.length).toBeGreaterThanOrEqual(3);
    expect(b.timeseries.some((s) => s.metric === 'cpuPct')).toBe(true);
    expect(b.collaboration?.recordings.length).toBeGreaterThan(0);
    expect(new Set(b.resources.map((r) => r.region))).toEqual(new Set(b.regions));
  });

  it('keeps business-hour arithmetic consistent', () => {
    // 22 weekdays x 10 business hours = 220; the remaining 500 of 720 hours are off-hours.
    for (const r of fresh().resources) {
      const m = (r as { metrics?: { runtimeHours?: number; offHoursRuntimeHours?: number } })
        .metrics;
      if (m?.runtimeHours === 720) expect(m.offHoursRuntimeHours ?? 500).toBe(500);
    }
  });
});

describe('validateBaseline', () => {
  it('rejects computed or conclusion fields anywhere in the document', () => {
    const b = fresh() as unknown as {
      resources: Array<Record<string, unknown>>;
      aiWorkloads: Array<Record<string, unknown>>;
    };
    b.resources[0].wasteType = 'IdleCompute';
    b.aiWorkloads[0].carbonImpact = { carbonSaved_kgCO2e: 12.3 };
    const { ok, errors } = validateBaseline(b, factors);
    expect(ok).toBe(false);
    expect(errors.some((e) => e.includes('wasteType'))).toBe(true);
    expect(errors.some((e) => e.includes('carbonImpact'))).toBe(true);
    expect(errors.some((e) => e.includes('carbonSaved_kgCO2e'))).toBe(true);
  });

  it('rejects regions without a grid factor', () => {
    const b = fresh();
    b.resources[0].region = 'mars-central';
    expect(validateBaseline(b, factors).errors.join('\n')).toContain("'mars-central'");
  });

  it('rejects broken cross-references', () => {
    const b = fresh();
    const selfHosted = b.pipelines.find((p) => p.runner.kind === 'self-hosted')!;
    selfHosted.runner = { kind: 'self-hosted', resourceId: '/missing' };
    b.aiWorkloads[0].deployment = 'gpt-unknown';
    const disk = b.resources.find((r) => r.name === 'disk-etl-data-01') as {
      metrics: { attachedTo: string | null };
    };
    disk.metrics.attachedTo = '/missing-vm';
    const text = validateBaseline(b, factors).errors.join('\n');
    expect(text).toContain('self-hosted runner');
    expect(text).toContain("deployment 'gpt-unknown'");
    expect(text).toContain("attachedTo '/missing-vm'");
  });

  it('rejects duplicate ids, unknown teams and impossible metrics', () => {
    const b = fresh();
    b.resources.push({ ...b.resources[0] });
    b.resources[1].tags.team = 'nobody';
    const vm = b.resources[2] as { metrics: { cpu: { avgPct: number; p95Pct: number } } };
    vm.metrics.cpu.avgPct = 50;
    vm.metrics.cpu.p95Pct = 10;
    b.aiWorkloads[0].cacheHits = b.aiWorkloads[0].requests + 1;
    const text = validateBaseline(b, factors).errors.join('\n');
    expect(text).toContain('duplicate id');
    expect(text).toContain("unknown team 'nobody'");
    expect(text).toContain('p95Pct is below avgPct');
    expect(text).toContain('cacheHits exceed requests');
  });

  it('rejects a non-object input', () => {
    expect(validateBaseline(null, factors).ok).toBe(false);
  });
});
