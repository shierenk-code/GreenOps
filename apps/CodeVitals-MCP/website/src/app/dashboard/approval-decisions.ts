import type { Finding } from './ledger-dashboard';
import type { LedgerEntry, SelectedRun } from './ledger-data';
import { asRecord, entryFor } from './dashboard-format';
import { buildFindingAudit, resolveRecordedRecommendation, safeAuditText } from './dashboard-audit';

export const APPROVAL_STORAGE_KEY = 'greenops.local-plan-reviews.v1';
export const MAX_APPROVAL_RECORDS = 500;
export const MAX_APPROVAL_STORAGE_CHARS = 2_000_000;
export type LocalDecision = 'approved' | 'rejected' | 'revision-requested';
export interface ApprovalProposal {
  id: string;
  runId: string;
  fingerprint: string;
  title: string;
  agentName: string;
  recommendation: string;
  recommendationTitle: string;
  source: string;
  confidence: string;
  reversible: boolean | null;
  evidence: Array<{ label: string; value: string }>;
  policy: string;
}
export interface ApprovalRecord {
  id: string;
  sequence: number;
  runId: string;
  findingId: string;
  fingerprint: string;
  title: string;
  decision: LocalDecision;
  reviewer: string;
  reason: string;
  recordedAt: string;
  scope: 'local-plan-only' | 'account-plan-only';
  identity: 'self-declared' | 'authenticated';
  acknowledged: true;
}
export interface ApprovalHistory {
  version: 1;
  records: ApprovalRecord[];
}
export interface ApprovalInput {
  decision: LocalDecision;
  reviewer: string;
  reason: string;
  acknowledged: boolean;
}
export const DECISION_LABELS: Record<LocalDecision, string> = {
  approved: 'Plan approved locally',
  rejected: 'Plan rejected',
  'revision-requested': 'Revision requested',
};
const decisions: LocalDecision[] = ['approved', 'rejected', 'revision-requested'];
const object = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
const bounded = (value: unknown, max: number): value is string =>
  typeof value === 'string' && value.trim().length > 0 && value.length <= max;
const digestPattern = /^[a-f0-9]{64}$/;

/** Canonical, type-preserving JSON; used ONLY as a transient SHA-256 input, never stored. */
export function canonicalApprovalJSON(value: unknown, depth = 0): string {
  if (depth > 50) throw new Error('This proposal is too complex to bind safely.');
  if (value === null || typeof value === 'string' || typeof value === 'boolean')
    return JSON.stringify(value);
  if (typeof value === 'number' && Number.isFinite(value)) return JSON.stringify(value);
  if (Array.isArray(value))
    return `[${value.map((item) => canonicalApprovalJSON(item, depth + 1)).join(',')}]`;
  if (object(value))
    return `{${Object.keys(value)
      .filter((key) => value[key] !== undefined)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalApprovalJSON(value[key], depth + 1)}`)
      .join(',')}}`;
  throw new Error('The proposal contains unsupported data.');
}

export async function fingerprintProposal(runId: string, entries: LedgerEntry[]): Promise<string> {
  const canonical = canonicalApprovalJSON({ version: 1, runId, entries });
  if (canonical.length > 1_000_000)
    throw new Error('This proposal is too large to review locally.');
  if (!globalThis.crypto?.subtle)
    throw new Error(
      'Secure browser storage binding is unavailable. Open this dashboard on localhost or HTTPS.',
    );
  const digest = await globalThis.crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(canonical),
  );
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** Source entries are authoritative; imported flattened UI fields cannot create a proposal. */
export async function buildApprovalProposals(
  run: SelectedRun | null,
  findings: Finding[],
): Promise<ApprovalProposal[]> {
  if (!run) return [];
  const grouped = new Map<string, LedgerEntry[]>();
  for (const entry of run.entries) {
    if (entry.runId !== run.runId) continue;
    const list = grouped.get(entry.bugId) ?? [];
    list.push(entry);
    grouped.set(entry.bugId, list);
  }
  const unique = new Map(findings.map((finding) => [finding.bugId, finding]));
  const result: ApprovalProposal[] = [];
  for (const [id, finding] of unique) {
    const entries = grouped.get(id);
    if (!entries) continue;
    const detect = entryFor(entries, 'detect');
    const compare = entryFor(entries, 'compare');
    if (!finding || !detect || !compare) continue;
    if (
      entries.some(
        (entry) =>
          (entry.stage === 'improve' && entry.data.applied === true) ||
          (entry.stage === 'verify' && entry.data.confirmed === true),
      )
    )
      continue;
    const recommendation = resolveRecordedRecommendation(entries);
    const selectedDetails = ['title', 'description'].some(
      (key) =>
        typeof recommendation.strategy[key] === 'string' && recommendation.strategy[key].trim(),
    );
    const directText =
      typeof compare.data.recommendation === 'string' && compare.data.recommendation.trim();
    if (!selectedDetails && !directText) continue;
    const audit = buildFindingAudit({ ...finding, entries });
    const fix = asRecord(compare.data.fix);
    result.push({
      id,
      runId: run.runId,
      fingerprint: await fingerprintProposal(run.runId, entries),
      title: safeAuditText(detect.data.title, safeAuditText(detect.summary, 'Recorded finding')),
      agentName: safeAuditText(finding.agentName, 'Specialist agent'),
      recommendation: recommendation.description,
      recommendationTitle: recommendation.title,
      source: audit.source.label,
      confidence: ['high', 'medium', 'low'].includes(String(detect.data.confidence))
        ? String(detect.data.confidence)
        : 'unknown',
      reversible:
        typeof recommendation.strategy.reversible === 'boolean'
          ? recommendation.strategy.reversible
          : typeof fix.reversible === 'boolean'
            ? fix.reversible
            : null,
      evidence: audit.evidence,
      policy: audit.decision.label,
    });
  }
  return result;
}

/** Reject invalid history in full instead of silently dropping approvals or overwriting corruption. */
export function parseApprovalHistory(raw: string | null): ApprovalHistory {
  if (raw === null) return { version: 1, records: [] };
  if (raw.length > MAX_APPROVAL_STORAGE_CHARS)
    throw new Error(
      'Local review history exceeds its size limit. Export or recover it before continuing.',
    );
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('Local review history is unreadable. It has not been overwritten.');
  }
  if (
    !object(parsed) ||
    parsed.version !== 1 ||
    !Array.isArray(parsed.records) ||
    parsed.records.length > MAX_APPROVAL_RECORDS
  )
    throw new Error('Local review history has an unsupported format. It has not been overwritten.');
  const seen = new Set<string>();
  let priorSequence = 0;
  const records = parsed.records.map((record: unknown): ApprovalRecord => {
    if (
      !object(record) ||
      !bounded(record.id, 100) ||
      seen.has(record.id) ||
      !Number.isSafeInteger(record.sequence) ||
      Number(record.sequence) <= priorSequence ||
      !bounded(record.runId, 300) ||
      !bounded(record.findingId, 300) ||
      typeof record.fingerprint !== 'string' ||
      !digestPattern.test(record.fingerprint) ||
      !bounded(record.title, 1600) ||
      !decisions.includes(record.decision as LocalDecision) ||
      !bounded(record.reviewer, 100) ||
      !bounded(record.reason, 1000) ||
      typeof record.recordedAt !== 'string' ||
      record.recordedAt.length > 40 ||
      !Number.isFinite(Date.parse(record.recordedAt)) ||
      record.scope !== 'local-plan-only' ||
      record.identity !== 'self-declared' ||
      record.acknowledged !== true
    )
      throw new Error(
        'Local review history contains an invalid record. It has not been overwritten.',
      );
    seen.add(record.id);
    priorSequence = Number(record.sequence);
    return {
      id: record.id,
      sequence: priorSequence,
      runId: record.runId,
      findingId: record.findingId,
      fingerprint: record.fingerprint,
      title: safeAuditText(record.title, 'Recorded finding'),
      decision: record.decision as LocalDecision,
      reviewer: safeAuditText(record.reviewer, 'Reviewer'),
      reason: safeAuditText(record.reason, 'No note'),
      recordedAt: record.recordedAt,
      scope: 'local-plan-only',
      identity: 'self-declared',
      acknowledged: true,
    };
  });
  return { version: 1, records };
}

export function latestProposalDecision(
  proposal: ApprovalProposal,
  records: ApprovalRecord[],
): ApprovalRecord | null {
  const latest = records
    .filter((record) => record.runId === proposal.runId && record.findingId === proposal.id)
    .at(-1);
  return latest?.fingerprint === proposal.fingerprint ? latest : null;
}

export function summarizeApprovals(
  proposals: ApprovalProposal[],
  records: ApprovalRecord[],
  runId: string | null,
) {
  const counts = { pending: 0, approved: 0, rejected: 0, revisionRequested: 0, stale: 0 };
  for (const proposal of proposals) {
    const latest = latestProposalDecision(proposal, records);
    if (!latest) counts.pending++;
    else if (latest.decision === 'approved') counts.approved++;
    else if (latest.decision === 'rejected') counts.rejected++;
    else counts.revisionRequested++;
  }
  const latestByFinding = new Map<string, ApprovalRecord>();
  for (const record of records)
    if (record.runId === runId) latestByFinding.set(record.findingId, record);
  for (const record of latestByFinding.values()) {
    if (
      !proposals.some(
        (proposal) =>
          proposal.id === record.findingId && proposal.fingerprint === record.fingerprint,
      )
    )
      counts.stale++;
  }
  return counts;
}

export function appendApprovalRecord(
  history: ApprovalHistory,
  proposal: ApprovalProposal,
  input: ApprovalInput,
  id: string,
  recordedAt: string,
): ApprovalHistory {
  if (!decisions.includes(input.decision)) throw new Error('Choose a valid review decision.');
  if (!bounded(input.reviewer.trim(), 100))
    throw new Error('Enter your reviewer name (up to 100 characters).');
  if (!bounded(input.reason.trim(), 1000))
    throw new Error('Add a decision reason (up to 1,000 characters).');
  if (input.acknowledged !== true)
    throw new Error('Confirm that this is a local plan review, not permission to execute.');
  if (history.records.length >= MAX_APPROVAL_RECORDS)
    throw new Error(
      'Local review history is full. Export your history before starting a new browser workspace.',
    );
  const record: ApprovalRecord = {
    id,
    sequence: (history.records.at(-1)?.sequence ?? 0) + 1,
    runId: proposal.runId,
    findingId: proposal.id,
    fingerprint: proposal.fingerprint,
    title: proposal.title,
    decision: input.decision,
    reviewer: safeAuditText(input.reviewer.trim(), 'Reviewer'),
    reason: safeAuditText(input.reason.trim(), 'No note'),
    recordedAt,
    scope: 'local-plan-only',
    identity: 'self-declared',
    acknowledged: true,
  };
  return parseApprovalHistory(
    JSON.stringify({ version: 1, records: [...history.records, record] }),
  );
}

export interface ApprovalStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}
/** Must be called under the origin-wide review write lock by browser consumers. */
export function saveApprovalRecord(
  storage: ApprovalStorage,
  proposal: ApprovalProposal,
  input: ApprovalInput,
  id: string,
  recordedAt: string,
): ApprovalHistory {
  const history = appendApprovalRecord(
    parseApprovalHistory(storage.getItem(APPROVAL_STORAGE_KEY)),
    proposal,
    input,
    id,
    recordedAt,
  );
  storage.setItem(APPROVAL_STORAGE_KEY, JSON.stringify(history));
  return history;
}

export interface ApprovalLockManager {
  request<T>(name: string, callback: () => T | Promise<T>): Promise<T>;
}

/** Web Locks serializes the read/append/write transaction across all tabs on this origin. */
export async function saveApprovalRecordLocked(
  locks: ApprovalLockManager | undefined,
  storage: ApprovalStorage,
  proposal: ApprovalProposal,
  input: ApprovalInput,
  id: string,
  recordedAt: string,
  isCurrent: () => boolean = () => true,
): Promise<ApprovalHistory> {
  if (!locks)
    throw new Error(
      'Safe cross-tab review storage is unavailable in this browser. Local decisions cannot be saved.',
    );
  return locks.request(`${APPROVAL_STORAGE_KEY}.write`, () => {
    if (!isCurrent())
      throw new Error(
        'The proposal changed while waiting to save. Review its current evidence before deciding.',
      );
    return saveApprovalRecord(storage, proposal, input, id, recordedAt);
  });
}
