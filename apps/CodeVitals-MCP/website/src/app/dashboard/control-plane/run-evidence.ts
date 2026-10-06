import type { SelectedRun } from '../ledger-data';
import type { Finding } from '../ledger-dashboard';
import { asRecord } from '../dashboard-format';
import { evidenceFor, safeAuditText } from '../dashboard-audit';
import { buildImpactSummary } from '../impact-summary-data';
import type { Fact, Metric } from './types';

export interface ResourceUsage {
  metrics: Metric[];
  completeness: string;
  explanation: string;
  details: Fact[];
}

const count = (value: number | null) =>
  value === null ? 'Not recorded' : value.toLocaleString('en-US');
const amount = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0;

/** Run-wide overhead is deliberately independent of workload/finding filters. */
export function resourcesFor(run: SelectedRun | null): ResourceUsage {
  const { agentUsage: usage } = buildImpactSummary([], run);
  const outcome = run?.outcome?.runId === run?.runId ? run?.outcome : undefined;
  const start = outcome ? Date.parse(outcome.startedAt) : NaN;
  const finish = outcome ? Date.parse(outcome.finishedAt) : NaN;
  const elapsed =
    Number.isFinite(start) && Number.isFinite(finish) && finish >= start
      ? `${((finish - start) / 1000).toLocaleString('en-US', { maximumFractionDigits: 1 })} s`
      : 'Not recorded';
  const models = new Set<string>();
  for (const entry of run?.entries ?? []) {
    if (entry.runId !== run?.runId || entry.stage !== 'investigate') continue;
    const analysis = asRecord(entry.data.analysis);
    if (analysis.status === 'generated' && typeof analysis.model === 'string') {
      models.add(
        `${safeAuditText(analysis.provider, 'Provider not recorded')} / ${safeAuditText(analysis.model, 'Model not recorded')}`,
      );
    }
  }
  return {
    completeness: {
      complete: 'Usage complete',
      partial: 'Some usage missing',
      'legacy-unconfirmed': 'Coverage not confirmed',
      'not-recorded': 'Usage not recorded',
    }[usage.completeness],
    explanation: usage.explanation,
    metrics: [
      {
        label: 'Reported tokens',
        value: count(usage.knownTokens),
        hint:
          usage.totalTokens === null
            ? 'Known subtotal only; total usage is unknown.'
            : 'Tokens used to analyze this run.',
      },
      {
        label: 'Model requests',
        value: count(usage.llmCalls),
        hint: 'Recorded attempts, including failures with missing usage.',
      },
      { label: 'Tool calls', value: count(usage.toolCalls), hint: 'Recorded analysis tool calls.' },
      { label: 'Retries', value: count(usage.retries), hint: 'Recorded repeat attempts.' },
      {
        label: 'Run duration',
        value: elapsed,
        hint: 'Elapsed time between recorded start and finish, not CPU time.',
      },
      {
        label: 'Requests missing usage',
        value: count(usage.unknownLlmCalls),
        hint: 'Not recorded does not mean zero.',
      },
    ],
    details: [
      { label: 'Scope', value: 'Entire selected run; finding filters do not reduce these totals.' },
      { label: 'Models with generated results', value: [...models].join(', ') || 'Not recorded' },
      {
        label: 'Measurement boundary',
        value:
          'Agent resource usage is separate from workload savings. Tokens are not measured electricity or carbon.',
      },
    ],
  };
}

export interface VerificationEvidence {
  status: 'Not verified' | 'Check failed' | 'Change check passed';
  baseline: Fact[];
  change: Fact[];
  result: Fact[];
  quality: string;
}

/** Only a follow-up check after the latest application can confirm that change. */
export function verificationFor(finding: Finding): VerificationEvidence {
  const entries = [...finding.entries].sort((a, b) => a.seq - b.seq);
  const detection = entries.find((e) => e.stage === 'detect');
  const native = asRecord(detection?.data.nativeMetric);
  const applicationIndex = entries.findLastIndex((e) => e.stage === 'improve');
  const application = entries[applicationIndex];
  const approval = entries
    .slice(0, applicationIndex < 0 ? undefined : applicationIndex)
    .findLast((e) => e.stage === 'approve');
  const check = entries.findLast((e, index) => e.stage === 'verify' && index > applicationIndex);
  const applied = application?.data.applied === true;
  const checked = applied && check && typeof check.data.confirmed === 'boolean';
  const evidence = evidenceFor(entries);
  const file = evidence.find((fact) => fact.label === 'Source file')?.value;
  const line = evidence.find((fact) => fact.label === 'Source line')?.value;
  const source = file ? `${file}${line ? `:${line}` : ''}` : 'Not recorded';
  return {
    status: !checked
      ? 'Not verified'
      : check.data.confirmed === true
        ? 'Change check passed'
        : 'Check failed',
    baseline: [
      { label: 'Source file / record', value: source },
      {
        label: 'Before — detected amount',
        value: amount(native.perRun)
          ? `${native.perRun.toLocaleString('en-US')} ${safeAuditText(native.unit, 'units')} (${safeAuditText(native.metric, 'metric not recorded')})`
          : 'Not recorded; projected savings are not a baseline.',
      },
    ],
    change: [
      {
        label: 'Recorded approval',
        value:
          approval?.data.approved === true
            ? 'Approved in the run; reviewer identity is not independently verified.'
            : approval?.data.approved === false
              ? 'Not approved in the run.'
              : 'No run approval recorded. Local plan decisions are shown in decision history.',
      },
      {
        label: 'Application',
        value: applied
          ? `Applied — ${application.data.mode === 'sandbox' ? 'isolated sandbox' : 'execution scope not recorded'}`
          : 'No successful application recorded.',
      },
    ],
    result: [
      {
        label: 'After — follow-up check',
        value: !checked
          ? 'Awaiting a check after an applied change.'
          : check.data.confirmed === true
            ? 'The recorded change check passed.'
            : 'The recorded change check did not pass.',
      },
      {
        label: 'Observed resource reduction',
        value:
          checked && amount(check.data.observedResourceReduction)
            ? `${check.data.observedResourceReduction.toLocaleString('en-US')} ${safeAuditText(native.unit, 'units (unit not recorded)')}`
            : 'Not recorded',
      },
      {
        label: 'Verification method',
        value:
          checked && check.data.measurementBasis === 'observed-redetection+estimated-conversion'
            ? 'Source re-analysis. Energy and carbon remain modeled estimates, not metered savings.'
            : 'No recognized measurement method recorded.',
      },
    ],
    quality:
      'Task quality, performance and regression checks are not recorded in this finding. A change check is not proof of equivalent task quality.',
  };
}
