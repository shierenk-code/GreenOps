import type { Finding } from './ledger-dashboard';
import type { SelectedRun, RunOutcome } from './ledger-data';
import { buildOverviewData } from './overview-data';

export interface ImpactSummaryData {
  runId: string | null;
  appliedChanges: number;
  verifiedChanges: number;
  pendingReviews: number | null;
  netCarbonBenefit: { status: 'not-established'; valueKg: null; explanation: string };
  agentUsage: {
    completeness: 'complete' | 'partial' | 'legacy-unconfirmed' | 'not-recorded';
    totalTokens: number | null;
    knownTokens: number | null;
    llmCalls: number | null;
    unknownLlmCalls: number | null;
    toolCalls: number | null;
    retries: number | null;
    explanation: string;
  };
  recordedEstimates: Array<{
    id: string;
    label: string;
    value: number;
    unit: 'kWh' | 'kg CO₂e';
    basis: 'modeled';
  }>;
  measurementGaps: string[];
}

const count = (value: unknown): number | null =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null;
const amount = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;

/** Changes verified by a check are not automatically measured carbon savings or a net benefit. */
export function buildImpactSummary(
  findings: Finding[],
  run: SelectedRun | null,
  pendingReviews?: number,
): ImpactSummaryData {
  const overview = buildOverviewData(findings, run);
  const ids = new Set(findings.map((finding) => finding.bugId));
  const groups = new Map<string, SelectedRun['entries']>();
  for (const entry of run?.entries ?? []) {
    if (entry.runId !== run?.runId || !ids.has(entry.bugId)) continue;
    const entries = groups.get(entry.bugId) ?? [];
    entries.push(entry);
    groups.set(entry.bugId, entries);
  }
  const verifiedChanges = [...groups.values()].filter((entries) => {
    if (!entries.some((entry) => entry.stage === 'detect')) return false;
    const applicationIndex = entries.findLastIndex((entry) => entry.stage === 'improve');
    const verificationIndex = entries.findLastIndex((entry) => entry.stage === 'verify');
    return (
      applicationIndex >= 0 &&
      verificationIndex > applicationIndex &&
      entries[applicationIndex].data.applied === true &&
      entries[verificationIndex].data.confirmed === true
    );
  }).length;
  const outcome = run?.outcome?.runId === run?.runId ? run?.outcome : undefined;
  let self: Partial<RunOutcome['selfCost']> | undefined = outcome?.selfCost;
  // Reviews have investigation records rather than a seven-stage run outcome.
  // Count every attempted request; missing usage must remain unknown.
  if (!outcome && run) {
    const investigations = run.entries.filter((entry) => entry.stage === 'investigate');
    const analyses = investigations.map(
      (entry) => entry.data.analysis as Record<string, unknown> | undefined,
    );
    if (
      analyses.length &&
      analyses.every((analysis) => analysis && typeof analysis.requestAttempted === 'boolean')
    ) {
      const attempted = analyses.filter((analysis) => analysis!.requestAttempted === true);
      const knownTokens = attempted.reduce(
        (sum, analysis) => sum + (count(analysis!.tokensUsed) ?? 0),
        0,
      );
      const unknown = attempted.filter((analysis) => count(analysis!.tokensUsed) === null).length;
      self = {
        knownTokens,
        tokens: unknown ? null : knownTokens,
        usageComplete: unknown === 0,
        llmCalls: attempted.length,
        unknownLlmCalls: unknown,
      };
    }
  }
  const metadata =
    self &&
    count(self.knownTokens) !== null &&
    typeof self.usageComplete === 'boolean' &&
    count(self.llmCalls) !== null &&
    count(self.unknownLlmCalls) !== null;
  const coherentMetadata = Boolean(
    metadata &&
    self!.unknownLlmCalls! <= self!.llmCalls! &&
    !(self!.knownTokens! > 0 && self!.llmCalls === self!.unknownLlmCalls),
  );
  const complete =
    coherentMetadata &&
    self!.usageComplete === true &&
    self!.unknownLlmCalls === 0 &&
    count(self!.tokens) !== null &&
    self!.tokens === self!.knownTokens;
  const partial =
    coherentMetadata &&
    self!.usageComplete === false &&
    self!.unknownLlmCalls! > 0 &&
    self!.tokens === null;
  const legacy =
    self &&
    ['knownTokens', 'usageComplete', 'llmCalls', 'unknownLlmCalls'].every(
      (key) => !Object.hasOwn(self, key),
    ) &&
    count(self.tokens) !== null;
  const completeness = complete
    ? 'complete'
    : partial
      ? 'partial'
      : legacy
        ? 'legacy-unconfirmed'
        : 'not-recorded';
  const explanation = complete
    ? 'Recorded token usage covers every recorded model request. These are GreenOps analysis tokens, not workload token savings.'
    : partial
      ? 'Some recorded model requests have unknown token usage. Reported tokens are a subtotal, not the complete agent footprint.'
      : legacy
        ? 'Historical token usage was recorded without completeness information. Unreported request usage may be missing.'
        : 'A complete, matching run-level agent-usage record is not available.';
  const recordedEstimates: ImpactSummaryData['recordedEstimates'] = [];
  // Old ledgers can contain zeroed failures. Never promote their energy conversions into footprint evidence.
  if (complete && amount(self?.energyKwh) !== null && amount(self?.carbonKgCo2e) !== null) {
    recordedEstimates.push({
      id: 'agent-energy',
      label: 'Recorded agent energy estimate',
      value: self!.energyKwh!,
      unit: 'kWh',
      basis: 'modeled',
    });
    recordedEstimates.push({
      id: 'agent-carbon',
      label: 'Recorded agent carbon estimate',
      value: self!.carbonKgCo2e!,
      unit: 'kg CO₂e',
      basis: 'modeled',
    });
  }
  return {
    runId: run?.runId ?? null,
    appliedChanges: overview.summary.applied,
    verifiedChanges,
    pendingReviews: run ? count(pendingReviews) : null,
    netCarbonBenefit: {
      status: 'not-established',
      valueKg: null,
      explanation:
        'A verified change is not yet proof of measured carbon savings. Comparable workload and agent-footprint measurements are needed.',
    },
    agentUsage: {
      completeness,
      totalTokens: complete ? count(self?.tokens) : null,
      knownTokens:
        complete || partial ? count(self?.knownTokens) : legacy ? count(self?.tokens) : null,
      llmCalls: coherentMetadata ? count(self?.llmCalls) : null,
      unknownLlmCalls: coherentMetadata ? count(self?.unknownLlmCalls) : null,
      toolCalls: count(self?.toolCalls),
      retries: count(self?.retries),
      explanation,
    },
    recordedEstimates,
    measurementGaps: [
      'Matched before/after workload measurements with equivalent task quality.',
      'A consistent software boundary including agent overhead, infrastructure and allocated hardware emissions.',
      'Energy and region-specific carbon-intensity evidence; output allowance is not consumed energy.',
      ...(complete
        ? []
        : ['Complete agent token usage, including failed or interrupted model requests.']),
    ],
  };
}
