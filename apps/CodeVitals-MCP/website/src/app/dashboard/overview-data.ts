import type { Finding } from './ledger-dashboard';
import type { LedgerEntry, LedgerStage, SelectedRun } from './ledger-data';
import { asRecord, entryFor, STAGES } from './dashboard-format';
import {
  evidenceFor,
  resolveRecordedRecommendation,
  safeAuditText,
  type AuditFact,
} from './dashboard-audit';
import { sourceFor } from './recommendation-source';

export type DashboardRun = SelectedRun;
export type OverviewAgentId =
  | 'ai-efficiency'
  | 'digital-waste'
  | 'carbon-incident'
  | 'architecture'
  | 'disaster-recovery'
  | 'collaboration'
  | 'pipeline-efficiency'
  | 'code-analysis';

export interface OverviewMetric {
  id: string;
  label: string;
  value: number | null;
  unit: string;
  aggregation: 'sum' | 'maximum' | 'distinct-count';
  evidenceCount: number;
  applicableFindings: number;
}

export interface OverviewEvidence {
  findingId: string;
  agentId: string;
  title: string;
  category: string;
  severity: 'critical' | 'high' | 'medium' | 'low' | 'unknown';
  verified: boolean;
  applied: boolean;
  /** Allowlisted facts only: no prompts, rationale, provider errors or raw payloads. */
  facts: AuditFact[];
}

export interface OverviewRecommendationCounts {
  /** Findings with an explicitly selected or recorded recommendation; excludes notRecorded. */
  total: number;
  modelGenerated: number;
  fallback: number;
  ruleBased: number;
  unconfirmed: number;
  notRecorded: number;
}

export interface OverviewAgentCard {
  id: OverviewAgentId;
  name: string;
  scope: string;
  count: number;
  /** Unverified findings with recorded high/critical severity. */
  highPriority: number;
  verified: number;
  applied: number;
  status: 'findings-recorded' | 'no-recorded-findings';
  statusLabel: string;
  recommendations: OverviewRecommendationCounts;
  categories: Array<{ id: string; label: string; count: number }>;
  metrics: OverviewMetric[];
  regions: string[];
  /** All public evidence rows, priority ordered. The view may cap rendering, but search covers all. */
  topEvidence: OverviewEvidence[];
}

export interface OverviewData {
  runId: string | null;
  recordedAt: string | null;
  runKind: SelectedRun['kind'] | null;
  summary: {
    findings: number;
    highPriority: number;
    applied: number;
    verified: number;
    awaitingAction: number;
    /** Evidence coverage, never active-agent or successful-scan counts. */
    specialistsWithFindings: number;
    specialistCount: 7;
    unassignedFindings: number;
    recommendations: OverviewRecommendationCounts;
  };
  agents: OverviewAgentCard[];
  /** Counts recorded lifecycle activity, not successful steps or human approvals. */
  stages: Array<{ id: LedgerStage; label: string; count: number }>;
  /** All unverified public rows, priority ordered; filtering/search happens before UI pagination. */
  priorityFindings: OverviewEvidence[];
}

const AGENTS: Array<Pick<OverviewAgentCard, 'id' | 'name' | 'scope'>> = [
  {
    id: 'carbon-incident',
    name: 'Carbon Efficiency',
    scope: 'Recorded energy spikes and baseline deviations',
  },
  {
    id: 'digital-waste',
    name: 'Digital Waste',
    scope: 'Compute, storage, container images and logs',
  },
  {
    id: 'ai-efficiency',
    name: 'AI Efficiency',
    scope: 'Token usage, repeated requests and retries',
  },
  {
    id: 'architecture',
    name: 'Architecture',
    scope: 'Capacity, autoscaling and deployment regions',
  },
  {
    id: 'disaster-recovery',
    name: 'Disaster Recovery',
    scope: 'Replication, standby capacity and recovery targets',
  },
  { id: 'collaboration', name: 'Collaboration', scope: 'Duplicate recordings and retention' },
  {
    id: 'pipeline-efficiency',
    name: 'Pipeline Efficiency',
    scope: 'CI/CD caching, duplicate runs and build artifacts',
  },
];
const CODE_AGENT: Pick<OverviewAgentCard, 'id' | 'name' | 'scope'> = {
  id: 'code-analysis',
  name: 'Code Review',
  scope: 'Source-code sustainability findings',
};
const CATEGORIES: Record<string, { agent: OverviewAgentId; label: string }> = {
  'uncached-completion': { agent: 'ai-efficiency', label: 'Repeated requests' },
  'oversized-token-request': { agent: 'ai-efficiency', label: 'Output allowance' },
  'ai-retry-storm': { agent: 'ai-efficiency', label: 'Retry storms' },
  'prompt-overhead': { agent: 'ai-efficiency', label: 'Repeated prompt context' },
  'model-tier-mismatch': { agent: 'ai-efficiency', label: 'Oversized model' },
  'idle-compute': { agent: 'digital-waste', label: 'Idle compute' },
  'off-hours-runtime': { agent: 'digital-waste', label: 'Off-hours runtime' },
  'overprovisioned-compute': { agent: 'digital-waste', label: 'Overprovisioned compute' },
  'unattached-storage': { agent: 'digital-waste', label: 'Unattached storage' },
  'oversized-image': { agent: 'digital-waste', label: 'Large container images' },
  'verbose-logging': { agent: 'digital-waste', label: 'Log retention' },
  'carbon-anomaly': { agent: 'carbon-incident', label: 'Energy spikes' },
  'no-autoscale': { agent: 'architecture', label: 'Missing autoscaling' },
  'high-carbon-region': { agent: 'architecture', label: 'High-carbon regions' },
  'inefficient-sizing': { agent: 'architecture', label: 'Oversized instances' },
  'over-replication': { agent: 'disaster-recovery', label: 'Excess replication' },
  'idle-standby': { agent: 'disaster-recovery', label: 'Idle hot standby' },
  'rto-rpo-mismatch': { agent: 'disaster-recovery', label: 'Recovery configuration' },
  'redundant-recording': { agent: 'collaboration', label: 'Duplicate recordings' },
  'excessive-retention': { agent: 'collaboration', label: 'Long retention' },
  'pipeline-cache-miss': { agent: 'pipeline-efficiency', label: 'Cache misses' },
  'redundant-pipeline-run': { agent: 'pipeline-efficiency', label: 'Duplicate runs' },
  'artifact-bloat': { agent: 'pipeline-efficiency', label: 'Large artifacts' },
};
const STAGE_LABELS: Record<LedgerStage, string> = {
  detect: 'Detected',
  investigate: 'Analyzed',
  compare: 'Options recorded',
  simulate: 'Impact estimated',
  approve: 'Decision recorded',
  improve: 'Application attempted',
  verify: 'Verification checked',
};
const SEVERITIES: OverviewEvidence['severity'][] = ['critical', 'high', 'medium', 'low'];
const severity = (value: unknown): OverviewEvidence['severity'] =>
  typeof value === 'string' &&
  SEVERITIES.includes(value.toLowerCase() as OverviewEvidence['severity'])
    ? (value.toLowerCase() as OverviewEvidence['severity'])
    : 'unknown';
const nonnegative = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
const countValue = (value: unknown): number | null => {
  const n = nonnegative(value);
  return n !== null && Number.isSafeInteger(n) ? n : null;
};
const publicId = (value: unknown): string | null =>
  typeof value === 'string' &&
  /^[a-z0-9][a-z0-9._-]{0,99}$/i.test(value) &&
  !/^(?:sk-|AIza)/.test(value)
    ? value
    : null;
const regionName = (value: unknown): string | null =>
  typeof value === 'string' &&
  /^[a-z0-9][a-z0-9 -]{0,59}$/i.test(value) &&
  !/\b(?:secret|password|token|bearer|apikey)\b/i.test(value)
    ? value
    : null;

interface ScopedFinding {
  id: string;
  agentId: string;
  category: string;
  title: string;
  severity: OverviewEvidence['severity'];
  entries: LedgerEntry[];
  evidence: Record<string, unknown>;
  verified: boolean;
  applied: boolean;
}

function scopedFindings(findings: Finding[], run: DashboardRun | null): ScopedFinding[] {
  if (!run) return [];
  const seen = new Set<string>();
  const entriesByFinding = new Map<string, LedgerEntry[]>();
  for (const entry of run.entries) {
    if (entry.runId !== run.runId) continue;
    const entries = entriesByFinding.get(entry.bugId) ?? [];
    entries.push(entry);
    entriesByFinding.set(entry.bugId, entries);
  }
  const result: ScopedFinding[] = [];
  for (const finding of findings) {
    if (seen.has(finding.bugId)) continue;
    const entries = entriesByFinding.get(finding.bugId) ?? [];
    const detection = entryFor(entries, 'detect');
    if (!detection) continue;
    seen.add(finding.bugId);
    const category = publicId(detection.data.category) ?? publicId(finding.category) ?? 'other';
    const recordedAgentId = publicId(detection.data.agentId) ?? publicId(finding.agentId);
    const agentId = recordedAgentId ?? CATEGORIES[category]?.agent ?? 'unassigned';
    result.push({
      id: finding.bugId,
      agentId,
      category,
      title: safeAuditText(
        detection.summary || finding.title,
        'Recorded sustainability finding',
      ).slice(0, 180),
      severity: severity(detection.data.severity ?? finding.severity),
      entries,
      evidence: asRecord(detection.data.evidence),
      verified:
        entryFor(entries, 'improve')?.data.applied === true &&
        entryFor(entries, 'verify')?.data.confirmed === true,
      applied: entryFor(entries, 'improve')?.data.applied === true,
    });
  }
  return result;
}

function recommendations(findings: ScopedFinding[]): OverviewRecommendationCounts {
  const result: OverviewRecommendationCounts = {
    total: 0,
    modelGenerated: 0,
    fallback: 0,
    ruleBased: 0,
    unconfirmed: 0,
    notRecorded: 0,
  };
  for (const finding of findings) {
    const recommendation = resolveRecordedRecommendation(finding.entries);
    const comparison = entryFor(finding.entries, 'compare');
    const explicitText =
      typeof comparison?.data.recommendation === 'string' &&
      comparison.data.recommendation.trim().length > 0;
    if (!recommendation.recommendedId && !explicitText) {
      result.notRecorded++;
      continue;
    }
    result.total++;
    const source = sourceFor(finding);
    if (source.status === 'generated') result.modelGenerated++;
    else if (source.status === 'fallback') result.fallback++;
    else if (source.status === 'offline') result.ruleBased++;
    else result.unconfirmed++;
  }
  return result;
}

type MetricRead = (evidence: Record<string, unknown>) => number | null;
function metric(
  findings: ScopedFinding[],
  id: string,
  label: string,
  unit: string,
  categories: string[],
  read: MetricRead,
  aggregation: OverviewMetric['aggregation'] = 'sum',
): OverviewMetric {
  const relevant = findings.filter((finding) => categories.includes(finding.category));
  const values = relevant.map((finding) => read(finding.evidence));
  const known = values.filter(
    (value): value is number => value !== null && Number.isFinite(value) && value >= 0,
  );
  // A total must cover every applicable finding; never silently present a partial sum as complete.
  const calculated =
    known.length && known.length === relevant.length
      ? aggregation === 'maximum'
        ? Math.max(...known)
        : known.reduce((sum, value) => sum + value, 0)
      : null;
  return {
    id,
    label,
    unit,
    aggregation,
    value: calculated !== null && Number.isFinite(calculated) ? calculated : null,
    evidenceCount: known.length,
    applicableFindings: relevant.length,
  };
}

function metricsFor(
  id: OverviewAgentId,
  findings: ScopedFinding[],
  regions: string[],
): OverviewMetric[] {
  const from =
    (key: string): MetricRead =>
    (evidence) =>
      nonnegative(evidence[key]);
  const tokenCount =
    (key: string): MetricRead =>
    (evidence) =>
      countValue(evidence[key]);
  switch (id) {
    case 'ai-efficiency':
      return [
        metric(
          findings,
          'wasted-tokens',
          'Potentially avoidable tokens',
          'tokens',
          ['uncached-completion', 'ai-retry-storm'],
          tokenCount('wastedTokens'),
        ),
        metric(
          findings,
          'unused-allowance',
          'Unused output allowance',
          'tokens of allowance',
          ['oversized-token-request'],
          tokenCount('wastedHeadroom'),
        ),
        metric(
          findings,
          'retry-attempts',
          'Recorded retries',
          'attempts',
          ['ai-retry-storm'],
          tokenCount('retries'),
        ),
      ];
    case 'digital-waste':
      return [
        metric(
          findings,
          'excess-cores',
          'Estimated excess capacity',
          'cores',
          ['overprovisioned-compute'],
          from('wastedCores'),
        ),
        metric(
          findings,
          'unattached-storage',
          'Unattached storage',
          'GB',
          ['unattached-storage'],
          from('gb'),
        ),
        metric(
          findings,
          'excess-image-size',
          'Estimated excess image size',
          'MB',
          ['oversized-image'],
          from('excessMb'),
        ),
      ];
    case 'carbon-incident':
      return [
        metric(
          findings,
          'peak-energy',
          'Highest recorded interval',
          'kWh',
          ['carbon-anomaly'],
          from('energyKwh'),
          'maximum',
        ),
        metric(
          findings,
          'peak-baseline-ratio',
          'Largest baseline deviation',
          '× baseline',
          ['carbon-anomaly'],
          (e) => {
            const actual = nonnegative(e.energyKwh);
            const baseline = nonnegative(e.baselineKwh);
            return actual !== null && baseline !== null && baseline > 0 ? actual / baseline : null;
          },
          'maximum',
        ),
        metric(
          findings,
          'baseline-energy',
          'Largest recorded baseline',
          'kWh',
          ['carbon-anomaly'],
          from('baselineKwh'),
          'maximum',
        ),
      ];
    case 'architecture':
      return [
        {
          id: 'regions',
          label: 'Regions flagged',
          value:
            regions.length &&
            findings
              .filter((f) => f.category === 'high-carbon-region')
              .every((f) => regionName(f.evidence.region))
              ? regions.length
              : null,
          unit: 'regions',
          aggregation: 'distinct-count',
          evidenceCount: findings.filter(
            (f) => f.category === 'high-carbon-region' && regionName(f.evidence.region),
          ).length,
          applicableFindings: findings.filter((f) => f.category === 'high-carbon-region').length,
        },
        metric(
          findings,
          'sizing-excess',
          'Estimated excess instance size',
          'cores',
          ['inefficient-sizing'],
          from('excessCores'),
        ),
        metric(
          findings,
          'grid-intensity',
          'Highest recorded grid intensity',
          'kg CO₂e/kWh',
          ['high-carbon-region'],
          from('gridIntensityKgPerKwh'),
          'maximum',
        ),
      ];
    case 'disaster-recovery':
      return [
        metric(
          findings,
          'excess-replicas',
          'Rule-estimated extra replicas',
          'replicas',
          ['over-replication'],
          tokenCount('excessReplicas'),
        ),
        metric(
          findings,
          'hot-standby-cores',
          'Hot standby capacity',
          'cores',
          ['idle-standby'],
          from('standbyCores'),
        ),
        metric(
          findings,
          'recovery-point',
          'Largest recorded RPO target',
          'minutes',
          ['rto-rpo-mismatch'],
          from('rpoMinutes'),
          'maximum',
        ),
      ];
    case 'collaboration':
      return [
        metric(
          findings,
          'duplicate-media',
          'Duplicate recording size',
          'GB',
          ['redundant-recording'],
          from('sizeGb'),
        ),
        metric(
          findings,
          'longest-retention',
          'Longest recorded retention',
          'days',
          ['excessive-retention'],
          from('retentionDays'),
          'maximum',
        ),
        metric(
          findings,
          'retention-size',
          'Media with long retention',
          'GB',
          ['excessive-retention'],
          from('sizeGb'),
        ),
      ];
    case 'pipeline-efficiency':
      return [
        metric(
          findings,
          'duplicate-runs',
          'Duplicate-commit runs',
          'runs',
          ['redundant-pipeline-run'],
          tokenCount('duplicateRuns'),
        ),
        metric(
          findings,
          'highest-cache-miss',
          'Highest recorded cache miss rate',
          '%',
          ['pipeline-cache-miss'],
          (e) => {
            const hit = nonnegative(e.cacheHitRatePct);
            return hit === null || hit > 100 ? null : 100 - hit;
          },
          'maximum',
        ),
        metric(
          findings,
          'largest-artifact',
          'Largest artifact per run',
          'MB',
          ['artifact-bloat'],
          from('artifactMbPerRun'),
          'maximum',
        ),
      ];
    case 'code-analysis':
      return [];
  }
}

const FACT_LABELS: Record<string, string[]> = {
  'ai-efficiency': [
    'Potentially avoidable tokens',
    'Unused allowance (not consumed tokens)',
    'Recorded retry attempts',
    'Recorded requests',
    'Configured output limit',
    'Reported output tokens',
  ],
  'digital-waste': [
    'Estimated excess cores',
    'Storage (GB)',
    'Image size (MB)',
    'Estimated excess size (MB)',
    'Daily ingestion (GB)',
    'Retention (days)',
  ],
  'carbon-incident': ['Recorded energy (kWh)', 'Baseline energy (kWh)', 'Baseline ratio'],
  architecture: [
    'Instance cores',
    'Estimated required cores',
    'Estimated excess cores',
    'Estimated idle cores',
    'Autoscaling enabled',
  ],
  'disaster-recovery': [
    'Configured replicas',
    'Rule-estimated replicas',
    'Rule-estimated excess replicas',
    'Standby cores',
    'Configured RPO (minutes)',
    'Standby mode',
  ],
  collaboration: [
    'Size (GB)',
    'Retention (days)',
    'Excess retention (days)',
    'Transcript available',
  ],
  'pipeline-efficiency': [
    'Dependency cache hit rate (%)',
    'Duplicate-commit runs',
    'Artifacts per run (MB)',
    'Median run time (minutes)',
    'Pipeline runs in period',
  ],
};

function evidenceRow(finding: ScopedFinding): OverviewEvidence {
  const facts = evidenceFor(finding.entries).filter(
    (fact) =>
      (FACT_LABELS[finding.agentId] ?? []).includes(fact.label) && fact.label !== 'Baseline ratio',
  );
  if (finding.agentId === 'carbon-incident') {
    const energy = nonnegative(finding.evidence.energyKwh);
    const baseline = nonnegative(finding.evidence.baselineKwh);
    if (energy !== null && baseline !== null && baseline > 0 && Number.isFinite(energy / baseline))
      facts.push({
        label: 'Baseline ratio',
        value: (energy / baseline).toLocaleString(undefined, { maximumFractionDigits: 2 }),
      });
  }
  const region =
    finding.category === 'high-carbon-region' ? regionName(finding.evidence.region) : null;
  if (region) facts.unshift({ label: 'Region', value: region });
  const rto = nonnegative(finding.evidence.rtoMinutes);
  if (finding.agentId === 'disaster-recovery' && rto !== null)
    facts.push({ label: 'Configured RTO (minutes)', value: rto.toLocaleString() });
  return {
    findingId: finding.id,
    agentId: finding.agentId,
    title: finding.title,
    category: finding.category,
    severity: finding.severity,
    applied: finding.applied,
    verified: finding.verified,
    facts: facts.slice(0, 3),
  };
}

const priority = (finding: ScopedFinding) =>
  (!finding.verified ? 100 : 0) +
  { critical: 4, high: 3, medium: 2, low: 1, unknown: 0 }[finding.severity];
const highPriority = (finding: ScopedFinding) =>
  !finding.verified && (finding.severity === 'critical' || finding.severity === 'high');

/** A saved-evidence overview. It does not infer clean scans, live agent health, grades, savings or time trends. */
export function buildOverviewData(findings: Finding[], run: DashboardRun | null): OverviewData {
  const scoped = scopedFindings(findings, run);
  const definitions = scoped.some((finding) => finding.agentId === 'code-analysis')
    ? [...AGENTS, CODE_AGENT]
    : AGENTS;
  const ordered = [...scoped].sort((a, b) => priority(b) - priority(a));
  const agents: OverviewAgentCard[] = definitions.map((definition) => {
    const selected = ordered.filter((finding) => finding.agentId === definition.id);
    const categories = new Map<string, number>();
    for (const finding of selected)
      categories.set(finding.category, (categories.get(finding.category) ?? 0) + 1);
    const regions = [
      ...new Set(
        selected
          .filter((finding) => finding.category === 'high-carbon-region')
          .flatMap((finding) => {
            const region = regionName(finding.evidence.region);
            return region ? [region] : [];
          }),
      ),
    ].sort();
    return {
      ...definition,
      count: selected.length,
      highPriority: selected.filter(highPriority).length,
      verified: selected.filter((finding) => finding.verified).length,
      applied: selected.filter((finding) => finding.applied).length,
      status: selected.length ? 'findings-recorded' : 'no-recorded-findings',
      statusLabel: selected.length
        ? `${selected.length} recorded finding${selected.length === 1 ? '' : 's'}`
        : 'No recorded findings',
      recommendations: recommendations(selected),
      categories: [...categories]
        .map(([id, count]) => ({
          id,
          label: CATEGORIES[id]?.label ?? safeAuditText(id.replace(/[-_]/g, ' '), 'Other finding'),
          count,
        }))
        .sort((a, b) => b.count - a.count),
      metrics: metricsFor(definition.id, selected, regions),
      regions,
      topEvidence: selected.map(evidenceRow),
    };
  });
  return {
    runId: run?.runId ?? null,
    recordedAt:
      run?.timestamp && Number.isFinite(Date.parse(run.timestamp))
        ? new Date(run.timestamp).toISOString()
        : null,
    runKind: run?.kind ?? null,
    summary: {
      findings: scoped.length,
      highPriority: scoped.filter(highPriority).length,
      applied: scoped.filter((finding) => finding.applied).length,
      verified: scoped.filter((finding) => finding.verified).length,
      awaitingAction: scoped.filter((finding) => !finding.applied && !finding.verified).length,
      specialistsWithFindings: agents.filter(
        (agent) => agent.id !== 'code-analysis' && agent.count > 0,
      ).length,
      specialistCount: 7,
      unassignedFindings: scoped.filter(
        (finding) => !definitions.some((agent) => agent.id === finding.agentId),
      ).length,
      recommendations: recommendations(scoped),
    },
    agents,
    stages: STAGES.map((id) => ({
      id,
      label: STAGE_LABELS[id],
      count: scoped.filter((finding) => finding.entries.some((entry) => entry.stage === id)).length,
    })),
    priorityFindings: ordered.filter((finding) => !finding.verified).map(evidenceRow),
  };
}
