import { describe, expect, it } from 'vitest';
import {
  assessSci,
  createSyntheticSciExample,
  type SciAssessment,
  type SciQuantity,
} from '../src/sci.js';

const example = () => createSyntheticSciExample();
const q = (value: number): SciQuantity => ({
  value,
  kind: 'synthetic',
  source: 'Synthetic test fixture, not measurement',
});
const resultFor = (mutate: (input: SciAssessment) => void) => {
  const input = example();
  mutate(input);
  return assessSci(input);
};

describe('SCI-based evidence calculation', () => {
  it('calculates sourced operational and allocated embodied emissions in grams per successful task', () => {
    const result = assessSci(example());
    expect(result.baseline.status).toBe('complete');
    expect(result.baseline.facilityEnergyKwh).toBeCloseTo(0.1);
    expect(result.baseline.operationalGrams).toBe(40);
    expect(result.baseline.embodiedGrams).toBe(5);
    expect(result.baseline.sciGramsPerUnit).toBeCloseTo(0.45);
    expect(result.after?.sciGramsPerUnit).toBeCloseTo(0.29);
    expect(result.comparison.status).toBe('comparable');
    expect(result.comparison.reductionGramsPerUnit).toBeCloseTo(0.16);
    expect(result.comparison.reductionPercent).toBeCloseTo((0.16 / 0.45) * 100);
    expect(result.comparison.synthetic).toBe(true);
    expect(result.disclaimer).toContain('not standards certification');
    expect(result.disclaimer).toContain('No carbon offsets');
  });

  it('does not mutate inputs and is deterministic / JSON-safe', () => {
    const input = example();
    const before = JSON.stringify(input);
    const result = assessSci(input);
    expect(JSON.stringify(input)).toBe(before);
    expect(assessSci(JSON.parse(before))).toEqual(result);
    expect(JSON.parse(JSON.stringify(result))).toEqual(result);
  });

  it('applies PUE exactly once to IT-only energy', () => {
    const result = resultFor((input) => {
      input.methodology.components[0].energyBasis = 'it';
      input.baseline.components[0].pue = q(1.5);
      input.after!.components[0].pue = q(1.5);
    });
    expect(result.baseline.facilityEnergyKwh).toBeCloseTo(0.15);
    expect(result.baseline.operationalGrams).toBeCloseTo(60);
    expect(result.baseline.sciGramsPerUnit).toBeCloseTo(0.65);
  });

  it('refuses a second PUE multiplier on facility-inclusive energy', () => {
    const result = resultFor((input) => {
      input.baseline.components[0].pue = q(1.2);
    });
    expect(result.baseline.status).toBe('invalid');
    expect(result.baseline.sciGramsPerUnit).toBeNull();
    expect(result.baseline.issues.some((e) => e.code === 'double-counted-pue')).toBe(true);
  });

  it.each([0, 0.9, -1, NaN, Infinity])('rejects invalid PUE %s', (value) => {
    const result = resultFor((input) => {
      input.methodology.components[0].energyBasis = 'it';
      input.baseline.components[0].pue = q(value);
    });
    expect(result.baseline.status).toBe('invalid');
    expect(result.baseline.sciGramsPerUnit).toBeNull();
  });

  it('does not invent PUE when IT energy is supplied', () => {
    const result = resultFor((input) => {
      input.methodology.components[0].energyBasis = 'it';
    });
    expect(result.baseline.status).toBe('incomplete');
    expect(result.baseline.facilityEnergyKwh).toBeNull();
  });

  it('leaves unknown embodied emissions null and labels operational-only evidence separately', () => {
    const result = resultFor((input) => {
      input.baseline.components[0].hardware = null;
    });
    expect(result.baseline.status).toBe('incomplete');
    expect(result.baseline.embodiedGrams).toBeNull();
    expect(result.baseline.sciGramsPerUnit).toBeNull();
    expect(result.baseline.totalGrams).toBeNull();
    expect(result.baseline.operationalGramsPerUnit).toBeCloseTo(0.4);
    expect(result.comparison.reductionGramsPerUnit).toBeNull();
  });

  it('does not interpret an empty hardware allocation as zero', () => {
    const result = resultFor((input) => {
      input.baseline.components[0].hardware = [];
    });
    expect(result.baseline.status).toBe('incomplete');
    expect(result.baseline.embodiedGrams).toBeNull();
  });

  it.each(['energyKwh', 'carbonIntensityGramsPerKwh'] as const)(
    'missing %s does not become zero',
    (field) => {
      const result = resultFor((input) => {
        input.baseline.components[0][field] = null;
      });
      expect(result.baseline.status).toBe('incomplete');
      expect(result.baseline.operationalGrams).toBeNull();
      expect(result.baseline.sciGramsPerUnit).toBeNull();
    },
  );

  it('requires sources for every input', () => {
    const result = resultFor((input) => {
      input.baseline.components[0].energyKwh!.source = '';
    });
    expect(result.baseline.status).toBe('incomplete');
    expect(result.baseline.facilityEnergyKwh).toBeNull();
  });

  it('requires a region, rejects market-based accounting', () => {
    const noRegion = resultFor((input) => {
      input.baseline.components[0].region = '';
    });
    expect(noRegion.baseline.operationalGrams).toBeNull();
    const input = example();
    (
      input.methodology.components[0] as unknown as { gridIntensityMethod: string }
    ).gridIntensityMethod = 'renewable-credit-offset';
    expect(assessSci(input).baseline.status).toBe('invalid');
  });

  it.each(['significant', 'unknown'] as const)(
    'blocks complete SCI for a %s boundary omission',
    (significance) => {
      const result = resultFor((input) => {
        input.methodology.boundary.exclusions = [
          {
            component: 'remote inference',
            reason: 'Unavailable',
            evidence: 'Supplier data requested',
            significance,
          },
        ];
      });
      expect(result.baseline.status).toBe('incomplete');
      expect(result.baseline.sciGramsPerUnit).toBeNull();
      expect(result.comparison.status).toBe('not-comparable');
    },
  );

  it('accepts a documented negligible exclusion but not an unassessed boundary', () => {
    const input = example();
    input.methodology.boundary.exclusions = [
      {
        component: 'fixture annotation',
        reason: 'No running component',
        evidence: 'Synthetic static metadata only',
        significance: 'negligible',
      },
    ];
    expect(assessSci(input).baseline.status).toBe('complete');
    input.methodology.boundary.assessed = false;
    expect(assessSci(input).baseline.status).toBe('incomplete');
  });

  it('does not sum a partial component set into a seemingly complete aggregate', () => {
    const result = resultFor((input) => {
      input.methodology.components.push({
        ...input.methodology.components[0],
        id: 'network',
        name: 'Network',
      });
      input.baseline.components.push({
        ...input.baseline.components[0],
        componentId: 'network',
        energyKwh: null,
        hardware: null,
      });
    });
    expect(result.baseline.facilityEnergyKwh).toBeNull();
    expect(result.baseline.operationalGrams).toBeNull();
    expect(result.baseline.embodiedGrams).toBeNull();
    expect(result.baseline.components[0].operationalGrams).toBe(40);
  });

  it('sums disjoint component scores using the common functional unit', () => {
    const result = resultFor((input) => {
      input.methodology.components.push({
        ...input.methodology.components[0],
        id: 'network',
        name: 'Network',
      });
      for (const observation of [input.baseline, input.after!]) {
        observation.components.push({
          ...structuredClone(observation.components[0]),
          componentId: 'network',
          hardware: [
            { ...structuredClone(observation.components[0].hardware![0]), id: 'network-device' },
          ],
        });
      }
    });
    expect(result.baseline.sciGramsPerUnit).toBeCloseTo(0.9);
  });

  it('rejects duplicate observations, boundary components and hardware within a component', () => {
    expect(
      resultFor((input) => {
        input.baseline.components.push(input.baseline.components[0]);
      }).baseline.status,
    ).toBe('invalid');
    expect(
      resultFor((input) => {
        input.methodology.components.push(input.methodology.components[0]);
      }).baseline.status,
    ).toBe('invalid');
    expect(
      resultFor((input) => {
        input.baseline.components[0].hardware!.push(input.baseline.components[0].hardware![0]);
      }).baseline.status,
    ).toBe('invalid');
  });

  it.each([
    ['expectedLifetimeHours', 0],
    ['reservedHours', 2],
    ['reservedResources', 9],
    ['totalResources', 0],
    ['totalEmbodiedGrams', -5],
  ] as const)('rejects invalid hardware %s=%s', (field, value) => {
    const result = resultFor((input) => {
      input.baseline.components[0].hardware![0][field] = q(value);
    });
    expect(result.baseline.status).toBe('invalid');
    expect(result.baseline.embodiedGrams).toBeNull();
  });

  it('requires a timezone and matching observation period for reservations', () => {
    const result = resultFor((input) => {
      input.baseline.period = { start: '2026-01-01T00:00:00', end: '2026-01-01T01:00:00' };
    });
    expect(result.baseline.status).toBe('invalid');
    expect(result.baseline.issues.some((e) => e.code === 'invalid-period')).toBe(true);
  });

  it.each([0, null])('does not divide by missing or zero successful task count (%s)', (value) => {
    const result = resultFor((input) => {
      input.baseline.successfulTasks = value;
    });
    expect(result.baseline.status).toBe('incomplete');
    expect(result.baseline.sciGramsPerUnit).toBeNull();
    expect(result.baseline.operationalGramsPerUnit).toBeNull();
  });

  it.each([-1, 0.5, Infinity, 101])('rejects impossible successful task count %s', (value) => {
    const result = resultFor((input) => {
      input.baseline.successfulTasks = value;
    });
    expect(result.baseline.status).toBe('invalid');
  });

  it('requires quality evidence and coverage of failed/idle work', () => {
    expect(
      resultFor((input) => {
        input.baseline.qualityPassed = false;
      }).baseline.sciGramsPerUnit,
    ).toBeNull();
    expect(
      resultFor((input) => {
        input.baseline.qualityEvidence = '';
      }).baseline.sciGramsPerUnit,
    ).toBeNull();
    expect(
      resultFor((input) => {
        input.baseline.energyCoverageConfirmed = false;
      }).baseline.sciGramsPerUnit,
    ).toBeNull();
  });

  it('preserves signed increases rather than clamping or calling them savings', () => {
    const result = resultFor((input) => {
      input.after!.components[0].energyKwh = q(0.2);
    });
    expect(result.comparison.reductionGramsPerUnit).toBeCloseTo(-0.4);
    expect(result.comparison.reductionPercent).toBeLessThan(0);
  });

  it('refuses comparisons using a different workload or task count', () => {
    expect(
      resultFor((input) => {
        input.after!.workloadId = 'different-workload';
      }).comparison.status,
    ).toBe('not-comparable');
    const unequal = resultFor((input) => {
      input.after!.attemptedTasks = 101;
    });
    expect(unequal.after!.status).toBe('complete');
    expect(unequal.comparison.status).toBe('not-comparable');
    expect(unequal.comparison.reductionGramsPerUnit).toBeNull();
  });

  it('refuses a mixed synthetic/real before-after methodology', () => {
    const result = resultFor((input) => {
      input.after!.components[0].energyKwh!.kind = 'measured';
    });
    expect(result.comparison.status).toBe('not-comparable');
    expect(result.comparison.synthetic).toBe(true);
  });

  it('does not require an after observation to calculate the baseline', () => {
    const result = resultFor((input) => {
      input.after = null;
    });
    expect(result.baseline.status).toBe('complete');
    expect(result.after).toBeNull();
    expect(result.comparison.status).toBe('not-comparable');
  });

  it.each([
    null,
    {},
    [],
    'untrusted JSON',
    { schemaVersion: 2 },
    { schemaVersion: 1, methodology: { components: [null] }, baseline: { components: [null] } },
  ])('fails closed without throwing for malformed input %j', (input) => {
    expect(() => assessSci(input)).not.toThrow();
    const result = assessSci(input);
    expect(result.baseline.status).not.toBe('complete');
    expect(result.baseline.sciGramsPerUnit).toBeNull();
    expect(result.comparison.reductionGramsPerUnit).toBeNull();
    expect(JSON.parse(JSON.stringify(result))).toEqual(result);
  });

  it('rejects numeric overflow without emitting Infinity or JSON-masked values', () => {
    const result = resultFor((input) => {
      input.baseline.components[0].energyKwh = q(Number.MAX_VALUE);
    });
    expect(result.baseline.status).toBe('invalid');
    expect(result.baseline.operationalGrams).toBeNull();
    expect(JSON.parse(JSON.stringify(result))).toEqual(result);
  });

  it('marks a synthetic workload synthetic even with no quantities or with measured live-model energy', () => {
    const result = resultFor((input) => {
      input.baseline.components = [];
      input.after!.components[0].energyKwh!.kind = 'measured';
    });
    expect(result.baseline.synthetic).toBe(true);
    expect(result.after!.synthetic).toBe(true);
  });

  it.each([
    { start: '', end: '' },
    { start: '2026-01-01T00:00:00Z', end: '2026-01-01T00:00:00Z' },
  ])('treats unavailable period precision as incomplete', (period) => {
    const result = resultFor((input) => {
      input.baseline.period = period;
    });
    expect(result.baseline.status).toBe('incomplete');
    expect(result.baseline.sciGramsPerUnit).toBeNull();
  });

  it.each([
    { start: '2026-02-30T00:00:00Z', end: '2026-02-30T01:00:00Z' },
    { start: '2026-01-01T24:00:00Z', end: '2026-01-02T01:00:00Z' },
    { start: '2026-01-01T01:00:00Z', end: '2026-01-01T00:00:00Z' },
    { start: '2026-01-01T00:00:00+14:30', end: '2026-01-01T01:00:00+14:30' },
  ])('rejects impossible dates or reversed periods %j', (period) => {
    expect(
      resultFor((input) => {
        input.baseline.period = period;
      }).baseline.status,
    ).toBe('invalid');
  });

  it('does not award a reduction from changing hardware lifetime assumptions', () => {
    const result = resultFor((input) => {
      input.after!.components[0].hardware![0].expectedLifetimeHours = q(80_000);
    });
    expect(result.after!.status).toBe('complete');
    expect(result.comparison.status).toBe('not-comparable');
    expect(result.comparison.issues.some((i) => i.code === 'changed-hardware-assumption')).toBe(
      true,
    );
  });

  it('checks hardware evidence kind per factor even if aggregate kind sets match', () => {
    const result = resultFor((input) => {
      input.baseline.components[0].energyKwh!.kind = 'modeled';
      input.after!.components[0].energyKwh!.kind = 'modeled';
      input.after!.components[0].hardware![0].totalEmbodiedGrams!.kind = 'modeled';
    });
    expect(result.baseline.evidenceKinds).toEqual(result.after!.evidenceKinds);
    expect(result.comparison.status).toBe('not-comparable');
  });

  it('rejects double allocation across components while accepting disjoint portions', () => {
    const input = example();
    input.methodology.components.push({
      ...input.methodology.components[0],
      id: 'network',
      name: 'Network',
    });
    input.baseline.components.push({
      ...structuredClone(input.baseline.components[0]),
      componentId: 'network',
    });
    // Each allocation is 4/8 cores for the same hour: together exactly one host.
    expect(assessSci(input).baseline.status).toBe('complete');
    input.baseline.components[1].hardware![0].reservedResources = q(5);
    const result = assessSci(input);
    expect(result.baseline.status).toBe('invalid');
    expect(result.baseline.issues.some((i) => i.code === 'overallocated-hardware')).toBe(true);
  });

  it('rejects inconsistent factors for the same shared physical device', () => {
    const result = resultFor((input) => {
      input.methodology.components.push({
        ...input.methodology.components[0],
        id: 'network',
        name: 'Network',
      });
      input.baseline.components.push({
        ...structuredClone(input.baseline.components[0]),
        componentId: 'network',
      });
      input.baseline.components[1].hardware![0].totalEmbodiedGrams = q(10);
    });
    expect(result.baseline.status).toBe('invalid');
    expect(result.baseline.issues.some((i) => i.code === 'inconsistent-hardware')).toBe(true);
  });

  it('does not silently emit an overflowing comparison percentage', () => {
    const result = resultFor((input) => {
      input.baseline.components[0].energyKwh = q(1e-308);
      input.baseline.components[0].hardware![0].totalEmbodiedGrams = q(0);
      input.after!.components[0].hardware![0].totalEmbodiedGrams = q(0);
      input.after!.components[0].energyKwh = q(1e100);
    });
    expect(result.comparison.status).toBe('not-comparable');
    expect(result.comparison.reductionGramsPerUnit).toBeNull();
    expect(result.comparison.issues.some((i) => i.code === 'numeric-overflow')).toBe(true);
  });

  it('compares allocation provenance for every component sharing one physical device', () => {
    const result = resultFor((input) => {
      input.methodology.components.push({
        ...input.methodology.components[0],
        id: 'network',
        name: 'Network',
      });
      for (const observation of [input.baseline, input.after!]) {
        observation.components[0].energyKwh!.kind = 'modeled';
        observation.components.push({
          ...structuredClone(observation.components[0]),
          componentId: 'network',
        });
      }
      input.after!.components[0].hardware![0].reservedHours!.kind = 'modeled';
    });
    expect(result.baseline.evidenceKinds).toEqual(result.after!.evidenceKinds);
    expect(result.after!.status).toBe('complete');
    expect(result.comparison.status).toBe('not-comparable');
  });
});
