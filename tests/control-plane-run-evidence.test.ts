import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  resourcesFor,
  verificationFor,
} from '../apps/CodeVitals-MCP/website/src/app/dashboard/control-plane/run-evidence';
import { ResourceSummary } from '../apps/CodeVitals-MCP/website/src/app/dashboard/control-plane/resource-summary';
import {
  buildRecordedData,
  buildSampleData,
  findingsFromRun,
} from '../apps/CodeVitals-MCP/website/src/app/dashboard/control-plane/data';
import type {
  LedgerEntry,
  SelectedRun,
} from '../apps/CodeVitals-MCP/website/src/app/dashboard/ledger-data';

vi.mock(
  '../apps/CodeVitals-MCP/website/src/app/dashboard/control-plane/resource-summary.module.css',
  () => ({ default: {} }),
);
const website = createRequire(resolve(__dirname, '../apps/CodeVitals-MCP/website/package.json'));
const { createElement } = website('react');
const { renderToStaticMarkup } = website('react-dom/server');
const at = '2026-10-05T10:00:00Z';
const detection: LedgerEntry = {
  seq: 0,
  runId: 'run',
  bugId: 'finding',
  timestamp: at,
  stage: 'detect',
  summary: 'Repeated calls',
  data: {
    agentId: 'ai-efficiency',
    category: 'uncached-completion',
    location: { filePath: '/private/workspace/usage.json', startLine: 2 },
    nativeMetric: { metric: 'tokens.avoided', perRun: 100, unit: 'tokens' },
  },
};
const entry = (
  stage: LedgerEntry['stage'],
  seq: number,
  data: LedgerEntry['data'],
): LedgerEntry => ({
  ...detection,
  stage,
  seq,
  data,
  summary: 'Internal reasoning must not appear',
});
function run(entries: LedgerEntry[] = [detection]): SelectedRun {
  return {
    runId: 'run',
    timestamp: at,
    kind: 'run',
    entries,
    outcome: {
      runId: 'run',
      startedAt: at,
      finishedAt: '2026-10-05T10:00:05Z',
      bugsDetected: 1,
      bugsImproved: 0,
      savings: { energyKwh: 0, carbonKgCo2e: 0 },
      selfCost: {
        tokens: 100,
        knownTokens: 100,
        usageComplete: true,
        llmCalls: 2,
        unknownLlmCalls: 0,
        toolCalls: 3,
        retries: 1,
        energyKwh: 0.01,
        carbonKgCo2e: 0.004,
      },
      net: { energyKwh: -0.01, carbonKgCo2e: -0.004, netPositive: false },
    },
  };
}
const metric = (selected: SelectedRun | null, label: string) =>
  resourcesFor(selected).metrics.find((item) => item.label === label)?.value;
const verify = (entries: LedgerEntry[]) => verificationFor(findingsFromRun(run(entries))[0]);

describe('GreenOps overhead visibility', () => {
  it('shows recorded requests, tokens, tools, retries and elapsed time separately', () => {
    expect(resourcesFor(run()).completeness).toBe('Usage complete');
    for (const [label, value] of [
      ['Reported tokens', '100'],
      ['Model requests', '2'],
      ['Tool calls', '3'],
      ['Retries', '1'],
      ['Run duration', '5 s'],
      ['Requests missing usage', '0'],
    ]) {
      expect(metric(run(), label)).toBe(value);
    }
  });
  it('preserves missing usage instead of claiming a complete total', () => {
    const selected = run();
    Object.assign(selected.outcome!.selfCost, {
      tokens: null,
      usageComplete: false,
      unknownLlmCalls: 1,
      energyKwh: null,
      carbonKgCo2e: null,
    });
    const usage = resourcesFor(selected);
    expect(usage.completeness).toBe('Some usage missing');
    expect(metric(selected, 'Reported tokens')).toBe('100');
    expect(usage.metrics[0].hint).toContain('subtotal');
    expect(metric(selected, 'Requests missing usage')).toBe('1');
  });
  it('keeps historical coverage unknown and true zero visible', () => {
    const legacy = run();
    legacy.outcome!.selfCost = {
      tokens: 0,
      toolCalls: 0,
      retries: 0,
      energyKwh: 0,
      carbonKgCo2e: 0,
    };
    expect(resourcesFor(legacy).completeness).toBe('Coverage not confirmed');
    expect(metric(legacy, 'Reported tokens')).toBe('0');
    expect(metric(legacy, 'Model requests')).toBe('Not recorded');
  });
  it('does not borrow another run outcome or fabricate missing duration', () => {
    const selected = run();
    selected.outcome!.runId = 'other';
    expect(metric(selected, 'Reported tokens')).toBe('Not recorded');
    expect(metric(selected, 'Run duration')).toBe('Not recorded');
    selected.outcome!.runId = 'run';
    selected.outcome!.finishedAt = '2026-10-04T10:00:00Z';
    expect(metric(selected, 'Run duration')).toBe('Not recorded');
  });
  it('does not prorate overhead when finding filters hide all results', () => {
    const selected = run();
    const data = buildRecordedData(selected, findingsFromRun(selected), 'Staging', '24h');
    expect(data.opportunities).toHaveLength(0);
    expect(data.resourceUsage?.metrics[0].value).toBe('100');
  });
  it('does not invent sample model consumption', () => {
    const html = renderToStaticMarkup(
      createElement(ResourceSummary, { data: buildSampleData('All', '30d') }),
    );
    expect(html).toContain('Resources used by GreenOps');
    expect(html).toContain('no analysis executed');
    expect(html).toContain('Not recorded');
    expect(html).toContain('<details>');
    expect(html).toContain('separate from workload savings');
  });
});

describe('before/after evidence boundaries', () => {
  it('does not verify a pending or approved plan', () => {
    expect(verify([detection]).status).toBe('Not verified');
    expect(verify([detection, entry('approve', 1, { approved: true })]).status).toBe(
      'Not verified',
    );
  });
  it('shows source and native baseline, never private parent paths', () => {
    const result = verify([detection]);
    expect(result.baseline[0].value).toBe('usage.json:2');
    expect(result.baseline[1].value).toContain('100 tokens');
    expect(JSON.stringify(result)).not.toContain('/private/workspace');
  });
  it('does not use a projected saving as a missing baseline', () => {
    const result = verify([
      { ...detection, data: { ...detection.data, nativeMetric: undefined } },
      entry('simulate', 1, { baseline: 900, savings: { energyKwh: 2 } }),
    ]);
    expect(result.baseline[1].value).toContain('Not recorded');
  });
  it('recognizes a subsequent check without inventing quality or metered carbon evidence', () => {
    const result = verify([
      detection,
      entry('approve', 1, { approved: true }),
      entry('improve', 2, { applied: true, mode: 'sandbox' }),
      entry('verify', 3, {
        confirmed: true,
        observedResourceReduction: 75,
        measurementBasis: 'observed-redetection+estimated-conversion',
      }),
    ]);
    expect(result.status).toBe('Change check passed');
    expect(result.result[1].value).toBe('75 tokens');
    expect(result.result[2].value).toContain('not metered savings');
    expect(result.quality).toContain('not recorded');
    expect(JSON.stringify(result)).not.toContain('Internal reasoning');
  });
  it('keeps failed, stale and unapplied checks unverified', () => {
    const applied = entry('improve', 2, { applied: true });
    expect(verify([detection, applied, entry('verify', 3, { confirmed: false })]).status).toBe(
      'Check failed',
    );
    expect(verify([detection, entry('verify', 1, { confirmed: true }), applied]).status).toBe(
      'Not verified',
    );
    expect(
      verify([
        detection,
        applied,
        entry('verify', 3, { confirmed: true }),
        entry('improve', 4, { applied: false }),
      ]).status,
    ).toBe('Not verified');
    expect(verify([detection, entry('verify', 1, { confirmed: true })]).status).toBe(
      'Not verified',
    );
  });
  it('orders checks by recorded sequence, not supplied array order', () => {
    expect(
      verify([
        entry('verify', 3, { confirmed: true }),
        detection,
        entry('improve', 2, { applied: true }),
      ]).status,
    ).toBe('Change check passed');
  });
});
