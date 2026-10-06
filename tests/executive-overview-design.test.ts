import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  ExecutiveOverview,
  overviewReviewQueue,
} from '../apps/CodeVitals-MCP/website/src/app/dashboard/control-plane/executive-overview';
import { buildSampleData } from '../apps/CodeVitals-MCP/website/src/app/dashboard/control-plane/data';
import { evidenceComparison } from '../apps/CodeVitals-MCP/website/src/app/dashboard/control-plane/evidence-comparison';
import type {
  ControlPlaneData,
  ControlTab,
  Opportunity,
} from '../apps/CodeVitals-MCP/website/src/app/dashboard/control-plane/types';

const websiteRequire = createRequire(
  resolve(__dirname, '../apps/CodeVitals-MCP/website/package.json'),
);
const { createElement } = websiteRequire('react');
const { renderToStaticMarkup } = websiteRequire('react-dom/server');
vi.mock('../apps/CodeVitals-MCP/website/node_modules/next/link', () => ({
  default: ({
    href,
    children,
    prefetch: _prefetch,
    ...props
  }: {
    href: string;
    children: unknown;
    prefetch?: boolean;
  }) => createElement('a', { href, ...props }, children),
}));
const data = () => buildSampleData('All', '30d');
const item = (id: string, patch: Partial<Opportunity> = {}): Opportunity => ({
  ...data().opportunities[0],
  id,
  status: 'pending',
  risk: 'Medium',
  ...patch,
});
function render(input: ControlPlaneData) {
  return renderToStaticMarkup(
    createElement(ExecutiveOverview, {
      data: input,
      href: (tab: ControlTab, patch: Record<string, string> = {}) =>
        '/dashboard?' + new URLSearchParams({ tab, run: 'selected-run', theme: 'olive', ...patch }),
      onNavigate: () => {},
    }),
  );
}

describe('decision-first executive overview', () => {
  it('compares only compatible recorded quantities without inferring missing values', () => {
    const finding = item('comparison', {
      evidence: [
        { label: 'Requested CPU cores', value: '2' },
        { label: 'Observed CPU cores', value: '0.2' },
      ],
    });
    expect(evidenceComparison(finding)?.values).toEqual([2, 0.2]);
    expect(evidenceComparison({ ...finding, evidence: finding.evidence.slice(0, 1) })).toBeNull();
    expect(
      evidenceComparison({
        ...finding,
        evidence: [finding.evidence[0], { label: 'Observed CPU cores', value: 'Not measured' }],
      }),
    ).toBeNull();
    expect(
      evidenceComparison({
        ...finding,
        evidence: [finding.evidence[0], { label: 'Observed CPU cores', value: '0' }],
      })?.values,
    ).toEqual([2, 0]);
  });
  it('renders the approved design hierarchy and seven workspaces', () => {
    const html = render(data());
    for (const label of [
      'Overview',
      'What needs your attention',
      'One problem. A complete journey.',
      'Seven specialist workspaces',
      'Resources used by GreenOps',
    ])
      expect(html).toContain(label);
    expect(html.indexOf('What needs your attention')).toBeLessThan(
      html.indexOf('Seven specialist workspaces'),
    );
    expect(html.indexOf('Seven specialist workspaces')).toBeLessThan(
      html.indexOf('Resources used by GreenOps'),
    );
    for (const agent of [
      'Carbon Efficiency',
      'Digital Waste',
      'AI Efficiency',
      'Architecture',
      'Disaster Recovery',
      'Collaboration',
      'Pipeline Efficiency',
    ])
      expect(html).toContain(agent);
    expect(html).not.toContain('Review progress');
    expect(html).not.toContain('Search overview agents');
  });
  it('prioritizes revisions and risk across agents without mutating the source', () => {
    const items = [
      item('approved', { status: 'approved' }),
      item('low', { agentKey: 'ai', risk: 'Low' }),
      item('unknown', { agentKey: 'carbon', risk: 'Unknown' }),
      item('high', { agentKey: 'waste', risk: 'High' }),
      item('revision', { agentKey: 'ai', status: 'revision-requested' }),
    ];
    expect(overviewReviewQueue(items).map((o) => o.id)).toEqual(['revision', 'high', 'unknown']);
    expect(items[0].id).toBe('approved');
  });
  it('fills available rows when all pending findings belong to one specialist', () => {
    expect(
      overviewReviewQueue([item('a'), item('b'), item('c'), item('d')]).map((o) => o.id),
    ).toEqual(['a', 'b', 'c']);
  });
  it('uses real pending and verified statuses, not static example counts', () => {
    const input = data();
    input.mode = 'recorded';
    input.opportunities = [
      item('pending'),
      item('revision', { status: 'revision-requested' }),
      item('approved', { status: 'approved' }),
      item('checked', { status: 'verified' }),
    ];
    const html = render(input);
    expect(html).toMatch(/Findings to review<\/h3><strong>2<\/strong>/);
    expect(html).toMatch(/Verified improvements<\/h3><strong>1<\/strong>/);
    expect(html).toContain('Recorded follow-up checks passed');
    expect(html).not.toContain('Verified cloud improvements');
  });
  it('does not count a human-approved plan as a verified result', () => {
    const input = data();
    input.mode = 'recorded';
    input.opportunities = [item('approved', { status: 'approved' })];
    const html = render(input);
    expect(html).toContain('No pending reviews in this selection');
    expect(html).toContain('No verified changes in this selection');
    expect(html).toMatch(/Verified improvements<\/h3><strong>0<\/strong>/);
  });
  it('keeps no-findings and zero-coverage states honest', () => {
    const input = data();
    input.mode = 'recorded';
    input.opportunities = [];
    input.agents = input.agents.map((a) => ({ ...a, rows: [] }));
    const html = render(input);
    expect(html).toContain('No findings in this selection');
    expect(html).toMatch(/Agent coverage<\/h3><strong>0<small> \/ 7<\/small>/);
  });
  it('deep-links to the exact recommendation while preserving selected context', () => {
    const input = data();
    input.opportunities = [item('finding with spaces', { agentKey: 'waste' })];
    const html = render(input);
    expect(html).toContain(
      'tab=waste&amp;run=selected-run&amp;theme=olive&amp;finding=finding+with+spaces',
    );
  });
  it('labels the sandbox separately and does not auto-start or approve it', () => {
    const html = render(data());
    expect(html).toContain('Separate synthetic sandbox');
    expect(html).toContain('Example request per replica · not a live result');
    expect(html).toContain('Start guided workflow');
    expect(html).toContain('Illustrative states · not real savings');
    expect(html).not.toContain('Auto-deploy');
  });
  it('renders a lifecycle guide, not fabricated completed run stages', () => {
    const html = render(data());
    expect(html).toContain('Decision lifecycle guide, not current run progress');
    expect(html).not.toContain('aria-current="step"');
    expect(html).toContain('Approval ≠ verified savings');
  });
  it('keeps full overhead evidence in a collapsed native disclosure', () => {
    const html = render(data());
    expect(html).toMatch(/<details[^>]*><summary><span>[\s\S]*Resources used by GreenOps/);
    expect(html).not.toMatch(/<details[^>]*\bopen/);
    expect(html).toContain('Requests missing usage');
    expect(html).toContain('no analysis executed');
  });
});
