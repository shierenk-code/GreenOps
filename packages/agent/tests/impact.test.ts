import { describe, expect, it } from 'vitest';
import type { SustainabilityBug } from '@greenops/detect';
import { simulateSustainabilityImpact } from '../src/impact.js';

describe('simulateSustainabilityImpact', () => {
  const regionBug: SustainabilityBug = {
    id: 'region',
    category: 'high-carbon-region',
    severity: 'medium',
    title: 'Region choice',
    location: { filePath: 'iac.json', startLine: 1, endLine: 1 },
    rationale: 'Same compute, cleaner electricity.',
    evidence: { instanceCores: 2, gridIntensityKgPerKwh: 0.6, targetGridIntensityKgPerKwh: 0.1 },
    estimatedWaste: {
      metric: 'carbon.region_shift',
      perRun: 48,
      unit: 'core-hours/day',
      assumptions: [],
    },
  };

  it('models region shifting as carbon-only using both grid factors and the disclosed horizon', () => {
    const result = simulateSustainabilityImpact(regionBug, 1);
    expect(result.energyKwh).toBe(0);
    expect(result.baseline).toBeCloseTo(2 * 24 * 30 * 0.015 * 1.4);
    expect(result.carbonKgCo2e).toBeCloseTo(result.baseline * (0.6 - 0.1));
  });

  it('never gives legacy carbon-equivalent CPU findings energy savings', () => {
    const result = simulateSustainabilityImpact(
      { ...regionBug, estimatedWaste: { ...regionBug.estimatedWaste, metric: 'cpu.core_hours' } },
      0.5,
    );
    expect(result.energyKwh).toBe(0);
    expect(result.carbonKgCo2e).toBeCloseTo(7.56);
  });

  it('credits no savings when the destination is missing or dirtier', () => {
    expect(
      simulateSustainabilityImpact(
        { ...regionBug, evidence: { instanceCores: 2, gridIntensityKgPerKwh: 0.6 } },
        1,
      ).carbonKgCo2e,
    ).toBe(0);
    expect(
      simulateSustainabilityImpact(
        { ...regionBug, evidence: { ...regionBug.evidence, targetGridIntensityKgPerKwh: 0.8 } },
        1,
      ).carbonKgCo2e,
    ).toBe(0);
  });

  it.each([-1, 1.1, NaN, Infinity])('rejects invalid reduction factor %s', (factor) => {
    expect(() => simulateSustainabilityImpact(regionBug, factor)).toThrow('Reduction factor');
  });

  it('does not convert unused token headroom into energy or carbon savings', () => {
    const bug: SustainabilityBug = {
      id: 'headroom',
      category: 'oversized-token-request',
      severity: 'low',
      title: 'Oversized output allowance',
      location: { filePath: 'trace.json', startLine: 1, endLine: 1 },
      rationale: 'The configured output limit is larger than observed completions.',
      evidence: { maxTokens: 1000, completionTokens: 100, wastedHeadroom: 900 },
      estimatedWaste: {
        metric: 'tokens.headroom',
        perRun: 900,
        unit: 'unused output tokens',
        assumptions: [],
      },
    };

    const savings = simulateSustainabilityImpact(bug, 1);

    expect(savings).toMatchObject({ energyKwh: 0, carbonKgCo2e: 0 });
    expect(savings.resources['tokens.headroom']).toBeGreaterThan(0);
  });
});
