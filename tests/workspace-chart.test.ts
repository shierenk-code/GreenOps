import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { Chart } from '../apps/CodeVitals-MCP/website/src/app/dashboard/control-plane/ui';
import type { ChartData } from '../apps/CodeVitals-MCP/website/src/app/dashboard/control-plane/types';
const requireWebsite = createRequire(
  resolve(__dirname, '../apps/CodeVitals-MCP/website/package.json'),
);
const { createElement } = requireWebsite('react');
const { renderToStaticMarkup } = requireWebsite('react-dom/server');
const data: ChartData = {
  title: 'Carbon comparison',
  description: 'Test observation',
  primaryLabel: 'Current',
  primaryUnit: 'g CO₂e/kWh',
  secondaryLabel: 'Candidate',
  secondaryUnit: 'g CO₂e/kWh',
  points: [{ label: 'Region', primary: 480, secondary: 45 }],
};
const render = (input: ChartData, kind: 'bar' | 'area' = 'bar') =>
  renderToStaticMarkup(createElement(Chart, { data: input, kind }));
describe('workspace chart comparisons', () => {
  it('uses proportional heights for same-unit current and candidate values', () => {
    const html = render(data);
    const primary = html.match(/<rect[^>]*height="([\d.]+)"[^>]*fill="var\(--cp-chart-primary\)"/);
    const secondary = html.match(
      /<rect[^>]*height="([\d.]+)"[^>]*fill="var\(--cp-chart-secondary\)"/,
    );
    expect(primary).not.toBeNull();
    expect(secondary).not.toBeNull();
    expect(Number(primary![1]) / Number(secondary![1])).toBeCloseTo(480 / 45);
  });
  it('does not draw a secondary bar for a missing observation', () => {
    const html = render({ ...data, points: [{ label: 'Unknown', primary: 480 }] });
    expect(html).not.toMatch(/<rect[^>]*fill="var\(--cp-chart-secondary\)"/);
    expect(html).toContain('Not recorded');
  });
  it('breaks lines across missing secondary observations rather than substituting zero', () => {
    const html = render(
      {
        ...data,
        points: [
          { label: 'A', primary: 5, secondary: 2 },
          { label: 'B', primary: 6 },
          { label: 'C', primary: 7, secondary: 3 },
        ],
      },
      'area',
    );
    const path = html.match(/<path d="([^"]*)" fill="none" stroke="var\(--cp-chart-secondary\)"/);
    expect(path).not.toBeNull();
    expect(path![1].match(/M/g)).toHaveLength(2);
    expect(path![1]).not.toContain('L');
  });
  it('provides focusable points, a point picker, and exact-value table', () => {
    const html = render(data);
    expect(html).toContain('aria-label="Carbon comparison data point"');
    expect(html).toContain('tabindex="0" role="button"');
    expect(html).toContain('Carbon comparison — exact values');
  });
});
