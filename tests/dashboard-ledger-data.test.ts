import { describe, expect, it } from 'vitest';
import {
  selectLatestRun,
  validateLedger,
  type LedgerEntry,
  type LedgerFile,
  type RunOutcome,
} from '../apps/CodeVitals-MCP/website/src/app/dashboard/ledger-data.js';

const entry = (
  runId: string,
  timestamp: string,
  data: Record<string, unknown> = {},
  seq = 0,
): LedgerEntry => ({
  runId,
  bugId: 'finding-1',
  stage: 'detect',
  seq,
  timestamp,
  summary: 'Recorded finding',
  data,
});
const outcome = (runId: string, finishedAt: string): RunOutcome => ({
  runId,
  startedAt: finishedAt,
  finishedAt,
  bugsDetected: 1,
  bugsImproved: 0,
  savings: { energyKwh: 0, carbonKgCo2e: 0 },
  selfCost: { energyKwh: 0.1, carbonKgCo2e: 0.02, tokens: 35, toolCalls: 1, retries: 0 },
  net: { energyKwh: -0.1, carbonKgCo2e: -0.02, netPositive: false },
});
const ledger = (entries: LedgerEntry[], outcomes: RunOutcome[] = []): LedgerFile => ({
  version: 1,
  entries,
  outcomes,
});

describe('Dashboard ledger validation', () => {
  function usageAware(complete: boolean): RunOutcome {
    const base = outcome('usage-aware', '2026-10-04T00:00:00Z');
    return {
      ...base,
      selfCost: {
        ...base.selfCost,
        tokens: complete ? 35 : null,
        knownTokens: 35,
        usageComplete: complete,
        llmCalls: 2,
        unknownLlmCalls: complete ? 0 : 1,
        energyKwh: complete ? 0.1 : null,
        carbonKgCo2e: complete ? 0.02 : null,
      },
      net: complete ? base.net : { energyKwh: null, carbonKgCo2e: null, netPositive: null },
    };
  }

  it.each([true, false])(
    'preserves usage-aware outcome completeness %s without inventing missing footprint',
    (complete) => {
      const input = ledger([], [usageAware(complete)]);
      expect(validateLedger(input)).toEqual(input);
      expect(selectLatestRun(validateLedger(input))!.outcome).toEqual(input.outcomes[0]);
    },
  );

  it('preserves explicitly recorded zero usage and no model calls', () => {
    const value = usageAware(true);
    value.selfCost = {
      ...value.selfCost,
      tokens: 0,
      knownTokens: 0,
      llmCalls: 0,
      energyKwh: 0,
      carbonKgCo2e: 0,
    };
    value.net = { energyKwh: 0, carbonKgCo2e: 0, netPositive: false };
    expect(validateLedger(ledger([], [value])).outcomes[0].selfCost.tokens).toBe(0);
  });

  it.each([
    { knownTokens: undefined },
    { usageComplete: 'true' },
    { knownTokens: -1 },
    { knownTokens: 0.5 },
    { knownTokens: 36 },
    { llmCalls: 0 },
    { unknownLlmCalls: 1 },
    { llmCalls: Infinity },
    { energyKwh: null },
    { carbonKgCo2e: -0.1 },
  ])('rejects inconsistent complete-usage metadata %j', (patch) => {
    const value = usageAware(true);
    Object.assign(value.selfCost, patch);
    expect(() => validateLedger(ledger([], [value]))).toThrow('invalid outcome');
  });

  it.each([
    { tokens: 0 },
    { energyKwh: 0 },
    { carbonKgCo2e: 0 },
    { unknownLlmCalls: 0 },
    { unknownLlmCalls: 3 },
    { llmCalls: 1 },
  ])(
    'rejects partial usage that hides unknown requests or invents a complete footprint %j',
    (patch) => {
      const value = usageAware(false);
      Object.assign(value.selfCost, patch);
      expect(() => validateLedger(ledger([], [value]))).toThrow('invalid outcome');
    },
  );

  it('requires partial usage net values to remain unknown and rejects partial metadata', () => {
    const value = usageAware(false);
    value.net.netPositive = false;
    expect(() => validateLedger(ledger([], [value]))).toThrow('invalid outcome');
    const old = outcome('legacy', '');
    old.selfCost.knownTokens = 35;
    expect(() => validateLedger(ledger([], [old]))).toThrow('invalid outcome');
    const unsupported = outcome('legacy-null', '');
    unsupported.selfCost.tokens = null;
    expect(() => validateLedger(ledger([], [unsupported]))).toThrow('invalid outcome');
  });

  it('accepts empty and minimal historical ledgers without inventing outcomes or dates', () => {
    expect(validateLedger({ entries: [], outcomes: [] })).toEqual(ledger([]));
    expect(
      validateLedger({
        entries: [{ runId: 'review-1', bugId: 'finding-1', stage: 'detect' }],
        outcomes: [],
      }),
    ).toEqual(
      ledger([
        {
          runId: 'review-1',
          bugId: 'finding-1',
          stage: 'detect',
          seq: 0,
          timestamp: '',
          summary: '',
          data: {},
        },
      ]),
    );
  });

  it('preserves stage payloads and legitimate negative net outcomes', () => {
    const input = ledger(
      [
        entry('run', '2026-10-01T00:00:00Z', {
          analysis: { provider: 'gemini' },
          futureField: [1, 'historical data'],
        }),
      ],
      [outcome('run', '2026-10-01T00:01:00Z')],
    );
    expect(validateLedger(input)).toEqual(input);
  });

  it.each([
    null,
    [],
    {},
    { entries: [] },
    { entries: {}, outcomes: [] },
    { entries: [], outcomes: {} },
  ])('rejects malformed ledger envelopes: %j', (input) => {
    expect(() => validateLedger(input)).toThrow('entries[] and outcomes[] are required');
  });

  it.each([
    null,
    [],
    {},
    { runId: 'r', bugId: '', stage: 'detect' },
    { runId: 1, bugId: 'b', stage: 'detect' },
    { runId: 'r', bugId: 'b', stage: 'unknown' },
    { runId: 'r', bugId: 'b', stage: 'detect', data: null },
    { runId: 'r', bugId: 'b', stage: 'detect', data: [] },
    { runId: 'r', bugId: 'b', stage: 'detect', summary: {} },
    { runId: 'r', bugId: 'b', stage: 'detect', timestamp: 123 },
    { runId: 'r', bugId: 'b', stage: 'detect', seq: Number.POSITIVE_INFINITY },
  ])('rejects unsafe entries without echoing their contents: %j', (input) => {
    expect(() => validateLedger({ entries: [input], outcomes: [] })).toThrow(
      'This GreenOps ledger has an invalid entry at position 1.',
    );
  });

  it.each([
    null,
    [],
    {},
    { ...outcome('run', ''), selfCost: null },
    { ...outcome('run', ''), net: { energyKwh: 0, carbonKgCo2e: 0 } },
    { ...outcome('run', ''), bugsDetected: -1 },
    { ...outcome('run', ''), bugsImproved: 0.5 },
    { ...outcome('run', ''), savings: { energyKwh: Number.NaN, carbonKgCo2e: 0 } },
    {
      ...outcome('run', ''),
      selfCost: { ...outcome('run', '').selfCost, tokens: Number.POSITIVE_INFINITY },
    },
  ])('rejects unsafe outcome records: %j', (input) => {
    expect(() => validateLedger({ entries: [], outcomes: [input] })).toThrow(
      'invalid outcome at position 1',
    );
  });
});

describe('Dashboard latest recorded activity', () => {
  it('returns null only for absent or empty ledgers', () => {
    expect(selectLatestRun(null)).toBeNull();
    expect(selectLatestRun(ledger([]))).toBeNull();
  });

  it.each(['local', 'github'])('displays an outcome-free %s review', (source) => {
    const entries = [entry('review-1', '2026-10-02T10:00:00Z', { source })];
    expect(selectLatestRun(ledger(entries))).toEqual({
      runId: 'review-1',
      entries,
      timestamp: '2026-10-02T10:00:00Z',
      kind: 'review',
    });
  });

  it('selects the newest recorded activity across out-of-order runs and reviews', () => {
    const recentReview = entry('new-review', '2026-10-03T10:00:00Z', { source: 'local' });
    const input = ledger(
      [
        recentReview,
        entry('old-review', '2026-10-01T10:00:00Z', { source: 'github' }),
        entry('old-run', '2026-10-02T10:00:00Z'),
      ],
      [outcome('old-run', '2026-10-02T10:01:00Z')],
    );
    expect(selectLatestRun(input)).toEqual({
      runId: 'new-review',
      entries: [recentReview],
      timestamp: recentReview.timestamp,
      kind: 'review',
    });
  });

  it('selects outcomes by recorded timestamp rather than the last array element', () => {
    const newest = outcome('new-run', '2026-10-03T10:00:00Z');
    expect(
      selectLatestRun(ledger([], [newest, outcome('old-run', '2026-10-01T10:00:00Z')])),
    ).toEqual({
      runId: 'new-run',
      entries: [],
      timestamp: newest.finishedAt,
      kind: 'run',
      outcome: newest,
    });
  });

  it('preserves a newer incomplete run and never borrows a completed outcome', () => {
    const unfinished = entry('unfinished', '2026-10-03T10:00:00Z');
    expect(
      selectLatestRun(ledger([unfinished], [outcome('completed', '2026-10-02T10:00:00Z')])),
    ).toEqual({
      runId: 'unfinished',
      entries: [unfinished],
      timestamp: unfinished.timestamp,
      kind: 'in-progress',
    });
  });

  it('uses timestamps chronologically, accounting for time zone offsets', () => {
    const newest = entry('newest', '2026-10-03T09:00:00-04:00');
    expect(selectLatestRun(ledger([newest, entry('older', '2026-10-03T12:00:00Z')]))).toMatchObject(
      { runId: 'newest', timestamp: newest.timestamp },
    );
  });

  it('keeps the latest actual outcome for repeated run ids and orders entries without mutating input', () => {
    const entries = [
      { ...entry('run', '2026-10-03T10:01:00Z', {}, 1), stage: 'investigate' as const },
      entry('run', '2026-10-03T10:00:00Z', {}, 0),
    ];
    const newest = outcome('run', '2026-10-03T10:02:00Z');
    const input = ledger(entries, [newest, outcome('run', '2026-10-03T10:01:00Z')]);
    const before = JSON.stringify(input);
    const selected = selectLatestRun(input);
    expect(selected?.outcome).toBe(newest);
    expect(selected?.entries.map((item) => item.seq)).toEqual([0, 1]);
    expect(JSON.stringify(input)).toBe(before);
  });

  it('keeps records with absent or invalid historical dates visible without invented timestamps', () => {
    const input = validateLedger({
      entries: [
        {
          runId: 'review',
          bugId: 'finding-1',
          stage: 'detect',
          data: { source: 'local' },
          timestamp: 'unknown',
        },
        { runId: 'review', bugId: 'finding-1', stage: 'compare' },
      ],
      outcomes: [],
    });
    expect(selectLatestRun(input)).toMatchObject({
      runId: 'review',
      timestamp: '',
      kind: 'review',
    });
    expect(selectLatestRun(input)?.entries).toHaveLength(2);
  });

  it('requires review provenance on a detect entry, not arbitrary stage data', () => {
    expect(
      selectLatestRun(ledger([{ ...entry('run', '', { source: 'local' }), stage: 'compare' }])),
    ).toMatchObject({ kind: 'in-progress' });
  });
});
