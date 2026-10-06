import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { assessSci, createSyntheticSciExample } from '../packages/measure/src/sci.js';
import MeasurementClient, {
  AssessmentSummary,
} from '../apps/CodeVitals-MCP/website/src/app/dashboard/measurement/measurement-client.js';
import {
  assessmentFromWorksheet,
  createEmptyWorksheet,
  createWorksheetReport,
  emptyHardware,
  worksheetFromAssessment,
} from '../apps/CodeVitals-MCP/website/src/app/dashboard/measurement/worksheet.js';

vi.mock('../apps/CodeVitals-MCP/website/node_modules/next/link', () => ({
  default: ({ href, children, ...props }: { href: string; children: unknown }) =>
    createElement('a', { href, ...props }, children),
}));
vi.mock(
  '../apps/CodeVitals-MCP/website/src/app/dashboard/ai-efficiency-demo/demo.module.css',
  () => ({ default: {} }),
);
vi.mock(
  '../apps/CodeVitals-MCP/website/src/app/dashboard/measurement/measurement.module.css',
  () => ({ default: {} }),
);

const websiteRequire = createRequire(
  resolve(__dirname, '../apps/CodeVitals-MCP/website/package.json'),
);
const { createElement } = websiteRequire('react');
const { renderToStaticMarkup } = websiteRequire('react-dom/server');

describe('SCI assessment worksheet', () => {
  it('starts without any invented baseline, quantities, task counts, hardware or quality evidence', () => {
    const draft = createEmptyWorksheet();
    const input = assessmentFromWorksheet(draft);
    expect(input.baseline.components[0].energyKwh).toBeNull();
    expect(input.baseline.components[0].hardware).toBeNull();
    expect(input.baseline.successfulTasks).toBeNull();
    expect(input.baseline.qualityPassed).toBeNull();
    expect(input.methodology.boundary.assessed).toBe(false);
    const report = createWorksheetReport(draft, false);
    expect(report.assessment.baseline.sciGramsPerUnit).toBeNull();
    expect(report.assessment.comparison.reductionGramsPerUnit).toBeNull();
    expect(report.assessment.comparison.status).toBe('not-comparable');
  });

  it('keeps an empty numeric value unknown, not zero, and retains partially typed source evidence', () => {
    const draft = createEmptyWorksheet();
    draft.baseline.components[0].energyKwh.source = 'Public meter export';
    const report = createWorksheetReport(draft, false);
    expect(report.inputs.baseline.components[0].energyKwh).toBeNull();
    expect(report.worksheetDraft.baseline.components[0].energyKwh.source).toBe(
      'Public meter export',
    );
  });

  it('round-trips the sourced synthetic example and prominently labels its export', () => {
    const input = createSyntheticSciExample();
    const draft = worksheetFromAssessment(input);
    expect(assessmentFromWorksheet(draft)).toEqual(input);
    const report = createWorksheetReport(draft, true);
    expect(report.syntheticExample).toBe(true);
    expect(report.assessment.comparison.synthetic).toBe(true);
    expect(report.assessment.baseline.sciGramsPerUnit).toBeCloseTo(0.45);
    expect(report.assessment.after?.sciGramsPerUnit).toBeCloseTo(0.29);
    expect(report.assessment.comparison.reductionGramsPerUnit).toBeCloseTo(0.16);
  });

  it('recalculates after edits instead of exporting a stale positive result', () => {
    const draft = worksheetFromAssessment(createSyntheticSciExample());
    const initial = createWorksheetReport(draft, true);
    draft.after.components[0].energyKwh.value = '0.2';
    const changed = createWorksheetReport(draft, true);
    expect(initial.assessment.comparison.reductionGramsPerUnit).toBeCloseTo(0.16);
    expect(changed.assessment.comparison.reductionGramsPerUnit).toBeLessThan(0);
    expect(changed.inputs.after?.components[0].energyKwh?.value).toBe(0.2);
  });

  it('labels user-entered synthetic evidence even when it did not come from the preset button', () => {
    const draft = worksheetFromAssessment(createSyntheticSciExample());
    const report = createWorksheetReport(draft, false);
    expect(report.loadedSyntheticPreset).toBe(false);
    expect(report.syntheticExample).toBe(true);
    expect(report.assessment.comparison.synthetic).toBe(true);
  });

  it('withdraws a full score as soon as hardware evidence is removed', () => {
    const draft = worksheetFromAssessment(createSyntheticSciExample());
    draft.after.components[0].hardware = [];
    const report = createWorksheetReport(draft, true);
    expect(report.assessment.after?.sciGramsPerUnit).toBeNull();
    expect(report.assessment.comparison.status).toBe('not-comparable');
    expect(report.assessment.after?.operationalGramsPerUnit).toBeCloseTo(0.24);
  });

  it('does not score a new blank hardware allocation', () => {
    const draft = worksheetFromAssessment(createSyntheticSciExample());
    draft.after.components[0].hardware.push(emptyHardware('new-host'));
    expect(createWorksheetReport(draft, true).assessment.after?.sciGramsPerUnit).toBeNull();
  });

  it('requires PUE for IT energy and removes the multiplier for facility-inclusive energy', () => {
    const draft = worksheetFromAssessment(createSyntheticSciExample());
    draft.methodology.components[0].energyBasis = 'it';
    expect(createWorksheetReport(draft, true).assessment.baseline.sciGramsPerUnit).toBeNull();
    draft.baseline.components[0].pue = {
      value: '1.2',
      kind: 'synthetic',
      source: 'Teaching assumption',
    };
    draft.after.components[0].pue = {
      value: '1.2',
      kind: 'synthetic',
      source: 'Teaching assumption',
    };
    expect(createWorksheetReport(draft, true).assessment.baseline.sciGramsPerUnit).toBeCloseTo(
      0.53,
    );
    draft.methodology.components[0].energyBasis = 'facility';
    expect(assessmentFromWorksheet(draft).baseline.components[0].pue).toBeNull();
    expect(createWorksheetReport(draft, true).assessment.baseline.sciGramsPerUnit).toBeCloseTo(
      0.45,
    );
  });

  it('rejects a quality failure and changed workload without preserving a comparison', () => {
    const draft = worksheetFromAssessment(createSyntheticSciExample());
    draft.after.qualityPassed = false;
    draft.after.workloadId = 'different-inputs';
    const report = createWorksheetReport(draft, true);
    expect(report.assessment.comparison.reductionPercent).toBeNull();
    expect(
      report.assessment.after?.issues.some((issue) => issue.code === 'workload-mismatch'),
    ).toBe(true);
  });

  it('does not mutate form state while trimming empty assumption lines for assessment', () => {
    const draft = worksheetFromAssessment(createSyntheticSciExample());
    draft.methodology.assumptions.push('', '   ');
    const before = JSON.stringify(draft);
    const report = createWorksheetReport(draft, true);
    expect(JSON.stringify(draft)).toBe(before);
    expect(report.assessment.comparison.status).toBe('comparable');
    expect(report.inputs.methodology.assumptions.every((value) => value.trim())).toBe(true);
  });
});

describe('SCI worksheet presentation', () => {
  it('embeds the worksheet in the new dashboard without its old sidebar or a nested main landmark', () => {
    const html = renderToStaticMarkup(createElement(MeasurementClient, { embedded: true }));
    expect(html).toContain('data-embedded="true"');
    expect(html).toContain('aria-label="Software carbon intensity assessment"');
    expect(html).toContain('Compare software carbon intensity');
    expect(html).toContain('does not make model requests or change your fleet ledger');
    expect(html).toContain('Export assessment');
    expect(html).not.toContain('<aside');
    expect(html).not.toContain('<main');
    expect(html).not.toContain('aria-label="Workspace navigation"');
  });

  it('renders the default incomplete worksheet with evidence guidance and working destination links', () => {
    const html = renderToStaticMarkup(createElement(MeasurementClient));
    expect(html).toContain('No defensible before-and-after SCI comparison yet');
    expect(html).toContain('Load synthetic example');
    expect(html).toContain('Reset worksheet');
    expect(html).toContain('Export assessment');
    expect(html).toContain('not saved automatically');
    expect(html).toContain('No API calls, model requests');
    expect(html).toContain('href="/dashboard/reports"');
    expect(html).toContain('href="/dashboard/ai-efficiency-demo"');
    expect(html).toContain('local cache, agent work');
    expect(html).toContain('Quality checks');
    expect(html).toContain('Hardware footprint and allocation');
    expect(html).not.toContain('Illustrative comparison available');
  });

  it('never presents synthetic arithmetic as actual project impact or certification', () => {
    const html = renderToStaticMarkup(
      createElement(MeasurementClient, {
        initialAssessment: createSyntheticSciExample(),
        initialExample: true,
      }),
    );
    expect(html).toContain('Synthetic example loaded');
    expect(html).toContain('separate from your real results');
    expect(html).toContain('Illustrative comparison available');
    expect(html).toContain('not a real-world result');
    expect(html).toContain('not certification');
    expect(html).toContain('0.45');
    expect(html).toContain('0.29');
    expect(html).not.toContain('Verified savings');
  });

  it('shows carbon increases honestly and does not convert missing score data to zero', () => {
    const input = createSyntheticSciExample();
    input.after!.components[0].energyKwh!.value = 0.2;
    const html = renderToStaticMarkup(
      createElement(AssessmentSummary, {
        assessment: assessSci(input),
        functionalUnit: input.methodology.functionalUnit,
        example: true,
      }),
    );
    expect(html).toContain('% increase');
    expect(html).not.toContain('% reduction');
    input.after!.components[0].hardware = null;
    const incompleteHtml = renderToStaticMarkup(
      createElement(AssessmentSummary, {
        assessment: assessSci(input),
        functionalUnit: input.methodology.functionalUnit,
        example: true,
      }),
    );
    expect(incompleteHtml).toContain('Full calculation unavailable');
    expect(incompleteHtml).toContain('Not comparable');
    expect(incompleteHtml).toContain('Operational-only intensity (not full SCI)');
  });
});
