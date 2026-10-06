import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { OverviewImpactSummary } from '../apps/CodeVitals-MCP/website/src/app/dashboard/overview-impact-summary';
import type {
  RunOutcome,
  SelectedRun,
} from '../apps/CodeVitals-MCP/website/src/app/dashboard/ledger-data';

vi.mock('../apps/CodeVitals-MCP/website/node_modules/next/link', () => ({
  default: ({ href, children, ...props }: { href: string; children: unknown }) =>
    createElement('a', { href, ...props }, children),
}));
vi.mock(
  '../apps/CodeVitals-MCP/website/src/app/dashboard/overview-impact-summary.module.css',
  () => ({ default: {} }),
);
const websiteRequire = createRequire(
  resolve(__dirname, '../apps/CodeVitals-MCP/website/package.json'),
);
const { createElement } = websiteRequire('react');
const { renderToStaticMarkup } = websiteRequire('react-dom/server');
const outcome = (partial = false): RunOutcome => ({
  runId: 'selected',
  startedAt: '',
  finishedAt: '',
  bugsDetected: 0,
  bugsImproved: 0,
  savings: { energyKwh: 3000, carbonKgCo2e: 9000 },
  selfCost: {
    tokens: partial ? null : 50,
    knownTokens: 50,
    usageComplete: !partial,
    llmCalls: 2,
    unknownLlmCalls: partial ? 1 : 0,
    toolCalls: 3,
    retries: 0,
    energyKwh: partial ? null : 0.00000001,
    carbonKgCo2e: partial ? null : 0.000000004,
  },
  net: partial
    ? { energyKwh: null, carbonKgCo2e: null, netPositive: null }
    : { energyKwh: 2999, carbonKgCo2e: 8999, netPositive: true },
});
const run = (record?: RunOutcome): SelectedRun => ({
  runId: 'selected',
  entries: [],
  timestamp: '',
  kind: record ? 'run' : 'in-progress',
  outcome: record,
});
const render = (selected: SelectedRun | null, pendingReviews?: number) =>
  renderToStaticMarkup(
    createElement(OverviewImpactSummary, { run: selected, findings: [], pendingReviews }),
  );

describe('impact summary presentation', () => {
  it('shows measured evidence gaps without promising carbon savings or a fabricated ratio', () => {
    const html = render(run(outcome()));
    expect(html).toContain('From findings to verified impact');
    expect(html).toContain('Net carbon benefit');
    expect(html).toContain('Not established');
    expect(html).not.toContain('8999');
    expect(html).not.toContain('9,000');
    expect(html).toContain('not metered');
    expect(html).toContain('not a complete measured footprint');
    expect(html).toContain('<details');
    expect(html).toContain('Measurement basis and gaps');
  });

  it('keeps partial usage distinct and hides incomplete energy conversions', () => {
    const html = render(run(outcome(true)));
    expect(html).toContain('50 reported');
    expect(html).toContain('Partial usage');
    expect(html).toContain('subtotal');
    expect(html).not.toContain('Recorded estimates');
    expect(html).toContain('GreenOps usage, separate from');
  });

  it('does not render false zero pending approvals while the inbox is unavailable', () => {
    const loading = render(run());
    expect(loading).toContain('Open approval inbox');
    expect(loading).toContain('Unavailable');
    expect(loading).not.toContain('No pending local reviews');
    expect(render(run(), 0)).toContain('No pending local reviews');
    expect(render(run(), 3)).toContain('3 pending local reviews');
  });

  it('shows four evidence-backed executive metrics instead of sample financial claims', () => {
    const html = render(run(outcome()), 3);
    expect(html.match(/<article[\s>]/g)).toHaveLength(4);
    for (const label of [
      'Pending reviews',
      'Verified changes',
      'Agent analysis tokens',
      'Net carbon benefit',
    ]) {
      expect(html).toContain(`<h3>${label}</h3>`);
    }
    expect(html).toContain('Review recommendations');
    expect(html).not.toMatch(/Dollars Saved|Trees Planted|Car Miles|Net Agent ROI|Updated Live/);
  });

  it('preserves an explicit complete zero token count but never infers zero from missing usage', () => {
    const o = outcome();
    Object.assign(o.selfCost, {
      tokens: 0,
      knownTokens: 0,
      llmCalls: 0,
      energyKwh: 0,
      carbonKgCo2e: 0,
    });
    expect(render(run(o))).toContain('Complete recorded usage');
    const missing = render(null);
    expect(missing).toContain('No usage record');
    expect(missing).not.toContain('Complete recorded usage');
  });

  it('keeps run context on all in-dashboard links except the independent demo', () => {
    const html = render(run(outcome()), 2);
    const links = [...html.matchAll(/href="([^"]+)"/g)].map((match) => match[1]);
    expect(links).toContain('/dashboard/ai-efficiency-demo');
    for (const href of links.filter((link) => link !== '/dashboard/ai-efficiency-demo'))
      expect(href).toContain('run=selected');
    expect(links).toContain('/dashboard/approvals?run=selected');
    expect(links).toContain('/dashboard/measurement?run=selected');
  });

  it('does not round a small positive recorded estimate to zero', () => {
    const html = render(run(outcome()));
    expect(html).toContain('1.00e-8');
    expect(html).toContain('4.00e-9');
  });
});
