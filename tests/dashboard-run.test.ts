import { describe, expect, it } from 'vitest';
import {
  selectDashboardRun,
  withRecordedRun,
} from '../apps/CodeVitals-MCP/website/src/app/dashboard/dashboard-run.js';
import type {
  LedgerEntry,
  LedgerFile,
  RunOutcome,
} from '../apps/CodeVitals-MCP/website/src/app/dashboard/ledger-data.js';

const entry = (runId: string, timestamp: string, seq = 0): LedgerEntry => ({
  runId,
  bugId: 'reused-finding-id',
  stage: 'detect',
  timestamp,
  seq,
  summary: `${runId} evidence`,
  data: { source: 'local' },
});
const outcome = (runId: string, finishedAt: string): RunOutcome => ({
  runId,
  startedAt: finishedAt,
  finishedAt,
  bugsDetected: 0,
  bugsImproved: 0,
  savings: { energyKwh: 0, carbonKgCo2e: 0 },
  selfCost: { energyKwh: 0, carbonKgCo2e: 0, tokens: 0, toolCalls: 0, retries: 0 },
  net: { energyKwh: 0, carbonKgCo2e: 0, netPositive: false },
});
const ledger: LedgerFile = {
  version: 1,
  entries: [entry('historic', '2026-10-01T09:00:00Z'), entry('latest', '2026-10-03T09:00:00Z')],
  outcomes: [],
};

describe('Recorded dashboard run selection', () => {
  it('keeps the latest-run default only when no run was requested', () => {
    expect(selectDashboardRun(ledger, null)?.runId).toBe('latest');
    expect(selectDashboardRun(null, null)).toBeNull();
  });

  it('binds a reused finding ID to its requested historic evidence', () => {
    const run = selectDashboardRun(ledger, 'historic');
    expect(run?.runId).toBe('historic');
    expect(run?.entries).toEqual([ledger.entries[0]]);
    expect(run?.kind).toBe('review');
  });

  it.each(['unknown', '', ' historic', 'HISTORIC'])(
    'does not substitute the latest run for an unavailable requested ID %j',
    (runId) => {
      expect(selectDashboardRun(ledger, runId)).toBeNull();
      expect(selectDashboardRun(null, runId)).toBeNull();
    },
  );

  it('selects an outcome-only run and never borrows a different run outcome', () => {
    const recorded = outcome('outcome-only', '2026-09-01T09:00:00Z');
    const input = { ...ledger, outcomes: [recorded] };
    expect(selectDashboardRun(input, 'outcome-only')).toMatchObject({
      runId: 'outcome-only',
      entries: [],
      kind: 'run',
      outcome: recorded,
    });
    expect(selectDashboardRun(input, 'historic')?.outcome).toBeUndefined();
  });

  it('orders the requested run without changing the source ledger', () => {
    const input = {
      ...ledger,
      entries: [entry('historic', '2026-10-01T09:01:00Z', 2), ...ledger.entries],
    };
    const before = JSON.stringify(input);
    expect(selectDashboardRun(input, 'historic')?.entries.map((item) => item.seq)).toEqual([0, 2]);
    expect(JSON.stringify(input)).toBe(before);
  });
});

describe('Recorded run navigation', () => {
  it.each([
    '/dashboard',
    '/dashboard/agents',
    '/dashboard/findings',
    '/dashboard/review',
    '/dashboard/trace',
  ])('binds %s to the current recorded run', (href) => {
    expect(withRecordedRun(href, 'historic')).toBe(`${href}?run=historic`);
  });

  it('preserves finding filters and decision anchors while replacing a stale run', () => {
    const href = withRecordedRun(
      '/dashboard/review?finding=a%26b&state=withheld&run=stale#human-decision',
      'historic / &?#',
    );
    const url = new URL(href, 'https://dashboard.example');
    expect(url.searchParams.get('finding')).toBe('a&b');
    expect(url.searchParams.get('state')).toBe('withheld');
    expect(url.searchParams.getAll('run')).toEqual(['historic / &?#']);
    expect(url.hash).toBe('#human-decision');
  });

  it('preserves agent, recommendation, stage filters and an agent anchor', () => {
    const href = withRecordedRun(
      '/dashboard/agents?agent=ai-efficiency&recommendation=cache&stage=compare#agent-detail',
      'historic',
    );
    expect(href).toBe(
      '/dashboard/agents?agent=ai-efficiency&recommendation=cache&stage=compare&run=historic#agent-detail',
    );
  });

  it('retains an invalid empty run binding instead of enabling a latest-run fallback', () => {
    expect(withRecordedRun('/dashboard/trace', '')).toBe('/dashboard/trace?run=');
  });

  it.each([null, undefined])(
    'leaves a destination alone when no run context exists: %j',
    (runId) => {
      expect(withRecordedRun('/dashboard/findings?state=verified#findings', runId)).toBe(
        '/dashboard/findings?state=verified#findings',
      );
    },
  );
});
