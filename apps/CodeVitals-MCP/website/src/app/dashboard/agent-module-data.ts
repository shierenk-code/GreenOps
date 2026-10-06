import type { Finding } from './ledger-dashboard';
import type { LedgerEntry } from './ledger-data';
import { AGENT_MODULE_IDS as ORDERED_AGENT_IDS } from './agent-paths';
import { asRecord, entryFor } from './dashboard-format';
import {
  AGENT_CAPABILITIES,
  buildFindingAudit,
  resolveRecordedRecommendation,
  type AuditActivity,
  type AuditDecision,
  type AuditFact,
} from './dashboard-audit';
import {
  buildOverviewData,
  type DashboardRun,
  type OverviewAgentId,
  type OverviewMetric,
  type OverviewRecommendationCounts,
  type OverviewEvidence,
} from './overview-data';

export type AgentModuleId = Exclude<OverviewAgentId, 'code-analysis'>;
export interface AgentModuleColumn {
  key: string;
  label: string;
}
export interface AgentModuleMetadata {
  id: AgentModuleId;
  name: string;
  goal: string;
  inventoryTitle: string;
  columns: AgentModuleColumn[];
  supportedChecks: string[];
  /** Not established by the supported ledger; never presented as working features. */
  notAvailable: string[];
}
export interface AgentModuleUsage {
  basis: 'per-finding-recorded';
  promptTokens: number | null;
  completionTokens: number | null;
  totalTokens: number | null;
  model: string | null;
  latencyMs: number | null;
  scope: string;
}
export interface AgentModuleRow {
  id: string;
  title: string;
  category: string;
  categoryLabel: string;
  severity: OverviewEvidence['severity'];
  resource: string | null;
  source: string | null;
  /** Ready-to-display allowlisted module-specific table cells. Unknown is null. */
  cells: Record<string, string | null>;
  evidenceFacts: AuditFact[];
  recommendation: {
    recorded: boolean;
    title: string;
    description: string;
    source: string;
    confidence: 'high' | 'medium' | 'low' | 'unknown';
    effort: 'trivial' | 'small' | 'moderate' | 'unknown';
    reversible: boolean | null;
  };
  decision: AuditDecision;
  applied: boolean;
  verified: boolean;
  activity: AuditActivity[];
  /** Workload evidence only. Never GreenOps recommendation-engine token usage. */
  workloadUsage: AgentModuleUsage | null;
}
export interface AgentModuleData extends AgentModuleMetadata {
  runId: string | null;
  recordedAt: string | null;
  statusLabel: string;
  counts: {
    findings: number;
    highPriority: number;
    applied: number;
    verified: number;
    recommendations: OverviewRecommendationCounts;
  };
  metrics: OverviewMetric[];
  categories: Array<{ id: string; label: string; count: number }>;
  rows: AgentModuleRow[];
}

const DEFINITIONS: Record<AgentModuleId, Omit<AgentModuleMetadata, 'id' | 'supportedChecks'>> = {
  'ai-efficiency': {
    name: 'AI Efficiency',
    goal: 'Find repeated requests, excessive retries and output limits that deserve a closer look, then review a token-efficiency recommendation.',
    inventoryTitle: 'AI workload observations',
    columns: [
      { key: 'model', label: 'Workload model' },
      { key: 'tokens', label: 'Recorded input / output' },
      { key: 'allowance', label: 'Unused output allowance' },
      { key: 'retries', label: 'Retry attempts' },
    ],
    notAvailable: [
      'Complete request inventory and deduplicated workload token totals',
      'Token pricing, total spend and verified cost savings',
      'Latency trends and live model health unless explicit workload observations are recorded',
    ],
  },
  'digital-waste': {
    name: 'Digital Waste',
    goal: 'Review idle capacity, unattached storage, large images and retained logs before changing or removing a resource.',
    inventoryTitle: 'Cloud resource observations',
    columns: [
      { key: 'capacity', label: 'Requested / used CPU' },
      { key: 'storage', label: 'Unattached storage' },
      { key: 'image', label: 'Container image' },
      { key: 'logging', label: 'Log ingestion / retention' },
    ],
    notAvailable: [
      'A complete live cloud asset inventory',
      'Provider billing and verified cost reductions',
      'Automatic cloud deletion, ownership validation or safety approval',
    ],
  },
  'carbon-incident': {
    name: 'Carbon Efficiency',
    goal: 'Compare recorded energy spikes with their baseline and investigate their cause before accepting an improvement.',
    inventoryTitle: 'Recorded energy anomalies',
    columns: [
      { key: 'observed', label: 'Observed energy' },
      { key: 'baseline', label: 'Baseline energy' },
      { key: 'deviation', label: 'Baseline deviation' },
    ],
    notAvailable: [
      'The full energy time series or a daily emissions trend',
      'Live incident alerts, forecast emissions or root-cause certainty',
      'Measured carbon reductions without a matched baseline and verified follow-up',
    ],
  },
  architecture: {
    name: 'Architecture',
    goal: 'Review deployment regions, autoscaling and instance sizing with the application requirements in view.',
    inventoryTitle: 'Architecture observations',
    columns: [
      { key: 'region', label: 'Deployment region' },
      { key: 'grid', label: 'Grid intensity' },
      { key: 'capacity', label: 'Provisioned / needed CPU' },
      { key: 'autoscale', label: 'Autoscaling' },
    ],
    notAvailable: [
      'A complete architecture dependency map',
      'Latency, residency and migration feasibility assessment',
      'Automatic infrastructure changes or standards-conformance certification',
    ],
  },
  'disaster-recovery': {
    name: 'Disaster Recovery',
    goal: 'Check whether replication and standby configuration fit the recorded recovery objectives without assuming resilience can safely be reduced.',
    inventoryTitle: 'Recovery configuration observations',
    columns: [
      { key: 'replicas', label: 'Configured / rule-estimated replicas' },
      { key: 'standby', label: 'Standby capacity' },
      { key: 'recovery', label: 'RTO / RPO targets' },
      { key: 'replication', label: 'Replication mode' },
    ],
    notAvailable: [
      'Measured restore times or recovery-drill results',
      'A verified service-level or resilience compliance assessment',
      'Automatic replica removal or proof that a lower-resilience option is safe',
    ],
  },
  collaboration: {
    name: 'Collaboration',
    goal: 'Identify duplicate recordings and long retention, then review what can be removed while respecting ownership and retention requirements.',
    inventoryTitle: 'Recording and retention observations',
    columns: [
      { key: 'size', label: 'Recording size' },
      { key: 'retention', label: 'Retention' },
      { key: 'duplicate', label: 'Duplicate evidence' },
      { key: 'transcript', label: 'Transcript available' },
    ],
    notAvailable: [
      'Recording content analysis or transcript summaries',
      'Verified ownership, legal-hold or retention-policy authorization',
      'Automatic deletion or a complete collaboration-platform inventory',
    ],
  },
  'pipeline-efficiency': {
    name: 'Pipeline Efficiency',
    goal: 'Find CI/CD runs that rebuild work already done: cache misses, duplicate runs for the same commit and oversized artifacts.',
    inventoryTitle: 'Pipeline observations',
    columns: [
      { key: 'runs', label: 'Runs / median time' },
      { key: 'cache', label: 'Cache hit rate' },
      { key: 'duplicates', label: 'Duplicate-commit runs' },
      { key: 'artifacts', label: 'Artifacts per run' },
    ],
    notAvailable: [
      'Live CI/CD run history or per-job runner telemetry',
      'Measured runner energy; runner power is modeled from SKU and utilization',
      'Automatic workflow changes or trigger edits',
    ],
  },
};

export const AGENT_MODULE_IDS = ORDERED_AGENT_IDS.filter(
  (id): id is AgentModuleId => id !== 'code-analysis',
);

const finite = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
const count = (value: unknown): number | null => {
  const number = finite(value);
  return number !== null && Number.isSafeInteger(number) ? number : null;
};
const numberText = (value: number | null, unit = ''): string | null =>
  value === null
    ? null
    : `${value > 0 && value < 0.001 ? '<0.001' : value.toLocaleString(undefined, { maximumFractionDigits: 3 })}${unit ? ` ${unit}` : ''}`;
const bool = (value: unknown): boolean | null =>
  value === true || value === 'true' ? true : value === false || value === 'false' ? false : null;
const enumValue = <T extends string>(value: unknown, values: readonly T[]): T | null =>
  typeof value === 'string' && values.includes(value as T) ? (value as T) : null;
const region = (value: unknown): string | null =>
  typeof value === 'string' &&
  /^[a-z0-9][a-z0-9 -]{0,59}$/i.test(value) &&
  !/\b(?:secret|password|token|bearer|apikey)\b/i.test(value)
    ? value
    : null;
const modelName = (value: unknown): string | null =>
  typeof value === 'string' &&
  /^[a-z0-9][a-z0-9._:/-]{0,79}$/i.test(value) &&
  !/(?:https?:|sk-|AIza|bearer|secret|password|api[_-]?key)/i.test(value)
    ? value
    : null;

/** Missing/invalid aliases are unknown; two contradictory recorded aliases do not silently pick one. */
function aliasCount(
  evidence: Record<string, unknown>,
  first: string,
  second: string,
): number | null {
  if (evidence[first] === undefined) return count(evidence[second]);
  if (evidence[second] === undefined) return count(evidence[first]);
  const a = count(evidence[first]);
  const b = count(evidence[second]);
  return a !== null && a === b ? a : null;
}

function workloadUsage(evidence: Record<string, unknown>): AgentModuleUsage | null {
  const promptTokens = aliasCount(evidence, 'promptTokens', 'inputTokens');
  const completionTokens = aliasCount(evidence, 'completionTokens', 'outputTokens');
  let totalTokens = count(evidence.totalTokens);
  if (
    totalTokens !== null &&
    ((promptTokens !== null && totalTokens < promptTokens) ||
      (completionTokens !== null && totalTokens < completionTokens))
  )
    totalTokens = null;
  if (
    totalTokens !== null &&
    promptTokens !== null &&
    completionTokens !== null &&
    totalTokens !== promptTokens + completionTokens
  )
    totalTokens = null;
  const model = modelName(evidence.model);
  const latencyMs = finite(evidence.latencyMs);
  if (
    [promptTokens, completionTokens, totalTokens, model, latencyMs].every((value) => value === null)
  )
    return null;
  return {
    basis: 'per-finding-recorded',
    promptTokens,
    completionTokens,
    totalTokens,
    model,
    latencyMs,
    scope:
      'Only this finding’s recorded workload evidence. Findings may overlap; these values are not summed into workload-wide usage.',
  };
}

function pair(
  first: number | null,
  second: number | null,
  firstLabel: string,
  secondLabel: string,
  unit: string,
): string | null {
  if (first === null && second === null) return null;
  return `${firstLabel}: ${numberText(first, unit) ?? 'not recorded'} · ${secondLabel}: ${numberText(second, unit) ?? 'not recorded'}`;
}

function moduleCells(
  id: AgentModuleId,
  category: string,
  evidence: Record<string, unknown>,
  usage: AgentModuleUsage | null,
): Record<string, string | null> {
  switch (id) {
    case 'ai-efficiency':
      return {
        model: usage?.model ?? null,
        tokens: pair(
          usage?.promptTokens ?? null,
          usage?.completionTokens ?? null,
          'Input',
          'Output',
          'tokens',
        ),
        allowance:
          category === 'oversized-token-request'
            ? numberText(count(evidence.wastedHeadroom), 'tokens of allowance')
            : null,
        retries:
          category === 'ai-retry-storm' ? numberText(count(evidence.retries), 'attempts') : null,
      };
    case 'digital-waste':
      return {
        capacity:
          category === 'overprovisioned-compute'
            ? pair(
                finite(evidence.requestedCpuCores),
                finite(evidence.usedCpuCores),
                'Requested',
                'Used',
                'cores',
              )
            : null,
        storage: category === 'unattached-storage' ? numberText(finite(evidence.gb), 'GB') : null,
        image: category === 'oversized-image' ? numberText(finite(evidence.sizeMb), 'MB') : null,
        logging:
          category === 'verbose-logging'
            ? [
                numberText(finite(evidence.gbPerDay), 'GB/day'),
                numberText(finite(evidence.retentionDays), 'days retention'),
              ]
                .filter((value) => value !== null)
                .join(' · ') || null
            : null,
      };
    case 'carbon-incident': {
      const observed = finite(evidence.energyKwh);
      const baseline = finite(evidence.baselineKwh);
      const ratio =
        observed !== null && baseline !== null && baseline > 0 ? observed / baseline : null;
      return {
        observed: numberText(observed, 'kWh'),
        baseline: numberText(baseline, 'kWh'),
        deviation:
          ratio !== null && Number.isFinite(ratio) ? numberText(ratio, '× baseline') : null,
      };
    }
    case 'architecture':
      return {
        region: region(evidence.region),
        grid: numberText(finite(evidence.gridIntensityKgPerKwh), 'kg CO₂e/kWh'),
        capacity: pair(
          finite(evidence.instanceCores),
          finite(evidence.neededCores),
          'Provisioned',
          'Needed',
          'cores',
        ),
        autoscale:
          bool(evidence.autoscale) === null
            ? null
            : bool(evidence.autoscale)
              ? 'Enabled'
              : 'Disabled',
      };
    case 'disaster-recovery': {
      const standby = enumValue(evidence.standbyMode, ['hot', 'warm', 'cold']);
      const standbyCores = numberText(finite(evidence.standbyCores), 'cores');
      return {
        replicas: pair(
          count(evidence.replicas),
          count(evidence.justifiedReplicas),
          'Configured',
          'Rule-estimated',
          'replicas',
        ),
        standby: [standby, standbyCores].filter((value) => value !== null).join(' · ') || null,
        recovery: pair(
          finite(evidence.rtoMinutes),
          finite(evidence.rpoMinutes),
          'RTO',
          'RPO',
          'minutes',
        ),
        replication: enumValue(evidence.replicationMode, ['continuous', 'periodic']),
      };
    }
    case 'collaboration':
      return {
        size: numberText(finite(evidence.sizeGb), 'GB'),
        retention: numberText(finite(evidence.retentionDays), 'days'),
        duplicate: category === 'redundant-recording' ? 'Flagged as a duplicate' : null,
        transcript:
          bool(evidence.hasTranscript) === null
            ? null
            : bool(evidence.hasTranscript)
              ? 'Yes'
              : 'No',
      };
    case 'pipeline-efficiency': {
      const runs = count(evidence.runs);
      const median = finite(evidence.medianMinutes);
      return {
        runs:
          runs === null && median === null
            ? null
            : `${numberText(runs, 'runs') ?? 'runs not recorded'} · ${numberText(median, 'min median') ?? 'median not recorded'}`,
        cache:
          category === 'pipeline-cache-miss'
            ? numberText(finite(evidence.cacheHitRatePct), '%')
            : null,
        duplicates:
          category === 'redundant-pipeline-run'
            ? numberText(count(evidence.duplicateRuns), 'runs')
            : null,
        artifacts:
          category === 'artifact-bloat'
            ? numberText(finite(evidence.artifactMbPerRun), 'MB')
            : null,
      };
    }
  }
}

function extraMetrics(id: AgentModuleId, rows: AgentModuleRow[]): OverviewMetric[] {
  if (id !== 'digital-waste') return [];
  // Retention size and daily ingestion are not storage GB-months. Preserve their native units.
  const relevant = rows.filter((row) => row.category === 'verbose-logging');
  const facts = relevant.map((row) =>
    row.evidenceFacts.find((fact) => fact.label === 'Daily ingestion (GB)'),
  );
  // Do not parse localized display strings back into numbers; these rows are inventory-only evidence.
  if (!facts.some(Boolean)) return [];
  return [
    {
      id: 'log-findings',
      label: 'Log retention findings',
      value: relevant.length,
      unit: 'findings',
      aggregation: 'distinct-count',
      evidenceCount: relevant.length,
      applicableFindings: relevant.length,
    },
  ];
}

/** Build a module from recorded findings; never promote a partial ledger into a full resource inventory. */
export function buildAgentModule(
  agentId: string,
  findings: Finding[],
  run: DashboardRun | null,
): AgentModuleData | null {
  if (!Object.hasOwn(DEFINITIONS, agentId)) return null;
  const id = agentId as AgentModuleId;
  const definition = DEFINITIONS[id];
  const overview = buildOverviewData(findings, run);
  const card = overview.agents.find((candidate) => candidate.id === id)!;
  const findingsById = new Map(findings.map((finding) => [finding.bugId, finding]));
  const entriesByFinding = new Map<string, LedgerEntry[]>();
  for (const entry of run?.entries ?? []) {
    if (entry.runId !== run?.runId) continue;
    const entries = entriesByFinding.get(entry.bugId) ?? [];
    entries.push(entry);
    entriesByFinding.set(entry.bugId, entries);
  }
  const rows: AgentModuleRow[] = card.topEvidence.map((publicRow) => {
    const finding = findingsById.get(publicRow.findingId)!;
    const entries = entriesByFinding.get(publicRow.findingId) ?? [];
    const detection = entryFor(entries, 'detect');
    const evidence = asRecord(detection?.data.evidence);
    const selected = resolveRecordedRecommendation(entries);
    const comparison = entryFor(entries, 'compare');
    const fix = asRecord(comparison?.data.fix);
    const explicitText =
      typeof comparison?.data.recommendation === 'string' &&
      comparison.data.recommendation.trim().length > 0;
    const recorded = Boolean(selected.recommendedId || explicitText);
    const audit = buildFindingAudit({
      ...finding,
      entries,
      title: publicRow.title,
      recommendationTitle: selected.title,
      recommendation: selected.description,
    });
    const sourceFile = audit.evidence.find((fact) => fact.label === 'Source file')?.value ?? null;
    const resource =
      audit.evidence.find((fact) => fact.label === 'Resource or symbol')?.value ?? null;
    const usage = id === 'ai-efficiency' ? workloadUsage(evidence) : null;
    const facts = audit.evidence.filter(
      (fact) =>
        !['Source file', 'Source line', 'Resource or symbol', 'Baseline ratio'].includes(
          fact.label,
        ),
    );
    const cells = moduleCells(id, publicRow.category, evidence, usage);
    if (id === 'carbon-incident' && cells.deviation)
      facts.push({ label: 'Baseline deviation', value: cells.deviation });
    if (id === 'architecture' && cells.region)
      facts.push({ label: 'Deployment region', value: cells.region });
    return {
      id: publicRow.findingId,
      title: publicRow.title,
      category: publicRow.category,
      categoryLabel:
        card.categories.find((category) => category.id === publicRow.category)?.label ??
        'Other finding',
      severity: publicRow.severity,
      resource,
      source: sourceFile,
      cells,
      evidenceFacts: facts,
      recommendation: {
        recorded,
        title: audit.recommendation.title,
        description: audit.recommendation.description,
        source: audit.recommendation.source,
        confidence: enumValue(detection?.data.confidence, ['high', 'medium', 'low']) ?? 'unknown',
        effort: enumValue(selected.strategy.effort, ['trivial', 'small', 'moderate']) ?? 'unknown',
        reversible: !recorded
          ? null
          : typeof selected.strategy.reversible === 'boolean'
            ? selected.strategy.reversible
            : typeof fix.reversible === 'boolean'
              ? fix.reversible
              : null,
      },
      decision: audit.decision,
      applied: publicRow.applied,
      verified: publicRow.verified,
      activity: audit.activity,
      workloadUsage: usage,
    };
  });
  return {
    ...definition,
    id,
    columns: definition.columns.map((column) => ({ ...column })),
    supportedChecks: [...AGENT_CAPABILITIES[id]],
    notAvailable: [...definition.notAvailable],
    runId: overview.runId,
    recordedAt: overview.recordedAt,
    statusLabel: card.statusLabel,
    counts: {
      findings: card.count,
      highPriority: card.highPriority,
      applied: card.applied,
      verified: card.verified,
      recommendations: card.recommendations,
    },
    metrics: [...card.metrics, ...extraMetrics(id, rows)],
    categories: card.categories,
    rows,
  };
}
