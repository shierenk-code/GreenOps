import { webcrypto } from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  APPROVAL_STORAGE_KEY,
  MAX_APPROVAL_RECORDS,
  MAX_APPROVAL_STORAGE_CHARS,
  appendApprovalRecord,
  buildApprovalProposals,
  canonicalApprovalJSON,
  fingerprintProposal,
  latestProposalDecision,
  parseApprovalHistory,
  saveApprovalRecord,
  saveApprovalRecordLocked,
  summarizeApprovals,
  type ApprovalHistory,
  type ApprovalInput,
  type ApprovalProposal,
  type ApprovalLockManager,
} from '../apps/CodeVitals-MCP/website/src/app/dashboard/approval-decisions';
import type { Finding } from '../apps/CodeVitals-MCP/website/src/app/dashboard/ledger-dashboard';
import type {
  LedgerEntry,
  SelectedRun,
} from '../apps/CodeVitals-MCP/website/src/app/dashboard/ledger-data';

beforeAll(() => {
  if (!globalThis.crypto?.subtle) Object.defineProperty(globalThis, 'crypto', { value: webcrypto });
});
const finding = (id = 'cache'): Finding => ({
  bugId: id,
  agentId: 'ai-efficiency',
  agentName: 'AI Efficiency',
  category: 'uncached-completion',
  severity: 'medium',
  title: 'STALE_FLATTENED_TITLE',
  state: 'withheld',
  impactEnergyKwh: 999,
  impactCarbonKg: 999,
  confidence: 'high',
  effort: 'small',
  recommendationId: 'stale',
  recommendationTitle: 'STALE_OPTION',
  recommendation: 'STALE_RECOMMENDATION',
  expectedReductionFactor: 0.9,
  reversible: true,
  entries: [],
});
const entries = (id = 'cache', runId = 'run-a'): LedgerEntry[] => [
  {
    seq: 1,
    runId,
    bugId: id,
    stage: 'detect',
    timestamp: '2026-10-04T01:00:00Z',
    summary: 'Repeated public requests',
    data: {
      agentId: 'ai-efficiency',
      confidence: 'high',
      evidence: { wastedTokens: 400, prompt: 'PRIVATE_PROMPT', apiKey: 'sk-privatevalue' },
    },
  },
  {
    seq: 2,
    runId,
    bugId: id,
    stage: 'compare',
    timestamp: '2026-10-04T01:01:00Z',
    summary: 'PRIVATE_REASONING',
    data: {
      recommended: 'response-cache',
      strategies: [
        {
          id: 'response-cache',
          title: 'Cache public responses',
          description: 'Cache repeated public answers for one hour.',
          reversible: true,
        },
      ],
    },
  },
];
const run = (rows = entries(), runId = 'run-a'): SelectedRun => ({
  runId,
  entries: rows,
  timestamp: '2026-10-04T01:01:00Z',
  kind: 'run',
});
const proposal: ApprovalProposal = {
  id: 'cache',
  runId: 'run-a',
  fingerprint: 'a'.repeat(64),
  title: 'Repeated public requests',
  agentName: 'AI Efficiency',
  recommendationTitle: 'Cache public responses',
  recommendation: 'Use a scoped response cache.',
  source: 'Rule-based',
  confidence: 'high',
  reversible: true,
  evidence: [],
  policy: 'Automatic policy: withheld',
};
const approved: ApprovalInput = {
  decision: 'approved',
  reviewer: 'Demo reviewer',
  reason: 'Checked public inputs and expiry.',
  acknowledged: true,
};
const empty = (): ApprovalHistory => ({ version: 1, records: [] });
const add = (history = empty(), p = proposal, input = approved, id = 'review-1') =>
  appendApprovalRecord(history, p, input, id, '2026-10-04T02:00:00Z');

describe('eligible local plan proposals', () => {
  it('preserves the finding priority order rather than ledger insertion order', async () => {
    const rows = [...entries('low'), ...entries('urgent')];
    const result = await buildApprovalProposals(run(rows), [finding('urgent'), finding('low')]);
    expect(result.map((proposal) => proposal.id)).toEqual(['urgent', 'low']);
  });
  it('uses run entries instead of stale flattened fields and does not expose raw private payloads', async () => {
    const result = await buildApprovalProposals(run(), [finding()]);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      title: 'Repeated public requests',
      recommendationTitle: 'Cache public responses',
      reversible: true,
      confidence: 'high',
    });
    expect(result[0].fingerprint).toMatch(/^[a-f0-9]{64}$/);
    const json = JSON.stringify(result);
    for (const hidden of ['STALE_', 'PRIVATE_PROMPT', 'PRIVATE_REASONING', 'sk-privatevalue'])
      expect(json).not.toContain(hidden);
  });
  it('requires an explicit reviewable proposal, not unselected candidates or dangling selected IDs', async () => {
    const rows = entries();
    rows[1].data.recommended = '';
    expect(await buildApprovalProposals(run(rows), [finding()])).toEqual([]);
    rows[1].data.recommended = 'missing';
    expect(await buildApprovalProposals(run(rows), [finding()])).toEqual([]);
    rows[1].data.recommendation = 'Reduce retries after checking the error class.';
    expect(await buildApprovalProposals(run(rows), [finding()])).toHaveLength(1);
  });
  it('requires detection and recommendation in the selected run', async () => {
    expect(await buildApprovalProposals(null, [finding()])).toEqual([]);
    expect(await buildApprovalProposals(run(entries().slice(1)), [finding()])).toEqual([]);
    expect(await buildApprovalProposals(run(entries().slice(0, 1)), [finding()])).toEqual([]);
    expect(await buildApprovalProposals(run(entries('cache', 'run-other')), [finding()])).toEqual(
      [],
    );
    expect(await buildApprovalProposals(run(), [])).toEqual([]);
  });
  it.each([
    ['improve', { applied: true }],
    ['verify', { confirmed: true }],
  ] as const)('excludes %s completed findings', async (stage, data) => {
    const rows = entries();
    rows.push({ ...rows[1], stage, data, seq: 3 });
    expect(await buildApprovalProposals(run(rows), [finding()])).toEqual([]);
  });
  it('does not mistake automated policy approval for application or local human approval', async () => {
    const rows = entries();
    rows.push({
      ...rows[1],
      stage: 'approve',
      data: { approver: 'policy-approver', approved: true },
      seq: 3,
    });
    const proposals = await buildApprovalProposals(run(rows), [finding(), finding()]);
    expect(proposals).toHaveLength(1);
    expect(proposals[0].policy).toContain('Automatic policy');
    expect(summarizeApprovals(proposals, [], 'run-a').pending).toBe(1);
  });
});

describe('evidence binding', () => {
  it('canonicalizes key order but preserves values, types and array order', () => {
    expect(canonicalApprovalJSON({ b: 1, a: { y: '2', x: 2 } })).toBe(
      canonicalApprovalJSON({ a: { x: 2, y: '2' }, b: 1 }),
    );
    expect(canonicalApprovalJSON([1, '2'])).not.toBe(canonicalApprovalJSON(['1', 2]));
    expect(canonicalApprovalJSON([1, 2])).not.toBe(canonicalApprovalJSON([2, 1]));
    expect(() => canonicalApprovalJSON(Number.NaN)).toThrow('unsupported');
  });
  it('changes fingerprint for evidence, recommendations, timestamp, application state and run changes', async () => {
    const base = await fingerprintProposal('run-a', entries());
    const variants = [entries(), entries(), entries(), entries()];
    variants[0][0].data.evidence = { wastedTokens: 500 };
    variants[1][1].data.recommended = 'other';
    variants[2][0].timestamp = '2026-10-04T01:02:00Z';
    variants[3].push({ ...entries()[1], stage: 'improve', data: { applied: false }, seq: 3 });
    for (const variant of variants)
      expect(await fingerprintProposal('run-a', variant)).not.toBe(base);
    expect(await fingerprintProposal('run-b', entries())).not.toBe(base);
  });
  it('rejects very large and deeply nested bindings', async () => {
    const rows = entries();
    rows[0].data.payload = 'x'.repeat(1_000_001);
    await expect(fingerprintProposal('run-a', rows)).rejects.toThrow('too large');
    let nested: unknown = 1;
    for (let i = 0; i < 60; i++) nested = [nested];
    expect(() => canonicalApprovalJSON(nested)).toThrow('too complex');
  });
});

describe('append-only local decision history', () => {
  it('serializes concurrent tab writes under one origin-wide lock without losing a decision', async () => {
    let raw: string | null = null;
    let queue = Promise.resolve();
    let active = 0;
    const locks: ApprovalLockManager = {
      request<T>(name: string, callback: () => T | Promise<T>): Promise<T> {
        expect(name).toBe(`${APPROVAL_STORAGE_KEY}.write`);
        const work = queue.then(async () => {
          active++;
          expect(active).toBe(1);
          await Promise.resolve();
          try {
            return await callback();
          } finally {
            active--;
          }
        });
        queue = work.then(
          () => {},
          () => {},
        );
        return work;
      },
    };
    const storage = {
      getItem: () => raw,
      setItem: (_key: string, value: string) => {
        raw = value;
      },
    };
    await Promise.all(
      Array.from({ length: 20 }, (_, index) =>
        saveApprovalRecordLocked(
          locks,
          storage,
          proposal,
          approved,
          `tab-${index}`,
          '2026-10-04T02:00:00Z',
        ),
      ),
    );
    const history = parseApprovalHistory(raw);
    expect(history.records).toHaveLength(20);
    expect(history.records.map((record) => record.sequence)).toEqual(
      Array.from({ length: 20 }, (_, i) => i + 1),
    );
  });
  it('does not fall back to unsafe writes when Web Locks are unavailable', async () => {
    let reads = 0;
    const storage = {
      getItem: () => {
        reads++;
        return null;
      },
      setItem() {
        throw new Error('Must not write');
      },
    };
    await expect(
      saveApprovalRecordLocked(undefined, storage, proposal, approved, 'r', '2026-10-04T02:00:00Z'),
    ).rejects.toThrow('Safe cross-tab');
    expect(reads).toBe(0);
  });
  it('checks proposal validity again after acquiring the lock, before any write', async () => {
    const locks: ApprovalLockManager = { request: async (_name, callback) => callback() };
    let reads = 0;
    const storage = {
      getItem: () => {
        reads++;
        return null;
      },
      setItem() {
        throw new Error('Must not write');
      },
    };
    await expect(
      saveApprovalRecordLocked(
        locks,
        storage,
        proposal,
        approved,
        'r',
        '2026-10-04T02:00:00Z',
        () => false,
      ),
    ).rejects.toThrow('proposal changed');
    expect(reads).toBe(0);
  });
  it('records only the minimal approved plan and self-declared identity without execution or raw source', () => {
    const history = add();
    expect(history.records[0]).toMatchObject({
      scope: 'local-plan-only',
      identity: 'self-declared',
      acknowledged: true,
      decision: 'approved',
      sequence: 1,
    });
    expect(Object.keys(history.records[0]).sort()).toEqual(
      [
        'acknowledged',
        'decision',
        'findingId',
        'fingerprint',
        'id',
        'identity',
        'reason',
        'recordedAt',
        'reviewer',
        'runId',
        'scope',
        'sequence',
        'title',
      ].sort(),
    );
  });
  it('appends revisions without removing earlier decisions; latest decision wins', () => {
    const history = add(
      add(),
      proposal,
      { ...approved, decision: 'revision-requested', reason: 'Add a quality test.' },
      'review-2',
    );
    expect(history.records).toHaveLength(2);
    expect(latestProposalDecision(proposal, history.records)?.decision).toBe('revision-requested');
    expect(summarizeApprovals([proposal], history.records, 'run-a')).toEqual({
      pending: 0,
      approved: 0,
      rejected: 0,
      revisionRequested: 1,
      stale: 0,
    });
  });
  it('does not revive an earlier approval when the newest decision belongs to another proposal revision', () => {
    const changed = { ...proposal, fingerprint: 'b'.repeat(64) };
    const history = add(add(), changed, { ...approved, decision: 'rejected' }, 'review-2');
    expect(latestProposalDecision(proposal, history.records)).toBeNull();
    expect(summarizeApprovals([proposal], history.records, 'run-a')).toMatchObject({
      pending: 1,
      approved: 0,
      stale: 1,
    });
    expect(latestProposalDecision(changed, history.records)?.decision).toBe('rejected');
  });
  it('isolates runs even for identical finding IDs and preserves stale history', () => {
    const history = add();
    const other = { ...proposal, runId: 'run-other' };
    expect(latestProposalDecision(other, history.records)).toBeNull();
    expect(summarizeApprovals([other], history.records, 'run-other')).toMatchObject({
      pending: 1,
      stale: 0,
    });
    expect(summarizeApprovals([], history.records, 'run-a')).toMatchObject({
      pending: 0,
      approved: 0,
      stale: 1,
    });
  });
  it.each([
    { ...approved, reviewer: ' ' },
    { ...approved, reviewer: 'x'.repeat(101) },
    { ...approved, reason: '' },
    { ...approved, reason: 'x'.repeat(1001) },
    { ...approved, acknowledged: false },
    { ...approved, decision: 'execute' as ApprovalInput['decision'] },
  ])('requires meaningful reviewer/reason, explicit decision and acknowledgment %j', (input) => {
    expect(() => add(empty(), proposal, input)).toThrow();
  });
  it('redacts accidental credentials in user entered fields and ignores unknown stored fields', () => {
    const history = add(empty(), proposal, {
      ...approved,
      reason: 'password=hunter2 token=secret sk-hidden',
    });
    expect(history.records[0].reason).not.toContain('hunter2');
    expect(history.records[0].reason).not.toContain('sk-hidden');
    const input = { ...history, records: [{ ...history.records[0], rawPrompt: 'HIDDEN' }] };
    expect(JSON.stringify(parseApprovalHistory(JSON.stringify(input)))).not.toContain('HIDDEN');
  });
  it.each([
    'not-json',
    '{}',
    '{"version":2,"records":[]}',
    JSON.stringify({ version: 1, records: [{ id: 'bad' }] }),
  ])('rejects malformed history without silently replacing it: %s', (raw) => {
    expect(() => parseApprovalHistory(raw)).toThrow('Local review history');
  });
  it('enforces storage size, record count, uniqueness, scope and order limits', () => {
    expect(() => parseApprovalHistory(' '.repeat(MAX_APPROVAL_STORAGE_CHARS + 1))).toThrow(
      'size limit',
    );
    const record = add().records[0];
    expect(() =>
      parseApprovalHistory(JSON.stringify({ version: 1, records: [record, record] })),
    ).toThrow('invalid record');
    expect(() =>
      parseApprovalHistory(
        JSON.stringify({ version: 1, records: [{ ...record, scope: 'production-approved' }] }),
      ),
    ).toThrow('invalid record');
    const full = {
      version: 1 as const,
      records: Array.from({ length: MAX_APPROVAL_RECORDS }, (_, i) => ({
        ...record,
        sequence: i + 1,
        id: `review-${i}`,
      })),
    };
    expect(() => add(full, proposal, approved, 'new')).toThrow('full');
  });
  it('fresh-reads existing history before every append to preserve updates from other components', () => {
    let raw: string | null = null;
    const storage = {
      getItem(key: string) {
        expect(key).toBe(APPROVAL_STORAGE_KEY);
        return raw;
      },
      setItem(key: string, value: string) {
        expect(key).toBe(APPROVAL_STORAGE_KEY);
        raw = value;
      },
    };
    saveApprovalRecord(storage, proposal, approved, 'review-1', '2026-10-04T02:00:00Z');
    const history = saveApprovalRecord(
      storage,
      proposal,
      { ...approved, decision: 'rejected' },
      'review-2',
      '2026-10-04T02:01:00Z',
    );
    expect(history.records.map((record) => record.decision)).toEqual(['approved', 'rejected']);
  });
  it('never overwrites malformed storage and surfaces write failures', () => {
    let writes = 0;
    const corrupt = {
      getItem: () => 'corrupt',
      setItem: () => {
        writes++;
      },
    };
    expect(() =>
      saveApprovalRecord(corrupt, proposal, approved, 'r', '2026-10-04T02:00:00Z'),
    ).toThrow();
    expect(writes).toBe(0);
    const blocked = {
      getItem: () => null,
      setItem: () => {
        throw new Error('Quota exceeded');
      },
    };
    expect(() =>
      saveApprovalRecord(blocked, proposal, approved, 'r', '2026-10-04T02:00:00Z'),
    ).toThrow('Quota exceeded');
  });
});
