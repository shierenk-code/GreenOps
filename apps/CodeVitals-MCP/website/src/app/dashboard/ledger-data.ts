export type LedgerStage =
  'detect' | 'investigate' | 'compare' | 'simulate' | 'approve' | 'improve' | 'verify';

export const MAX_LEDGER_BYTES = 20 * 1024 * 1024;

export interface LedgerEntry {
  seq: number;
  runId: string;
  bugId: string;
  stage: LedgerStage;
  timestamp: string;
  summary: string;
  data: Record<string, unknown>;
}

export interface RunOutcome {
  runId: string;
  startedAt: string;
  finishedAt: string;
  bugsDetected: number;
  bugsImproved: number;
  savings: { energyKwh: number; carbonKgCo2e: number };
  selfCost: {
    energyKwh: number | null;
    carbonKgCo2e: number | null;
    tokens: number | null;
    /** Present together on usage-aware ledgers; absent on historical records. */
    knownTokens?: number;
    usageComplete?: boolean;
    llmCalls?: number;
    unknownLlmCalls?: number;
    toolCalls: number;
    retries: number;
    events?: Array<{
      stage: string;
      kind: 'llm' | 'tool' | 'retry';
      tokens?: number | null;
      durationMs?: number;
      note?: string;
      at: string;
    }>;
  };
  trace?: Array<{
    kind: 'plan' | 'agent';
    actor: string;
    status: 'planned' | 'started' | 'completed' | 'failed';
    detail: string;
    at: string;
  }>;
  net: { energyKwh: number | null; carbonKgCo2e: number | null; netPositive: boolean | null };
}

export interface LedgerFile {
  version: number;
  entries: LedgerEntry[];
  outcomes: RunOutcome[];
}

export interface SelectedRun {
  runId: string;
  entries: LedgerEntry[];
  timestamp: string;
  kind: 'run' | 'review' | 'in-progress';
  outcome?: RunOutcome;
}

const STAGES = new Set<LedgerStage>([
  'detect',
  'investigate',
  'compare',
  'simulate',
  'approve',
  'improve',
  'verify',
]);
const object = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
const identifier = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0;
const finite = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);
const count = (value: unknown): value is number =>
  finite(value) && Number.isSafeInteger(value) && value >= 0;
const optionalText = (value: unknown) => value === undefined || typeof value === 'string';
const impact = (value: unknown): boolean =>
  object(value) && finite(value.energyKwh) && finite(value.carbonKgCo2e);

function validSelfCostAndNet(selfCost: unknown, net: unknown): boolean {
  if (!object(selfCost) || !object(net) || !count(selfCost.toolCalls) || !count(selfCost.retries))
    return false;
  const physicalEstimate = (value: unknown) => finite(value) && value >= 0;
  const numericFootprint =
    physicalEstimate(selfCost.energyKwh) && physicalEstimate(selfCost.carbonKgCo2e);
  const numericNet = impact(net) && typeof net.netPositive === 'boolean';
  const metadata = ['knownTokens', 'usageComplete', 'llmCalls', 'unknownLlmCalls'];
  const hasMetadata = metadata.some((key) => Object.hasOwn(selfCost, key));
  // Preserve the historical numeric schema without inventing completeness metadata.
  if (!hasMetadata) return count(selfCost.tokens) && numericFootprint && numericNet;
  if (
    !metadata.every((key) => Object.hasOwn(selfCost, key)) ||
    !count(selfCost.knownTokens) ||
    typeof selfCost.usageComplete !== 'boolean' ||
    !count(selfCost.llmCalls) ||
    !count(selfCost.unknownLlmCalls)
  )
    return false;
  if (selfCost.unknownLlmCalls > selfCost.llmCalls) return false;
  if (selfCost.knownTokens > 0 && selfCost.llmCalls === selfCost.unknownLlmCalls) return false;
  if (selfCost.usageComplete)
    return (
      selfCost.unknownLlmCalls === 0 &&
      count(selfCost.tokens) &&
      selfCost.tokens === selfCost.knownTokens &&
      numericFootprint &&
      numericNet
    );
  return (
    selfCost.unknownLlmCalls > 0 &&
    selfCost.tokens === null &&
    selfCost.energyKwh === null &&
    selfCost.carbonKgCo2e === null &&
    net.energyKwh === null &&
    net.carbonKgCo2e === null &&
    net.netPositive === null
  );
}

/** Validate the envelope used by the UI while preserving historical stage data. */
export function validateLedger(value: unknown): LedgerFile {
  if (!object(value) || !Array.isArray(value.entries) || !Array.isArray(value.outcomes)) {
    throw new Error('This JSON is not a GreenOps ledger: entries[] and outcomes[] are required.');
  }
  if (value.version !== undefined && (!count(value.version) || value.version < 1)) {
    throw new Error('This GreenOps ledger has an invalid version.');
  }
  const entries = value.entries.map((entry: unknown, index): LedgerEntry => {
    if (
      !object(entry) ||
      !identifier(entry.runId) ||
      !identifier(entry.bugId) ||
      !STAGES.has(entry.stage as LedgerStage) ||
      (entry.seq !== undefined && !count(entry.seq)) ||
      !optionalText(entry.timestamp) ||
      !optionalText(entry.summary) ||
      (entry.data !== undefined && !object(entry.data))
    ) {
      throw new Error(`This GreenOps ledger has an invalid entry at position ${index + 1}.`);
    }
    // Missing presentation fields occur in older/minimal ledgers. Empty dates
    // remain unknown, rather than inventing when the activity happened.
    return {
      ...entry,
      seq: (entry.seq as number | undefined) ?? index,
      runId: entry.runId,
      bugId: entry.bugId,
      stage: entry.stage as LedgerStage,
      timestamp: (entry.timestamp as string | undefined) ?? '',
      summary: (entry.summary as string | undefined) ?? '',
      data: (entry.data as Record<string, unknown> | undefined) ?? {},
    };
  });
  const outcomes = value.outcomes.map((outcome: unknown, index): RunOutcome => {
    if (
      !object(outcome) ||
      !identifier(outcome.runId) ||
      !optionalText(outcome.startedAt) ||
      !optionalText(outcome.finishedAt) ||
      !count(outcome.bugsDetected) ||
      !count(outcome.bugsImproved) ||
      !impact(outcome.savings) ||
      !validSelfCostAndNet(outcome.selfCost, outcome.net)
    ) {
      throw new Error(`This GreenOps ledger has an invalid outcome at position ${index + 1}.`);
    }
    return {
      ...outcome,
      startedAt: outcome.startedAt ?? '',
      finishedAt: outcome.finishedAt ?? '',
    } as unknown as RunOutcome;
  });
  return { ...value, version: (value.version as number | undefined) ?? 1, entries, outcomes };
}

const time = (timestamp: string) => {
  const parsed = Date.parse(timestamp);
  return Number.isFinite(parsed) ? parsed : Number.NEGATIVE_INFINITY;
};

/** Select recorded activity, including reviews that do not have run outcomes. */
export function selectLatestRun(ledger: LedgerFile | null): SelectedRun | null {
  if (!ledger) return null;
  const runs = new Map<string, SelectedRun>();
  const getRun = (runId: string) => {
    let run = runs.get(runId);
    if (!run) {
      run = { runId, entries: [], timestamp: '', kind: 'in-progress' };
      runs.set(runId, run);
    }
    return run;
  };
  const updateTime = (run: SelectedRun, timestamp: string) => {
    if (time(timestamp) > time(run.timestamp)) run.timestamp = timestamp;
  };
  for (const entry of ledger.entries) {
    const run = getRun(entry.runId);
    run.entries.push(entry);
    updateTime(run, entry.timestamp);
  }
  for (const outcome of ledger.outcomes) {
    const run = getRun(outcome.runId);
    if (
      !run.outcome ||
      Math.max(time(outcome.finishedAt), time(outcome.startedAt)) >=
        Math.max(time(run.outcome.finishedAt), time(run.outcome.startedAt))
    ) {
      run.outcome = outcome;
    }
    updateTime(run, outcome.startedAt);
    updateTime(run, outcome.finishedAt);
  }
  let latest: SelectedRun | null = null;
  for (const run of runs.values()) {
    run.kind = run.outcome
      ? 'run'
      : run.entries.some(
            (entry) =>
              entry.stage === 'detect' &&
              (entry.data.source === 'local' || entry.data.source === 'github'),
          )
        ? 'review'
        : 'in-progress';
    if (!latest || time(run.timestamp) >= time(latest.timestamp)) latest = run;
  }
  if (latest) {
    // Copying above and sorting here never changes the uploaded ledger.
    latest.entries.sort((a, b) => {
      const aTime = time(a.timestamp);
      const bTime = time(b.timestamp);
      return aTime === bTime ? a.seq - b.seq : aTime < bTime ? -1 : 1;
    });
  }
  return latest;
}
