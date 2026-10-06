import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import LedgerDashboard, {
  type DashboardView,
} from '../apps/CodeVitals-MCP/website/src/app/dashboard/ledger-dashboard.js';
import type {
  LedgerEntry,
  LedgerFile,
} from '../apps/CodeVitals-MCP/website/src/app/dashboard/ledger-data.js';

const navigation = vi.hoisted(() => ({ query: '' }));
vi.mock('../apps/CodeVitals-MCP/website/node_modules/next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(navigation.query),
  useRouter: () => ({ push: vi.fn() }),
}));
vi.mock('../apps/CodeVitals-MCP/website/node_modules/next/link', () => ({
  default: ({ href, children, ...props }: { href: string; children: unknown }) =>
    createElement('a', { href, ...props }, children),
}));
vi.mock('../apps/CodeVitals-MCP/website/node_modules/lucide-react', () => ({
  Activity: () => null,
  LayoutDashboard: () => null,
  ClipboardList: () => null,
  ListFilter: () => null,
  Wrench: () => null,
  Workflow: () => null,
  BarChart3: () => null,
  ArrowRight: () => null,
  BrainCircuit: () => null,
  CheckCircle2: () => null,
  ChevronRight: () => null,
  Database: () => null,
  FileJson: () => null,
  GitBranch: () => null,
  Gauge: () => null,
  Leaf: () => null,
  RefreshCcw: () => null,
  Search: () => null,
  ShieldCheck: () => null,
  Upload: () => null,
  Users: () => null,
  Zap: () => null,
  X: () => null,
  AlertTriangle: () => null,
  BadgeCheck: () => null,
  BookOpen: () => null,
  ChevronDown: () => null,
  ChevronLeft: () => null,
  ClipboardCheck: () => null,
  History: () => null,
  Info: () => null,
}));
vi.mock('../apps/CodeVitals-MCP/website/src/app/dashboard/dashboard.module.css', () => ({
  default: {},
}));

const websiteRequire = createRequire(
  resolve(__dirname, '../apps/CodeVitals-MCP/website/package.json'),
);
const { createElement } = websiteRequire('react');
const { renderToStaticMarkup } = websiteRequire('react-dom/server');
const entry = (runId: string, date: string, title: string): LedgerEntry => ({
  runId,
  bugId: 'reused-finding',
  stage: 'detect',
  seq: 1,
  timestamp: date,
  summary: title,
  data: { category: 'uncached-completion', agentId: 'ai-efficiency', source: 'local' },
});
const ledger: LedgerFile = {
  version: 1,
  entries: [
    entry('historic-run', '2026-10-01T09:00:00Z', 'Historic finding evidence'),
    entry('latest-run', '2026-10-03T09:00:00Z', 'New finding evidence'),
  ],
  outcomes: [],
};
const render = (view: DashboardView, query: string): string => {
  navigation.query = query;
  return renderToStaticMarkup(
    createElement(LedgerDashboard, {
      initialLedger: ledger,
      initialFileName: 'recorded-ledger.json',
      view,
    }),
  );
};
const dashboardLinks = (html: string) =>
  [...html.matchAll(/href="(\/dashboard[^\"]*)"/g)]
    .map((match) => new URL(match[1].replaceAll('&amp;', '&'), 'https://dashboard.example'))
    .filter((url) => url.pathname !== '/dashboard/ai-efficiency-demo');

describe('Dashboard run-bound pages', () => {
  it.each<DashboardView>([
    'dashboard',
    'agents',
    'findings',
    'review',
    'approvals',
    'trace',
    'reports',
  ])('keeps the complete shared workspace navigation on %s', (view) => {
    const html = render(view, 'run=historic-run');
    const sidebar =
      html.match(/<header[^>]*aria-label="Workspace navigation"[^>]*>[\s\S]*?<\/header>/)?.[0] ??
      '';
    const labels = [
      'Overview',
      'Agent detail',
      'Finding review',
      'Approval inbox',
      'Run trace',
      'AI Efficiency demo',
      'Impact reports',
    ];
    expect(sidebar).toContain('aria-label="Workspace navigation"');
    expect(sidebar).toContain('Control Plane');
    expect(sidebar).toContain('Refresh results');
    expect(sidebar).toContain('Import results');
    const nav = sidebar.match(/<nav[^>]*>[\s\S]*?<\/nav>/)?.[0] ?? '';
    for (const label of labels) expect(nav).toContain(`aria-label="${label}"`);
    expect(nav.match(/aria-current="page"/g) ?? []).toHaveLength(1);
    expect(sidebar.match(/<option /g) ?? []).toHaveLength(labels.length);
    expect(sidebar).toContain('/dashboard/reports?run=historic-run');
    expect(sidebar).toContain('/dashboard/approvals?run=historic-run');
    expect(sidebar).not.toContain('/dashboard/ai-efficiency-demo?run=');
  });

  it('orders agent filters and normalizes the legacy carbon display name without changing evidence', () => {
    navigation.query = 'run=historic-run';
    const carbonEntry = {
      ...entry('historic-run', '2026-10-01T09:00:00Z', 'Recorded carbon finding'),
      data: {
        category: 'carbon-anomaly',
        agentId: 'carbon-incident',
        agentName: 'Carbon Incident Agent',
      },
    };
    const html = renderToStaticMarkup(
      createElement(LedgerDashboard, {
        initialLedger: { version: 1, entries: [carbonEntry], outcomes: [] },
        initialFileName: 'recorded-ledger.json',
        view: 'findings',
      }),
    );
    const ids = ['carbon-incident', 'digital-waste', 'ai-efficiency'];
    const positions = ids.map((id) => html.indexOf(`<option value="${id}">`));
    expect(positions.every((position) => position >= 0)).toBe(true);
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
    expect(html).toContain('Carbon Efficiency');
    expect(html).not.toContain('Carbon Incident Agent');
    expect(carbonEntry.data.agentName).toBe('Carbon Incident Agent');
  });

  it('connects the approval inbox without claiming decisions before local storage loads', () => {
    const html = render('approvals', 'run=historic-run');
    expect(html).toContain('Approval inbox');
    expect(html).not.toContain('0 pending reviews');
    expect(
      dashboardLinks(html).every((url) => url.searchParams.get('run') === 'historic-run'),
    ).toBe(true);
  });

  it('renders incomplete usage as unknown and suppresses a net-saving claim', () => {
    navigation.query = 'run=historic-run';
    const incomplete: LedgerFile = {
      ...ledger,
      outcomes: [
        {
          runId: 'historic-run',
          startedAt: '2026-10-01T09:00:00Z',
          finishedAt: '2026-10-01T10:00:00Z',
          bugsDetected: 1,
          bugsImproved: 0,
          savings: { energyKwh: 0, carbonKgCo2e: 0 },
          selfCost: {
            tokens: null,
            knownTokens: 18,
            usageComplete: false,
            llmCalls: 2,
            unknownLlmCalls: 1,
            energyKwh: null,
            carbonKgCo2e: null,
            toolCalls: 3,
            retries: 0,
          },
          net: { energyKwh: null, carbonKgCo2e: null, netPositive: null },
        },
      ],
    };
    const html = renderToStaticMarkup(
      createElement(LedgerDashboard, {
        initialLedger: incomplete,
        initialFileName: 'unknown-usage.json',
        view: 'reports',
      }),
    );
    expect(html).toContain('Unknown total · 18 reported');
    expect(html).toContain('Not established');
    expect(html).toContain('Some model usage is unknown');
    expect(html).not.toContain('Estimated analysis overhead is 0');
  });

  it('opens the isolated demo without misrepresenting a fleet run as demo evidence', () => {
    const html = render('dashboard', 'run=historic-run');
    expect(html).toContain('href="/dashboard/ai-efficiency-demo"');
    expect(html).not.toContain('/dashboard/ai-efficiency-demo?run=');
    expect(html).toContain('Your saved fleet findings and real applications are not changed.');
  });
  it.each<DashboardView>(['dashboard', 'agents', 'findings', 'review', 'trace'])(
    'keeps every %s navigation link bound to the selected historical run',
    (view) => {
      const html = render(view, 'run=historic-run&finding=reused-finding&agent=ai-efficiency');
      const links = dashboardLinks(html);
      expect(links.length).toBeGreaterThan(4);
      expect(links.every((url) => url.searchParams.get('run') === 'historic-run')).toBe(true);
      expect(html).toContain('Historic finding evidence');
      expect(html).not.toContain('New finding evidence');
    },
  );

  it('keeps the decision anchor and finding filter in run-bound review links', () => {
    const links = dashboardLinks(render('review', 'run=historic-run&finding=reused-finding'));
    const decision = links.find((url) => url.hash === '#human-decision');
    expect(decision?.searchParams.get('finding')).toBe('reused-finding');
    expect(decision?.searchParams.get('run')).toBe('historic-run');
    const trace = links.find(
      (url) => url.pathname === '/dashboard/trace' && url.searchParams.has('finding'),
    );
    expect(trace?.searchParams.get('finding')).toBe('reused-finding');
  });

  it('shows an unavailable run without exposing another run’s finding evidence', () => {
    const html = render('review', 'run=missing-run&finding=reused-finding');
    expect(html).toContain('Recorded run not available');
    expect(html).not.toContain('Historic finding evidence');
    expect(html).not.toContain('New finding evidence');
    expect(dashboardLinks(html).every((url) => url.searchParams.get('run') === 'missing-run')).toBe(
      true,
    );
  });

  it('defaults to the latest run and binds outgoing links to that run', () => {
    const html = render('review', 'finding=reused-finding');
    expect(html).toContain('New finding evidence');
    expect(html).not.toContain('Historic finding evidence');
    expect(dashboardLinks(html).every((url) => url.searchParams.get('run') === 'latest-run')).toBe(
      true,
    );
  });

  it('renders the specialist overview without the former large demo banner', () => {
    const html = render('dashboard', 'run=historic-run');
    expect(html).toContain('Orchestrator overview');
    expect(html).toContain('Your specialist agents');
    expect(html).toContain('AI Efficiency');
    expect(html).toContain('Disaster Recovery');
    expect(html).toContain('Collaboration');
    expect(html).not.toContain('Try a complete AI Efficiency workflow');
  });

  it('keeps the overview unavailable instead of leaking another run', () => {
    const html = render('dashboard', 'run=missing-run');
    expect(html).toContain('Recorded run not available');
    expect(html).not.toContain('Your specialist agents');
    expect(html).not.toContain('Historic finding evidence');
    expect(html).not.toContain('New finding evidence');
  });

  it('lets the dedicated module route take precedence over a conflicting agent query', () => {
    navigation.query = 'run=historic-run&agent=ai-efficiency';
    const html = renderToStaticMarkup(
      createElement(LedgerDashboard, {
        initialLedger: ledger,
        initialFileName: 'recorded-ledger.json',
        view: 'agents',
        initialAgentId: 'disaster-recovery',
      }),
    );
    expect(html).toContain('Disaster Recovery Agent');
    expect(html).not.toContain('Historic finding evidence');
    expect(html).toContain('/dashboard/agents/disaster-recovery?run=historic-run');
    expect(
      dashboardLinks(html).every((url) => url.searchParams.get('run') === 'historic-run'),
    ).toBe(true);
  });
});
