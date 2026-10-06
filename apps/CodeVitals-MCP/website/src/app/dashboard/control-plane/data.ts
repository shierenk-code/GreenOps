import type { Finding } from '../ledger-dashboard';
import type { LedgerEntry, SelectedRun } from '../ledger-data';
import { rollupForOutcome } from '../baseline-rollup';
import { asRecord, entryFor, formatMeasuredEnergy } from '../dashboard-format';
import {
  buildFindingAudit,
  resolveRecordedRecommendation,
  safeAuditText,
} from '../dashboard-audit';
import { buildAgentModule } from '../agent-module-data';
import { buildOverviewData } from '../overview-data';
import { buildImpactSummary } from '../impact-summary-data';
import { resourcesFor, verificationFor } from './run-evidence';
import { findingInsights } from './agent-insights';
import {
  AGENT_IDS,
  SPECIALIST_KEYS,
  type AgentKey,
  type AgentWorkspace,
  type AuditRow,
  type ChartData,
  type ControlPlaneData,
  type EnvironmentFilter,
  type Fact,
  type Metric,
  type Opportunity,
  type ResourceRow,
  type TimeRange,
  type DateWindow,
} from './types';

const AGENT_ORDER: AgentKey[] = SPECIALIST_KEYS;
const NAMES: Record<AgentKey, string> = {
  carbon: 'Carbon Efficiency',
  waste: 'Digital Waste',
  ai: 'AI Efficiency',
  arch: 'Architecture & Code',
  dr: 'Disaster Recovery',
  collab: 'Collaboration',
  pipeline: 'Pipeline Efficiency',
};
const CATEGORY_AGENT: Record<string, string> = {
  // The core CLI detector records source-code categories without a fleet agentId.
  // Present these in the code/architecture workspace instead of dropping them.
  'dead-code': 'architecture',
  'duplicate-import': 'architecture',
  'redundant-call': 'architecture',
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
const DAYS = { '24h': 1, '7d': 7, '30d': 30, '1y': 365 };
const DAY = 86_400_000;
const numeric = (value: unknown): number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0;
const number = (value: number) =>
  value > 0 && value < 0.001
    ? '<0.001'
    : value.toLocaleString('en-US', { maximumFractionDigits: 3 });
const usd = (value: number) => `$${number(value)}`;
const known = (value: number | null) => (value === null ? 'Not recorded' : number(value));
const metric = (
  label: string,
  value: string,
  hint: string,
  tone: Metric['tone'] = 'green',
): Metric => ({ label, value, hint, tone });
const validDate = (value: unknown): string | null =>
  typeof value === 'string' && Number.isFinite(Date.parse(value))
    ? new Date(value).toISOString()
    : null;
const keyFor = (id: string): AgentKey | undefined =>
  AGENT_ORDER.find((key) => AGENT_IDS[key] === id);

/** A verification must follow the most recent successful application. Approval is never execution. */
function stateFor(entries: LedgerEntry[]): Finding['state'] {
  const application = entries.findLastIndex((entry) => entry.stage === 'improve');
  const verification = entries.findLastIndex((entry) => entry.stage === 'verify');
  if (application >= 0 && entries[application].data.applied === true) {
    return verification > application && entries[verification].data.confirmed === true
      ? 'verified'
      : 'unverified';
  }
  const source = entryFor(entries, 'detect')?.data.source;
  if ((source === 'local' || source === 'github') && application < 0) return 'review-only';
  if (entryFor(entries, 'approve')?.data.approved === false) return 'withheld';
  if (application >= 0 && entries[application].data.applied === false) return 'not-applied';
  return 'in-progress';
}

/** The presentation boundary uses only entries belonging to the selected run. */
export function findingsFromRun(run: SelectedRun | null): Finding[] {
  if (!run) return [];
  const grouped = new Map<string, LedgerEntry[]>();
  for (const entry of run.entries) {
    if (entry.runId !== run.runId) continue;
    grouped.set(entry.bugId, [...(grouped.get(entry.bugId) ?? []), entry]);
  }
  return [...grouped.entries()].flatMap(([bugId, entries]): Finding[] => {
    const detection = entryFor(entries, 'detect');
    if (!detection) return [];
    const selected = resolveRecordedRecommendation(entries);
    const savings = asRecord(entryFor(entries, 'simulate')?.data.savings);
    const fix = asRecord(entryFor(entries, 'compare')?.data.fix);
    const category = safeAuditText(detection.data.category, 'unknown');
    const agentId = safeAuditText(
      detection.data.agentId,
      CATEGORY_AGENT[category] ?? 'code-analysis',
    );
    const key = keyFor(agentId);
    const native = asRecord(detection.data.nativeMetric);
    const confidence = detection.data.confidence;
    return [
      {
        bugId,
        agentId,
        agentName: key ? NAMES[key] : 'Code Analysis',
        category,
        severity: safeAuditText(detection.data.severity, 'unknown').toLowerCase(),
        title: safeAuditText(detection.summary, 'Recorded finding'),
        state: stateFor(entries),
        impactEnergyKwh: numeric(savings.energyKwh),
        impactCarbonKg: numeric(savings.carbonKgCo2e),
        confidence:
          confidence === 'high' || confidence === 'medium' || confidence === 'low'
            ? confidence
            : 'unknown',
        effort: safeAuditText(selected.strategy.effort, 'unknown'),
        recommendationId: selected.recommendedId || 'manual-review',
        recommendationTitle: selected.title,
        recommendation: selected.description,
        expectedReductionFactor: numeric(selected.strategy.expectedReductionFactor),
        reversible: selected.strategy.reversible === true || fix.reversible === true,
        nativeMetric:
          typeof native.metric === 'string' &&
          typeof native.perRun === 'number' &&
          Number.isFinite(native.perRun) &&
          native.perRun >= 0
            ? {
                metric: safeAuditText(native.metric, 'Recorded metric'),
                perRun: native.perRun,
                unit: safeAuditText(native.unit, 'units'),
              }
            : undefined,
        entries,
      },
    ];
  });
}

/** Environment comes from an explicit environment field, never a resource-name guess. */
function environmentFor(finding: Finding): EnvironmentFilter | null {
  const detection = entryFor(finding.entries, 'detect');
  const evidence = asRecord(detection?.data.evidence);
  const value = detection?.data.environment ?? evidence.environment;
  if (typeof value !== 'string') return null;
  if (['prod', 'production'].includes(value.trim().toLowerCase())) return 'Prod';
  if (['staging', 'stage'].includes(value.trim().toLowerCase())) return 'Staging';
  return null;
}

export function validDateWindow(window?: DateWindow): boolean {
  const valid = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
  return Boolean(window && valid(window.from) && valid(window.to) && window.from <= window.to);
}
function withinRange(timestamp: string | null, asOf: string | null, timeRange: TimeRange, window?: DateWindow): boolean {
  if (!timestamp || !asOf) return false;
  const time = Date.parse(timestamp);
  if (timeRange === 'custom') {
    if (!validDateWindow(window)) return false;
    return time >= Date.parse(window!.from) && time < Date.parse(window!.to) + DAY && time <= Date.parse(asOf);
  }
  const end = Date.parse(asOf);
  return time <= end && time >= end - DAYS[timeRange] * DAY;
}

export function buildRecordedData(
  run: SelectedRun | null,
  findings: Finding[],
  environment: EnvironmentFilter,
  timeRange: TimeRange,
  window?: DateWindow,
): ControlPlaneData {
  // Rebuild public fields instead of trusting stale presentation fields supplied by a caller.
  const requestedIds = new Set(findings.map((finding) => finding.bugId));
  const current = findingsFromRun(run).filter((finding) => requestedIds.has(finding.bugId));
  const asOf = validDate(run?.timestamp);
  const selected = current.filter(
    (finding) =>
      (environment === 'All' || environmentFor(finding) === environment) &&
      withinRange(validDate(entryFor(finding.entries, 'detect')?.timestamp), asOf, timeRange, window),
  );
  const ids = new Set(selected.map((finding) => finding.bugId));
  const scopedRun = run
    ? {
        ...run,
        entries: run.entries.filter((entry) => entry.runId === run.runId && ids.has(entry.bugId)),
      }
    : null;
  const overview = buildOverviewData(selected, scopedRun);
  const impact = buildImpactSummary(selected, scopedRun);
  const reviewEstimates = { energyKwh: 0, carbonKg: 0, findings: 0 };
  for (const finding of selected) {
    const savings = entryFor(finding.entries, 'simulate')?.data.savings as Record<string, unknown> | undefined;
    if (savings && typeof savings.energyKwh === 'number' && Number.isFinite(savings.energyKwh) && savings.energyKwh >= 0 && typeof savings.carbonKgCo2e === 'number' && Number.isFinite(savings.carbonKgCo2e) && savings.carbonKgCo2e >= 0) {
      reviewEstimates.energyKwh += savings.energyKwh;
      reviewEstimates.carbonKg += savings.carbonKgCo2e;
      reviewEstimates.findings++;
    }
  }
  const runImpact = buildImpactSummary(current, run);
  const opportunities: Opportunity[] = [];
  const ledger: AuditRow[] = [];
  const agents: AgentWorkspace[] = AGENT_ORDER.map((key) => {
    const agentModule = buildAgentModule(AGENT_IDS[key], selected, scopedRun)!;
    for (const row of agentModule.rows) {
      const finding = selected.find((candidate) => candidate.bugId === row.id)!;
      const audit = buildFindingAudit(finding);
      opportunities.push({
        ...findingInsights(finding),
        verification: verificationFor(finding),
        id: row.id,
        agentKey: key,
        title: row.recommendation.recorded ? row.recommendation.title : row.title,
        target: row.resource ?? row.source ?? row.title,
        description: row.title,
        recommendation: row.recommendation.description,
        evidence: audit.evidence,
        risk: 'Unknown',
        riskNote:
          'Implementation risk needs a human assessment; finding severity is not deployment risk.',
        confidence: row.recommendation.confidence,
        source: row.recommendation.source,
        monthlyUsd: null,
        carbonKg: null,
        status:
          finding.state === 'verified'
            ? 'verified'
            : finding.state === 'unverified'
              ? 'applied'
              : 'pending',
        history: audit.activity.map((activity) => ({
          label: activity.timestamp ? `${activity.label} · ${activity.timestamp}` : activity.label,
          value: activity.detail,
        })),
      });
      for (const activity of audit.activity) {
        ledger.push({
          id: `${row.id}-${activity.sequence}`,
          timestamp: activity.timestamp ?? 'Not recorded',
          agent: NAMES[key],
          action: activity.detail,
          costSavings: 'Not measured',
          carbonSaved: 'Not measured',
          status: activity.label,
          findingId: row.id,
        });
      }
    }
    return {
      key,
      name: NAMES[key],
      description: agentModule.goal,
      savingsMonthly: null,
      runCostMonthly: null,
      roiPercent: null,
      metrics: [
        ...agentModule.metrics
          .slice(0, 3)
          .map((item) =>
            metric(
              item.label,
              item.value === null ? 'Not recorded' : `${number(item.value)} ${item.unit}`,
              `${item.evidenceCount} recorded observations · ${item.aggregation === 'maximum' ? 'highest observed value' : item.aggregation === 'sum' ? 'sum of finding estimates; overlap may exist' : 'distinct count'}`,
            ),
          ),
        ...(key === 'waste'
          ? [
              metric(
                'Log retention findings',
                `${agentModule.rows.filter((row) => row.category === 'verbose-logging').length} findings`,
                'Recorded log-retention findings in this scope · distinct count, not total retained storage.',
                'purple',
              ),
            ]
          : []),
      ],
      inventoryTitle: agentModule.inventoryTitle,
      columns: agentModule.columns.map((column) => column.label),
      rows: agentModule.rows.map((row) => {
        const state = selected.find((finding) => finding.bugId === row.id)?.state;
        return {
          id: row.id,
          name: row.resource ?? row.title,
          cells: agentModule.columns.map((column) => row.cells[column.key] ?? 'Not recorded'),
          opportunityId: row.id,
          status:
            state === 'verified'
              ? 'Check passed'
              : state === 'unverified'
                ? 'Applied; check needed'
                : 'Needs review',
          facts: [
            { label: 'Source', value: row.source ?? 'Source file not recorded' },
            ...row.evidenceFacts,
          ],
        };
      }),
      chart: {
        title: 'Findings by check',
        description: 'Recorded findings in the selected scope; not a live inventory.',
        primaryLabel: 'Findings',
        primaryUnit: 'findings',
        points: agentModule.categories.map((category) => ({
          label: category.label,
          primary: category.count,
        })),
      },
    };
  });
  const unknownEnvironment = current.filter((finding) => environmentFor(finding) === null).length;
  const usage = runImpact.agentUsage;
  const energy = runImpact.recordedEstimates.find((estimate) => estimate.id === 'agent-energy');
  return {
    mode: 'recorded',
    baselineRollup: rollupForOutcome(run?.outcome),
    resourceUsage: resourcesFor(run),
    asOf,
    reviewEstimates,
    reviewCategories: {
      title: 'Findings by category', description: 'Distinct findings in the selected recorded review.',
      primaryLabel: 'Findings', primaryUnit: 'findings',
      points: [...new Set(selected.map(finding => finding.category))].map(category => ({
        label: category.replaceAll('-', ' '), primary: selected.filter(finding => finding.category === category).length,
      })),
    },
    runId: run?.runId ?? null,
    agents,
    opportunities,
    ledger: ledger.sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp)),
    executiveMetrics: [
      metric(
        'Monthly savings',
        'Not measured',
        'Billing and an approved monthly baseline are needed.',
      ),
      metric(
        'Verified improvements',
        number(impact.verifiedChanges),
        'Successful follow-up checks; not measured carbon savings.',
        'blue',
      ),
      metric(
        'Opportunities to review',
        number(opportunities.filter((item) => item.status === 'pending').length),
        `${overview.summary.highPriority} high-priority findings in this scope.`,
        'amber',
      ),
      metric(
        'Net agent ROI',
        'Not established',
        'Comparable benefit and operating-cost measurements are needed.',
        'purple',
      ),
    ],
    trend: {
      title: 'Savings & carbon impact over time',
      description:
        'This run does not contain matched monthly financial and carbon measurements. Estimates are not presented as achieved savings.',
      primaryLabel: 'Measured monthly savings',
      primaryUnit: 'USD',
      secondaryLabel: 'Measured carbon reduction',
      secondaryUnit: 'kg CO₂e',
      points: [],
    },
    selfAudit: [
      metric(
        'Agent analysis tokens',
        usage.totalTokens === null ? 'Total unknown' : number(usage.totalTokens),
        usage.explanation,
        'purple',
      ),
      metric(
        'Agent energy footprint',
        energy ? formatMeasuredEnergy(energy.value) : 'Not established',
        energy
          ? 'Run-wide model-based estimate, not direct energy metering.'
          : 'A complete matching footprint record is needed.',
        'amber',
      ),
      metric(
        'Net sustainability return',
        'Not established',
        runImpact.netCarbonBenefit.explanation,
      ),
    ],
    usageDetails: [
      {
        label: 'Usage scope',
        value: 'Entire selected run; not prorated by environment or finding date filters.',
      },
      { label: 'Usage completeness', value: usage.completeness },
      { label: 'Reported token subtotal', value: known(usage.knownTokens) },
      { label: 'Model calls', value: known(usage.llmCalls) },
      { label: 'Calls with unknown usage', value: known(usage.unknownLlmCalls) },
      { label: 'Tool calls', value: known(usage.toolCalls) },
      { label: 'Retries', value: known(usage.retries) },
      ...runImpact.measurementGaps.map((gap, index) => ({
        label: `Measurement gap ${index + 1}`,
        value: gap,
      })),
    ],
    filterNote: run
      ? `${selected.length} of ${current.length} findings · ${environment === 'All' ? 'all recorded environments' : `explicit ${environment} tags only`} · detected ${timeRange === 'custom' ? `between ${window?.from || 'unset'} and ${window?.to || 'unset'} (UTC)` : `within ${timeRange} before this snapshot`}. ${unknownEnvironment} findings have no recognized environment tag and appear only in All. Agent footprint remains run-wide.`
      : 'No saved run loaded. Load a ledger or explore the clearly labeled sample workspace.',
  };
}

// The demonstration model below is isolated from recorded results and never used as a fallback.
// Prices, carbon values and equivalence factors are invented scenario assumptions, not live rates.
const SAMPLE_AS_OF = '2026-10-04T12:00:00.000Z';
interface SampleDefinition {
  description: string;
  savings: number;
  carbon: number;
  cost: number;
  title: string;
  recommendation: string;
  risk: Opportunity['risk'];
  riskNote: string;
  inventory: string;
  columns: string[];
}
/** Agents with an illustrative sample scenario. Pipeline Efficiency is shown from recorded runs only. */
type SampleKey = Exclude<AgentKey, 'pipeline'>;
const SAMPLE_ORDER = AGENT_ORDER.filter((key): key is SampleKey => key !== 'pipeline');
const SAMPLE: Record<SampleKey, SampleDefinition> = {
  ai: {
    description:
      'Route each task to the right model, reuse repeated responses and control token spend.',
    savings: 12100,
    carbon: 2890,
    cost: 850,
    title: 'Route routine extraction to a smaller model',
    recommendation:
      'Benchmark a compact model on the synthetic extraction set, enable response caching for repeated public prompts, and keep a quality-gated fallback to the larger model.',
    risk: 'Medium',
    riskNote:
      'Quality, schema accuracy and sensitive-data isolation must pass a benchmark before changing the route.',
    inventory: 'Prompt & model routing opportunities',
    columns: ['Model route', 'Token volume', 'Cache opportunity', 'Retry rate'],
  },
  waste: {
    description:
      'Find unused volumes, outdated images and retained logs before they become permanent overhead.',
    savings: 8400,
    carbon: 1420,
    cost: 320,
    title: 'Archive orphaned snapshots and unattached volumes',
    recommendation:
      'Confirm the owner, retention requirements and restore test; move eligible snapshots to a cold tier before scheduling a separately authorized cleanup.',
    risk: 'Medium',
    riskNote:
      'Deletion is destructive. Ownership, legal holds and recovery evidence must be checked first.',
    inventory: 'Unused cloud asset inventory',
    columns: ['Asset type', 'Unused capacity', 'Age', 'Environment'],
  },
  carbon: {
    description:
      'Compare regional intensity scenarios and reschedule flexible jobs within their service constraints.',
    savings: 5200,
    carbon: 4100,
    cost: 410,
    title: 'Schedule flexible batch jobs in a lower-intensity region',
    recommendation:
      'Compare the synthetic region profiles, verify residency and latency constraints, then propose a bounded migration window with a rollback path.',
    risk: 'Medium',
    riskNote:
      'Data residency, transfer emissions, deadline and availability impacts still require review.',
    inventory: 'Regional workload & carbon scenarios',
    columns: ['Region', 'Grid intensity', 'Flexible energy', 'Source'],
  },
  arch: {
    description:
      'Review Terraform sizing, autoscaling and processor choices with a deployable change plan.',
    savings: 4500,
    carbon: 1850,
    cost: 200,
    title: 'Rightsize an over-provisioned service and enable autoscaling',
    recommendation:
      'Draft a Terraform change that reduces the instance floor and adds bounded autoscaling. Review load-test evidence and a rollback plan before applying it.',
    risk: 'High',
    riskNote:
      'Capacity changes can affect service performance. A representative load test and deployment approval are required.',
    inventory: 'Infrastructure-as-code review',
    columns: ['IaC module', 'Observed CPU', 'Proposed change', 'Risk'],
  },
  dr: {
    description:
      'Balance recovery objectives with the cost and footprint of always-on standby capacity.',
    savings: 3100,
    carbon: 2200,
    cost: 150,
    title: 'Move an eligible standby dataset to a warm recovery tier',
    recommendation:
      'Test a warm-standby restore in the isolated scenario, compare the measured drill with the RTO/RPO targets, and retain hot replicas for critical services.',
    risk: 'High',
    riskNote:
      'A cheaper tier is not compliant until an actual restore meets the agreed recovery targets.',
    inventory: 'Recovery objectives & storage tiers',
    columns: ['Current tier', 'Proposed tier', 'RTO / RPO', 'Drill status'],
  },
  collab: {
    description:
      'Retain searchable decisions while reducing duplicate recordings and unnecessary media storage.',
    savings: 950,
    carbon: 360,
    cost: 80,
    title: 'Retain transcripts and archive duplicate meeting recordings',
    recommendation:
      'Review the synthetic transcript, verify the retention policy and ownership, then propose archival of duplicate raw video while keeping the decision summary searchable.',
    risk: 'Medium',
    riskNote: 'Ownership, consent and legal retention take precedence over storage savings.',
    inventory: 'Meeting knowledge & media lifecycle',
    columns: ['Raw video', 'Transcript', 'Retention', 'Next step'],
  },
};

interface SampleScenario {
  name: string;
  title: string;
  description: string;
  recommendation: string;
}
const scenario = (
  name: string,
  title: string,
  description: string,
  recommendation: string,
): SampleScenario => ({ name, title, description, recommendation });

/** Distinct workflow examples, not multiple copies of one opportunity. */
const SCENARIOS: Record<SampleKey, SampleScenario[]> = {
  ai: [
    scenario(
      'Ticket extraction router',
      'Route routine extraction to a smaller model',
      'A large model processes short, structured classification requests in the synthetic workload.',
      'Benchmark a compact model on the labeled extraction set. Route only tasks that meet the quality threshold, retaining a larger-model fallback for ambiguous inputs.',
    ),
    scenario(
      'Public FAQ response cache',
      'Reuse repeated public FAQ responses',
      'Identical public FAQ prompts account for 58% of requests in this scenario.',
      'Cache responses by normalized prompt, model version and generation settings. Use a 24-hour TTL and bypass the cache for personal, time-sensitive or non-deterministic requests.',
    ),
    scenario(
      'Embedding ingestion worker',
      'Bound retries in the embedding worker',
      'The synthetic ingestion worker retries failed requests immediately, amplifying token use and rate-limit pressure.',
      'Retry transient failures only, with exponential backoff, jitter and a three-attempt budget. Deduplicate completed batches and open a circuit breaker after repeated failures.',
    ),
    scenario(
      'Research tool aggregator',
      'Consolidate repeated tool results before inference',
      'The research workflow sends overlapping search results to the model after every tool call.',
      'Deduplicate source documents, batch independent tool lookups and pass a bounded evidence digest to the model. Preserve source citations and test answer completeness.',
    ),
    scenario(
      'Document tagging completion policy',
      'Right-size output limits for document tagging',
      'Short tag lists use a broad output allowance that is unrelated to observed completion length.',
      'Set per-task output limits from the measured completion-length distribution. Track truncation and schema validity; unused allowance is not itself consumed-token savings.',
    ),
  ],
  waste: [
    scenario(
      'Detached analytics volumes',
      'Review detached analytics volumes for removal',
      'Unattached block volumes remain billable after an analytics environment was retired.',
      'Identify each owner and confirm the volume is not referenced by a recovery plan. Validate a recoverable snapshot, obtain a deletion approval and stage the removal with a rollback window.',
    ),
    scenario(
      'Stale build container images',
      'Expire unreferenced container image layers',
      'Superseded build images retain large layers without a current deployment reference.',
      'Check running workload digests and rollback tags. Keep the latest supported releases, then propose a 30-day expiry rule for unreferenced images.',
    ),
    scenario(
      'Verbose application log archive',
      'Archive aged application logs using tiered retention',
      'High-volume debug logs stay in the hot tier beyond their operational use window.',
      'Reduce unnecessary debug ingestion, keep searchable operational logs for 14 days, then archive eligible records. Apply legal-hold exceptions before any expiry.',
    ),
    scenario(
      'Retired test snapshot chain',
      'Consolidate redundant test snapshots',
      'A retired test database has overlapping snapshot chains and no documented expiry owner.',
      'Verify snapshot dependencies and perform a restore test. Retain the approved recovery points and propose expiry of redundant snapshots only after ownership review.',
    ),
    scenario(
      'Idle self-hosted build runners',
      'Schedule idle build runners off outside build windows',
      'Dedicated runners retain compute capacity overnight despite no queued builds.',
      'Use queue-driven scaling and a minimum warm pool. Drain active jobs before shutdown and retain a manual override for release operations.',
    ),
  ],
  carbon: [
    scenario(
      'Regional analytics ETL',
      'Move eligible ETL to a lower-intensity region',
      'A flexible ETL workload has a lower-intensity candidate region in the synthetic grid profile.',
      'Check data residency, transfer emissions and the four-hour deadline. Propose a canary migration to the candidate region with source-region rollback.',
    ),
    scenario(
      'Overnight model evaluation',
      'Defer model evaluations to a cleaner time window',
      'Non-urgent evaluation jobs overlap an evening grid-intensity peak in this scenario.',
      'Schedule evaluations within the next approved eight-hour window using the synthetic forecast. Keep an immediate-run override for urgent regression investigations.',
    ),
    scenario(
      'Concurrent batch scheduler',
      'Stagger batch jobs to reduce peak energy demand',
      'Independent batch jobs start together and create a modeled power spike.',
      'Apply a bounded concurrency limit and stagger low-priority jobs. Validate total energy and completion deadlines; reducing peak demand alone does not prove lower emissions.',
    ),
    scenario(
      'Media transcoding window',
      'Shift non-urgent transcoding out of the carbon peak',
      'Back-catalog transcoding runs during the highest-intensity interval in the scenario.',
      'Separate urgent uploads from back-catalog work. Pause flexible jobs during the peak and resume within the 12-hour processing objective, measuring end-to-end energy.',
    ),
    scenario(
      'Monthly reporting location',
      'Compare regional reporting routes before migration',
      'A repeatable reporting job can be evaluated in two regions without changing its output.',
      'Run equivalent small benchmarks in both candidate routes, including data-transfer overhead. Propose a region change only if quality, residency and net-emissions checks pass.',
    ),
  ],
  arch: [
    scenario(
      'Catalog API Terraform module',
      'Rightsize the catalog API instance floor',
      'The catalog API reserves substantially more CPU than its synthetic load requires.',
      'Draft a smaller minimum instance size, load-test peak traffic and keep the current configuration as an immediate rollback. Review latency and error-rate thresholds before deployment.',
    ),
    scenario(
      'Worker pool autoscaling module',
      'Add queue-driven autoscaling to worker pools',
      'A fixed worker replica count runs continuously despite a variable synthetic queue.',
      'Scale from queue depth with bounded minimum and maximum replicas. Test backlog recovery and graceful drain behavior before applying the Terraform patch.',
    ),
    scenario(
      'Batch processor architecture module',
      'Evaluate ARM-compatible batch processors',
      'A portable batch service is pinned to one processor family without comparative measurements.',
      'Build the ARM image, validate native dependencies and compare equivalent job runs. Keep the same vCPU count until throughput, energy and compatibility evidence supports a sizing change.',
    ),
    scenario(
      'Non-production schedule module',
      'Schedule non-production capacity around working hours',
      'A staging cluster retains its full node floor throughout nights and weekends.',
      'Draft scheduled capacity rules with opt-out tags for release testing. Stop only drained, non-critical workloads and retain an on-demand wake-up path.',
    ),
    scenario(
      'Shared node placement module',
      'Improve node packing with bounded workload placement',
      'Small workloads are spread across lightly occupied nodes in the modeled cluster.',
      'Review requests and limits, then draft consolidation rules that retain disruption budgets and failure-domain separation. Validate eviction safety before reducing node count.',
    ),
  ],
  dr: [
    scenario(
      'Analytics warm-standby plan',
      'Test warm standby for the analytics dataset',
      'A non-critical analytics dataset uses hot standby despite a four-hour recovery objective.',
      'Run an isolated warm-standby restoration drill. Compare recovery time with the four-hour RTO and one-hour RPO before approving any tier change.',
    ),
    scenario(
      'Sandbox cold-restore plan',
      'Move eligible sandbox backups to a cold tier',
      'Sandbox recovery allows a full day, but backups remain in an always-ready warm tier.',
      'Confirm the 24-hour RTO and 12-hour RPO with the owner. Test cold retrieval plus restoration, including retrieval cost, before changing the lifecycle rule.',
    ),
    scenario(
      'Payments critical recovery policy',
      'Tune backup cadence without reducing critical replicas',
      'A critical synthetic service has redundant backup jobs but strict recovery targets.',
      'Keep hot failover replicas and continuous recovery logs. Deduplicate overlapping full-backup jobs, then prove the 30-minute RTO and five-minute RPO in a controlled drill.',
    ),
    scenario(
      'Reporting regional restore plan',
      'Review regional replica placement for reporting',
      'A reporting service maintains multiple hot replicas while its declared restore window is eight hours.',
      'Retain regional fault isolation and compare a mixed hot/warm design. Simulate regional loss and verify the eight-hour RTO and two-hour RPO before removing any replica.',
    ),
    scenario(
      'Document backup deduplication plan',
      'Deduplicate backup content before adding capacity',
      'Repeated document versions inflate warm backup storage in the synthetic dataset.',
      'Test content-addressed deduplication with immutable recovery points. Restore a representative sample and validate the two-hour RTO and 30-minute RPO before rollout.',
    ),
  ],
  collab: [
    scenario(
      'Engineering sync duplicate recordings',
      'Archive duplicate engineering-sync recordings',
      'The same synthetic meeting is stored in several team folders.',
      'Confirm a canonical recording and transcript, review ownership and legal holds, then propose archival of duplicate copies while preserving shared access links.',
    ),
    scenario(
      'Architecture decision transcript index',
      'Index transcripts instead of reprocessing meeting video',
      'Teams repeatedly submit the same architecture meeting media for summaries.',
      'Index the reviewed transcript and decision summary once. Answer subsequent lookups from the indexed source with citations; reprocess only when the source changes.',
    ),
    scenario(
      'Quarterly planning retention review',
      'Apply an owner-reviewed meeting retention policy',
      'Old planning recordings have indefinite retention without a documented business owner.',
      'Assign an owner and classify each recording. Preserve required decision records and legal holds, then propose a 90-day video retention rule for eligible meetings.',
    ),
    scenario(
      'Training library media compression',
      'Create efficient access copies of training recordings',
      'High-resolution training recordings are distributed even when a smaller format meets the viewing need.',
      'Encode a lower-bitrate access copy and validate legibility and captions. Keep the source where required; replace duplicate distribution copies only after owner approval.',
    ),
    scenario(
      'Recurring status-summary pipeline',
      'Reuse unchanged transcript summaries across workflows',
      'Several automations independently summarize identical synthetic meeting transcripts.',
      'Share versioned summaries keyed to transcript hash and prompt version. Respect access boundaries and rerun summarization only after a substantive source change.',
    ),
  ],
};

interface SampleRecord {
  id: string;
  key: SampleKey;
  environment: 'Prod' | 'Staging';
  timestamp: string;
  factor: number;
  monthlyUsd: number;
  carbonKg: number;
  runCostUsd: number;
  row: ResourceRow;
  scenario: SampleScenario;
  index: number;
}
const COHORTS = [
  { days: 0.2, factor: 0.25, environment: 'Prod' as const },
  { days: 3, factor: 0.25, environment: 'Staging' as const },
  { days: 12, factor: 0.2, environment: 'Prod' as const },
  { days: 24, factor: 0.2, environment: 'Staging' as const },
  { days: 120, factor: 0.1, environment: 'Prod' as const },
];

function sampleRow(
  key: SampleKey,
  index: number,
  factor: number,
  environment: string,
): ResourceRow {
  const id = `sample-${key}-${index + 1}`;
  const shared: Fact[] = [
    { label: 'Source', value: 'Synthetic scenario' },
    { label: 'Environment', value: environment },
  ];
  const example = SCENARIOS[key][index];
  const base = { id, name: example.name, opportunityId: id, status: 'Sample · needs review' };
  switch (key) {
    case 'ai':
      return {
        ...base,
        cells: [
          [
            'Large → compact model',
            'Balanced model + cache',
            'Embedding model',
            'Large model + tool digest',
            'Compact structured output',
          ][index],
          `${number(42.8 * factor)}M / month`,
          `${[4, 58, 8, 12, 2][index]}% repeated prompts`,
          `${[1.2, 0.5, 18, 3.5, 0.8][index]}%`,
        ],
        facts: [
          ...shared,
          { label: 'Input tokens', value: `${number(36 * factor)}M / month` },
          { label: 'Output tokens', value: `${number(6.8 * factor)}M / month` },
          { label: 'Observed issue', value: example.description },
          { label: 'Benchmark', value: 'Synthetic quality evaluation required before approval' },
        ],
      };
    case 'waste':
      return {
        ...base,
        cells: [
          [
            'Detached volumes',
            'Unreferenced images',
            'Aged application logs',
            'Redundant snapshots',
            'Idle build runners',
          ][index],
          index === 4 ? '16 vCPU' : `${number(420 * factor)} TB`,
          [
            '93 days unattached',
            '45 days unreferenced',
            '180 days retained',
            '120 days since retirement',
            '12 idle hours / day',
          ][index],
          environment,
        ],
        facts: [
          ...shared,
          { label: 'Capacity', value: index === 4 ? '16 vCPU' : `${number(420 * factor)} TB` },
          { label: 'Observed issue', value: example.description },
          {
            label: 'Safety check',
            value: [
              'Owner and snapshot restoration',
              'Deployment digests and rollback tags',
              'Legal holds and searchable retention',
              'Snapshot dependency and restoration',
              'Active job drain and release override',
            ][index],
          },
        ],
      };
    case 'carbon':
      return {
        ...base,
        cells: [
          [
            'US East → Europe North',
            'Europe West · time shift',
            'US Central · staged batches',
            'Europe West · off-peak',
            'US West → Europe North',
          ][index],
          `${[480, 310, 360, 620, 260][index]} → ${[45, 110, 160, 280, 95][index]} g CO₂e/kWh`,
          `${number((SAMPLE.carbon.carbon * factor) / ([480, 310, 360, 620, 260][index] - [45, 110, 160, 280, 95][index]))} MWh`,
          'Synthetic scenario',
        ],
        facts: [
          ...shared,
          {
            label: 'Current grid intensity',
            value: `${[480, 310, 360, 620, 260][index]} g CO₂e/kWh`,
          },
          {
            label: 'Candidate grid intensity',
            value: `${[45, 110, 160, 280, 95][index]} g CO₂e/kWh`,
          },
          {
            label: 'Flexible workload',
            value: `${number((SAMPLE.carbon.carbon * factor) / ([480, 310, 360, 620, 260][index] - [45, 110, 160, 280, 95][index]))} MWh / month`,
          },
          {
            label: 'Constraint',
            value: [
              '4-hour deadline; residency review required',
              '8-hour window; urgent regression override',
              '6-hour queue deadline; energy metering required',
              '12-hour back-catalog processing objective',
              'Equivalent report output; transfer overhead included',
            ][index],
          },
          {
            label: 'Projection basis',
            value:
              'Synthetic eligible energy × difference in scenario grid intensity; not a forecast or verified result',
          },
        ],
      };
    case 'arch':
      return {
        ...base,
        cells: [
          [
            'services/catalog-api.tf',
            'workers/queue-pool.tf',
            'batch/processor.tf',
            'environments/staging.tf',
            'cluster/node-placement.tf',
          ][index],
          `${[4, 7, 42, 3, 11][index]}% average`,
          [
            'Smaller instance floor',
            'Queue-driven autoscaling',
            'ARM compatibility benchmark',
            'Working-hours schedule',
            'Bounded node consolidation',
          ][index],
          'High',
        ],
        facts: [
          ...shared,
          { label: 'Provisioned capacity', value: `${Math.round(160 * factor)} vCPU` },
          { label: 'Average utilization', value: `${[4, 7, 42, 3, 11][index]}%` },
          {
            label: 'Proposed validation',
            value: [
              'Peak traffic load test',
              'Backlog recovery and graceful drain',
              'Native dependency and energy benchmark',
              'Release override and wake-up test',
              'Disruption budget and eviction test',
            ][index],
          },
          { label: 'Patch status', value: 'Draft proposal only; no deployment' },
        ],
      };
    case 'dr':
      return {
        ...base,
        cells: [
          [
            'Hot standby',
            'Warm backups',
            'Hot replicas + full backups',
            'Multiple hot replicas',
            'Warm versioned backups',
          ][index],
          [
            'Warm standby',
            'Cold archive',
            'Hot replicas + deduplicated backups',
            'Mixed hot / warm',
            'Warm deduplicated backups',
          ][index],
          [
            '4 hours / 1 hour',
            '24 hours / 12 hours',
            '30 minutes / 5 minutes',
            '8 hours / 2 hours',
            '2 hours / 30 minutes',
          ][index],
          'Sample drill required',
        ],
        facts: [
          ...shared,
          {
            label: 'RTO target',
            value: ['4 hours', '24 hours', '30 minutes', '8 hours', '2 hours'][index],
          },
          {
            label: 'RPO target',
            value: ['1 hour', '12 hours', '5 minutes', '2 hours', '30 minutes'][index],
          },
          {
            label: 'Current tier',
            value: [
              'Hot standby',
              'Warm backups',
              'Hot replicas + full backups',
              'Multiple hot replicas',
              'Warm versioned backups',
            ][index],
          },
          {
            label: 'Proposed tier',
            value: [
              'Warm standby',
              'Cold archive',
              'Hot replicas + deduplicated backups',
              'Mixed hot / warm',
              'Warm deduplicated backups',
            ][index],
          },
          { label: 'Stored capacity', value: `${number(240 * factor)} TB` },
          { label: 'SLA status', value: 'Not verified; restore drill required' },
        ],
      };
    case 'collab':
      return {
        ...base,
        cells: [
          `${number(18 * factor)} TB`,
          [
            'Canonical transcript ready',
            'Decision index proposed',
            'Owner review required',
            'Captions to validate',
            'Versioned summary proposed',
          ][index],
          [
            'Keep canonical source',
            'Retain decision record',
            '90-day policy proposal',
            'Preserve source if required',
            'Invalidate when transcript changes',
          ][index],
          [
            'Review duplicate archive',
            'Review knowledge index',
            'Review retention exceptions',
            'Review access-copy compression',
            'Review summary reuse',
          ][index],
        ],
        facts: [
          ...shared,
          { label: 'Raw recording storage', value: `${number(18 * factor)} TB` },
          { label: 'Transcript storage', value: `${number(0.08 * factor)} TB` },
          {
            label: 'Summary',
            value: [
              'Engineering sync: agree on one canonical recording and preserve source links in the shared summary.',
              'Architecture review: compare processor benchmarks and assign owners to the autoscaling proposal.',
              'Quarterly planning: record retention owners and document exceptions before expiry is scheduled.',
              'Training review: validate slide readability and captions in a lower-bitrate access copy.',
              'Status summary: reuse reviewed decisions across authorized workflows, with source-version invalidation.',
            ][index],
          },
          { label: 'Legal hold', value: 'Must be checked before any deletion' },
        ],
      };
  }
}

function sampleRecords(): SampleRecord[] {
  return SAMPLE_ORDER.flatMap((key) =>
    COHORTS.map((cohort, index) => ({
      id: `sample-${key}-${index + 1}`,
      key,
      environment: cohort.environment,
      timestamp: new Date(Date.parse(SAMPLE_AS_OF) - cohort.days * DAY).toISOString(),
      factor: cohort.factor,
      index,
      scenario: SCENARIOS[key][index],
      monthlyUsd: SAMPLE[key].savings * cohort.factor,
      carbonKg: SAMPLE[key].carbon * cohort.factor,
      runCostUsd: SAMPLE[key].cost * cohort.factor,
      row: sampleRow(key, index, cohort.factor, cohort.environment),
    })),
  );
}

function sampleChart(key: SampleKey, records: SampleRecord[]): ChartData {
  const factor = records.reduce((sum, record) => sum + record.factor, 0);
  if (key === 'ai')
    return {
      title: 'Model-tier comparison',
      description:
        'Illustrative prices and carbon per million tokens; not provider rates or benchmarks.',
      primaryLabel: 'Scenario cost',
      primaryUnit: 'USD / 1M tokens',
      secondaryLabel: 'Scenario carbon',
      secondaryUnit: 'g CO₂e / 1M tokens',
      points: records.length
        ? [
            { label: 'Large', primary: 15, secondary: 180 },
            { label: 'Balanced', primary: 5, secondary: 75 },
            { label: 'Compact', primary: 1, secondary: 25 },
            { label: 'Local', primary: 0.6, secondary: 18 },
          ]
        : [],
    };
  if (key === 'waste')
    return {
      title: 'Unused capacity by asset type',
      description: 'Synthetic inventory, filtered to selected environment and discovery dates.',
      primaryLabel: 'Capacity',
      primaryUnit: 'TB',
      points: records
        .filter((record) => record.index !== 4)
        .map((record) => ({
          label: ['Volumes', 'Images', 'Logs', 'Snapshots'][record.index],
          primary: 420 * record.factor,
        })),
    };
  if (key === 'carbon')
    return {
      title: 'Workload carbon-intensity scenarios',
      description:
        'Illustrative region and time-window profiles; not a live grid feed or forecast.',
      primaryLabel: 'Current scenario',
      primaryUnit: 'g CO₂e/kWh',
      secondaryLabel: 'Candidate scenario',
      secondaryUnit: 'g CO₂e/kWh',
      points: records.map((record) => ({
        label: ['ETL', 'Evaluation', 'Batch', 'Transcoding', 'Reporting'][record.index],
        primary: [480, 310, 360, 620, 260][record.index],
        secondary: [45, 110, 160, 280, 95][record.index],
      })),
    };
  if (key === 'arch')
    return {
      title: 'Capacity before & proposed',
      description: 'Illustrative vCPU allocation; proposed capacity still needs a load test.',
      primaryLabel: 'Current vCPU',
      primaryUnit: 'vCPU',
      secondaryLabel: 'Proposed vCPU',
      secondaryUnit: 'vCPU',
      points: records.map((record) => ({
        label: ['Catalog API', 'Worker pool', 'Batch ARM', 'Non-prod', 'Placement'][record.index],
        primary: Math.round(160 * record.factor),
        secondary: Math.round(160 * record.factor * [0.5, 0.4, 1, 0.3, 0.6][record.index]),
      })),
    };
  if (key === 'dr')
    return {
      title: 'Recovery tier cost & carbon',
      description:
        'Hypothetical tier alternatives for the selected capacity. Lower footprint does not establish recovery compliance.',
      primaryLabel: 'Scenario monthly cost',
      primaryUnit: 'USD / month',
      secondaryLabel: 'Scenario carbon',
      secondaryUnit: 'kg CO₂e / month',
      points: [
        { label: 'Hot', primary: 9000 * factor, secondary: 4200 * factor },
        { label: 'Warm', primary: 5900 * factor, secondary: 2000 * factor },
        { label: 'Cold', primary: 2700 * factor, secondary: 750 * factor },
      ],
    };
  return {
    title: 'Video-to-knowledge storage',
    description:
      'Scenario storage by representation; archival still requires retention and ownership review.',
    primaryLabel: 'Storage',
    primaryUnit: 'TB',
    points: [
      { label: 'Raw video', primary: 18 * factor },
      { label: 'Compressed media', primary: 3.6 * factor },
      { label: 'Transcripts', primary: 0.08 * factor },
    ],
  };
}

function sampleMetrics(key: SampleKey, records: SampleRecord[]): Metric[] {
  const factor = records.reduce((sum, record) => sum + record.factor, 0);
  const savings = records.reduce((sum, record) => sum + record.monthlyUsd, 0);
  const costMetric = metric(
    'Monthly savings potential',
    `${usd(savings)}/mo`,
    'Synthetic projection, not achieved savings.',
  );
  switch (key) {
    case 'ai':
      return [
        metric(
          'Token volume in scope',
          `${number(42.8 * factor)}M`,
          'Synthetic monthly workload.',
          'purple',
        ),
        costMetric,
        metric(
          'Response cache opportunity',
          factor > 0
            ? `${number(records.reduce((sum, record) => sum + [4, 58, 8, 12, 2][record.index] * record.factor, 0) / factor)}%`
            : 'Not in scope',
          'Workload-weighted repeated-prompt share; not benchmarked savings.',
          'blue',
        ),
      ];
    case 'waste':
      return [
        metric(
          'Unused storage',
          `${number(records.filter((record) => record.index !== 4).reduce((sum, record) => sum + 420 * record.factor, 0))} TB`,
          'Synthetic snapshots, volumes, images and logs.',
          'blue',
        ),
        costMetric,
        metric(
          'Asset groups to review',
          number(records.length),
          'No resources are deleted by this dashboard.',
          'amber',
        ),
        metric(
          'Log archive opportunity',
          `${number(records.filter((record) => record.index === 2).reduce((sum, record) => sum + 420 * record.factor, 0))} TB`,
          'Synthetic log capacity; retention and legal holds still require review.',
          'purple',
        ),
      ];
    case 'carbon':
      return [
        metric(
          'Flexible batch energy',
          `${number(records.reduce((sum, record) => sum + record.carbonKg / ([480, 310, 360, 620, 260][record.index] - [45, 110, 160, 280, 95][record.index]), 0))} MWh`,
          'Synthetic monthly jobs within scope.',
          'blue',
        ),
        costMetric,
        metric(
          'Projected carbon reduction',
          `${number(4100 * factor)} kg`,
          'Scenario estimate, not verified or offset emissions.',
        ),
      ];
    case 'arch':
      return [
        metric(
          'IaC modules in scope',
          number(records.length),
          'Synthetic infrastructure proposals.',
          'blue',
        ),
        costMetric,
        metric(
          'Capacity awaiting review',
          `${number(160 * factor)} vCPU`,
          'Rightsizing requires a representative load test.',
          'amber',
        ),
      ];
    case 'dr':
      return [
        metric(
          'Recovery storage',
          `${number(240 * factor)} TB`,
          'Synthetic datasets considered for tier changes.',
          'blue',
        ),
        costMetric,
        metric(
          'Recovery compliance',
          'Not verified',
          'Workload-specific RTO/RPO targets; each requires a restore drill.',
          'amber',
        ),
      ];
    case 'collab':
      return [
        metric(
          'Raw media in scope',
          `${number(18 * factor)} TB`,
          'Synthetic meeting recordings.',
          'blue',
        ),
        costMetric,
        metric(
          'Knowledge collections',
          number(records.length),
          'Synthetic summaries, not user meeting content.',
          'purple',
        ),
      ];
  }
}

export function buildSampleData(
  environment: EnvironmentFilter,
  timeRange: TimeRange,
  window?: DateWindow,
): ControlPlaneData {
  const selected = sampleRecords().filter(
    (record) =>
      (environment === 'All' || record.environment === environment) &&
      withinRange(record.timestamp, SAMPLE_AS_OF, timeRange, window),
  );
  const monthlyUsd = selected.reduce((sum, record) => sum + record.monthlyUsd, 0);
  const carbonKg = selected.reduce((sum, record) => sum + record.carbonKg, 0);
  const runCost = selected.reduce((sum, record) => sum + record.runCostUsd, 0);
  const roi = runCost > 0 ? ((monthlyUsd - runCost) / runCost) * 100 : null;
  const opportunities: Opportunity[] = selected.map((record) => {
    const definition = SAMPLE[record.key];
    return {
      id: record.id,
      agentKey: record.key,
      title: record.scenario.title,
      target: `${record.row.name} · ${record.environment}`,
      description: record.scenario.description,
      recommendation: record.scenario.recommendation,
      evidence: record.row.facts ?? [],
      risk: definition.risk,
      riskNote: definition.riskNote,
      confidence: 'Illustrative; not evaluated',
      source: 'Synthetic scenario',
      monthlyUsd: record.monthlyUsd,
      carbonKg: record.carbonKg,
      status: 'pending',
      history: [
        { label: 'Scenario created', value: record.timestamp },
        { label: 'Decision', value: 'Human review required. No actual execution or verification.' },
      ],
    };
  });
  const agents = AGENT_ORDER.map((key): AgentWorkspace => {
    if (key === 'pipeline')
      return {
        key,
        name: NAMES[key],
        description:
          'No sample scenario is defined for CI/CD pipelines. Load a recorded Azure baseline run to see pipeline findings.',
        savingsMonthly: null,
        runCostMonthly: null,
        roiPercent: null,
        metrics: [],
        inventoryTitle: 'Pipeline observations',
        columns: ['Pipeline', 'Runs / median time', 'Finding', 'Status'],
        rows: [],
      };
    const records = selected.filter((record) => record.key === key);
    const savings = records.reduce((sum, record) => sum + record.monthlyUsd, 0);
    const cost = records.reduce((sum, record) => sum + record.runCostUsd, 0);
    return {
      key,
      name: NAMES[key],
      description: SAMPLE[key].description,
      savingsMonthly: savings,
      runCostMonthly: cost,
      roiPercent: cost > 0 ? ((savings - cost) / cost) * 100 : null,
      metrics: sampleMetrics(key, records),
      inventoryTitle: SAMPLE[key].inventory,
      columns: SAMPLE[key].columns,
      rows: records.map((record) => record.row),
      chart: sampleChart(key, records),
    };
  });
  const cohorts = new Map<string, { primary: number; secondary: number }>();
  for (const record of selected) {
    const day = record.timestamp.slice(0, 10);
    const point = cohorts.get(day) ?? { primary: 0, secondary: 0 };
    point.primary += record.monthlyUsd;
    point.secondary += record.carbonKg;
    cohorts.set(day, point);
  }
  const historical: Array<{
    key: AgentKey;
    days: number;
    environment: 'Prod' | 'Staging';
    action: string;
    usd: number;
    kg: number;
  }> = [
    {
      key: 'carbon',
      days: 0.1,
      environment: 'Prod',
      action: 'Illustrative batch scheduling scenario completed',
      usd: 1850,
      kg: 2100,
    },
    {
      key: 'waste',
      days: 2,
      environment: 'Staging',
      action: 'Illustrative container image retention scenario completed',
      usd: 420,
      kg: 400,
    },
    {
      key: 'ai',
      days: 11,
      environment: 'Prod',
      action: 'Illustrative response-cache scenario completed',
      usd: 4100,
      kg: 1200,
    },
    {
      key: 'dr',
      days: 21,
      environment: 'Staging',
      action: 'Illustrative recovery-tier scenario completed',
      usd: 5300,
      kg: 3800,
    },
  ];
  const ledger = historical.flatMap((item, index): AuditRow[] => {
    const timestamp = new Date(Date.parse(SAMPLE_AS_OF) - item.days * DAY).toISOString();
    if (
      (environment !== 'All' && environment !== item.environment) ||
      !withinRange(timestamp, SAMPLE_AS_OF, timeRange, window)
    )
      return [];
    return [
      {
        id: `sample-audit-${index + 1}`,
        timestamp,
        agent: NAMES[item.key],
        action: item.action,
        costSavings: `${usd(item.usd)}/mo (sample)`,
        carbonSaved: `${number(item.kg)} kg CO₂e (sample)`,
        status: 'Sample verified',
      },
    ];
  });
  const factor = selected.reduce((sum, record) => sum + record.factor, 0) / SAMPLE_ORDER.length;
  return {
    mode: 'sample',
    baselineRollup: null,
    asOf: SAMPLE_AS_OF,
    runId: null,
    agents,
    opportunities,
    ledger,
    executiveMetrics: [
      metric(
        'Monthly savings potential',
        `${usd(monthlyUsd)}/mo`,
        'Synthetic projection for selected opportunity groups.',
      ),
      metric(
        'Illustrative tree-years',
        number(carbonKg / 20),
        'Scenario equivalence: 20 kg CO₂e per tree-year; no trees planted.',
        'green',
      ),
      metric(
        'Illustrative car miles',
        number(carbonKg / 0.4),
        'Scenario equivalence: 0.4 kg CO₂e per mile; not measured travel.',
        'blue',
      ),
      metric(
        'Projected net agent ROI',
        roi === null ? 'Not in scope' : `${number(roi)}%`,
        'Synthetic (monthly savings − monthly agent cost) / agent cost.',
        'purple',
      ),
    ],
    trend: {
      title: 'Savings & carbon opportunity timeline',
      description:
        'Monthly projections grouped by discovery date. Independent synthetic opportunities, not cumulative achieved savings.',
      primaryLabel: 'Monthly savings potential',
      primaryUnit: 'USD / month',
      secondaryLabel: 'Monthly carbon potential',
      secondaryUnit: 'kg CO₂e / month',
      points: [...cohorts.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([label, values]) => ({ label, ...values })),
    },
    selfAudit: [
      metric(
        'Agent operational cost',
        `${usd(runCost)}/mo`,
        'Synthetic monthly operating-cost assumption.',
        'purple',
      ),
      metric(
        'Agent energy estimate',
        `${number(48 * factor)} kWh`,
        'Illustrative scenario estimate, not measured energy.',
        'amber',
      ),
      metric(
        'Projected benefit / cost',
        runCost > 0 ? `${number(monthlyUsd / runCost)}×` : 'Not in scope',
        'Gross scenario savings divided by scenario operating cost.',
      ),
    ],
    usageDetails: [
      {
        label: 'Data source',
        value: 'Synthetic scenario — invented data for the prototype walkthrough.',
      },
      {
        label: 'Workload token volume',
        value: `${number(42.8 * selected.filter((record) => record.key === 'ai').reduce((sum, record) => sum + record.factor, 0))}M synthetic tokens per month`,
      },
      {
        label: 'Projected carbon reduction',
        value: `${number(carbonKg)} kg CO₂e per month; not independently verified`,
      },
      {
        label: 'Estimated analysis footprint',
        value: `${number(48 * factor)} kWh; scenario assumption, no metering`,
      },
      {
        label: 'Price basis',
        value: 'Invented scenario rates, not current model or cloud-provider pricing.',
      },
      {
        label: 'Model-tier chart',
        value:
          'Unit-price and carbon assumptions are constant across filters; the chart is shown only for an in-scope AI workload.',
      },
      {
        label: 'Approval boundary',
        value:
          'Sample approvals record a local decision only. They never change projected savings or create verified outcomes.',
      },
      {
        label: 'Audit boundary',
        value:
          'Sample verified rows are fictional historical demonstrations, separate from pending opportunities and recorded runs.',
      },
    ],
    filterNote: `Synthetic scenario · ${environment === 'All' ? 'Prod and Staging' : environment} · ${selected.length} opportunity groups discovered ${timeRange === 'custom' ? `between ${window?.from || 'unset'} and ${window?.to || 'unset'} (UTC)` : `within ${timeRange} before 4 Oct 2026`}. Projections remain monthly, not prorated to the selected window. Sample data never changes a recorded run.`,
  };
}
