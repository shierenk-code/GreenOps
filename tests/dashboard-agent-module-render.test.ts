import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import AgentModuleView, {
  filterAgentModuleRows,
  nextModuleTab,
  type AgentModuleViewProps,
} from '../apps/CodeVitals-MCP/website/src/app/dashboard/agent-module-view';
import { buildAgentModule } from '../apps/CodeVitals-MCP/website/src/app/dashboard/agent-module-data';
import type { Finding } from '../apps/CodeVitals-MCP/website/src/app/dashboard/ledger-dashboard';
import type {
  LedgerEntry,
  SelectedRun,
} from '../apps/CodeVitals-MCP/website/src/app/dashboard/ledger-data';

vi.mock('../apps/CodeVitals-MCP/website/node_modules/next/link', () => ({
  default: ({ href, children, ...props }: { href: string; children: unknown }) =>
    createElement('a', { href, ...props }, children),
}));
vi.mock('../apps/CodeVitals-MCP/website/src/app/dashboard/agent-module.module.css', () => ({
  default: {},
}));
vi.mock('../apps/CodeVitals-MCP/website/src/app/dashboard/agent-action-workbench', () => ({
  default: ({ agentId, run }: { agentId: string; run: SelectedRun | null }) =>
    createElement(
      'div',
      { 'data-agent': agentId, 'data-run': run?.runId },
      'Local action workbench',
    ),
}));
const websiteRequire = createRequire(
  resolve(__dirname, '../apps/CodeVitals-MCP/website/package.json'),
);
const { createElement } = websiteRequire('react');
const { renderToStaticMarkup } = websiteRequire('react-dom/server');

const finding = (
  id: string,
  agentId = 'ai-efficiency',
  category = 'oversized-token-request',
  evidence: Record<string, unknown> = {},
): Finding => ({
  bugId: id,
  agentId,
  agentName: agentId,
  category,
  severity: 'medium',
  title: `Finding ${id}`,
  state: 'withheld',
  impactEnergyKwh: 98765,
  impactCarbonKg: 98765,
  confidence: 'high',
  effort: 'small',
  recommendationId: 'stale',
  recommendationTitle: 'STALE_TITLE',
  recommendation: 'STALE_RECOMMENDATION',
  expectedReductionFactor: 0.9,
  reversible: true,
  entries: [
    {
      runId: 'selected-run',
      bugId: id,
      seq: 1,
      stage: 'detect',
      timestamp: '2026-10-03T08:00:00Z',
      summary: `Finding ${id}`,
      data: { agentId, category, severity: 'medium', evidence },
    },
  ],
});
function add(f: Finding, stage: LedgerEntry['stage'], data: Record<string, unknown>) {
  f.entries.push({
    runId: 'selected-run',
    bugId: f.bugId,
    seq: f.entries.length + 1,
    stage,
    data,
    timestamp: '2026-10-03T08:01:00Z',
    summary: 'PRIVATE_ACTIVITY_REASONING',
  });
  return f;
}
const runFor = (findings: Finding[]): SelectedRun => ({
  runId: 'selected-run',
  entries: findings.flatMap((f) => f.entries),
  timestamp: '2026-10-03T08:01:00Z',
  kind: 'run',
});
const render = (findings: Finding[], props: Partial<AgentModuleViewProps> = {}) =>
  renderToStaticMarkup(
    createElement(AgentModuleView, {
      agentId: 'ai-efficiency',
      findings,
      run: runFor(findings),
      ...props,
    }),
  );

function recommended(id = 'cache') {
  const f = finding(id, 'ai-efficiency', 'uncached-completion', { wastedTokens: 400 });
  f.entries[0].data.confidence = 'high';
  add(f, 'investigate', {
    analysis: {
      provider: 'gemini',
      status: 'generated',
      model: 'RECOMMENDATION_ENGINE_ONLY',
      tokensUsed: 949,
    },
  });
  add(f, 'compare', {
    recommended: 'cache',
    strategies: [
      {
        id: 'cache',
        title: 'Cache public responses',
        description: 'Use a scoped response cache with explicit expiry.',
        effort: 'small',
        reversible: true,
      },
    ],
  });
  add(f, 'approve', {
    approved: true,
    approver: 'policy-approver',
    reason: 'PRIVATE_APPROVAL_REASONING',
  });
  return f;
}

describe('specialist module presentation', () => {
  it.each([
    ['ai-efficiency', 'Token &amp; request inspection'],
    ['digital-waste', 'Unused asset inventory'],
    ['carbon-incident', 'Energy spike analysis'],
    ['architecture', 'IaC resource audit'],
    ['disaster-recovery', 'Recovery configuration'],
    ['collaboration', 'Recording lifecycle inventory'],
  ])('renders a distinct %s analysis workspace and honest empty inventory', (agentId, title) => {
    const html = render([], { agentId });
    expect(html).toContain(title);
    expect(html).toContain('No recorded findings');
    expect(html).toContain('No findings recorded for this agent');
    expect(html).toContain('Not recorded');
    expect(html).toContain('role="tablist"');
    expect(html).toContain('role="tabpanel"');
    expect(html).toContain('aria-selected="true"');
    expect(html).toContain('Module capabilities and next integrations');
    expect(html).not.toMatch(/100% healthy|Live monitoring|Connected and running/);
  });

  it('shows allowance separately from consumed tokens and does not invent workload usage', () => {
    const f = finding('headroom', 'ai-efficiency', 'oversized-token-request', {
      wastedHeadroom: 9102,
    });
    add(f, 'investigate', {
      analysis: {
        provider: 'gemini',
        status: 'generated',
        model: 'RECOMMENDATION_ENGINE_ONLY',
        tokensUsed: 949,
      },
    });
    const html = render([f]);
    expect(html).toContain('9,102');
    expect(html).toContain('tokens of allowance');
    expect(html).toContain('Not consumed or saved tokens');
    expect(html).toContain('Workload model');
    expect(html).toContain('Recorded input / output');
    expect(html).not.toContain('RECOMMENDATION_ENGINE_ONLY');
    expect(html).not.toContain('98765');
    expect(html).not.toContain('98,765');
    expect(html).not.toContain('STALE_RECOMMENDATION');
  });

  it('displays explicit workload model and token observations without using the analysis model', () => {
    const f = finding('request', 'ai-efficiency', 'oversized-token-request', {
      model: 'workload-small',
      promptTokens: 120,
      completionTokens: 15,
    });
    const html = render([f]);
    expect(html).toContain('workload-small');
    expect(html).toContain('Input: 120 tokens');
    expect(html).toContain('Output: 15 tokens');
    expect(html).toContain('Recorded findings only');
  });

  it('keeps recommendations distinct from detection and does not promote an unselected option', () => {
    const f = finding('unselected');
    add(f, 'compare', { strategies: [{ id: 'option', title: 'UNSELECTED_OPTION' }] });
    const html = render([f], { initialTab: 'recommendations' });
    expect(html).toContain('No recommendation recorded yet');
    expect(html).not.toContain('UNSELECTED_OPTION');
    expect(html).not.toContain('STALE_TITLE');
  });

  it('presents sourced recommendations with risk, confidence, effort and a real review link', () => {
    const html = render([recommended()], { initialTab: 'recommendations' });
    expect(html).toContain('Cache public responses');
    expect(html).toContain('Use a scoped response cache with explicit expiry.');
    expect(html).toContain('AI-assisted');
    expect(html).toContain('Finding confidence:');
    expect(html).toContain('High');
    expect(html).toContain('Small');
    expect(html).toContain('Reversible:');
    expect(html).toContain('Implementation consideration:');
    expect(html).toContain('Automatic policy: allowed the change');
    expect(html).toContain('Review evidence and decision');
    expect(html).toContain(
      '/dashboard/review?agent=ai-efficiency&amp;finding=cache&amp;run=selected-run',
    );
    expect(html).not.toContain('Human approved');
    expect(html).not.toContain('PRIVATE_APPROVAL_REASONING');
  });

  it('shows only applied-and-confirmed findings as verified', () => {
    const unconfirmed = finding('confirmation-only');
    add(unconfirmed, 'verify', { confirmed: true });
    const applied = finding('actually-verified');
    add(applied, 'improve', { applied: true });
    add(applied, 'verify', { confirmed: true });
    const html = render([unconfirmed, applied]);
    expect(html).toContain('Review needed');
    expect(html).toContain('>Verified</span>');
    expect(html).toContain('1 verified');
  });

  it('uses safe activity summaries, not raw ledger reasoning or request payloads', () => {
    const f = recommended();
    const html = render([f], { initialTab: 'activity' });
    expect(html).toContain('Recorded work summary');
    expect(html).toContain('Finding cache');
    expect(html).toContain('/dashboard/trace?agent=ai-efficiency&amp;run=selected-run');
    expect(html).toContain('UTC');
    expect(html).not.toContain('PRIVATE_ACTIVITY_REASONING');
    expect(html).not.toContain('PRIVATE_APPROVAL_REASONING');
    expect(html).not.toContain('RECOMMENDATION_ENGINE_ONLY');
  });

  it('mounts the local workbench only for its tab and scopes it to the selected module/run', () => {
    const f = finding('disk', 'digital-waste', 'unattached-storage', { gb: 20 });
    expect(render([f], { agentId: 'digital-waste' })).not.toContain('Local action workbench');
    const html = render([f], { agentId: 'digital-waste', initialTab: 'actions' });
    expect(html).toContain('Local action workbench');
    expect(html).toContain('data-agent="digital-waste"');
    expect(html).toContain('data-run="selected-run"');
  });

  it('keeps all fleet navigation run-bound and the independent cache demo unbound', () => {
    for (const initialTab of ['analysis', 'recommendations', 'activity'] as const) {
      const html = render([recommended()], { initialTab });
      const destinations = [...html.matchAll(/href="([^\"]*)"/g)].map((match) => match[1]);
      expect(destinations).toContain('/dashboard/ai-efficiency-demo');
      for (const href of destinations.filter(
        (value) => value !== '/dashboard/ai-efficiency-demo',
      )) {
        expect(href).toContain('run=selected-run');
      }
    }
  });

  it('preserves explicitly empty run IDs rather than falling through to the latest run', () => {
    const f = recommended();
    for (const entry of f.entries) entry.runId = '';
    const html = render([f], { run: { ...runFor([f]), runId: '' } });
    expect(html).toContain('finding=cache&amp;run=');
  });

  it('searches all records before pagination and combines query with category filtering', () => {
    const findings = Array.from({ length: 12 }, (_, i) =>
      finding(
        `request-${i}`,
        'ai-efficiency',
        i === 11 ? 'ai-retry-storm' : 'oversized-token-request',
        i === 11 ? { retries: 5 } : { wastedHeadroom: 20 },
      ),
    );
    const data = buildAgentModule('ai-efficiency', findings, runFor(findings))!;
    expect(
      filterAgentModuleRows(data.rows, 'request-11', 'ai-retry-storm').map((row) => row.id),
    ).toEqual(['request-11']);
    expect(filterAgentModuleRows(data.rows, 'request-11', 'oversized-token-request')).toEqual([]);
    expect(filterAgentModuleRows(data.rows, '5 attempts', '').map((row) => row.id)).toEqual([
      'request-11',
    ]);
    const html = render(findings, {
      initialQuery: 'request-11',
      initialCategory: 'ai-retry-storm',
    });
    expect(html).toContain('Finding request-11');
    expect(html).not.toContain('Finding request-0');
    expect(html).toContain('Clear filters');
    expect(html).toContain('1–1 of 1');
    expect(render(findings)).toContain('Next');
  });

  it('does not leak findings from another run or another specialist', () => {
    const current = finding('current');
    const old = finding('OLD_RUN_FINDING');
    old.entries[0].runId = 'old';
    const other = finding('OTHER_SPECIALIST', 'collaboration', 'redundant-recording', {
      sizeGb: 10,
    });
    const html = render([current, old, other]);
    expect(html).toContain('Finding current');
    expect(html).not.toContain('OLD_RUN_FINDING');
    expect(html).not.toContain('OTHER_SPECIALIST');
  });

  it('makes tab keyboard navigation predictable with wrapping and Home/End', () => {
    expect(nextModuleTab(0, 'ArrowLeft')).toBe(3);
    expect(nextModuleTab(3, 'ArrowRight')).toBe(0);
    expect(nextModuleTab(1, 'Home')).toBe(0);
    expect(nextModuleTab(1, 'End')).toBe(3);
    expect(nextModuleTab(1, 'Enter')).toBeNull();
  });

  it('handles an invalid module without echoing its untrusted ID', () => {
    const html = render([], { agentId: 'PRIVATE_INVALID_AGENT' });
    expect(html).toContain('Agent module not available');
    expect(html).not.toContain('PRIVATE_INVALID_AGENT');
    expect(html).toContain('/dashboard?run=selected-run');
  });
});
