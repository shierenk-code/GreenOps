'use client';

import Link from 'next/link';
import { useCloud } from '../../cloud-client';
import { usePathname, useSearchParams, useRouter } from 'next/navigation';
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
  type MouseEvent,
} from 'react';
import {
  Activity,
  Sparkles,
  HardDrive,
  Zap,
  Compass,
  ShieldAlert,
  Users,
  CheckCircle,
  FileText,
  Terminal,
  Leaf,
  Sun,
  PanelLeft,
  Moon,
  Eye,
  RefreshCw,
  Upload,
  Search,
  Menu,
  X,
  Palette,
  ArrowUpRight,
  PanelLeftClose,
  Workflow,
} from 'lucide-react';
import { MAX_LEDGER_BYTES, validateLedger, selectLatestRun, type LedgerFile } from '../ledger-data';
import { selectDashboardRun } from '../dashboard-run';
import type { DashboardView } from '../ledger-dashboard';
import { useApprovalDecisions } from '../approval-inbox';
import { latestProposalDecision, type ApprovalInput } from '../approval-decisions';
import { buildRecordedData, buildSampleData, findingsFromRun } from './data';
import {
  SpecialistWorkspace,
  InvestigationPage,
  ResultsPage,
  ActivityPage,
  WORKSPACE_SECTIONS,
  type WorkspaceSection,
} from './workspace-pages';
import { ApprovalPage, ReviewDialog } from './audit-pages';
import { Notifications } from './notifications';
import { buildNotifications } from './notification-data';
import { ExecutiveOverview } from './executive-overview';
import {
  AGENT_IDS,
  CONTROL_TABS,
  SPECIALIST_KEYS,
  TAB_LABELS,
  type ControlTab,
  type ThemeName,
  type DataMode,
  type TimeRange,
  type AuditRow,
} from './types';
import { Empty } from './ui';
import styles from './control-plane.module.css';

const ICONS = {
  overview: Activity,
  ai: Sparkles,
  waste: HardDrive,
  carbon: Zap,
  arch: Compass,
  dr: ShieldAlert,
  collab: Users,
  pipeline: Workflow,
  approval: CheckCircle,
  ledger: FileText,
  meta: Terminal,
  investigations: Search,
  results: FileText,
  activity: Terminal,
};
const THEMES = [
  { id: 'sunset', name: 'GreenOps Studio', icon: Sun },
  { id: 'clean', name: 'Clean Enterprise Light', icon: Sun },
  { id: 'olive', name: 'Charcoal & Olive', icon: PanelLeft },
  { id: 'dark', name: 'Dark Cyber', icon: Moon },
  { id: 'forest', name: 'Sustainable Forest', icon: Leaf },
  { id: 'highContrast', name: 'High Contrast', icon: Eye },
] as const;
const SNAPSHOT_KEY = 'greenops.dashboard.uploadedSnapshot';
const SNAPSHOT_EVENT = 'greenops-dashboard-snapshot';
function subscribeSnapshot(callback: () => void) {
  window.addEventListener(SNAPSHOT_EVENT, callback);
  window.addEventListener('storage', callback);
  return () => {
    window.removeEventListener(SNAPSHOT_EVENT, callback);
    window.removeEventListener('storage', callback);
  };
}
function readSnapshot() {
  try {
    return sessionStorage.getItem(SNAPSHOT_KEY);
  } catch {
    return null;
  }
}
function serverSnapshot() {
  return null;
}
export function tabForView(view: DashboardView, agentId?: string): ControlTab {
  if (view === 'agents')
    return (Object.entries(AGENT_IDS).find(([, id]) => id === agentId)?.[0] as ControlTab) ?? 'ai';
  if (view === 'approvals' || view === 'review') return 'approval';
  if (view === 'findings') return 'investigations';
  if (view === 'improvements' || view === 'reports') return 'results';
  if (view === 'trace' || view === 'audits') return 'activity';
  return 'overview';
}
export interface ControlPlaneProps {
  initialLedger: LedgerFile | null;
  initialFileName: string;
  initialError?: string;
  view?: DashboardView;
  initialAgentId?: string;
  children?: ReactNode;
}

export default function ControlPlaneDashboard({
  initialLedger,
  initialFileName,
  initialError = '',
  view = 'dashboard',
  initialAgentId,
  children,
}: ControlPlaneProps) {
  const cloud = useCloud();
  const router = useRouter();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const mobileToggle = useRef<HTMLButtonElement>(null);
  const mobileCloseRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!mobileOpen) return;
    mobileCloseRef.current?.focus();
    const viewport = window.matchMedia('(max-width: 720px)');
    const closeOnDesktop = () => {
      if (!viewport.matches) setMobileOpen(false);
    };
    viewport.addEventListener('change', closeOnDesktop);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      viewport.removeEventListener('change', closeOnDesktop);
      document.body.style.overflow = previousOverflow;
    };
  }, [mobileOpen]);
  const pathname = usePathname();
  const search = useSearchParams();
  const query = search.toString();
  const requestedTab = CONTROL_TABS.includes(search.get('tab') as ControlTab)
    ? (search.get('tab') as ControlTab)
    : tabForView(view, initialAgentId);
  const mode: DataMode = search.get('data') === 'sample' ? 'sample' : 'recorded';
  const theme: ThemeName = THEMES.some((t) => t.id === search.get('theme'))
    ? (search.get('theme') as ThemeName)
    : 'sunset';
  const timeRange: TimeRange = ['24h', '7d', '30d', '1y'].includes(search.get('range') ?? '')
    ? (search.get('range') as TimeRange)
    : '30d';
  const section: WorkspaceSection = WORKSPACE_SECTIONS.includes(
    search.get('section') as WorkspaceSection,
  )
    ? (search.get('section') as WorkspaceSection)
    : 'findings';
  const cached = useSyncExternalStore(subscribeSnapshot, readSnapshot, serverSnapshot);
  const uploaded = useMemo(() => {
    try {
      if (!cached) return null;
      const value = JSON.parse(cached);
      return {
        ledger: validateLedger(value.ledger),
        fileName: typeof value.fileName === 'string' ? value.fileName : 'Imported results',
      };
    } catch {
      return null;
    }
  }, [cached]);
  const [loaded, setLoaded] = useState<{ ledger: LedgerFile; fileName: string } | null>(null);
  const ledger = cloud ? initialLedger : loaded?.ledger ?? uploaded?.ledger ?? initialLedger;
  const fileName = cloud ? initialFileName : loaded?.fileName ?? uploaded?.fileName ?? initialFileName;
  const requestedRun = search.get('run');
  const run = useMemo(() => selectDashboardRun(ledger, requestedRun), [ledger, requestedRun]);
  const findings = useMemo(() => findingsFromRun(run), [run]);
  const approvalStore = useApprovalDecisions(run, findings);
  const base = useMemo(
    () =>
      mode === 'sample'
        ? buildSampleData('All', timeRange)
        : buildRecordedData(run, findings, 'All', timeRange),
    [mode, run, findings, timeRange],
  );
  const [sampleDecisions, setSampleDecisions] = useState<
    Array<{ id: string; input: ApprovalInput; at: string }>
  >([]);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const loadRequest = useRef(0);
  const data = useMemo(() => {
    const opportunities = base.opportunities.map((opportunity) => {
      const proposal = approvalStore.proposals.find((p) => p.id === opportunity.id);
      const recordedDecision = proposal
        ? latestProposalDecision(proposal, approvalStore.records)
        : null;
      const demoHistory = sampleDecisions.filter((item) => item.id === opportunity.id);
      const demo = demoHistory.at(-1);
      const decision = mode === 'sample' ? demo?.input.decision : recordedDecision?.decision;
      const recordedHistory = approvalStore.records.filter(
        (record) => record.runId === run?.runId && record.findingId === opportunity.id,
      );
      return {
        ...opportunity,
        status:
          decision && !['verified', 'applied'].includes(opportunity.status)
            ? decision
            : opportunity.status,
        history:
          mode === 'sample'
            ? [
                ...opportunity.history,
                ...demoHistory.map((item) => ({
                  label: 'Simulated decision',
                  value: `${item.at} · ${item.input.decision}. ${item.input.reviewer}: ${item.input.reason}`,
                })),
              ]
            : [
                ...opportunity.history,
                ...recordedHistory.map((record) => ({
                  label:
                    record.fingerprint === proposal?.fingerprint
                      ? 'Local plan decision'
                      : 'Previous-evidence decision',
                  value: `${record.recordedAt} · ${record.decision}. ${record.reviewer}: ${record.reason}`,
                })),
              ],
      };
    });
    const ids = new Set(opportunities.map((o) => o.id));
    const localRows: AuditRow[] =
      mode === 'sample'
        ? sampleDecisions
            .filter(({ id }) => ids.has(id))
            .map((decision, index) => ({
              kind: 'sample',
              id: `sample-review-${decision.id}-${index}`,
              timestamp: decision.at,
              agent:
                base.agents.find(
                  (a) => a.key === opportunities.find((o) => o.id === decision.id)?.agentKey,
                )?.name ?? 'Sample agent',
              action: `Simulated plan ${decision.input.decision}: ${opportunities.find((o) => o.id === decision.id)?.title ?? decision.id}`,
              costSavings: 'Not realized',
              carbonSaved: 'Not verified',
              status: 'Simulated review only',
              findingId: decision.id,
            }))
        : approvalStore.records
            .filter((record) => ids.has(record.findingId))
            .map((record) => ({
              kind: 'local-decision',
              id: record.id,
              timestamp: record.recordedAt,
              agent: 'Human review',
              action: `Plan ${record.decision}: ${record.title}`,
              costSavings: 'Not realized',
              carbonSaved: 'Not verified',
              status: 'Local decision only',
              findingId: record.findingId,
            }));
    return {
      ...base,
      opportunities,
      executiveMetrics: base.executiveMetrics.map((metric) =>
        mode === 'recorded' && metric.label === 'Opportunities to review'
          ? {
              ...metric,
              value: String(
                opportunities.filter(
                  (item) => item.status === 'pending' || item.status === 'revision-requested',
                ).length,
              ),
            }
          : metric,
      ),
      ledger: [...localRows, ...base.ledger],
    };
  }, [base, mode, sampleDecisions, approvalStore.proposals, approvalStore.records, run?.runId]);
  const initialFinding = search.get('finding');
  const selectedId = initialFinding;
  const linkedOpportunity = data.opportunities.find((o) => o.id === initialFinding);
  const activeTab =
    !CONTROL_TABS.includes(search.get('tab') as ControlTab) && linkedOpportunity
      ? linkedOpportunity.agentKey
      : requestedTab;
  const selectedOpportunity =
    data.opportunities.find(
      (o) =>
        o.id === selectedId &&
        (o.agentKey === activeTab ||
          ['approval', 'investigations', 'results', 'activity'].includes(activeTab)),
    ) ?? null;
  const activeAgent = data.agents.find((agent) => agent.key === activeTab);
  const missingRun = mode === 'recorded' && requestedRun !== null && !run;
  const pendingCount = data.opportunities.filter(
    (o) => o.status === 'pending' || o.status === 'revision-requested',
  ).length;
  const notifications = buildNotifications(data, {
    unavailable: missingRun || (mode === 'recorded' && !run),
    loadFailed: Boolean(error),
  });
  function href(tab: ControlTab, patch: Record<string, string | null> = {}) {
    const params = new URLSearchParams(query);
    params.set('tab', tab);
    params.delete('finding');
    params.delete('agent');
    params.delete('env');
    if (tab !== activeTab) params.delete('section');
    params.delete('sandbox');
    if (tab !== 'investigations') params.delete('q');
    if (mode === 'recorded' && run) params.set('run', run.runId);
    for (const [key, value] of Object.entries(patch)) {
      if (value === null) params.delete(key);
      else params.set(key, value);
    }
    return `/dashboard?${params.toString()}`;
  }
  function update(patch: Record<string, string | null>) {
    const appearanceOnly = Object.keys(patch).length === 1 && 'theme' in patch;
    const destination = href(activeTab, {
      ...patch,
      ...(appearanceOnly && search.get('sandbox') === '1' ? { sandbox: '1' } : {}),
      ...(appearanceOnly && selectedOpportunity ? { finding: selectedOpportunity.id } : {}),
    });
    // View controls operate on the loaded snapshot without refetching the whole ledger.
    window.history.pushState(null, '', `${pathname}${destination.slice(destination.indexOf('?'))}`);
  }
  function navigateTab(event: MouseEvent<HTMLAnchorElement>) {
    if (
      pathname !== '/dashboard' ||
      children ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    )
      return;
    event.preventDefault();
    window.history.pushState(null, '', event.currentTarget.href);
    window.scrollTo({ top: 0, behavior: 'instant' });
  }
  function review(id: string) {
    window.history.pushState(
      null,
      '',
      `${pathname}?${href(activeTab, { finding: id }).split('?')[1]}`,
    );
  }
  function closeReview() {
    window.history.pushState(null, '', `${pathname}?${href(activeTab).split('?')[1]}`);
  }
  async function saveDecision(id: string, input: ApprovalInput) {
    if (mode === 'recorded') return approvalStore.save(id, input);
    if (!data.opportunities.some((op) => op.id === id))
      return { ok: false, message: 'This sample proposal is no longer in the selected view.' };
    if (
      !input.reviewer.trim() ||
      input.reviewer.length > 120 ||
      input.reason.trim().length < 8 ||
      input.reason.length > 2000 ||
      !input.acknowledged ||
      !['approved', 'rejected', 'revision-requested'].includes(input.decision)
    )
      return {
        ok: false,
        message:
          'Enter a reviewer and a reason of at least 8 characters, choose a decision, and acknowledge the simulation scope.',
      };
    setSampleDecisions((current) => [
      ...current,
      {
        id,
        input: { ...input, reviewer: input.reviewer.trim(), reason: input.reason.trim() },
        at: new Date().toISOString(),
      },
    ]);
    return {
      ok: true,
      message:
        'Simulated review recorded for this session. No workload was changed and no savings were verified.',
    };
  }
  function selectLoaded(next: LedgerFile, name: string, persist: boolean) {
    closeReview();
    setLoaded({ ledger: next, fileName: name });
    try {
      if (persist)
        sessionStorage.setItem(SNAPSHOT_KEY, JSON.stringify({ ledger: next, fileName: name }));
      else sessionStorage.removeItem(SNAPSHOT_KEY);
      window.dispatchEvent(new Event(SNAPSHOT_EVENT));
    } catch {
      setNotice('Results loaded for this page. Browser storage is unavailable.');
    }
    update({ data: 'recorded', run: selectLatestRun(next)?.runId ?? null });
  }
  async function importFile(file?: File) {
    if (cloud) { setError('Use your connected terminal to sync recorded evidence.'); return; }
    if (!file) return;
    const request = ++loadRequest.current;
    setRefreshing(false);
    setError('');
    try {
      if (file.size > MAX_LEDGER_BYTES) throw new Error();
      const next = validateLedger(JSON.parse(await file.text()));
      if (request !== loadRequest.current) return;
      selectLoaded(next, file.name, true);
      setNotice('Imported analysis loaded. No new scan or model call was started.');
    } catch {
      if (request === loadRequest.current)
        setError(
          'Choose a valid GreenOps ledger JSON file, no larger than 20 MiB. Your previous results are unchanged.',
        );
    }
  }
  async function refresh() {
    if (cloud) { router.refresh(); setNotice('Refreshing your account’s recorded evidence.'); return; }
    const request = ++loadRequest.current;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    setRefreshing(true);
    setError('');
    try {
      const response = await fetch('/dashboard/latest-ledger', {
        cache: 'no-store',
        signal: controller.signal,
      });
      if (!response.ok) throw new Error();
      const result = await response.json();
      const next = validateLedger(result.ledger);
      if (request !== loadRequest.current) return;
      selectLoaded(
        next,
        typeof result.fileName === 'string' ? result.fileName : 'Saved analysis',
        false,
      );
      setNotice('Latest saved results loaded. No new scan or model call was started.');
    } catch {
      if (request === loadRequest.current)
        setError(
          'Latest results could not be loaded. Run an analysis or import results; your current view has been kept.',
        );
    } finally {
      clearTimeout(timeout);
      if (request === loadRequest.current) setRefreshing(false);
    }
  }
  return (
    <div
      className={styles.root}
      data-theme={theme}
      data-collapsed={sidebarCollapsed}
      data-nav-open={mobileOpen}
    >
      <a className={styles.skip} href="#control-plane-content">
        Skip to dashboard
      </a>
      {mobileOpen && (
        <button
          type="button"
          className={styles.navBackdrop}
          aria-label="Close navigation"
          onClick={() => {
            setMobileOpen(false);
            mobileToggle.current?.focus();
          }}
        />
      )}
      <aside
        id="workspace-navigation"
        role={mobileOpen ? 'dialog' : undefined}
        aria-modal={mobileOpen ? true : undefined}
        aria-label="Workspace navigation"
        className={styles.sidebar}
        onKeyDown={(event) => {
          if (event.key === 'Tab' && mobileOpen) {
            const controls = event.currentTarget.querySelectorAll<HTMLElement>(
              'a[href], button:not(:disabled)',
            );
            const first = controls[0],
              last = controls[controls.length - 1];
            if (event.shiftKey && document.activeElement === first) {
              event.preventDefault();
              last?.focus();
            } else if (!event.shiftKey && document.activeElement === last) {
              event.preventDefault();
              first?.focus();
            }
          }
          if (event.key === 'Escape') {
            setMobileOpen(false);
            mobileToggle.current?.focus();
          }
        }}
      >
        <button
          type="button"
          ref={mobileCloseRef}
          className={styles.mobileClose}
          aria-label="Close navigation"
          onClick={() => {
            setMobileOpen(false);
            mobileToggle.current?.focus();
          }}
        >
          <X size={20} />
        </button>
        <div className={styles.brand}>
          <span className={styles.brandIcon}>
            <Leaf size={24} aria-hidden="true" />
          </span>
          <div>
            <strong>GreenOps</strong>
            <p>Sustainability workspace</p>
          </div>
        </div>
        <nav
          className={styles.sideNav}
          aria-label="Control plane pages"
          onClick={() => setMobileOpen(false)}
        >
          {CONTROL_TABS.map((tab) => {
            const Icon = ICONS[tab];
            return (
              <div key={tab}>
                {tab === 'overview' && <p className={styles.navGroup}>Workspace</p>}
                {tab === 'carbon' && <p className={styles.navGroup}>Specialists</p>}
                {tab === 'results' && <p className={styles.navGroup}>Evidence</p>}
                <Link
                  href={href(tab)}
                  prefetch={false}
                  onClick={navigateTab}
                  title={TAB_LABELS[tab]}
                  aria-label={TAB_LABELS[tab]}
                  aria-current={activeTab === tab ? 'page' : undefined}
                >
                  <Icon size={19} aria-hidden="true" />
                  <span>{TAB_LABELS[tab]}</span>
                  {tab === 'approval' && (
                    <b
                      className={styles.approvalCount}
                      aria-label={`${pendingCount} pending reviews`}
                    >
                      {pendingCount}
                    </b>
                  )}
                </Link>
              </div>
            );
          })}
        </nav>
        <div className={styles.sidebarBottom}>
          <div className={styles.sidebarNote}>
            <Leaf size={22} aria-hidden="true" />
            <strong>Make room for better.</strong>
            <p>Explore a complete decision loop in the synthetic sandbox.</p>
            <Link
              href={href('waste', { sandbox: '1' })}
              onClick={(event) => {
                setMobileOpen(false);
                navigateTab(event);
              }}
            >
              Explore sandbox <ArrowUpRight size={15} aria-hidden="true" />
            </Link>
          </div>
          <Link href="/" className={styles.homeLink}>
            GreenOps Engineering <ArrowUpRight size={14} aria-hidden="true" />
          </Link>
        </div>
      </aside>
      <div className={styles.workspace} inert={mobileOpen || undefined}>
        <nav className={styles.studioNav} aria-label="Workspace shortcuts">
          <Link href={href('overview')} onClick={navigateTab} className={styles.studioBrand}>
            <svg viewBox="0 0 40 40" width="32" height="32" aria-hidden="true">
              <path fill="#ffb000" d="M16 0h16v8H16zM8 8h24v8H8z" />
              <path fill="#ff8200" d="M0 16h32v8H0zM8 24h16v8H8z" />
              <path fill="#fa501f" d="M16 16h8v24h-8zM8 32h24v8H8z" />
            </svg>
            GreenOps
          </Link>
          <Link
            href={href('overview')}
            onClick={navigateTab}
            aria-current={activeTab === 'overview' ? 'page' : undefined}
          >
            Overview
          </Link>
          <details
            className={styles.studioMenu}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                event.currentTarget.removeAttribute('open');
                event.currentTarget.querySelector('summary')?.focus();
              }
            }}
          >
            <summary>
              Specialists <span aria-hidden="true">⌄</span>
            </summary>
            <div className={styles.studioDropdown}>
              <p>Seven perspectives. One footprint.</p>
              {CONTROL_TABS.filter((tab) => (SPECIALIST_KEYS as ControlTab[]).includes(tab)).map(
                (tab) => (
                  <Link
                    key={tab}
                    href={href(tab)}
                    aria-current={activeTab === tab ? 'page' : undefined}
                    onClick={(event) => {
                      event.currentTarget.closest('details')?.removeAttribute('open');
                      navigateTab(event);
                    }}
                  >
                    {TAB_LABELS[tab]} <ArrowUpRight size={15} />
                  </Link>
                ),
              )}
            </div>
          </details>
          <Link
            href={href('investigations')}
            onClick={navigateTab}
            aria-current={activeTab === 'investigations' ? 'page' : undefined}
          >
            Investigations
          </Link>
          <details
            className={styles.studioMenu}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                event.currentTarget.removeAttribute('open');
                event.currentTarget.querySelector('summary')?.focus();
              }
            }}
          >
            <summary>
              Evidence <span aria-hidden="true">⌄</span>
            </summary>
            <div className={styles.studioDropdown}>
              {(['results', 'activity'] as const).map((tab) => (
                <Link
                  key={tab}
                  href={href(tab)}
                  aria-current={activeTab === tab ? 'page' : undefined}
                  onClick={(event) => {
                    event.currentTarget.closest('details')?.removeAttribute('open');
                    navigateTab(event);
                  }}
                >
                  {TAB_LABELS[tab]} <ArrowUpRight size={15} />
                </Link>
              ))}
            </div>
          </details>
          <Link className={styles.studioCta} href={href('approval')} onClick={navigateTab}>
            Review decisions <span>{pendingCount}</span> <ArrowUpRight size={16} />
          </Link>
        </nav>
        <header className={styles.header}>
          <div className={styles.headerIdentity}>
            <button
              type="button"
              className={styles.collapseToggle}
              aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              aria-expanded={!sidebarCollapsed}
              aria-controls="workspace-navigation"
              onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            >
              <PanelLeftClose size={18} aria-hidden="true" />
            </button>
            <button
              ref={mobileToggle}
              type="button"
              className={styles.mobileToggle}
              aria-label="Toggle navigation"
              aria-expanded={mobileOpen}
              aria-controls="workspace-navigation"
              onClick={() => setMobileOpen(!mobileOpen)}
            >
              <Menu size={20} aria-hidden="true" />
            </button>
            <div>
              <span className={styles.breadcrumb}>GREENOPS / WORKSPACE</span>
              <h1>
                {TAB_LABELS[activeTab]}
                {selectedOpportunity ? ' / Finding review' : ''}
              </h1>
            </div>
          </div>
          <div className={styles.controls}>
            <form
              className={styles.globalSearch}
              role="search"
              onSubmit={(event) => {
                event.preventDefault();
                const form = new FormData(event.currentTarget);
                const destination = href('investigations', { q: String(form.get('search') ?? '') });
                if (pathname !== '/dashboard' || children) window.location.assign(destination);
                else window.history.pushState(null, '', destination);
              }}
            >
              <Search size={16} aria-hidden="true" />
              <input
                name="search"
                aria-label="Search all findings"
                placeholder="Search findings or resources"
                type="search"
              />
              <button type="submit" aria-label="Search">
                Go
              </button>
            </form>
            <label>
              Data
              <select
                aria-label="Dashboard data source"
                value={mode}
                onChange={(event) => update({ data: event.target.value })}
              >
                <option value="recorded">Recorded analysis</option>
                <option value="sample">Sample scenarios</option>
              </select>
            </label>
            <select
              aria-label="Analysis time range"
              value={timeRange}
              onChange={(event) => update({ range: event.target.value })}
            >
              <option value="24h">Last 24 Hours</option>
              <option value="7d">Last 7 Days</option>
              <option value="30d">Last 30 Days</option>
              <option value="1y">Last Year</option>
            </select>
            <details className={styles.appearance}>
              <summary aria-label="Choose appearance" title="Choose appearance">
                <Palette size={18} aria-hidden="true" />
              </summary>
              <div className={styles.themePopover}>
                <p>Make it your workspace</p>
                <div className={styles.themes} role="group" aria-label="Dashboard theme">
                  {THEMES.map((option) => {
                    const Icon = option.icon;
                    return (
                      <button
                        key={option.id}
                        type="button"
                        title={option.name}
                        aria-label={option.name}
                        aria-pressed={theme === option.id}
                        onClick={() => update({ theme: option.id === 'sunset' ? null : option.id })}
                      >
                        <Icon size={16} aria-hidden="true" />
                      </button>
                    );
                  })}
                </div>
              </div>
            </details>
            <Notifications
              items={notifications}
              href={(item) => href(item.tab, item.findingId ? { finding: item.findingId } : {})}
              onNavigate={navigateTab}
            />
          </div>
        </header>
        <div className={styles.datasetBar}>
          <div className={styles.datasetInfo}>
            {mode === 'sample' ? (
              <span className={styles.sampleNotice}>
                Sample data only. Reviews are simulated; no changes or savings are real.
              </span>
            ) : (
              <span>
                {run ? 'Saved analysis' : 'No recorded analysis'}
                {data.asOf
                  ? ` · ${new Date(data.asOf).toLocaleDateString('en-GB', { timeZone: 'UTC', day: 'numeric', month: 'short', year: 'numeric' })}`
                  : ''}
              </span>
            )}
            <details className={styles.scopeDetails}>
              <summary>Scope &amp; assumptions</summary>
              <p>{data.filterNote}</p>
            </details>
          </div>
          <div className={styles.datasetActions}>
            <button
              type="button"
              className={styles.textButton}
              disabled={refreshing}
              data-loading={refreshing}
              aria-busy={refreshing}
              onClick={() => void refresh()}
            >
              <RefreshCw size={14} aria-hidden="true" />
              {refreshing ? 'Refreshing…' : 'Refresh results'}
            </button>
            <button
              type="button"
              className={styles.textButton}
              onClick={() => inputRef.current?.click()}
            >
              <Upload size={14} aria-hidden="true" />
              Import results
            </button>
            <input
              ref={inputRef}
              type="file"
              accept=".json,application/json"
              hidden
              aria-label="Import a GreenOps ledger"
              onChange={(event) => {
                const file = event.currentTarget.files?.[0];
                event.currentTarget.value = '';
                void importFile(file);
              }}
            />
          </div>
        </div>
        <main className={styles.main} id="control-plane-content" tabIndex={-1}>
          {error && (
            <p className={styles.error} role="alert">
              {error}
            </p>
          )}
          {notice && (
            <p className={styles.notice} role="status">
              {notice}
            </p>
          )}
          <div className={styles.viewTransition} key={activeTab} data-view={activeTab}>
            {children ? (
              <div className={styles.embedded}>{children}</div>
            ) : missingRun ? (
              <Empty>
                This recorded run is unavailable. Refresh or import its results; another run has not
                been substituted.
              </Empty>
            ) : mode === 'recorded' && !run ? (
              <>
                <Empty>
                  {initialError
                    ? 'No saved analysis is available.'
                    : 'No recorded analysis loaded.'}{' '}
                  Import results or choose Sample scenarios to explore every dashboard page.
                </Empty>
                {activeTab === 'overview' && (
                  <ExecutiveOverview data={data} href={href} onNavigate={navigateTab} />
                )}
              </>
            ) : selectedOpportunity ? (
              <button type="button" className={styles.textButton} onClick={closeReview}>
                ← Back to {TAB_LABELS[activeTab]}
              </button>
            ) : selectedId ? (
              <Empty>
                This finding is unavailable in the selected run or filters. Clear the finding
                selection or adjust the time range.{' '}
                <button type="button" onClick={closeReview}>
                  Back to workspace
                </button>
              </Empty>
            ) : activeTab === 'overview' ? (
              <ExecutiveOverview data={data} href={href} onNavigate={navigateTab} />
            ) : activeAgent ? (
              <SpecialistWorkspace
                agent={activeAgent}
                data={data}
                onReview={review}
                section={section}
                sandbox={search.get('sandbox') === '1'}
                href={href}
                onNavigate={navigateTab}
              />
            ) : activeTab === 'investigations' ? (
              <InvestigationPage
                key={search.get('q') ?? ''}
                data={data}
                onReview={review}
                query={search.get('q') ?? ''}
              />
            ) : activeTab === 'results' ? (
              <ResultsPage data={data} onReview={review} />
            ) : activeTab === 'activity' ? (
              <ActivityPage data={data} onReview={review} />
            ) : activeTab === 'approval' ? (
              <ApprovalPage data={data} onReview={review} />
            ) : (
              <Empty>Select an agent to review its findings and recommendations.</Empty>
            )}
          </div>
          <ReviewDialog
            inline
            fullPage
            key={`${mode}-${base.runId}-${selectedOpportunity?.id ?? 'closed'}-${approvalStore.proposals.find((proposal) => proposal.id === selectedOpportunity?.id)?.fingerprint ?? 'sample'}`}
            opportunity={selectedOpportunity}
            mode={mode}
            onClose={closeReview}
            onSave={saveDecision}
            canSave={
              mode === 'sample' ||
              (approvalStore.ready &&
                approvalStore.proposals.some((p) => p.id === selectedOpportunity?.id))
            }
            storageError={
              mode === 'recorded'
                ? approvalStore.error ||
                  (approvalStore.ready &&
                  !approvalStore.proposals.some(
                    (proposal) => proposal.id === selectedOpportunity?.id,
                  )
                    ? 'No approvable recommendation was recorded for this finding. Review its evidence and run an analysis with a recommendation before making a plan decision.'
                    : null)
                : null
            }
          />
        </main>
        <footer className={styles.footer}>
          GreenOps Digital Sustainability Control Plane · Human-reviewed improvements · Measurable
          outcomes
          {mode === 'recorded' && fileName && (
            <details>
              <summary>Analysis source</summary>
              {fileName}
            </details>
          )}
        </footer>
      </div>
    </div>
  );
}
