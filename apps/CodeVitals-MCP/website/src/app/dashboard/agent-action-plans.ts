import type { Finding } from './ledger-dashboard';
import type { SelectedRun } from './ledger-data';
import { asRecord, entryFor } from './dashboard-format';
import { evidenceFor, resolveRecordedRecommendation, safeAuditText } from './dashboard-audit';

export interface ActionCandidate {
  findingId: string;
  title: string;
  resourceId: string | null;
  category: string;
}
export interface LocalActionPlan {
  status: 'draft-only';
  title: string;
  resources: ActionCandidate[];
  settings: string[];
  steps: string[];
  requiredChecks: string[];
  disclaimer: string;
}
export type PlanResult<T> = { ok: true; value: T } | { ok: false; errors: string[] };

const categories: Record<string, string[]> = {
  'ai-efficiency': ['uncached-completion', 'oversized-token-request', 'ai-retry-storm'],
  'digital-waste': ['unattached-storage', 'oversized-image', 'verbose-logging'],
  collaboration: ['redundant-recording', 'excessive-retention'],
  architecture: ['no-autoscale', 'high-carbon-region', 'inefficient-sizing'],
  'carbon-incident': ['carbon-anomaly'],
  'disaster-recovery': ['over-replication', 'idle-standby', 'rto-rpo-mismatch'],
};
function publicIdentifier(value: unknown): string | null {
  return typeof value === 'string' &&
    /^[a-z0-9][a-z0-9._-]{0,119}$/i.test(value) &&
    !/^(?:sk-|AIza)/i.test(value) &&
    !/(?:secret|password|api[_-]?key|bearer)/i.test(value)
    ? value
    : null;
}

/** Candidates come from this run's detection records, not stale Finding presentation state. */
export function actionCandidates(
  agentId: string,
  findings: Finding[],
  run: SelectedRun | null,
): ActionCandidate[] {
  if (!run || !Object.hasOwn(categories, agentId)) return [];
  const seen = new Set<string>();
  const candidates: ActionCandidate[] = [];
  for (const finding of findings) {
    if (seen.has(finding.bugId) || !publicIdentifier(finding.bugId)) continue;
    const entries = run.entries.filter(
      (entry) => entry.runId === run.runId && entry.bugId === finding.bugId,
    );
    const detection = entryFor(entries, 'detect');
    if (!detection) continue;
    const category = typeof detection.data.category === 'string' ? detection.data.category : '';
    if (!categories[agentId].includes(category)) continue;
    if (typeof detection.data.agentId === 'string' && detection.data.agentId !== agentId) continue;
    seen.add(finding.bugId);
    candidates.push({
      findingId: finding.bugId,
      title: safeAuditText(detection.summary, 'Recorded finding').slice(0, 160),
      resourceId: publicIdentifier(asRecord(detection.data.location).symbol),
      category,
    });
  }
  return candidates;
}

/** A local React-state identity made only from public planning inputs, never raw payloads. */
export function actionWorkbenchIdentity(
  agentId: string,
  findings: Finding[],
  run: SelectedRun | null,
): string {
  const candidates = actionCandidates(agentId, findings, run);
  return JSON.stringify({
    agentId,
    runId: run?.runId ?? null,
    recordedAt: run?.timestamp ?? '',
    candidates: candidates.map((candidate) => {
      const entries =
        run?.entries.filter(
          (entry) => entry.runId === run.runId && entry.bugId === candidate.findingId,
        ) ?? [];
      const recommendation = resolveRecordedRecommendation(entries);
      return {
        ...candidate,
        facts: evidenceFor(entries),
        recommendation: {
          id: recommendation.recommendedId,
          title: recommendation.title,
          description: recommendation.description,
        },
        applied: entryFor(entries, 'improve')?.data.applied === true,
        verified: entryFor(entries, 'verify')?.data.confirmed === true,
      };
    }),
  });
}

/** Never display a finite nonzero estimate as a rounded zero. */
export function formatActionNumber(value: number): string {
  if (!Number.isFinite(value)) return 'Not available';
  if (value !== 0 && Math.abs(value) < 0.000001) return value.toExponential(2);
  return value.toLocaleString('en-US', { maximumFractionDigits: 6 });
}

function selectedResources(
  agentId: string,
  findings: Finding[],
  run: SelectedRun | null,
  selected: unknown,
): PlanResult<ActionCandidate[]> {
  if (!run) return { ok: false, errors: ['Select an available recorded analysis first.'] };
  if (
    !Array.isArray(selected) ||
    selected.length === 0 ||
    selected.some((id) => typeof id !== 'string')
  )
    return { ok: false, errors: ['Select at least one recorded finding.'] };
  const ids = [...new Set(selected as string[])];
  const candidates = actionCandidates(agentId, findings, run);
  if (ids.some((id) => !candidates.some((item) => item.findingId === id)))
    return {
      ok: false,
      errors: ['A selected finding is unavailable in this agent and analysis. Select again.'],
    };
  return { ok: true, value: candidates.filter((item) => ids.includes(item.findingId)) };
}

function inputNumber(
  value: unknown,
  label: string,
  maximum: number,
  integer = false,
): PlanResult<number> {
  const input = typeof value === 'string' ? value.trim() : value;
  const parsed =
    typeof input === 'number'
      ? input
      : typeof input === 'string' && /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(input)
        ? Number(input)
        : NaN;
  if (
    !Number.isFinite(parsed) ||
    parsed < 0 ||
    parsed > maximum ||
    (integer && !Number.isSafeInteger(parsed))
  )
    return {
      ok: false,
      errors: [
        `${label} must be ${integer ? 'a whole number' : 'a finite number'} between 0 and ${maximum.toLocaleString('en-US')}.`,
      ],
    };
  return { ok: true, value: parsed };
}

export function previewRetentionPlan(input: {
  agentId: string;
  findings: Finding[];
  run: SelectedRun | null;
  selectedIds: unknown;
  retentionDays: unknown;
  action: unknown;
}): PlanResult<LocalActionPlan> {
  if (!['digital-waste', 'collaboration'].includes(input.agentId))
    return {
      ok: false,
      errors: ['Retention planning is available only for storage and collaboration findings.'],
    };
  const selected = selectedResources(input.agentId, input.findings, input.run, input.selectedIds);
  if (!selected.ok) return selected;
  const days = inputNumber(input.retentionDays, 'Retention days', 3650, true);
  if (!days.ok || days.value < 1)
    return { ok: false, errors: ['Retention days must be a whole number from 1 to 3,650.'] };
  if (input.action !== 'archive' && input.action !== 'review')
    return {
      ok: false,
      errors: ['Choose archive proposal or policy review. Deletion is not available.'],
    };
  return {
    ok: true,
    value: {
      status: 'draft-only',
      title:
        input.action === 'archive'
          ? 'Archive proposal for owner review'
          : 'Retention policy review',
      resources: selected.value,
      settings: [
        `Proposed retention review threshold: ${days.value} days.`,
        `Action requested: ${input.action === 'archive' ? 'assess archive eligibility' : 'review existing policy'}.`,
      ],
      steps: [
        'Confirm the selected resource identifiers, owners, dependencies and current retention settings.',
        'Compare each resource with the proposed threshold; age and archive eligibility have not been established by this preview.',
        input.action === 'archive'
          ? 'Prepare an archive destination, access controls and a tested restore procedure for eligible resources.'
          : 'Document the policy change and its expected access and recovery effects for the owner.',
        'Have the responsible owner approve a separate implementation plan and verify retained access afterwards.',
      ],
      requiredChecks: [
        'Owner approval is required before implementation.',
        'Check legal holds, contractual retention and records policy.',
        'Validate backups and test restoration before moving any data.',
        'Confirm dependencies, permissions and rollback; no automated deletion is proposed.',
      ],
      disclaimer:
        'Local planning preview only. No data has been archived, deleted or changed; no savings have been verified.',
    },
  };
}

export function previewArchitecturePlan(input: {
  findings: Finding[];
  run: SelectedRun | null;
  selectedIds: unknown;
}): PlanResult<LocalActionPlan> {
  const selected = selectedResources('architecture', input.findings, input.run, input.selectedIds);
  if (!selected.ok) return selected;
  return {
    ok: true,
    value: {
      status: 'draft-only',
      title: 'Infrastructure patch-review checklist',
      resources: selected.value,
      settings: [
        'Use the recorded recommendations linked below; this preview does not generate an infrastructure patch.',
      ],
      steps: [
        'Review each recorded proposal and its supporting evidence.',
        'Prepare the smallest IaC change in a separate review branch; record the intended diff and affected resources.',
        'Validate configuration and run a non-applying plan; check dependencies, capacity, availability and rollback.',
        'Request human approval before implementation, then compare workload quality and measured resource usage.',
      ],
      requiredChecks: [
        'Service owner approval and change window.',
        'Data residency, network transfer and temporary duplicate-capacity effects for region changes.',
        'Capacity and performance tests; autoscaling limits and availability requirements.',
        'Rollback plan and post-change measurements.',
      ],
      disclaimer:
        'Checklist draft only. No code, deployment or cloud resource has changed. This is not a standards-conformance assessment.',
    },
  };
}

export interface CarbonScenario {
  energyKwh: number;
  baselineGramsPerKwh: number;
  targetGramsPerKwh: number;
  baselineKg: number;
  targetKg: number;
  reductionKg: number;
}
export function previewCarbonScenario(input: {
  energyKwh: unknown;
  baselineGramsPerKwh: unknown;
  targetGramsPerKwh: unknown;
}): PlanResult<CarbonScenario> {
  const energy = inputNumber(input.energyKwh, 'Energy (kWh)', 1_000_000_000);
  const baseline = inputNumber(input.baselineGramsPerKwh, 'Baseline grid intensity', 1_000_000);
  const target = inputNumber(input.targetGramsPerKwh, 'Target grid intensity', 1_000_000);
  if (!energy.ok || !baseline.ok || !target.ok)
    return {
      ok: false,
      errors: [energy, baseline, target].flatMap((result) => (result.ok ? [] : result.errors)),
    };
  const baselineKg = (energy.value * baseline.value) / 1000;
  const targetKg = (energy.value * target.value) / 1000;
  return {
    ok: true,
    value: {
      energyKwh: energy.value,
      baselineGramsPerKwh: baseline.value,
      targetGramsPerKwh: target.value,
      baselineKg,
      targetKg,
      reductionKg: baselineKg - targetKg,
    },
  };
}

export interface RecoveryTabletop {
  rtoMinutes: number;
  rpoMinutes: number;
  recoveryMinutes: number;
  dataGapMinutes: number;
  meetsRecoveryTarget: boolean;
  meetsDataTarget: boolean;
}
export function previewRecoveryTabletop(input: {
  rtoMinutes: unknown;
  rpoMinutes: unknown;
  recoveryMinutes: unknown;
  dataGapMinutes: unknown;
}): PlanResult<RecoveryTabletop> {
  const rto = inputNumber(input.rtoMinutes, 'RTO target', 525_600);
  const rpo = inputNumber(input.rpoMinutes, 'RPO target', 525_600);
  const recovery = inputNumber(input.recoveryMinutes, 'Estimated recovery time', 525_600);
  const gap = inputNumber(input.dataGapMinutes, 'Estimated data gap', 525_600);
  if (!rto.ok || !rpo.ok || !recovery.ok || !gap.ok)
    return {
      ok: false,
      errors: [rto, rpo, recovery, gap].flatMap((result) => (result.ok ? [] : result.errors)),
    };
  return {
    ok: true,
    value: {
      rtoMinutes: rto.value,
      rpoMinutes: rpo.value,
      recoveryMinutes: recovery.value,
      dataGapMinutes: gap.value,
      meetsRecoveryTarget: recovery.value <= rto.value,
      meetsDataTarget: gap.value <= rpo.value,
    },
  };
}
