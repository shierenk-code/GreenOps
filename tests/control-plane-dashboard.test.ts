import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ControlPlaneDashboard, {
  tabForView,
} from '../apps/CodeVitals-MCP/website/src/app/dashboard/control-plane/control-plane-dashboard';
import type { DashboardView } from '../apps/CodeVitals-MCP/website/src/app/dashboard/ledger-dashboard';
import type {
  ApprovalProposal,
  ApprovalRecord,
} from '../apps/CodeVitals-MCP/website/src/app/dashboard/approval-decisions';
import type {
  LedgerEntry,
  LedgerFile,
} from '../apps/CodeVitals-MCP/website/src/app/dashboard/ledger-data';
import {
  CONTROL_TABS,
  TAB_LABELS,
} from '../apps/CodeVitals-MCP/website/src/app/dashboard/control-plane/types';

const navigation = vi.hoisted(() => ({ query: '', pathname: '/dashboard', push: vi.fn() }));
const store = vi.hoisted(() => ({
  proposals: [] as ApprovalProposal[],
  records: [] as ApprovalRecord[],
  ready: false,
  error: null as string | null,
  save: vi.fn(async () => ({ ok: true, message: 'Plan recorded locally.' })),
  seenRun: null as string | null,
}));
vi.mock('../apps/CodeVitals-MCP/website/node_modules/next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(navigation.query),
  usePathname: () => navigation.pathname,
  useRouter: () => ({ push: navigation.push }),
}));
vi.mock('../apps/CodeVitals-MCP/website/node_modules/next/link', () => ({
  default: ({
    href,
    children,
    scroll: _scroll,
    prefetch: _prefetch,
    ...props
  }: {
    href: string;
    children: unknown;
    scroll?: boolean;
    prefetch?: boolean;
  }) => createElement('a', { href, ...props }, children),
}));
vi.mock('../apps/CodeVitals-MCP/website/src/app/dashboard/approval-inbox', () => ({
  useApprovalDecisions: (run: { runId: string } | null) => {
    store.seenRun = run?.runId ?? null;
    return {
      proposals: store.proposals,
      records: store.records,
      ready: store.ready,
      error: store.error,
      save: store.save,
      counts: { pending: 0, approved: 0, rejected: 0, revisionRequested: 0, stale: 0 },
      exportHistory: vi.fn(),
    };
  },
}));

const websiteRequire = createRequire(
  resolve(__dirname, '../apps/CodeVitals-MCP/website/package.json'),
);
const { createElement } = websiteRequire('react');
const { renderToStaticMarkup } = websiteRequire('react-dom/server');
const findingId = 'reused-finding';
const entry = (runId: string, at: string, title: string): LedgerEntry => ({
  runId,
  bugId: findingId,
  seq: 1,
  stage: 'detect',
  timestamp: at,
  summary: title,
  data: {
    category: 'uncached-completion',
    agentId: 'ai-efficiency',
    source: 'local',
    severity: 'high',
    confidence: 'high',
    environment: 'Prod',
    evidence: { wastedTokens: 415, promptTokens: 100, completionTokens: 20 },
    location: { filePath: 'fixtures/request-usage.json', symbol: 'faq' },
  },
});
const comparison = (runId: string, at: string, title: string): LedgerEntry => ({
  ...entry(runId, at, title),
  seq: 2,
  stage: 'compare',
  data: {
    recommended: 'cache',
    strategies: [
      {
        id: 'cache',
        title,
        description: `${title}: reuse safe public responses.`,
        effort: 'small',
        reversible: true,
      },
    ],
  },
});
const ledger: LedgerFile = {
  version: 1,
  entries: [
    entry('historic-run', '2026-10-01T09:00:00Z', 'Historic finding evidence'),
    comparison('historic-run', '2026-10-01T09:01:00Z', 'Historic cache recommendation'),
    entry('latest-run', '2026-10-03T09:00:00Z', 'Latest finding evidence'),
    comparison('latest-run', '2026-10-03T09:01:00Z', 'Latest cache recommendation'),
  ],
  outcomes: [],
};
const proposal: ApprovalProposal = {
  id: findingId,
  runId: 'historic-run',
  fingerprint: 'a'.repeat(64),
  title: 'Historic finding evidence',
  agentName: 'AI Efficiency',
  recommendation: 'Reuse safe public responses.',
  recommendationTitle: 'Historic cache recommendation',
  source: 'Rule-based',
  confidence: 'high',
  reversible: true,
  evidence: [],
  policy: 'Review required',
};
const approved: ApprovalRecord = {
  id: 'local-review-1',
  sequence: 1,
  runId: proposal.runId,
  findingId,
  fingerprint: proposal.fingerprint,
  title: proposal.title,
  decision: 'approved',
  reviewer: 'Human Reviewer',
  reason: 'Public response evidence checked.',
  recordedAt: '2026-10-04T10:00:00Z',
  scope: 'local-plan-only',
  identity: 'self-declared',
  acknowledged: true,
};

const render = (query = '', props: Record<string, unknown> = {}) => {
  navigation.query = query;
  return renderToStaticMarkup(
    createElement(ControlPlaneDashboard, {
      initialLedger: ledger,
      initialFileName: 'saved-analysis.json',
      ...props,
    }),
  );
};
const main = (html: string) => html.match(/<main\b[^>]*>[\s\S]*?<\/main>/)?.[0] ?? '';
const nav = (html: string) =>
  html.match(/<nav\b[^>]*aria-label="Control plane pages"[^>]*>[\s\S]*?<\/nav>/)?.[0] ?? '';
const links = (html: string) =>
  [...html.matchAll(/href="(\/dashboard[^\"]*)"/g)].map(
    (match) => new URL(match[1].replaceAll('&amp;', '&'), 'https://dashboard.example'),
  );

beforeEach(() => {
  navigation.query = '';
  navigation.pathname = '/dashboard';
  navigation.push.mockClear();
  store.proposals = [];
  store.records = [];
  store.ready = false;
  store.error = null;
  store.seenRun = null;
  store.save.mockClear();
});

describe('complete control-plane page integration', () => {
  it.each(CONTROL_TABS)('renders the %s sample page with twelve grouped sidebar pages', (tab) => {
    const html = render(`data=sample&tab=${tab}`);
    const navigationHtml = nav(html);
    expect(html).not.toContain('Detect. Review. Improve.');
    expect(html).not.toContain('Human decisions, measurable outcomes.');
    expect(navigationHtml.match(/<a\b/g)).toHaveLength(12);
    expect(navigationHtml.match(/aria-current="page"/g)).toHaveLength(1);
    for (const label of CONTROL_TABS.map((key) => TAB_LABELS[key]))
      expect(navigationHtml).toContain(label.replaceAll('&', '&amp;'));
    const active = navigationHtml.match(/<a[^>]*aria-current="page"[^>]*>[\s\S]*?<\/a>/)?.[0] ?? '';
    expect(active).toContain(TAB_LABELS[tab].replaceAll('&', '&amp;'));
    expect(html).toContain('Sample data only.');
    expect(html).toContain(
      'Sample data only. Reviews are simulated; no changes or savings are real.',
    );
    expect(main(html)).not.toContain('No recorded analysis loaded');
    const pageMarkers = {
      overview: 'Executive orchestrator overview',
      ai: 'AI Efficiency Agent workspace',
      waste: 'Digital Waste Agent workspace',
      carbon: 'Carbon Efficiency Agent workspace',
      arch: 'Architecture Agent workspace',
      dr: 'Disaster Recovery workspace',
      collab: 'Collaboration Agent workspace',
      pipeline: 'Pipeline Efficiency Agent workspace',
      investigations: 'Investigations',
      results: 'Results &amp; Evidence',
      activity: 'Agent Activity',
      approval: 'Recommended optimizations',
      ledger: 'Sustainability audit ledger',
      meta: 'Is GreenOps saving more than it consumes?',
    };
    expect(main(html)).toContain(pageMarkers[tab]);
    expect(store.save).not.toHaveBeenCalled();
  });

  it('defaults to recorded data, never silently replacing an empty analysis with samples', () => {
    const html = render('', { initialLedger: null });
    expect(html).toContain('No recorded analysis');
    expect(html).toContain('No recorded analysis loaded.');
    expect(html).toContain('choose Sample scenarios');
    expect(html).not.toContain('Sample data only.');
    expect(main(html)).toContain('Executive orchestrator overview');
    expect(main(html)).toContain('No mapped observations');
    expect(main(html)).toContain('0 regions in scope');
  });

  it.each(['true', 'Sample', 'demo', 'recorded'])(
    'does not enable sample mode for data=%s',
    (value) => {
      const html = render(`data=${value}`, { initialLedger: null });
      expect(html).toContain('No recorded analysis');
      expect(html).not.toContain('Sample data only.');
    },
  );

  it('fails closed for an explicitly missing requested run without substituting latest or sample evidence', () => {
    const html = render('run=missing-run&tab=approval&finding=reused-finding');
    expect(html).toContain('This recorded run is unavailable');
    expect(html).toContain('another run has not been substituted');
    expect(html).not.toContain('Latest cache recommendation');
    expect(html).not.toContain('Historic cache recommendation');
    expect(html).not.toContain('<dialog');
    expect(store.seenRun).toBeNull();
    for (const url of links(nav(html))) expect(url.searchParams.get('run')).toBe('missing-run');
  });

  it('shows only selected run evidence even when a finding identifier is reused', () => {
    const html = render('run=historic-run&tab=approval');
    expect(main(html)).toContain('Historic cache recommendation');
    expect(main(html)).not.toContain('Latest cache recommendation');
    expect(store.seenRun).toBe('historic-run');
  });

  it('selects the latest run only when no run was requested', () => {
    const html = render('tab=approval');
    expect(main(html)).toContain('Latest cache recommendation');
    expect(main(html)).not.toContain('Historic cache recommendation');
    expect(store.seenRun).toBe('latest-run');
    for (const url of links(nav(html))) expect(url.searchParams.get('run')).toBe('latest-run');
  });

  it('keeps run, time range and theme on tab links while dropping stale finding and agent selectors', () => {
    const html = render(
      'run=historic-run&tab=ai&env=Prod&range=7d&theme=forest&finding=missing&agent=ai-efficiency',
    );
    const urls = links(nav(html));
    expect(urls).toHaveLength(12);
    for (const url of urls) {
      expect(url.pathname).toBe('/dashboard');
      expect(url.searchParams.get('run')).toBe('historic-run');
      expect(url.searchParams.has('env')).toBe(false);
      expect(url.searchParams.get('range')).toBe('7d');
      expect(url.searchParams.get('theme')).toBe('forest');
      expect(url.searchParams.has('finding')).toBe(false);
      expect(url.searchParams.has('agent')).toBe(false);
    }
    expect(html).toContain('data-theme="forest"');
  });

  it('keeps explicit sample mode on every tab and overview detail link', () => {
    const html = render('data=sample&theme=dark&env=Prod&range=24h');
    for (const url of links(html)) {
      expect(url.searchParams.get('data')).toBe('sample');
      expect(url.searchParams.get('theme')).toBe('dark');
    }
    expect(html).toContain('data-theme="dark"');
    expect(main(html)).toContain('Seven specialist workspaces');
  });

  it.each(['sunset', 'clean', 'olive', 'dark', 'forest', 'highContrast'])(
    'preserves the %s theme without displaying a theme picker',
    (theme) => {
      const html = render(`data=sample&theme=${theme}`);
      expect(html).toContain(`data-theme="${theme}"`);
      expect(html).not.toContain('aria-label="Choose appearance"');
      expect(html).not.toContain('aria-label="Dashboard theme"');
    },
  );

  it('removes the appearance button and menu', () => {
    const html = render('data=sample');
    expect(html).not.toContain('aria-label="Choose appearance"');
    expect(html).not.toContain('aria-label="Dashboard theme"');
    expect(html).not.toContain('Make it your workspace');
  });

  it('keeps the second theme selected across dashboard navigation', () => {
    const html = render('data=sample&theme=olive');
    for (const url of links(html)) {
      expect(url.searchParams.get('theme')).toBe('olive');
    }
    expect(html).toContain('data-theme="olive"');
  });

  it('uses safe defaults for unknown query enum values', () => {
    const html = render('tab=unknown&theme=unknown&env=unknown&range=unknown&data=sample');
    expect(html).toContain('data-theme="sunset"');
    expect(nav(html).match(/<a[^>]*aria-current="page"[^>]*>[\s\S]*?<\/a>/)?.[0]).toContain(
      'Overview',
    );
    expect(html).toMatch(/<option value="30d" selected="">/);
  });

  it('offers import and refresh without exposing raw server errors or making requests during render', () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    try {
      const html = render('', { initialLedger: null, initialError: 'API_SECRET_PRIVATE_STACK' });
      expect(html).toContain('Refresh results');
      expect(html).toContain('Import results');
      expect(html).toContain('type="file"');
      expect(html).toContain('accept=".json,application/json"');
      expect(html).toContain('No saved analysis is available.');
      expect(html).not.toContain('API_SECRET_PRIVATE_STACK');
      expect(fetchSpy).not.toHaveBeenCalled();
      expect(navigation.push).not.toHaveBeenCalled();
    } finally {
      fetchSpy.mockRestore();
    }
  });
});

describe('legacy dashboard route compatibility', () => {
  it.each(['/dashboard/ai-efficiency-demo', '/dashboard/measurement'])(
    'keeps the standalone %s child available without a saved fleet analysis',
    (pathname) => {
      navigation.pathname = pathname;
      const html = render('theme=forest', {
        initialLedger: null,
        children: createElement(
          'section',
          { 'aria-label': 'Independent workflow' },
          'Workflow remains available',
        ),
      });
      expect(main(html)).toContain('Workflow remains available');
      expect(main(html)).not.toContain('No recorded analysis loaded');
      expect(html).toContain('data-theme="forest"');
      expect(html).not.toContain('aria-label="Dashboard theme"');
      expect(links(nav(html))).toHaveLength(12);
      for (const url of links(nav(html))) expect(url.pathname).toBe('/dashboard');
    },
  );

  it.each<[DashboardView, string]>([
    ['dashboard', 'overview'],
    ['agents', 'ai'],
    ['approvals', 'approval'],
    ['findings', 'investigations'],
    ['review', 'approval'],
    ['improvements', 'results'],
    ['trace', 'activity'],
    ['audits', 'activity'],
    ['reports', 'results'],
  ])('maps %s to the %s workspace', (view, expected) => {
    expect(tabForView(view)).toBe(expected);
  });

  it.each([
    ['ai-efficiency', 'ai'],
    ['digital-waste', 'waste'],
    ['carbon-incident', 'carbon'],
    ['architecture', 'arch'],
    ['disaster-recovery', 'dr'],
    ['collaboration', 'collab'],
    ['pipeline-efficiency', 'pipeline'],
  ])('maps legacy agent %s to %s', (id, expected) => {
    expect(tabForView('agents', id)).toBe(expected);
  });

  it('uses the server-provided legacy route when tab is absent or invalid, but respects a valid tab override', () => {
    const legacy = render('data=sample', { view: 'agents', initialAgentId: 'architecture' });
    expect(main(legacy)).toContain('Architecture Agent workspace');
    const invalid = render('data=sample&tab=invalid', { view: 'reports' });
    expect(main(invalid)).toContain('Results &amp; Evidence');
    const override = render('data=sample&tab=ai', { view: 'reports' });
    expect(main(override)).toContain('AI Efficiency Agent workspace');
  });
});

describe('integrated review and ledger scope', () => {
  it('keeps specialist landing pages compact with three findings and collapsed measurements', () => {
    const html = main(render('data=sample&tab=ai&range=1y'));
    expect(html).toContain('Resources with findings');
    expect(html).toContain('Your next step');
    expect(html).toContain('Change checks passed');
    expect(html).toMatch(/View all \d+ findings/);
    const table = html.match(/<table><caption[^>]*>Findings in this selection<\/caption>[\s\S]*?<\/table>/)?.[0] ?? '';
    expect((table.match(/<tbody>[\s\S]*?<\/tbody>/)?.[0].match(/<tr>/g) ?? []).length).toBe(3);
    expect(html).toMatch(/<details\b[^>]*><summary>Domain measurements/);
    expect(html).not.toContain('Before making a change');
  });
  it('provides a ranked region selector without presenting intensity as emissions', () => {
    const html = main(render('data=sample&tab=carbon&range=1y'));
    expect(html).toContain('Carbon by region');
    expect(html).toContain('Highest observed grid intensity');
    expect(html).toContain('Grid intensity is not total workload emissions');
    expect(html).toContain('Proposed routes off');
  });
  it.each(['carbon', 'waste', 'ai', 'arch', 'dr', 'collab'])(
    'gives %s four consistent URL-addressable sections',
    (agent) => {
      for (const section of ['findings', 'recommendations', 'results', 'activity']) {
        const html = render(`data=sample&tab=${agent}&section=${section}&theme=olive`);
        expect(main(html)).toContain('aria-label="Agent workspace sections"');
        const sectionNavigation =
          html.match(
            /<nav\b[^>]*aria-label="Agent workspace sections"[^>]*>[\s\S]*?<\/nav>/,
          )?.[0] ?? '';
        const sectionLinks = links(sectionNavigation).filter(
          (url) => url.searchParams.has('section') && !url.searchParams.has('sandbox'),
        );
        expect(sectionLinks.map((url) => url.searchParams.get('section'))).toEqual([
          'findings',
          'recommendations',
          'results',
          'activity',
        ]);
        expect(main(html)).toContain(
          section === 'findings'
            ? 'Resource findings'
            : section === 'recommendations'
              ? 'Recommended changes'
              : section === 'results'
                ? 'Results for this specialist'
                : 'Specialist activity',
        );
        expect(main(html)).not.toContain('Start waste workflow');
      }
    },
  );
  it('does not combine another agent’s findings into a specialist Results page', () => {
    const html = render('run=historic-run&tab=waste&section=results');
    expect(main(html)).toContain('No finding evidence in this selection');
    expect(main(html)).not.toContain('Historic cache recommendation');
  });
  it('keeps the synthetic sandbox behind an explicit entry point', () => {
    expect(main(render('data=sample&tab=waste'))).not.toContain(
      'Find waste. Review the fix. Check the result.',
    );
    expect(main(render('data=sample&tab=waste&sandbox=1'))).toContain(
      'Find waste. Review the fix. Check the result.',
    );
    expect(main(render('data=sample&tab=carbon&sandbox=1'))).not.toContain(
      'Separate synthetic sandbox',
    );
  });
  it('makes global search open a filtered investigation list', () => {
    const html = render('run=historic-run&tab=investigations&q=nonexistent');
    expect(main(html)).toContain('No matching findings');
    expect(html).toContain('aria-label="Search all findings"');
  });
  it('shows missing before/after evidence rather than treating plan approval as savings', () => {
    store.ready = true;
    store.proposals = [proposal];
    store.records = [approved];
    const html = render('run=historic-run&tab=results');
    expect(main(html)).toContain('No successful application recorded');
    expect(main(html)).toContain('Not verified');
    expect(main(html)).toContain('Export evidence');
  });
  it('retains lifecycle records on the activity page without exposing raw reasoning', () => {
    const html = render('run=historic-run&tab=activity');
    expect(main(html)).toContain('Sustainability audit ledger');
    expect(main(html)).toContain('Whole-run model and tool usage');
    expect(main(html)).not.toContain('Latest finding evidence');
  });
  it('opens the matching real finding with decisions disabled until safe storage and proposal binding are ready', () => {
    store.error = 'Safe review storage is unavailable.';
    const html = render('run=historic-run&tab=approval&finding=reused-finding');
    expect(main(html)).toContain('Historic cache recommendation');
    expect(html).not.toContain('<dialog');
    expect(html).toContain('Historic cache recommendation');
    expect(html).toMatch(/<fieldset[^>]*disabled=""/);
    expect(html).toMatch(/type="submit"[^>]*disabled=""/);
    expect(html).toContain('Safe review storage is unavailable.');
    expect(store.save).not.toHaveBeenCalled();
  });

  it('does not enable a real decision merely because storage is ready without a matching proposal', () => {
    store.ready = true;
    store.proposals = [{ ...proposal, id: 'different-finding' }];
    const html = render('run=historic-run&tab=approval&finding=reused-finding');
    expect(html).toMatch(/type="submit"[^>]*disabled=""/);
    expect(html).toContain('No approvable recommendation was recorded for this finding.');
    expect(html).not.toContain('Review storage is not ready');
  });

  it('enables only local plan review after matching proposal binding and storage readiness', () => {
    store.ready = true;
    store.proposals = [proposal];
    const html = render('run=historic-run&tab=approval&finding=reused-finding');
    expect(html).toContain('Record decision');
    expect(html).not.toMatch(/type="submit"[^>]*disabled=""/);
    expect(html).toContain('local plan review only');
    expect(html).not.toContain('Approve &amp; Execute');
    expect(store.save).not.toHaveBeenCalled();
  });

  it('shows approved plans and their history inside the owning agent without claiming execution', () => {
    store.ready = true;
    store.proposals = [proposal];
    store.records = [approved];
    const html = render('run=historic-run&tab=ai&finding=reused-finding');
    expect(main(html)).not.toContain('AI Efficiency Agent workspace');
    expect(main(html)).toContain('Local plan decision');
    expect(main(html)).toContain('Public response evidence checked.');
    expect(main(html)).toContain('Manual fix — in your own environment');
    expect(main(html)).not.toContain('Approve &amp; Execute');
    expect(main(html)).toContain('Decision recorded');
    expect(main(html)).toContain('Revise decision');
    expect(main(html)).not.toContain('name="decision"');
  });

  it('keeps requested revisions in the executive attention count', () => {
    store.ready = true;
    store.proposals = [proposal];
    store.records = [{ ...approved, decision: 'revision-requested' }];
    const html = render('run=historic-run&tab=overview');
    expect(html).toMatch(/Findings to review<\/h3><strong>1<\/strong>/);
    expect(nav(html)).toContain('Approvals');
  });

  it('updates pending reviews after approval without increasing verified results', () => {
    store.ready = true;
    store.proposals = [proposal];
    store.records = [approved];
    const html = render('run=historic-run&tab=overview');
    expect(html).toMatch(/Findings to review<\/h3><strong>0<\/strong>/);
    expect(html).toMatch(/Verified improvements<\/h3><strong>0<\/strong>/);
    expect(html).toContain('No pending reviews in this selection');
  });

  it('links overview queue entries to their owning agent and exact finding while preserving run and theme', () => {
    const html = render('run=historic-run&tab=overview&theme=clean');
    expect(html).toContain(
      '/dashboard?run=historic-run&amp;tab=ai&amp;theme=clean&amp;finding=reused-finding',
    );
    const review = render('run=historic-run&tab=ai&theme=clean&finding=reused-finding');
    expect(main(review)).not.toContain('AI Efficiency Agent workspace');
    expect(main(review)).toContain('Your decision');
  });

  it('retains successive human review notes in the inline review instead of replacing decision history', () => {
    store.ready = true;
    store.proposals = [proposal];
    store.records = [
      approved,
      {
        ...approved,
        id: 'local-review-2',
        sequence: 2,
        decision: 'revision-requested',
        reason: 'Please shorten the cache expiry.',
        recordedAt: '2026-10-04T10:30:00Z',
      },
    ];
    const html = render('run=historic-run&tab=approval&finding=reused-finding');
    const dialog = main(html);
    expect(dialog).toContain('Public response evidence checked.');
    expect(dialog).toContain('Please shorten the cache expiry.');
    expect(main(html)).toContain('revision-requested');
  });

  it('does not reuse real local decisions in sample scenarios', () => {
    store.ready = true;
    store.proposals = [proposal];
    store.records = [approved];
    const html = render('data=sample&tab=ledger');
    expect(main(html)).not.toContain('Human Reviewer');
    expect(main(html)).not.toContain('Historic finding evidence');
    expect(main(html)).not.toContain('Local human decision');
    expect(main(html)).toContain('Synthetic scenario');
  });

  it('can explore a sample review independently of unavailable real-review storage', () => {
    const html = render('data=sample&tab=approval&finding=sample-ai-1');
    expect(main(html)).toContain('Simulated human review');
    expect(html).not.toContain('<dialog');
    expect(html).toContain('Save simulated decision');
    expect(html).not.toMatch(/type="submit"[^>]*disabled=""/);
    expect(html).toContain('does not apply a real change');
    expect(store.save).not.toHaveBeenCalled();
  });

  it('does not open a different recommendation for an unknown finding id', () => {
    const html = render('run=historic-run&tab=approval&finding=not-there');
    expect(html).not.toContain('<dialog');
  });

  it('groups workspace pages, seven specialists and evidence destinations', () => {
    const html = render('data=sample&tab=meta');
    const tabs = links(nav(html)).map((url) => url.searchParams.get('tab'));
    expect(nav(html)).toContain('Workspace');
    expect(nav(html)).toContain('Specialists');
    expect(nav(html)).toContain('Evidence');
    expect(tabs).toEqual([
      'overview',
      'investigations',
      'approval',
      'carbon',
      'waste',
      'ai',
      'arch',
      'dr',
      'collab',
      'pipeline',
      'results',
      'activity',
    ]);
    expect(main(html)).toContain('Executive orchestrator overview');
  });

  it('keeps review details scoped to the selected agent', () => {
    const html = render('data=sample&tab=waste&finding=sample-ai-1');
    expect(main(html)).toContain('This finding is unavailable');
    expect(main(html)).not.toContain('Recommendation &amp; human fix');
  });

  it('opens a legacy finding link on its owning agent page', () => {
    const html = render('data=sample&finding=sample-waste-1', { view: 'findings' });
    expect(main(html)).not.toContain('Resource findings');
    expect(main(html)).toContain('Simulated human review');
    expect(main(html)).toContain('Decision history');
    expect(html).not.toContain('<dialog');
  });
  it('ignores obsolete environment filters and removes the selector', () => {
    const all = render('data=sample&tab=approval');
    const stale = render('data=sample&tab=approval&env=Prod');
    expect(main(stale)).toBe(main(all));
    expect(stale).not.toContain('Environment filter');
    expect(stale).not.toContain('All Envs');
    expect(stale).toContain('Dashboard data source');
    expect(stale).toMatch(/aria-label="Notifications, \d+ unread"/);
  });

  it('fades only the selected view and keeps the inline review outside its navigation boundary', () => {
    const html = render('data=sample&tab=waste&finding=sample-waste-1');
    expect(main(html)).toContain('data-view="waste"');
    expect(main(html)).toContain('Simulated human review');
    expect(html).toContain('aria-busy="false"');
  });

  it('reviews an agent finding directly in the shared approval queue', () => {
    const html = render('data=sample&tab=approval&finding=sample-waste-1');
    expect(main(html)).not.toContain('Recommended optimizations');
    expect(main(html)).toContain('Simulated human review');
    expect(main(html)).toContain('Manual fix');
    expect(html).not.toContain('<dialog');
  });
});
