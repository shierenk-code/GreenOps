import { describe, expect, it } from 'vitest';
import { assessDemoCarbon } from '../apps/CodeVitals-MCP/website/src/app/dashboard/ai-efficiency-demo/demo-sci';
import {
  analyzeDemo,
  applyDemo,
  createDemoRun,
  createFixtureProvider,
  decideDemo,
  verifyDemo,
} from '../apps/CodeVitals-MCP/website/src/app/dashboard/ai-efficiency-demo/demo-engine';

describe('SCI evidence from the real demo workflow', () => {
  it('does not fabricate functional output or energy for a run that never started', () => {
    const assessment = assessDemoCarbon(createDemoRun('fixture', 'fixture-v1'));
    expect(assessment.input.baseline.successfulTasks).toBeNull();
    expect(assessment.input.after).toBeNull();
    expect(assessment.result.baseline.sciGramsPerUnit).toBeNull();
    expect(assessment.result.baseline.operationalGramsPerUnit).toBeNull();
    expect(assessment.result.comparison.reductionPercent).toBeNull();
  });

  it('exports successful quality-checked tasks while keeping infrastructure gaps explicit', async () => {
    const provider = createFixtureProvider();
    const baseline = await analyzeDemo(createDemoRun('fixture', provider.model), provider);
    const approved = decideDemo(baseline, {
      approved: true,
      actor: 'Automated test',
      note: 'Test only',
      acknowledged: true,
    });
    const run = await verifyDemo(applyDemo(approved), provider);
    const evidence = run.carbonAssessment!;
    expect(evidence.input.baseline.successfulTasks).toBe(8);
    expect(evidence.input.after?.successfulTasks).toBe(8);
    expect(evidence.input.after?.attemptedTasks).toBe(8);
    expect(evidence.input.after?.qualityPassed).toBe(true);
    expect(evidence.input.baseline.workloadId).toBe(evidence.input.after?.workloadId);
    expect(evidence.input.methodology.boundary.assessed).toBe(false);
    expect(evidence.input.baseline.components[0]).toMatchObject({
      energyKwh: null,
      carbonIntensityGramsPerKwh: null,
      hardware: null,
    });
    expect(evidence.result.baseline.sciGramsPerUnit).toBeNull();
    expect(evidence.result.baseline.status).toBe('incomplete');
    expect(evidence.result.baseline.synthetic).toBe(true);
    expect(evidence.result.after?.synthetic).toBe(true);
    expect(evidence.result.after?.sciGramsPerUnit).toBeNull();
    expect(evidence.result.comparison.status).toBe('not-comparable');
    expect(evidence.input.methodology.assumptions.join(' ')).toContain('synthetic');
    expect(JSON.parse(JSON.stringify(run)).carbonAssessment).toEqual(evidence);
  });

  it('never upgrades a historical illustrative estimate into SCI evidence', () => {
    const run = createDemoRun('gemini', 'historical-model');
    run.baseline = {
      requests: 8,
      modelCalls: 8,
      cacheHits: 0,
      tokens: 1000,
      missingUsage: 0,
      durationMs: 50,
      qualityPassed: false,
      results: [],
    };
    const evidence = assessDemoCarbon(run);
    expect(evidence.input.baseline.successfulTasks).toBe(0);
    expect(evidence.input.baseline.qualityPassed).toBe(false);
    expect(evidence.result.baseline.facilityEnergyKwh).toBeNull();
    expect(evidence.result.baseline.sciGramsPerUnit).toBeNull();
  });
});
