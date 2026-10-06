'use client';

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { summarizeRecommendationSources } from './recommendation-source';
import { getWorkflowStage } from './dashboard-workflow';
import { AgentDetailView, RunTraceView } from './dashboard-audit-views';
import { resolveRecordedRecommendation } from './dashboard-audit';
import { selectDashboardRun, withRecordedRun } from './dashboard-run';
import OrchestratorOverview from './orchestrator-overview';
import AgentModuleView from './agent-module-view';
import { agentModulePath } from './agent-paths';
import { WorkspaceSidebar } from './workspace-sidebar';
import { OverviewImpactSummary } from './overview-impact-summary';
import {
  ApprovalInbox,
  ApprovalDecisionHistory,
  FindingApprovalPanel,
  useApprovalDecisions,
} from './approval-inbox';
import styles from './dashboard.module.css';
import {
  FindingDetail,
  FindingTable,
  Metric,
  ModelRunStatus,
  Panel,
  SmallStat,
} from './dashboard-components';
import { asRecord, text, entryFor, formatMeasuredEnergy, formatCarbon } from './dashboard-format';
import {
  MAX_LEDGER_BYTES,
  selectLatestRun,
  validateLedger,
  type LedgerEntry,
  type LedgerFile,
} from './ledger-data';
import {
  Activity,
  ClipboardList,
  ArrowRight,
  ListFilter,
  Wrench,
  BrainCircuit,
  CheckCircle2,
  ChevronRight,
  Database,
  FileJson,
  GitBranch,
  Leaf,
  RefreshCcw,
  Search,
  ShieldCheck,
  Upload,
  Users,
  Workflow,
  Zap,
  X,
} from 'lucide-react';

export interface Finding {
  bugId: string;
  agentId: string;
  agentName: string;
  category: string;
  severity: string;
  title: string;
  state: 'verified' | 'unverified' | 'not-applied' | 'withheld' | 'in-progress' | 'review-only';
  impactEnergyKwh: number;
  impactCarbonKg: number;
  confidence: 'high' | 'medium' | 'low' | 'unknown';
  effort: string;
  recommendationId: string;
  recommendationTitle: string;
  recommendation: string;
  expectedReductionFactor: number;
  reversible: boolean;
  nativeMetric?: { metric: string; perRun: number; unit: string };
  entries: LedgerEntry[];
}

export type DashboardView =
  | 'dashboard'
  | 'audits'
  | 'agents'
  | 'findings'
  | 'improvements'
  | 'reports'
  | 'review'
  | 'trace'
  | 'approvals';

const PAGE_META: Record<DashboardView, { title: string; description: string }> = {
  dashboard: {
    title: 'Orchestrator overview',
    description: 'Your agents, their findings, and the next decisions to make.',
  },
  audits: {
    title: 'From finding to improvement',
    description: 'Explore what your agents found and choose the next step.',
  },
  agents: {
    title: 'Specialist agents',
    description: 'See what each agent checks and the improvements it recommends.',
  },
  findings: {
    title: 'Priority findings',
    description: 'Choose a problem to understand it, compare options, and take action.',
  },
  improvements: {
    title: 'Improvements',
    description: 'Plan your next change and check the results of changes already made.',
  },
  reports: {
    title: 'Impact reports',
    description: 'See the results of verified changes and explore potential savings.',
  },
  review: {
    title: 'Review a recommendation',
    description: 'Check the evidence, understand the trade-offs, and decide on the next change.',
  },
  trace: {
    title: 'Run trace',
    description: 'Follow recorded agent activity, decisions, and verification results.',
  },
  approvals: {
    title: 'Approval inbox',
    description: 'Review proposed changes and record a decision before planning implementation.',
  },
};

const AGENTS = [
  {
    id: 'carbon-incident',
    name: 'Carbon Efficiency',
    scope: 'Energy and carbon spikes',
    icon: Activity,
    color: 'amber',
  },
  {
    id: 'digital-waste',
    name: 'Digital Waste',
    scope: 'Compute, storage, images',
    icon: Database,
    color: 'emerald',
  },
  {
    id: 'ai-efficiency',
    name: 'AI Efficiency',
    scope: 'Tokens, retries, caching',
    icon: BrainCircuit,
    color: 'cyan',
  },
  {
    id: 'architecture',
    name: 'Architecture',
    scope: 'IaC, sizing, regions',
    icon: GitBranch,
    color: 'blue',
  },
  {
    id: 'disaster-recovery',
    name: 'Disaster Recovery',
    scope: 'Replication, RTO/RPO',
    icon: RefreshCcw,
    color: 'violet',
  },
  {
    id: 'collaboration',
    name: 'Collaboration',
    scope: 'Recordings and retention',
    icon: Users,
    color: 'pink',
  },
  {
    id: 'pipeline-efficiency',
    name: 'Pipeline Efficiency',
    scope: 'CI/CD caches, runs, artifacts',
    icon: Workflow,
    color: 'emerald',
  },
  {
    id: 'code-analysis',
    name: 'Code Review',
    scope: 'Source code and pull requests',
    icon: GitBranch,
    color: 'blue',
  },
] as const;

const CATEGORY_AGENT: Record<string, string> = {
  'uncached-completion': 'ai-efficiency',
  'oversized-token-request': 'ai-efficiency',
  'ai-retry-storm': 'ai-efficiency',
  'prompt-overhead': 'ai-efficiency',
  'model-tier-mismatch': 'ai-efficiency',
  'overprovisioned-compute': 'digital-waste',
  'unattached-storage': 'digital-waste',
  'oversized-image': 'digital-waste',
  'verbose-logging': 'digital-waste',
  'idle-compute': 'digital-waste',
  'off-hours-runtime': 'digital-waste',
  'carbon-anomaly': 'carbon-incident',
  'no-autoscale': 'architecture',
  'high-carbon-region': 'architecture',
  'inefficient-sizing': 'architecture',
  'over-replication': 'disaster-recovery',
  'idle-standby': 'disaster-recovery',
  'rto-rpo-mismatch': 'disaster-recovery',
  'redundant-recording': 'collaboration',
  'excessive-retention': 'collaboration',
  'pipeline-cache-miss': 'pipeline-efficiency',
  'redundant-pipeline-run': 'pipeline-efficiency',
  'artifact-bloat': 'pipeline-efficiency',
};
const SEVERITY_RANK: Record<string, number> = { critical: 4, high: 3, medium: 2, low: 1 };
const CONFIDENCE_RANK: Record<Finding['confidence'], number> = {
  high: 3,
  medium: 2,
  low: 1,
  unknown: 0,
};
const EFFORT_RANK: Record<string, number> = {
  trivial: 4,
  small: 3,
  moderate: 2,
  medium: 2,
  large: 1,
};
const number = (value: unknown) =>
  typeof value === 'number' && Number.isFinite(value) ? value : 0;

function describeNetEnergy(kwh: number | null | undefined): string {
  if (typeof kwh !== 'number' || !Number.isFinite(kwh)) return 'Not established';
  if (kwh === 0) return 'No net change';
  return `${formatMeasuredEnergy(Math.abs(kwh))} ${kwh > 0 ? 'saving' : 'increase'}`;
}

function friendlyDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return 'Completion time unavailable';
  return `Completed ${date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })} at ${date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: true })}`;
}

function stateFor(entries: LedgerEntry[]): Finding['state'] {
  if (
    entryFor(entries, 'improve')?.data.applied === true &&
    entryFor(entries, 'verify')?.data.confirmed === true
  )
    return 'verified';
  if (entryFor(entries, 'improve')?.data.applied === true) return 'unverified';
  const source = entryFor(entries, 'detect')?.data.source;
  if ((source === 'local' || source === 'github') && !entryFor(entries, 'improve'))
    return 'review-only';
  if (entryFor(entries, 'approve')?.data.approved === false) return 'withheld';
  if (entryFor(entries, 'improve')?.data.applied === false) return 'not-applied';
  return 'in-progress';
}

const SNAPSHOT_KEY = 'greenops.dashboard.uploadedSnapshot';
const SNAPSHOT_EVENT = 'greenops-dashboard-snapshot';
const serverSnapshot = () => '';
function readSnapshot() {
  try {
    return window.sessionStorage.getItem(SNAPSHOT_KEY) ?? '';
  } catch {
    return '';
  }
}
function subscribeSnapshot(callback: () => void) {
  window.addEventListener('storage', callback);
  window.addEventListener(SNAPSHOT_EVENT, callback);
  return () => {
    window.removeEventListener('storage', callback);
    window.removeEventListener(SNAPSHOT_EVENT, callback);
  };
}

interface DashboardProps {
  initialLedger: LedgerFile | null;
  initialFileName: string;
  initialError?: string;
  view?: DashboardView;
  initialAgentId?: string;
}

interface LoadedLedger {
  ledger: LedgerFile;
  fileName: string;
  source: 'saved' | 'uploaded';
}

export default function LedgerDashboard(props: DashboardProps) {
  const searchParams = useSearchParams();
  const lastEntry = props.initialLedger?.entries.at(-1);
  const lastOutcome = props.initialLedger?.outcomes.at(-1);
  // Keep explicitly loaded data across query changes, while a new server
  // snapshot resets it. Filters still reset with each route/query workspace.
  const identity = JSON.stringify([
    props.view,
    props.initialAgentId,
    props.initialFileName,
    lastEntry?.runId,
    lastEntry?.seq,
    lastEntry?.timestamp,
    lastOutcome?.finishedAt,
  ]);
  const [loaded, setLoaded] = useState<{ identity: string; value: LoadedLedger } | null>(null);
  return (
    <LedgerWorkspace
      key={JSON.stringify([identity, searchParams.toString()])}
      {...props}
      searchQuery={searchParams.toString()}
      loaded={loaded?.identity === identity ? loaded.value : null}
      onLoad={(value) => setLoaded({ identity, value })}
    />
  );
}

function LedgerWorkspace({
  initialLedger,
  initialFileName,
  initialError = '',
  view = 'dashboard',
  initialAgentId,
  searchQuery,
  loaded,
  onLoad,
}: DashboardProps & {
  searchQuery: string;
  loaded: LoadedLedger | null;
  onLoad: (value: LoadedLedger) => void;
}) {
  const router = useRouter();
  const params = new URLSearchParams(searchQuery);
  const inputRef = useRef<HTMLInputElement>(null);
  const loadRequest = useRef(0);
  const findingsRef = useRef<HTMLElement>(null);
  const journeyRef = useRef<HTMLElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const drawerBodyRef = useRef<HTMLDivElement>(null);
  const [detailOpen, setDetailOpen] = useState(
    view === 'findings' && Boolean(params.get('finding')),
  );
  const [journeyStep, setJourneyStep] = useState<'detect' | 'review' | 'change' | 'verify'>(
    'review',
  );
  const cachedSnapshot = useSyncExternalStore(subscribeSnapshot, readSnapshot, serverSnapshot);
  const uploaded = useMemo(() => {
    if (!cachedSnapshot) return null;
    try {
      const snapshot = asRecord(JSON.parse(cachedSnapshot));
      return {
        ledger: validateLedger(snapshot.ledger),
        fileName: text(snapshot.fileName, 'Uploaded ledger'),
        source: 'uploaded' as const,
      };
    } catch {
      return null;
    }
  }, [cachedSnapshot]);
  const current = loaded ?? uploaded;
  const ledger = current?.ledger ?? initialLedger;
  const fileName = current?.fileName ?? initialFileName;
  const source = current?.source ?? 'saved';
  const [loadError, setError] = useState('');
  const error = loadError || (!ledger ? initialError : '');
  const [loadingLatest, setLoadingLatest] = useState(false);
  const [notice, setNotice] = useState('');
  const [query, setQuery] = useState('');
  const [stateFilter, setStateFilter] = useState<'all' | Finding['state']>(() => {
    const requested = params.get('state');
    return requested &&
      ['verified', 'unverified', 'not-applied', 'withheld', 'in-progress', 'review-only'].includes(
        requested,
      )
      ? (requested as Finding['state'])
      : 'all';
  });
  const [severityFilter, setSeverityFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [agentFilter, setAgentFilter] = useState(() => {
    const requestedAgent = initialAgentId ?? params.get('agent');
    return AGENTS.some((agent) => agent.id === requestedAgent) ? requestedAgent! : 'all';
  });
  const [recommendationFilter, setRecommendationFilter] = useState(
    params.get('recommendation') || 'all',
  );
  const [sortBy, setSortBy] = useState<'impact' | 'severity' | 'confidence'>('severity');
  const [selectedBug, setSelectedBug] = useState<string | null>(params.get('finding'));

  const requestedRunId = params.get('run');
  const run = useMemo(() => selectDashboardRun(ledger, requestedRunId), [ledger, requestedRunId]);
  const runHref = (href: string) => withRecordedRun(href, run?.runId ?? requestedRunId);
  const unavailableRun = requestedRunId !== null && !run;
  const outcome = run?.outcome;
  const reviewOnly = run?.kind === 'review';
  const findings = useMemo<Finding[]>(() => {
    const grouped = new Map<string, LedgerEntry[]>();
    for (const entry of run?.entries ?? [])
      grouped.set(entry.bugId, [...(grouped.get(entry.bugId) ?? []), entry]);
    return [...grouped.entries()]
      .map(([bugId, entries]) => {
        const detect = entryFor(entries, 'detect');
        const simulate = entryFor(entries, 'simulate');
        const compare = entryFor(entries, 'compare');
        const savings = asRecord(simulate?.data.savings);
        const fix = asRecord(compare?.data.fix);
        const recommendation = resolveRecordedRecommendation(entries);
        const { strategy, recommendedId } = recommendation;
        const state = stateFor(entries);
        const category = text(detect?.data.category, 'unknown');
        const agentId = text(detect?.data.agentId, CATEGORY_AGENT[category] ?? 'code-analysis');
        const agent = AGENTS.find((candidate) => candidate.id === agentId);
        const native = asRecord(detect?.data.nativeMetric);
        return {
          bugId,
          agentId,
          agentName:
            agentId === 'carbon-incident'
              ? 'Carbon Efficiency'
              : text(detect?.data.agentName, agent?.name ?? 'Code Analysis'),
          category,
          severity: text(detect?.data.severity, 'unknown').toLowerCase(),
          title: detect?.summary ?? bugId,
          state,
          impactEnergyKwh: number(savings.energyKwh),
          impactCarbonKg: number(savings.carbonKgCo2e),
          confidence:
            typeof detect?.data.confidence === 'string' &&
            ['high', 'medium', 'low'].includes(detect.data.confidence)
              ? (detect?.data.confidence as Finding['confidence'])
              : 'unknown',
          effort: text(strategy.effort, 'unknown').toLowerCase(),
          recommendationId: recommendedId || 'manual-review',
          recommendationTitle: recommendation.title,
          recommendation: recommendation.description,
          expectedReductionFactor: number(strategy.expectedReductionFactor),
          reversible: strategy.reversible === true || fix.reversible === true,
          nativeMetric:
            typeof native.metric === 'string' && typeof native.perRun === 'number'
              ? { metric: native.metric, perRun: native.perRun, unit: text(native.unit, 'units') }
              : undefined,
          entries,
        } satisfies Finding;
      })
      .sort(
        (left, right) =>
          (SEVERITY_RANK[right.severity] ?? 0) - (SEVERITY_RANK[left.severity] ?? 0) ||
          CONFIDENCE_RANK[right.confidence] - CONFIDENCE_RANK[left.confidence] ||
          (EFFORT_RANK[right.effort] ?? 0) - (EFFORT_RANK[left.effort] ?? 0),
      );
  }, [run]);
  const approvalStore = useApprovalDecisions(run, findings);
  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return findings
      .filter(
        (finding) =>
          (stateFilter === 'all' || finding.state === stateFilter) &&
          (agentFilter === 'all' || finding.agentId === agentFilter) &&
          (recommendationFilter === 'all' || finding.recommendationId === recommendationFilter) &&
          (severityFilter === 'all' || finding.severity === severityFilter) &&
          (categoryFilter === 'all' || finding.category === categoryFilter) &&
          (!normalized ||
            finding.title.toLowerCase().includes(normalized) ||
            finding.category.toLowerCase().includes(normalized) ||
            finding.bugId.toLowerCase().includes(normalized)),
      )
      .sort((left, right) =>
        sortBy === 'severity'
          ? (SEVERITY_RANK[right.severity] ?? 0) - (SEVERITY_RANK[left.severity] ?? 0)
          : sortBy === 'confidence'
            ? CONFIDENCE_RANK[right.confidence] - CONFIDENCE_RANK[left.confidence]
            : right.impactEnergyKwh - left.impactEnergyKwh,
      );
  }, [
    findings,
    query,
    stateFilter,
    severityFilter,
    categoryFilter,
    agentFilter,
    recommendationFilter,
    sortBy,
  ]);
  const selected = findings.find((finding) => finding.bugId === selectedBug);
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!detailOpen || !selected || !dialog) {
      dialog?.close();
      return;
    }
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    if (!dialog.open) dialog.showModal();
    dialog.querySelector<HTMLElement>('#finding-panel-title')?.focus();
    drawerBodyRef.current?.scrollTo({ top: 0 });
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [detailOpen, selected]);
  const categoryCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const finding of findings)
      counts.set(finding.category, (counts.get(finding.category) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [findings]);
  const categoryImpact = useMemo(() => {
    const impact = new Map<string, { energy: number; carbon: number; count: number }>();
    for (const finding of findings) {
      const current = impact.get(finding.category) ?? { energy: 0, carbon: 0, count: 0 };
      impact.set(finding.category, {
        energy: current.energy + finding.impactEnergyKwh,
        carbon: current.carbon + finding.impactCarbonKg,
        count: current.count + 1,
      });
    }
    return [...impact.entries()]
      .map(([category, values]) => ({ category, ...values }))
      .sort((left, right) => right.energy - left.energy);
  }, [findings]);
  const maxCategory = Math.max(1, ...categoryCounts.map(([, count]) => count));
  const appliedCount = findings.filter(
    (finding) => entryFor(finding.entries, 'improve')?.data.applied === true,
  ).length;
  const verifiedCount = findings.filter((finding) => finding.state === 'verified').length;
  const unverifiedCount = findings.filter((finding) => finding.state === 'unverified').length;
  const detectedCount = findings.length || outcome?.bugsDetected || 0;
  const estimatedEnergy = findings.reduce((sum, finding) => sum + finding.impactEnergyKwh, 0);
  const estimatedCarbon = findings.reduce((sum, finding) => sum + finding.impactCarbonKg, 0);
  const agentSummaries = AGENTS.filter(
    (agent) =>
      agent.id !== 'code-analysis' || findings.some((finding) => finding.agentId === agent.id),
  ).map((agent) => {
    const agentFindings = findings.filter((finding) => finding.agentId === agent.id);
    return {
      ...agent,
      findings: agentFindings.length,
      highSeverity: agentFindings.filter((finding) =>
        ['high', 'critical'].includes(finding.severity),
      ).length,
      energy: agentFindings.reduce((sum, finding) => sum + finding.impactEnergyKwh, 0),
      verified: agentFindings.filter((finding) => finding.state === 'verified').length,
    };
  });
  const runSources = summarizeRecommendationSources(findings);
  const overheadWh =
    typeof outcome?.selfCost.energyKwh === 'number'
      ? Math.abs(outcome.selfCost.energyKwh * 1000)
      : null;

  function focusReviewQueue() {
    if (view === 'dashboard' || view === 'audits') {
      setJourneyStep(unverifiedCount > 0 ? 'verify' : 'review');
      journeyRef.current?.scrollIntoView({ behavior: 'auto', block: 'start' });
    } else
      router.push(runHref(`/dashboard/findings${unverifiedCount > 0 ? '?state=unverified' : ''}`));
  }

  function selectLoadedRun(nextLedger: LedgerFile) {
    const latestRun = selectLatestRun(nextLedger);
    const pathname =
      view === 'dashboard'
        ? '/dashboard'
        : view === 'agents' && initialAgentId
          ? agentModulePath(initialAgentId)
          : `/dashboard/${view}`;
    // Import and Refresh explicitly choose a new context. Remove stale finding
    // and filter queries; the history update keeps the loaded snapshot in memory.
    window.history.replaceState(null, '', withRecordedRun(pathname, latestRun?.runId));
    setSelectedBug(null);
    setDetailOpen(false);
    clearFilters();
  }

  async function loadFile(file?: File) {
    if (!file) return;
    const request = ++loadRequest.current;
    setLoadingLatest(false);
    try {
      if (file.size > MAX_LEDGER_BYTES) throw new Error('Choose a ledger smaller than 20 MiB.');
      const parsed = validateLedger(JSON.parse(await file.text()) as unknown);
      if (request !== loadRequest.current) return;
      onLoad({ ledger: parsed, fileName: file.name, source: 'uploaded' });
      setNotice(
        'Imported results are ready to review. Refresh results to return to your latest analysis.',
      );
      try {
        sessionStorage.removeItem(SNAPSHOT_KEY);
        sessionStorage.setItem(
          SNAPSHOT_KEY,
          JSON.stringify({ ledger: parsed, fileName: file.name }),
        );
        window.dispatchEvent(new Event(SNAPSHOT_EVENT));
      } catch {
        setNotice('Snapshot loaded for this page only; browser storage is unavailable.');
      }
      selectLoadedRun(parsed);
      setError('');
    } catch {
      if (request === loadRequest.current)
        setError(
          'Unable to load this file. Choose a valid GreenOps ledger JSON smaller than 20 MiB.',
        );
    }
  }

  async function loadLatestRun() {
    const request = ++loadRequest.current;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);
    setLoadingLatest(true);
    setError('');
    setNotice('');
    try {
      const response = await fetch('/dashboard/latest-ledger', {
        cache: 'no-store',
        signal: controller.signal,
      });
      if (!response.ok) throw new Error('Latest ledger unavailable');
      const result = asRecord(await response.json());
      if (request !== loadRequest.current) return;
      if (!result.ledger) {
        setError(
          'No new analysis is available. Complete an analysis or import saved results. Your current view has been kept.',
        );
        return;
      }
      const latest = validateLedger(result.ledger);
      onLoad({
        ledger: latest,
        fileName: text(result.fileName, 'Local ledger'),
        source: 'saved',
      });
      selectLoadedRun(latest);
      setNotice('Results refreshed from your latest saved analysis.');
      try {
        sessionStorage.removeItem('greenops.dashboard.source');
        sessionStorage.removeItem('greenops.dashboard.ledger');
        sessionStorage.removeItem('greenops.dashboard.ledgerName');
        sessionStorage.removeItem(SNAPSHOT_KEY);
        window.dispatchEvent(new Event(SNAPSHOT_EVENT));
      } catch {
        /* Reading the latest run does not require browser storage. */
      }
    } catch {
      if (request === loadRequest.current)
        setError(
          'We could not refresh your results. Please try again. Your current view has been kept.',
        );
    } finally {
      clearTimeout(timeout);
      if (request === loadRequest.current) setLoadingLatest(false);
    }
  }

  const activeNavigation =
    view === 'review' || view === 'improvements'
      ? 'findings'
      : view === 'audits'
        ? 'dashboard'
        : view;
  const activeAgent = agentFilter === 'all' ? 'ai-efficiency' : agentFilter;
  const currentAgent = AGENTS.find((agent) => agent.id === activeAgent);
  const failedVerificationCount = findings.filter(
    (finding) => entryFor(finding.entries, 'verify')?.data.confirmed === false,
  ).length;
  const runLabel = unavailableRun
    ? 'Run unavailable'
    : outcome || reviewOnly
      ? 'Analysis complete'
      : run
        ? 'Analysis incomplete'
        : 'No analysis';
  const needsReview = findings.filter((finding) => getWorkflowStage(finding) === 'needs-review');
  const readyToVerify = findings.filter(
    (finding) => getWorkflowStage(finding) === 'needs-verification',
  );
  const recommendations = findings.filter((finding) =>
    Boolean(entryFor(finding.entries, 'compare')),
  );

  function clearFilters() {
    setQuery('');
    setStateFilter('all');
    setSeverityFilter('all');
    setCategoryFilter('all');
    setAgentFilter(view === 'agents' && initialAgentId ? initialAgentId : 'all');
    setRecommendationFilter('all');
  }
  function openFinding(bugId: string) {
    router.push(runHref(`/dashboard/review?finding=${encodeURIComponent(bugId)}`));
  }
  const journeySteps = [
    {
      id: 'detect' as const,
      title: 'Find waste',
      value: detectedCount,
      unit: 'issues found',
      description: 'Agents check your workload for unnecessary usage.',
    },
    {
      id: 'review' as const,
      title: 'Review solutions',
      value: recommendations.length,
      unit: 'recommendations',
      description: 'Understand the cause and compare ways to improve.',
    },
    {
      id: 'change' as const,
      title: 'Make changes',
      value: appliedCount,
      unit: 'changes applied',
      description: 'Choose a recommendation and follow its implementation steps.',
    },
    {
      id: 'verify' as const,
      title: 'Confirm results',
      value: verifiedCount,
      unit: 'changes verified',
      description: 'Check whether the change solved the original problem.',
    },
  ];
  const journeyFindings =
    journeyStep === 'detect'
      ? findings
      : journeyStep === 'review'
        ? needsReview
        : journeyStep === 'change'
          ? needsReview
          : findings.filter((finding) => getWorkflowStage(finding) !== 'needs-review');
  const journeyContent = {
    detect: {
      title: 'What your agents found',
      description:
        'Select an issue to see the affected resource, why it matters, and the recommended next step.',
      empty: 'No issues were found in this analysis.',
    },
    review: {
      title: 'Recommendations awaiting your review',
      description:
        'Review the evidence and available options. You decide which change is right for your workload.',
      empty: 'No recommendations are waiting for review.',
    },
    change: {
      title: 'Choose a change to make',
      description:
        'Open a recommendation for manual implementation steps. Automatic changes are not available in this workspace.',
      empty: 'There are no outstanding changes to plan.',
    },
    verify: {
      title: 'Check the results of your changes',
      description:
        'Review completed checks and the verification steps for changes that still need checking.',
      empty:
        'No changes have been applied yet. Start with a recommendation, make the change, then run a new analysis to compare results.',
    },
  }[journeyStep];
  const pipeline = (
    <section ref={journeyRef} className={styles.stack} aria-label="Decision journey">
      <div className={styles.journeyIntro}>
        <h2 className={styles.sectionTitle}>Your path to lower waste</h2>
        <p>Select a step to see what was found and what you can do next.</p>
      </div>
      <div className={styles.journeyCards}>
        {journeySteps.map((step, index) => (
          <button
            type="button"
            key={step.id}
            className={styles.journeyCard}
            data-active={journeyStep === step.id}
            aria-pressed={journeyStep === step.id}
            aria-controls="journey-selection"
            onClick={() => setJourneyStep(step.id)}
          >
            <span className={styles.journeyNumber}>Step {index + 1}</span>
            <strong>{step.title}</strong>
            <span className={styles.journeyValue}>
              {step.value} <small>{step.unit}</small>
            </span>
            <span className={styles.journeyCaption}>{step.description}</span>
          </button>
        ))}
      </div>
      <div id="journey-selection" className={styles.journeySelection}>
        <Panel
          title={journeyContent.title}
          subtitle={journeyContent.description}
          action={
            <Link
              href={runHref(
                journeyStep === 'verify' ? '/dashboard/improvements' : '/dashboard/findings',
              )}
              className={styles.sectionAction}
            >
              View all findings <ChevronRight size={15} />
            </Link>
          }
        >
          {journeyFindings.length ? (
            <FindingTable
              key={`${journeyStep}:${run?.runId}`}
              findings={view === 'dashboard' ? journeyFindings.slice(0, 5) : journeyFindings}
              onSelect={openFinding}
            />
          ) : (
            <p className={styles.emptyState}>{journeyContent.empty}</p>
          )}
        </Panel>
      </div>
    </section>
  );
  const accounting = (
    <Panel
      title="GreenOps operating cost"
      subtitle="Analysis overhead, separate from the workload being assessed."
    >
      <div className={styles.statGrid}>
        <SmallStat
          label="Estimated energy used"
          value={outcome ? formatMeasuredEnergy(outcome.selfCost.energyKwh) : 'Not recorded'}
        />
        <SmallStat
          label="Estimated carbon emitted"
          value={outcome ? formatCarbon(outcome.selfCost.carbonKgCo2e) : 'Not recorded'}
        />
        <SmallStat
          label="Recorded model tokens"
          value={
            outcome
              ? outcome.selfCost.tokens === null
                ? `Unknown total · ${(outcome.selfCost.knownTokens ?? 0).toLocaleString()} reported`
                : outcome.selfCost.tokens.toLocaleString()
              : runSources.missingTokenCounts > 0
                ? `Unknown total · ${runSources.tokens.toLocaleString()} reported`
                : runSources.tokens.toLocaleString()
          }
        />
        <SmallStat
          label="Tool calls / retries"
          value={
            outcome ? `${outcome.selfCost.toolCalls} / ${outcome.selfCost.retries}` : 'Not recorded'
          }
        />
      </div>
      <p className={styles.footerNote}>
        {outcome && overheadWh !== null
          ? `Estimated analysis overhead is ${overheadWh === 0 ? '0' : overheadWh < 0.001 ? 'less than 0.001' : overheadWh.toLocaleString(undefined, { maximumFractionDigits: 3 })} Wh. It is deducted from the recorded net result: ${describeNetEnergy(outcome.net.energyKwh)}. These are not power-metered measurements.${outcome.selfCost.usageComplete === undefined ? ' Usage coverage was not recorded in this historical result.' : ''}`
          : outcome
            ? 'Some model usage is unknown. Energy, carbon and net benefit are not established; reported tokens are only the known portion.'
            : 'This review has no completed self-accounting outcome. Missing energy and tool usage are not treated as zero.'}
      </p>
    </Panel>
  );
  const reviewNotice = (
    <section className={styles.nextActionCard} aria-label="Next action">
      <ShieldCheck size={20} aria-hidden="true" />
      <div className={styles.calloutContent}>
        <h2 className={styles.calloutTitle}>
          {readyToVerify.length > 0
            ? `${readyToVerify.length} changes are ready to check`
            : needsReview.length > 0
              ? `${needsReview.length} opportunities need your review`
              : verifiedCount > 0
                ? `${verifiedCount} improvements verified`
                : 'No issues need your attention'}
        </h2>
        <p className={styles.calloutText}>
          {failedVerificationCount > 0
            ? 'Some changes did not pass their checks. Open a finding to review the result and next steps.'
            : readyToVerify.length > 0
              ? 'Confirm that your changes solved the problem before reporting savings.'
              : needsReview.length > 0
                ? 'Start with a recommendation. Understand the problem, compare options, and choose your next change.'
                : 'Explore your findings and the results of completed checks below.'}
        </p>
      </div>
      <button type="button" className={styles.primaryButton} onClick={focusReviewQueue}>
        {readyToVerify.length > 0
          ? 'Check changes'
          : needsReview.length > 0
            ? 'Review recommendations'
            : 'Explore results'}
        <ChevronRight size={16} aria-hidden="true" />
      </button>
    </section>
  );

  return (
    <div className={`${styles.root} ${view === 'dashboard' ? styles.orchestratorShell : ''}`}>
      <a href="#dashboard-content" className={styles.skipLink}>
        Skip to content
      </a>
      <WorkspaceSidebar
        activeView={activeNavigation}
        runId={run?.runId ?? requestedRunId}
        findingsCount={ledger ? detectedCount : undefined}
        pendingReviews={approvalStore.ready ? approvalStore.counts.pending : undefined}
        actions={
          <div className={styles.toolbar}>
            <button
              type="button"
              onClick={() => void loadLatestRun()}
              disabled={loadingLatest}
              aria-busy={loadingLatest}
              className={styles.button}
              title="Reload saved results. For new recommendations, run an analysis first."
            >
              <RefreshCcw size={16} aria-hidden="true" />
              {loadingLatest ? 'Refreshing…' : 'Refresh results'}
            </button>
            <input
              ref={inputRef}
              type="file"
              accept="application/json,.json"
              hidden
              aria-label="Choose a ledger JSON file"
              onChange={(event) => {
                const file = event.currentTarget.files?.[0];
                event.currentTarget.value = '';
                void loadFile(file);
              }}
            />
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className={styles.primaryButton}
            >
              <Upload size={16} aria-hidden="true" />
              Import results
            </button>
          </div>
        }
      />
      <div className={styles.workspace}>
        <main id="dashboard-content" tabIndex={-1} className={styles.content}>
          {error && (
            <p role="alert" className={styles.errorNotice}>
              {error}
            </p>
          )}
          {notice && (
            <p role="status" className={styles.notice}>
              {notice}
            </p>
          )}
          <div className={styles.pageHeading}>
            <div>
              <h1 className={styles.pageTitle}>
                {view === 'agents' && currentAgent
                  ? `${currentAgent.name} Agent`
                  : PAGE_META[view].title}
              </h1>
              {view !== 'dashboard' && view !== 'agents' && (
                <p className={styles.pageDescription}>{PAGE_META[view].description}</p>
              )}
            </div>
            {ledger && (
              <div className={styles.headingStatus}>
                {view === 'dashboard' && run && (
                  <span className={styles.headingDate}>
                    {friendlyDate(run.timestamp).replace('Completed', 'Last analysed')}
                  </span>
                )}
                <span className={`${styles.badge} ${styles.badgeNeutral}`}>{runLabel}</span>
              </div>
            )}
          </div>
          {ledger && view !== 'dashboard' && (
            <div className={styles.runMeta}>
              {run && (
                <span>{friendlyDate(run.timestamp).replace('Completed', 'Last analysed')}</span>
              )}
              {source === 'uploaded' && <span>Imported analysis</span>}
            </div>
          )}
          {!ledger ? (
            <section className={styles.emptyState}>
              <FileJson size={30} aria-hidden="true" />
              <h2>Your first analysis starts here</h2>
              <p>
                Import completed GreenOps results to explore findings and recommendations. If your
                team has already completed an analysis, select Refresh results.
              </p>
              <button
                type="button"
                className={styles.primaryButton}
                onClick={() => inputRef.current?.click()}
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => {
                  event.preventDefault();
                  void loadFile(event.dataTransfer.files[0]);
                }}
              >
                Import analysis results
              </button>
              <p className={styles.small}>
                JSON only · up to 20 MiB · files are parsed in your browser
              </p>
            </section>
          ) : unavailableRun ? (
            <section className={styles.emptyState}>
              <FileJson size={30} aria-hidden="true" />
              <h2>Recorded run not available</h2>
              <p>
                The analysis linked here is not present in the loaded results. Import saved results
                or refresh results to select an available analysis.
              </p>
            </section>
          ) : (
            <>
              {view !== 'dashboard' && view !== 'agents' && (
                <nav className={styles.auditProgress} aria-label="Audit progression">
                  {[
                    ['Status', '/dashboard', false],
                    ['Activity', '/dashboard/trace', view === 'trace'],
                    ['Evidence', '/dashboard/findings', view === 'findings'],
                    [
                      'Recommendation',
                      selected
                        ? `/dashboard/review?finding=${encodeURIComponent(selected.bugId)}`
                        : '/dashboard/findings',
                      view === 'review',
                    ],
                    [
                      'Human decision',
                      selected
                        ? `/dashboard/review?finding=${encodeURIComponent(selected.bugId)}#human-decision`
                        : '/dashboard/approvals',
                      view === 'approvals',
                    ],
                    [
                      'Verified result',
                      selected
                        ? `/dashboard/review?finding=${encodeURIComponent(selected.bugId)}#verified-result`
                        : '/dashboard/improvements?state=verified',
                      view === 'improvements',
                    ],
                  ].map(([label, href, active], index) => (
                    <Link
                      key={String(label)}
                      href={runHref(String(href))}
                      className={`${styles.auditStep} ${active ? styles.auditStepActive : ''}`}
                      aria-current={active ? 'step' : undefined}
                    >
                      <span>{index + 1}</span>
                      {label}
                    </Link>
                  ))}
                </nav>
              )}
              {view === 'trace' && (
                <div className={styles.stack}>
                  <RunTraceView findings={findings} run={run} />
                  <ApprovalDecisionHistory store={approvalStore} />
                </div>
              )}
              {view === 'approvals' && (
                <ApprovalInbox
                  store={approvalStore}
                  run={run}
                  initialFindingId={params.get('finding') ?? undefined}
                />
              )}
              {view === 'review' && (
                <div className={styles.stack}>
                  <div className={styles.auditToolbar}>
                    <Link className={styles.button} href={runHref('/dashboard/findings')}>
                      All findings
                    </Link>
                    {selected && (
                      <Link
                        className={styles.button}
                        href={runHref(
                          `/dashboard/agents?agent=${encodeURIComponent(selected.agentId)}`,
                        )}
                      >
                        View agent
                      </Link>
                    )}
                    <Link
                      className={styles.button}
                      href={runHref(
                        `/dashboard/trace${selected ? `?finding=${encodeURIComponent(selected.bugId)}` : ''}`,
                      )}
                    >
                      View run trace
                    </Link>
                  </div>
                  {selected ? (
                    <FindingDetail
                      key={`${run?.runId}:${selected.bugId}`}
                      finding={selected}
                      decisionPanel={
                        <FindingApprovalPanel store={approvalStore} findingId={selected.bugId} />
                      }
                    />
                  ) : (
                    <Panel
                      title={
                        params.get('finding')
                          ? 'Finding not available'
                          : 'Choose a finding to review'
                      }
                      subtitle="Select a finding from the current analysis to review its evidence and recommendation."
                    >
                      <FindingTable findings={findings} onSelect={openFinding} />
                    </Panel>
                  )}
                </div>
              )}
              {view === 'improvements' && (
                <div className={styles.metrics} aria-label="Run metrics">
                  <Metric
                    icon={<ClipboardList size={17} />}
                    label="Findings"
                    value={String(detectedCount)}
                    detail="Issues found by your agents"
                  />
                  <Metric
                    icon={<ListFilter size={17} />}
                    label="Needs your review"
                    value={String(needsReview.length)}
                    detail="Choose an improvement to make"
                  />
                  <Metric
                    icon={<Wrench size={17} />}
                    label="Changes made"
                    value={String(appliedCount)}
                    detail="Successfully applied changes"
                  />
                  <Metric
                    icon={<CheckCircle2 size={17} />}
                    label="Results verified"
                    value={String(verifiedCount)}
                    detail="Changes with a successful check"
                    tone={verifiedCount > 0 ? 'emerald' : 'neutral'}
                  />
                </div>
              )}

              {['audits', 'improvements'].includes(view) && reviewNotice}

              {view === 'dashboard' && (
                <>
                  <OverviewImpactSummary
                    findings={findings}
                    run={run}
                    pendingReviews={approvalStore.ready ? approvalStore.counts.pending : undefined}
                  />
                  <OrchestratorOverview findings={findings} run={run} />
                </>
              )}

              {view === 'agents' && (
                <>
                  <nav aria-label="Specialist agent modules" className={styles.agentModuleNav}>
                    {agentSummaries.map((agent) => {
                      const Icon = agent.icon;
                      return (
                        <Link
                          key={agent.id}
                          href={runHref(agentModulePath(agent.id))}
                          className={`${styles.agentModuleLink} ${activeAgent === agent.id ? styles.agentModuleActive : ''}`}
                          aria-current={activeAgent === agent.id ? 'page' : undefined}
                        >
                          <Icon size={16} aria-hidden="true" />
                          <span>{agent.name}</span>
                          <span className={styles.navCount}>{agent.findings}</span>
                        </Link>
                      );
                    })}
                  </nav>
                  <section id="agent-detail" className={styles.stack}>
                    {activeAgent === 'code-analysis' ? (
                      <AgentDetailView
                        agentId={activeAgent}
                        agentName={currentAgent?.name ?? 'Code Review'}
                        scope={currentAgent?.scope ?? 'Source-code checks'}
                        findings={findings}
                        run={run}
                      />
                    ) : (
                      <AgentModuleView
                        key={`${run?.runId}:${activeAgent}`}
                        agentId={activeAgent}
                        findings={findings}
                        run={run}
                      />
                    )}
                  </section>
                </>
              )}

              {view === 'audits' && (
                <div className={styles.stack}>
                  {pipeline}
                  <Panel
                    title="Types of waste found"
                    subtitle="Explore the areas your agents identified for improvement."
                  >
                    <div className={styles.twoColumns}>
                      {categoryCounts.map(([category, count]) => (
                        <div key={category} className={styles.barRow}>
                          <span className={`${styles.barLabel} ${styles.capitalize}`}>
                            {category.replaceAll('-', ' ')}
                          </span>
                          <span className={styles.barTrack}>
                            <span
                              className={styles.barFill}
                              style={{ width: `${(count / maxCategory) * 100}%` }}
                            />
                          </span>
                          <strong>{count}</strong>
                        </div>
                      ))}
                    </div>
                  </Panel>
                </div>
              )}

              {view === 'reports' && (
                <>
                  <Panel
                    title="Carbon measurement"
                    subtitle="Compare a workload before and after using the Software Carbon Intensity method."
                  >
                    <p>
                      A carbon score needs energy, regional electricity emissions and allocated
                      hardware emissions for the same successful unit of work. The saved fleet
                      estimates below do not contain a complete SCI assessment.
                    </p>
                    <Link className={styles.primaryButton} href="/dashboard/measurement">
                      Open measurement worksheet <ArrowRight size={16} aria-hidden="true" />
                    </Link>
                  </Panel>
                  <div className={styles.metrics}>
                    <Metric
                      icon={<Zap size={17} />}
                      label="Recorded avoided energy"
                      value={
                        outcome ? formatMeasuredEnergy(outcome.savings.energyKwh) : 'Not recorded'
                      }
                      detail="Estimated conversion of verified changes"
                    />
                    <Metric
                      icon={<Leaf size={17} />}
                      label="Recorded avoided carbon"
                      value={outcome ? formatCarbon(outcome.savings.carbonKgCo2e) : 'Not recorded'}
                      detail="Estimated, not power-metered"
                    />
                    <Metric
                      icon={<Activity size={17} />}
                      label="Estimated net result"
                      value={outcome ? describeNetEnergy(outcome.net.energyKwh) : 'Not recorded'}
                      detail="Avoided energy less analysis overhead"
                    />
                    <Metric
                      icon={<ShieldCheck size={17} />}
                      label="Verified changes"
                      value={String(verifiedCount)}
                      detail={`${appliedCount} changes successfully applied`}
                    />
                  </div>
                  <Panel
                    title="Recorded opportunities by category"
                    subtitle="Possible savings estimated during analysis. These savings have not been verified."
                  >
                    <p className={styles.notice}>
                      <strong>These estimates cannot be added up to predict your savings.</strong>{' '}
                      Two recommendations may address the same waste, and estimates may cover
                      different time periods. Unused token limits are not tokens you actually used
                      or saved.
                    </p>
                    <div
                      className={styles.tableWrap}
                      tabIndex={0}
                      role="region"
                      aria-label="Category estimates"
                    >
                      <table className={styles.table}>
                        <caption>Recorded simulation estimates</caption>
                        <thead>
                          <tr>
                            <th scope="col">Category</th>
                            <th scope="col">Findings</th>
                            <th scope="col">Estimated energy</th>
                            <th scope="col">Estimated carbon</th>
                          </tr>
                        </thead>
                        <tbody>
                          {categoryImpact.map((item) => (
                            <tr key={item.category}>
                              <th scope="row" className={styles.capitalize}>
                                {item.category.replaceAll('-', ' ')}
                              </th>
                              <td>{item.count}</td>
                              <td>{formatMeasuredEnergy(item.energy)}</td>
                              <td>{formatCarbon(item.carbon)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <details className={styles.disclosure}>
                      <summary>Why the combined estimate is not your actual saving</summary>
                      <p>
                        <strong>Energy estimates added together:</strong>{' '}
                        {formatMeasuredEnergy(estimatedEnergy)}
                      </p>
                      <p>
                        <strong>Carbon estimates added together:</strong>{' '}
                        {formatCarbon(estimatedCarbon)}
                      </p>
                      <p>
                        These totals may count the same saving more than once. They are not a
                        forecast or proof of savings. Check each finding, apply an approved change,
                        and verify the result before reporting a saving.
                      </p>
                    </details>
                  </Panel>
                  <details id="technical-diagnostics" className={styles.technicalSection}>
                    <summary>Technical diagnostics</summary>
                    <p>
                      Analysis ID: <code>{run?.runId}</code>
                    </p>
                    <p>Source file: {fileName}</p>
                    <ModelRunStatus sources={runSources} findingCount={findings.length} />
                    {accounting}
                  </details>
                </>
              )}

              {['findings', 'improvements'].includes(view) && (
                <section id="findings" ref={findingsRef} className={styles.stack}>
                  <Panel
                    title={view === 'improvements' ? 'Your improvement plan' : 'All findings'}
                    subtitle={`${filtered.length} of ${detectedCount} shown. Select Review to compare options and see how to make the change.`}
                  >
                    <div className={styles.filters}>
                      <label className={styles.searchField}>
                        <span>Search findings</span>
                        <div>
                          <Search size={16} aria-hidden="true" />
                          <input
                            value={query}
                            onChange={(event) => setQuery(event.target.value)}
                            placeholder="Search title, category or ID"
                          />
                        </div>
                      </label>
                      <label className={styles.filterField}>
                        <span>Agent</span>
                        <select
                          value={agentFilter}
                          onChange={(event) => setAgentFilter(event.target.value)}
                        >
                          <option value="all">All agents</option>
                          {AGENTS.map((agent) => (
                            <option key={agent.id} value={agent.id}>
                              {agent.name}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className={styles.filterField}>
                        <span>Status</span>
                        <select
                          value={stateFilter}
                          onChange={(event) =>
                            setStateFilter(event.target.value as typeof stateFilter)
                          }
                        >
                          <option value="all">All statuses</option>
                          <option value="verified">Verified</option>
                          <option value="unverified">Needs verification</option>
                          <option value="withheld">Needs review</option>
                          <option value="not-applied">Manual action needed</option>
                          <option value="in-progress">Analysis incomplete</option>
                          <option value="review-only">Ready to review</option>
                        </select>
                      </label>
                      <label className={styles.filterField}>
                        <span>Severity</span>
                        <select
                          value={severityFilter}
                          onChange={(event) => setSeverityFilter(event.target.value)}
                        >
                          <option value="all">All severities</option>
                          {['critical', 'high', 'medium', 'low'].map((severity) => (
                            <option key={severity} value={severity}>
                              {severity[0].toUpperCase() + severity.slice(1)}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className={styles.filterField}>
                        <span>Category</span>
                        <select
                          value={categoryFilter}
                          onChange={(event) => setCategoryFilter(event.target.value)}
                        >
                          <option value="all">All categories</option>
                          {categoryCounts.map(([category]) => (
                            <option key={category} value={category}>
                              {category.replaceAll('-', ' ')}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className={styles.filterField}>
                        <span>Sort by</span>
                        <select
                          value={sortBy}
                          onChange={(event) => setSortBy(event.target.value as typeof sortBy)}
                        >
                          <option value="severity">Priority</option>
                          <option value="confidence">Confidence</option>
                          <option value="impact">Estimated energy (unverified)</option>
                        </select>
                      </label>
                      <button type="button" onClick={clearFilters} className={styles.button}>
                        Clear filters
                      </button>
                    </div>
                    {recommendationFilter !== 'all' && (
                      <p className={styles.notice}>
                        Showing findings for one recommendation. Clear filters to see every finding.
                      </p>
                    )}
                    <div>
                      <FindingTable
                        key={JSON.stringify([
                          query,
                          stateFilter,
                          severityFilter,
                          categoryFilter,
                          agentFilter,
                          recommendationFilter,
                          sortBy,
                          run?.runId,
                        ])}
                        findings={filtered}
                        selectedId={selected?.bugId}
                        onSelect={openFinding}
                      />
                    </div>
                  </Panel>
                </section>
              )}
            </>
          )}
        </main>
      </div>
      <dialog
        ref={dialogRef}
        className={styles.findingDrawer}
        aria-labelledby="finding-panel-title"
        onCancel={() => setDetailOpen(false)}
        onClose={(event) => {
          if (!event.currentTarget.open) setDetailOpen(false);
        }}
      >
        <header className={styles.drawerHeader}>
          <h2 id="finding-panel-title" tabIndex={-1}>
            Review an improvement
          </h2>
          <button
            type="button"
            className={styles.button}
            aria-label="Close finding"
            onClick={() => setDetailOpen(false)}
          >
            <X size={20} aria-hidden="true" />
          </button>
        </header>
        <div ref={drawerBodyRef} className={styles.drawerBody}>
          {selected && detailOpen && (
            <FindingDetail
              key={`${run?.runId}:${selected.bugId}`}
              finding={selected}
              decisionPanel={
                <FindingApprovalPanel store={approvalStore} findingId={selected.bugId} />
              }
            />
          )}
        </div>
      </dialog>
    </div>
  );
}
