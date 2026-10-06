import type { Finding } from './ledger-dashboard';
import type { LedgerEntry, LedgerStage, SelectedRun } from './ledger-data';
import { asRecord, entryFor, STAGES } from './dashboard-format';
import { sourceFor } from './recommendation-source';

export interface AuditFact {
  label: string;
  value: string;
}
export interface AuditActivity {
  stage: LedgerStage;
  label: string;
  detail: string;
  timestamp: string | null;
  sequence: number;
}
export interface AuditDecision {
  kind: 'policy' | 'automatic' | 'unattributed' | 'missing';
  approved: boolean | null;
  label: string;
  detail: string;
  humanRecorded: false;
}

const LABELS: Record<LedgerStage, string> = {
  detect: 'Detection',
  investigate: 'Analysis',
  compare: 'Recommendation',
  simulate: 'Impact estimate',
  approve: 'Approval decision',
  improve: 'Application',
  verify: 'Verification',
};
const numeric = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0;
const count = (value: unknown) => (numeric(value) && Number.isSafeInteger(value) ? value : null);
const timestamp = (value: string) =>
  Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : null;

/** Only intended public recommendation fields pass here; internal reasoning never does. */
export function safeAuditText(value: unknown, fallback: string): string {
  if (typeof value !== 'string' || !value.trim()) return fallback;
  return value
    .trim()
    .slice(0, 1600)
    .replace(/\b(?:sk-[A-Za-z0-9_-]+|AIza[A-Za-z0-9_-]+)\b/g, '[redacted]')
    .replace(/\bBearer\s+\S+/gi, 'Bearer [redacted]')
    .replace(/\b(?:api[_-]?key|token|secret|password)\s*[:=]\s*\S+/gi, '[redacted credential]')
    .replace(/https?:\/\/[^\s<>]+/gi, '[URL omitted]');
}

/** Resolve an explicit recommendation without promoting an unselected candidate. */
export function resolveRecordedRecommendation(entries: LedgerEntry[]): {
  strategy: Record<string, unknown>;
  recommendedId: string;
  title: string;
  description: string;
} {
  const comparison = entryFor(entries, 'compare');
  const fix = asRecord(comparison?.data.fix);
  const nonempty = (value: unknown): string =>
    typeof value === 'string' && value.trim() ? value : '';
  const recommendedId = nonempty(comparison?.data.recommended) || nonempty(fix.strategyId);
  const candidates = Array.isArray(comparison?.data.strategies)
    ? comparison.data.strategies.map(asRecord)
    : [];
  const strategy =
    (recommendedId && candidates.find((candidate) => candidate.id === recommendedId)) || {};
  const recordedDescription = nonempty(comparison?.data.recommendation);
  const hasSelectedOption = Object.keys(strategy).length > 0;
  const fallbackTitle = hasSelectedOption
    ? 'Recorded recommended option'
    : recordedDescription
      ? 'Recorded recommendation'
      : recommendedId
        ? 'Recommended option details not recorded'
        : 'No recommended option recorded';
  const fallbackDescription = hasSelectedOption
    ? 'No description was recorded for the recommended option.'
    : recommendedId
      ? 'The recorded recommendation does not include matching option details.'
      : candidates.length > 0
        ? 'Candidate options were recorded without a selected recommendation.'
        : 'A recommendation was not recorded.';
  return {
    strategy,
    recommendedId,
    title: safeAuditText(strategy.title, fallbackTitle),
    description: safeAuditText(
      strategy.description,
      safeAuditText(recordedDescription, fallbackDescription),
    ),
  };
}

function safeIdentifier(value: unknown): string | null {
  return typeof value === 'string' &&
    value.length <= 100 &&
    /^[A-Za-z0-9._ /-]+$/.test(value) &&
    !/\b(?:sk-|AIza|Bearer\b)/i.test(value)
    ? value
    : null;
}

const NUMERIC_EVIDENCE: Record<string, string> = {
  requests: 'Recorded requests',
  redundant: 'Repeated requests',
  tokensPerCall: 'Estimated tokens per call',
  wastedTokens: 'Potentially avoidable tokens',
  maxTokens: 'Configured output limit',
  completionTokens: 'Reported output tokens',
  wastedHeadroom: 'Unused allowance (not consumed tokens)',
  retries: 'Recorded retry attempts',
  retryBackoffMs: 'Retry delay (ms)',
  tokensPerAttempt: 'Estimated tokens per attempt',
  requestedCpuCores: 'Requested CPU cores',
  usedCpuCores: 'Observed CPU cores',
  replicas: 'Configured replicas',
  wastedCores: 'Estimated excess cores',
  instanceCores: 'Instance cores',
  neededCores: 'Estimated required cores',
  idleCores: 'Estimated idle cores',
  excessCores: 'Estimated excess cores',
  gb: 'Storage (GB)',
  sizeGb: 'Size (GB)',
  sizeMb: 'Image size (MB)',
  excessMb: 'Estimated excess size (MB)',
  gbPerDay: 'Daily ingestion (GB)',
  retentionDays: 'Retention (days)',
  excessDays: 'Excess retention (days)',
  gbStored: 'Estimated stored GB-months',
  energyKwh: 'Recorded energy (kWh)',
  baselineKwh: 'Baseline energy (kWh)',
  ratio: 'Baseline ratio',
  excessKwh: 'Estimated excess energy (kWh)',
  gridIntensityKgPerKwh: 'Grid intensity (kg CO₂e/kWh)',
  justifiedReplicas: 'Rule-estimated replicas',
  excessReplicas: 'Rule-estimated excess replicas',
  standbyCores: 'Standby cores',
  rpoMinutes: 'Configured RPO (minutes)',
  runs: 'Pipeline runs in period',
  medianMinutes: 'Median run time (minutes)',
  cacheHitRatePct: 'Dependency cache hit rate (%)',
  targetMedianMinutes: 'Estimated median with cache (minutes)',
  duplicateRuns: 'Duplicate-commit runs',
  artifactMbPerRun: 'Artifacts per run (MB)',
  targetArtifactMb: 'Target artifacts per run (MB)',
  carbonPerRunG: 'Modeled carbon per run (g CO₂e)',
};
const ENUM_EVIDENCE: Record<string, { label: string; values: string[] }> = {
  criticality: { label: 'Configured criticality', values: ['low', 'medium', 'high'] },
  standbyMode: { label: 'Standby mode', values: ['hot', 'warm', 'cold'] },
  replicationMode: { label: 'Replication mode', values: ['continuous', 'periodic'] },
  status: {
    label: 'Recorded request status',
    values: ['ok', 'success', 'succeeded', 'failed', 'error', 'cancelled', 'completed'],
  },
};

/** Positive field allowlist: no prompts, headers, credentials, raw errors, or JSON payloads. */
export function evidenceFor(entries: LedgerEntry[]): AuditFact[] {
  const detection = entryFor(entries, 'detect');
  const evidence = asRecord(detection?.data.evidence);
  const location = asRecord(detection?.data.location);
  const facts: AuditFact[] = [];
  if (typeof location.filePath === 'string') {
    const file = safeIdentifier(location.filePath.split(/[\\/]/).at(-1));
    if (file) facts.push({ label: 'Source file', value: file });
  }
  const line = count(location.startLine);
  if (line !== null && line > 0) facts.push({ label: 'Source line', value: String(line) });
  const resource = safeIdentifier(location.symbol);
  if (resource) facts.push({ label: 'Resource or symbol', value: resource });
  for (const [key, label] of Object.entries(NUMERIC_EVIDENCE)) {
    if (numeric(evidence[key])) facts.push({ label, value: evidence[key].toLocaleString() });
  }
  for (const [key, rule] of Object.entries(ENUM_EVIDENCE)) {
    if (typeof evidence[key] === 'string' && rule.values.includes(evidence[key])) {
      facts.push({ label: rule.label, value: evidence[key] });
    }
  }
  for (const [key, label] of [
    ['attached', 'Storage attached'],
    ['autoscale', 'Autoscaling enabled'],
    ['hasTranscript', 'Transcript available'],
  ]) {
    const value = evidence[key];
    if (value === true || value === 'true' || value === false || value === 'false') {
      facts.push({ label, value: value === true || value === 'true' ? 'Yes' : 'No' });
    }
  }
  return facts;
}

export function decisionFor(entries: LedgerEntry[]): AuditDecision {
  const entry = entryFor(entries, 'approve');
  if (!entry)
    return {
      kind: 'missing',
      approved: null,
      label: 'No approval decision recorded',
      detail: 'Human approval is not established by this ledger.',
      humanRecorded: false,
    };
  const approved = typeof entry.data.approved === 'boolean' ? entry.data.approved : null;
  // The current writer has no human actor discriminator. An arbitrary name or a
  // statement in a summary is not enough to label a decision as human approval.
  const kind =
    entry.data.approver === 'policy-approver'
      ? 'policy'
      : entry.data.approver === 'auto-approver'
        ? 'automatic'
        : 'unattributed';
  const actor =
    kind === 'policy'
      ? 'Automatic policy'
      : kind === 'automatic'
        ? 'Automatic demo mode'
        : 'Unattributed decision';
  const result =
    approved === true
      ? 'allowed the change'
      : approved === false
        ? 'withheld the change'
        : 'has no recorded approval result';
  return {
    kind,
    approved,
    label: `${actor}: ${result}`,
    detail:
      kind === 'policy' || kind === 'automatic'
        ? 'This is an automated decision, not a human approval. Permission does not prove application.'
        : 'The ledger does not establish whether a person or automation made this decision.',
    humanRecorded: false,
  };
}

export function applicationFor(entries: LedgerEntry[]) {
  const entry = entryFor(entries, 'improve');
  if (!entry)
    return {
      state: 'not-recorded' as const,
      label: 'No application recorded',
      detail: 'A recommendation or approval does not establish that a change was made.',
    };
  if (entry.data.applied === true)
    return {
      state: 'applied' as const,
      label: entry.data.mode === 'sandbox' ? 'Applied in a sandbox' : 'Application recorded',
      detail:
        entry.data.mode === 'sandbox'
          ? 'The recorded change affected the sandbox copy, not the original workload.'
          : 'The target environment was not established in the supported record.',
    };
  if (entry.data.applied === false)
    return {
      state: 'not-applied' as const,
      label: 'Change not applied',
      detail: 'An attempt was recorded without a successful application.',
    };
  return {
    state: 'unknown' as const,
    label: 'Application result unknown',
    detail: 'An application stage exists, but its result was not recorded.',
  };
}

export function verificationFor(entries: LedgerEntry[]) {
  const entry = entryFor(entries, 'verify');
  if (!entry)
    return {
      state: 'not-recorded' as const,
      label: 'No verification result recorded',
      detail: 'No successful follow-up check is established for this finding.',
    };
  if (entry.data.confirmed === true)
    return {
      state: 'confirmed' as const,
      label: 'Verification passed',
      detail:
        entry.data.measurementBasis === 'observed-redetection+estimated-conversion'
          ? 'Re-detection confirmed that the finding disappeared. Energy and carbon remain model-based estimates.'
          : 'A successful check was recorded; its method is not established in the supported record. This is not proof of measured energy savings.',
    };
  if (entry.data.confirmed === false)
    return {
      state: 'failed' as const,
      label: 'Verification did not pass',
      detail: 'The follow-up check did not confirm the improvement.',
    };
  return {
    state: 'unknown' as const,
    label: 'Verification result unknown',
    detail: 'A verification stage exists, but no success or failure was recorded.',
  };
}

function activityFor(entry: LedgerEntry, findingEntries: LedgerEntry[] = [entry]): AuditActivity {
  const entries = [entry];
  let detail: string;
  switch (entry.stage) {
    case 'detect':
      detail = 'A potential sustainability issue was recorded.';
      break;
    case 'investigate': {
      // Legacy provenance can be recorded in the following comparison. Keep it
      // with this analysis attempt, rather than borrowing a later attempt's result.
      const index = findingEntries.indexOf(entry);
      const nextAnalysis = findingEntries.findIndex(
        (candidate, candidateIndex) => candidateIndex > index && candidate.stage === 'investigate',
      );
      const source = sourceFor({
        entries:
          index < 0
            ? entries
            : findingEntries.slice(index, nextAnalysis < 0 ? undefined : nextAnalysis),
      });
      detail = Object.hasOwn(entry.data, 'error')
        ? 'Analysis failed; no usable analysis result is established.'
        : source.status === 'generated'
          ? 'A model-generated recommendation analysis was recorded.'
          : source.status === 'fallback'
            ? 'Rule-based fallback was used for this finding.'
            : source.status === 'offline'
              ? 'Rule-based analysis was recorded.'
              : 'Analysis was recorded; its source is not confirmed.';
      break;
    }
    case 'compare':
      detail = Array.isArray(entry.data.strategies)
        ? `${entry.data.strategies.length} candidate option(s) were recorded.`
        : 'Recommendation data was recorded; an option comparison was not recorded.';
      break;
    case 'simulate':
      detail = 'An impact-estimate stage was recorded. This is not measured or achieved savings.';
      break;
    case 'approve':
      detail = decisionFor(entries).label;
      break;
    case 'improve':
      detail = applicationFor(entries).label;
      break;
    case 'verify':
      detail = verificationFor(entries).label;
      break;
  }
  return {
    stage: entry.stage,
    label: LABELS[entry.stage],
    detail,
    timestamp: timestamp(entry.timestamp),
    sequence: entry.seq,
  };
}

export function buildFindingAudit(finding: Finding) {
  const source = sourceFor(finding);
  const sourceLabel =
    source.status === 'generated'
      ? 'AI-assisted'
      : source.status === 'fallback'
        ? 'Rule-based fallback'
        : source.status === 'offline'
          ? 'Rule-based'
          : source.status === 'not-run'
            ? 'Not analyzed'
            : 'Source not confirmed';
  return {
    evidence: evidenceFor(finding.entries),
    decision: decisionFor(finding.entries),
    application: applicationFor(finding.entries),
    verification: verificationFor(finding.entries),
    activity: finding.entries.map((entry) => activityFor(entry, finding.entries)),
    recommendation: {
      title: safeAuditText(finding.recommendationTitle, 'Review the recorded recommendation'),
      description: safeAuditText(finding.recommendation, 'A recommendation was not recorded.'),
      source: sourceLabel,
    },
    source: {
      label: sourceLabel,
      generated: source.status === 'generated',
      fallback: source.status === 'fallback',
    },
    coverage: { recordedStages: new Set(finding.entries.map((entry) => entry.stage)).size },
  };
}

export const AGENT_CAPABILITIES: Record<string, string[]> = {
  'ai-efficiency': ['Repeated cacheable requests', 'Output-token allowance', 'Retry attempts'],
  'digital-waste': [
    'CPU allocation and observed use',
    'Unattached storage',
    'Image size and log retention',
  ],
  'carbon-incident': ['Energy samples against a baseline', 'Recorded energy spikes'],
  architecture: [
    'Autoscaling configuration',
    'Instance sizing',
    'Region carbon-intensity estimates',
  ],
  'disaster-recovery': [
    'Replica configuration',
    'Hot standby use',
    'Replication and recovery objectives',
  ],
  collaboration: ['Duplicate recordings', 'Recording retention'],
  'pipeline-efficiency': [
    'Dependency and layer cache hit rate',
    'Duplicate runs for one commit',
    'Artifact size per run',
  ],
  'code-analysis': ['Supported static source-code rules', 'Repository and pull-request findings'],
};

export function buildRunAudit(findings: Finding[], run: SelectedRun | null) {
  const runFindings = run
    ? findings.filter((finding) => finding.entries.some((entry) => entry.runId === run.runId))
    : [];
  const entries = run?.entries ?? [];
  const entriesByFinding = new Map<string, LedgerEntry[]>();
  for (const entry of entries) {
    const findingEntries = entriesByFinding.get(entry.bugId) ?? [];
    findingEntries.push(entry);
    entriesByFinding.set(entry.bugId, findingEntries);
  }
  const byAgent = new Map<
    string,
    {
      id: string;
      name: string;
      findings: number;
      applied: number;
      verified: number;
      fallback: number;
    }
  >();
  for (const finding of runFindings) {
    const audit = buildFindingAudit(finding);
    const group = byAgent.get(finding.agentId) ?? {
      id: finding.agentId,
      name: finding.agentName,
      findings: 0,
      applied: 0,
      verified: 0,
      fallback: 0,
    };
    group.findings += 1;
    group.applied += Number(audit.application.state === 'applied');
    group.verified += Number(audit.verification.state === 'confirmed');
    group.fallback += Number(audit.source.fallback);
    byAgent.set(finding.agentId, group);
  }
  return {
    status: !run
      ? 'No recorded run'
      : run.kind === 'review'
        ? 'Read-only review recorded'
        : run.outcome
          ? 'Completion recorded'
          : 'No completion record',
    stages: STAGES.map((stage) => ({
      stage,
      label: LABELS[stage],
      findings: new Set(
        entries.filter((entry) => entry.stage === stage).map((entry) => entry.bugId),
      ).size,
    })),
    groups: [...byAgent.values()],
    groupingBasis: 'Inferred from finding ownership; no delegation event log is present.' as const,
    toolCalls: count(run?.outcome?.selfCost.toolCalls),
    retries: count(run?.outcome?.selfCost.retries),
    toolEvidence: run?.outcome?.selfCost.events?.length
      ? 'Detailed self-accounting events are recorded below. Agent delegation and per-specialist execution events are not available.'
      : 'Only run-level totals are recorded for this ledger. Tool names, per-call results, and agent attribution are not available.',
    selfCostEvents: (run?.outcome?.selfCost.events ?? []).map((event) => ({
      stage: safeAuditText(event.stage, 'unknown stage'),
      kind: event.kind,
      tokens: count(event.tokens),
      durationMs: count(event.durationMs),
      note: safeAuditText(event.note, ''),
      timestamp: timestamp(event.at),
    })),
    orchestrationTrace: (run?.outcome?.trace ?? []).map((event) => ({
      kind: event.kind,
      actor: safeAuditText(event.actor, 'unknown actor'),
      status: event.status,
      detail: safeAuditText(event.detail, 'Recorded orchestration event.'),
      timestamp: timestamp(event.at),
    })),
    events: entries.map((entry) => ({
      ...activityFor(entry, entriesByFinding.get(entry.bugId)),
      bugId: entry.bugId,
    })),
  };
}
