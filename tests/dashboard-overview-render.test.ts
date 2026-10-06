import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import OrchestratorOverview, {
  filterOverview,
} from '../apps/CodeVitals-MCP/website/src/app/dashboard/orchestrator-overview';
import {
  buildOverviewData,
  type DashboardRun,
} from '../apps/CodeVitals-MCP/website/src/app/dashboard/overview-data';
import type { Finding } from '../apps/CodeVitals-MCP/website/src/app/dashboard/ledger-dashboard';
import type { LedgerEntry } from '../apps/CodeVitals-MCP/website/src/app/dashboard/ledger-data';

vi.mock('../apps/CodeVitals-MCP/website/node_modules/next/link', () => ({
  default: ({ href, children, ...props }: { href: string; children: unknown }) =>
    createElement('a', { href, ...props }, children),
}));
vi.mock(
  '../apps/CodeVitals-MCP/website/src/app/dashboard/orchestrator-overview.module.css',
  () => ({ default: {} }),
);

const websiteRequire = createRequire(
  resolve(__dirname, '../apps/CodeVitals-MCP/website/package.json'),
);
const { createElement } = websiteRequire('react');
const { renderToStaticMarkup } = websiteRequire('react-dom/server');

function finding(
  id: string,
  agentId = 'ai-efficiency',
  category = 'uncached-completion',
  evidence: Record<string, unknown> = {},
): Finding {
  return {
    bugId: id,
    agentId,
    agentName: agentId,
    category,
    severity: 'medium',
    title: `Finding ${id}`,
    state: 'withheld',
    impactEnergyKwh: 8888,
    impactCarbonKg: 7777,
    confidence: 'unknown',
    effort: '',
    recommendationId: '',
    recommendationTitle: '',
    recommendation: '',
    expectedReductionFactor: 0,
    reversible: false,
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
  };
}
function add(f: Finding, stage: LedgerEntry['stage'], data: Record<string, unknown>) {
  f.entries.push({
    runId: 'selected-run',
    bugId: f.bugId,
    seq: f.entries.length + 1,
    stage,
    data,
    timestamp: '2026-10-03T08:01:00Z',
    summary: 'PRIVATE_INTERNAL_ACTIVITY',
  });
  return f;
}
const runFor = (findings: Finding[]): DashboardRun => ({
  runId: 'selected-run',
  entries: findings.flatMap((f) => f.entries),
  timestamp: '2026-10-03T08:01:00Z',
  kind: 'run',
});
const render = (findings: Finding[], initialQuery = '') =>
  renderToStaticMarkup(
    createElement(OrchestratorOverview, { findings, run: runFor(findings), initialQuery }),
  );
const fleet = () => [
  finding('cache', 'ai-efficiency', 'uncached-completion', { wastedTokens: 400 }),
  finding('headroom', 'ai-efficiency', 'oversized-token-request', { wastedHeadroom: 9102 }),
  finding('disk', 'digital-waste', 'unattached-storage', { gb: 25 }),
  finding('spike', 'carbon-incident', 'carbon-anomaly', { energyKwh: 12, baselineKwh: 3 }),
  finding('region', 'architecture', 'high-carbon-region', {
    region: 'west-demo',
    gridIntensityKgPerKwh: 0.5,
  }),
  finding('replicas', 'disaster-recovery', 'over-replication', {
    replicas: 4,
    justifiedReplicas: 2,
  }),
  finding('recording', 'collaboration', 'redundant-recording', { sizeGb: 3.2 }),
];

describe('orchestrator overview presentation', () => {
  it('shows Carbon Efficiency, Digital Waste, and AI Efficiency first in that order', () => {
    const html = render(fleet());
    const ids = [
      'carbon-incident',
      'digital-waste',
      'ai-efficiency',
      'architecture',
      'disaster-recovery',
      'collaboration',
    ];
    const positions = ids.map((id) => html.indexOf(`id="overview-${id}"`));
    expect(positions.every((position) => position >= 0)).toBe(true);
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
    expect(html).toContain('Carbon Efficiency');
    expect(html).not.toContain('Carbon Incident');
  });

  it('renders all six actual specialist groups with accessible charts and review actions', () => {
    const html = render(fleet());
    for (const id of [
      'ai-efficiency',
      'digital-waste',
      'carbon-incident',
      'architecture',
      'collaboration',
      'disaster-recovery',
    ]) {
      expect(html).toContain(`id="overview-${id}"`);
      expect(html).toContain(`/dashboard/agents/${id}?run=selected-run#agent-detail`);
      expect(html).toContain(`/dashboard/findings?agent=${id}&amp;run=selected-run`);
    }
    expect(html).toContain('role="img"');
    expect(html).toContain('AI Efficiency: 2 findings, 0 verified');
    expect(html).toContain('Findings by category');
    expect(html).toContain('What was found');
    expect(html).toContain('View agent');
    expect(html).toContain('Findings');
    expect(html).toContain('Finding cache');
  });

  it('shows native evidence without surfacing inflated legacy energy estimates', () => {
    const html = render(fleet());
    expect(html).toContain('400');
    expect(html).toContain('9,102');
    expect(html).toContain('Not consumed or saved tokens');
    expect(html).toContain('25');
    expect(html).not.toContain('8,888');
    expect(html).not.toContain('7,777');
    expect(html).not.toContain('Sustainability score');
    expect(html).not.toContain('99.9%');
    expect(html).not.toContain('Healthy');
    expect(html).not.toContain('Deploy');
    expect(html).not.toContain('Monthly Savings');
    expect(html).not.toContain('Trees Planted');
    expect(html).not.toContain('ROI');
  });

  it('charts recorded findings separately from successful verification', () => {
    const pending = finding('pending');
    const verified = add(add(finding('finished'), 'improve', { applied: true }), 'verify', {
      confirmed: true,
    });
    const html = render([pending, verified]);
    expect(html).toContain('Opportunities and verified progress');
    expect(html).toContain('AI Efficiency: 2 findings, 1 verified');
    expect(html).toContain('1 applied changes recorded');
    expect(html).toContain('Recommendation sources');
    expect(html).toContain('Source unconfirmed');
    expect(html).toContain('Not yet recorded');
    expect(html).not.toContain('Monthly Savings');
  });

  it('binds every fleet link to the recorded run and keeps the isolated demo independent', () => {
    const html = render(fleet());
    const links = [...html.matchAll(/href="(\/dashboard[^\"]*)"/g)].map(
      (match) => new URL(match[1].replaceAll('&amp;', '&'), 'https://example.invalid'),
    );
    expect(links.length).toBeGreaterThan(20);
    for (const link of links) {
      expect(link.searchParams.get('run')).toBe(
        link.pathname === '/dashboard/ai-efficiency-demo' ? null : 'selected-run',
      );
    }
    expect(html).toContain('Your saved fleet findings and real applications are not changed.');
    expect(html).toContain('View impact and measurement');
    expect(html).not.toContain('/dashboard/measurement');
  });

  it('does not claim an empty agent completed a clean scan', () => {
    const html = render([]);
    expect(html).toContain('No recorded findings');
    expect(html).toContain('This does not establish a clean scan.');
    expect(html).not.toContain('All systems operational');
    expect(html).not.toContain('100%');
    expect(html).not.toContain('-0 recorded');
  });

  it('uses recorded recommendations as a count, not total minus missing recommendations', () => {
    const html = render([finding('no-recommendation')]);
    expect(html).toContain('0 recorded');
    expect(html).not.toContain('-1 recorded');
  });

  it('does not show applied/verified counts from stale finding status or automatic policy approval', () => {
    const f = add(finding('pending'), 'approve', { approved: true, approver: 'auto-approver' });
    f.state = 'verified';
    const html = render([f]);
    expect(html).toContain('0 applied changes recorded');
    expect(html).toContain('0 verified');
    expect(html).toContain('Human decision');
    expect(html).toContain('Review proposed changes');
    expect(html).not.toContain('Human approved');
  });

  it('does not place verified findings back into the urgent review queue', () => {
    const f = add(add(finding('finished'), 'improve', { applied: true }), 'verify', {
      confirmed: true,
    });
    const html = render([f]);
    const queue = html.slice(html.indexOf('id="overview-priorities"'));
    expect(queue).toContain('No unverified priority findings');
    expect(queue).not.toContain('Finding finished');
    expect(html).toContain('1 verified');
  });

  it('never renders raw prompts, provider errors, or model reasoning on the overview', () => {
    const f = finding('safe-title', 'ai-efficiency', 'uncached-completion', {
      wastedTokens: 5,
      prompt: 'PRIVATE_PROMPT',
      apiKey: 'PRIVATE_KEY',
    });
    add(f, 'investigate', { rootCause: 'PRIVATE_REASONING', error: 'PRIVATE_PROVIDER_ERROR' });
    add(f, 'compare', { reasoning: 'PRIVATE_COMPARISON', suggestedCode: 'PRIVATE_CODE' });
    const html = render([f]);
    for (const text of [
      'PRIVATE_PROMPT',
      'PRIVATE_KEY',
      'PRIVATE_REASONING',
      'PRIVATE_PROVIDER_ERROR',
      'PRIVATE_COMPARISON',
      'PRIVATE_CODE',
      'PRIVATE_INTERNAL_ACTIVITY',
    ])
      expect(html).not.toContain(text);
  });

  it('provides all six audit stages without pretending the stages succeeded', () => {
    const html = render([finding('pending')]);
    for (const title of [
      'Status',
      'Activity',
      'Evidence',
      'Recommendation',
      'Human decision',
      'Verified result',
    ])
      expect(html).toContain(title);
    expect(html).toContain('1 stage recorded');
    expect(html).toContain('Saved results');
    expect(html).not.toContain('Live');
  });
});

describe('orchestrator overview search', () => {
  it('filters both agent cards and priority rows by an agent capability', () => {
    const findings = fleet();
    const data = buildOverviewData(findings, runFor(findings));
    const results = filterOverview(data, 'tokens');
    expect(results.agents.map((agent) => agent.id)).toEqual(['ai-efficiency']);
    expect(results.priorityFindings.every((f) => f.agentId === 'ai-efficiency')).toBe(true);
    const html = render(findings, 'tokens');
    expect(html).toContain('id="overview-ai-efficiency"');
    expect(html).not.toContain('id="overview-disaster-recovery"');
    expect(html).toContain('Clear search');
    expect(html).toContain('Summary totals remain for the selected run.');
  });

  it('searches finding titles beyond the first rendered priority page', () => {
    const findings = Array.from({ length: 12 }, (_, index) => finding(`cache-${index}`));
    findings[11].entries[0].summary = 'Unique later opportunity';
    const data = buildOverviewData(findings, runFor(findings));
    const results = filterOverview(data, 'Unique later');
    expect(results.agents.map((agent) => agent.id)).toEqual(['ai-efficiency']);
    expect(results.priorityFindings.map((f) => f.findingId)).toEqual(['cache-11']);
    expect(render(findings, 'Unique later')).toContain('Unique later opportunity');
  });

  it('has a clear zero-match state and restoring an empty query exposes all groups', () => {
    const findings = fleet();
    const data = buildOverviewData(findings, runFor(findings));
    expect(filterOverview(data, 'unlikely unmatched text').agents).toHaveLength(0);
    expect(filterOverview(data, '   ').agents).toHaveLength(7);
    const html = render(findings, 'unlikely unmatched text');
    expect(html).toContain('No matching agents');
    expect(html).toContain('Show all agents');
    expect(html).toContain('No priority findings match this search.');
  });
});
