/**
 * The Sustainability Ledger: an append-only, fully-traceable record of the entire
 * GreenOps journey for each detected Sustainability Bug.
 *
 * Every entry answers, in order: what was detected, why it happened, what
 * solutions were considered, what the AI recommended, what the human approved,
 * what changed, what was saved, and what did not work and why.
 *
 * The ledger is append-only (entries are never mutated in place) and every entry
 * carries the baseline, assumptions and evidence behind its numbers, so a judge
 * can audit any single claim end-to-end.
 */

import {
  readFileSync,
  existsSync,
  mkdirSync,
  openSync,
  writeSync,
  fsyncSync,
  closeSync,
  renameSync,
  rmSync,
} from 'node:fs';
import { randomBytes } from 'node:crypto';
import { basename, dirname, join } from 'node:path';
import { Assumption, type BaselineRollup } from '@greenops/measure';
import { SelfCostEvent, SelfCostSummary } from './self-accountant.js';
import type { OperationalOutcome } from './operational-run.js';

export type LedgerStage =
  'detect' | 'investigate' | 'compare' | 'simulate' | 'approve' | 'improve' | 'verify';

export interface SavingsEstimate {
  energyKwh: number;
  carbonKgCo2e: number;
  /** Resource-level detail, e.g. { "tokens.avoided": 12000 }. */
  resources: Record<string, number>;
  baseline: number;
  assumptions: Assumption[];
  evidence: Record<string, number | string>;
}

export interface LedgerEntry {
  /** Monotonic sequence number within a run. */
  seq: number;
  runId: string;
  bugId: string;
  stage: LedgerStage;
  timestamp: string;
  /** Human-readable summary of what happened at this stage. */
  summary: string;
  /** Structured payload specific to the stage. */
  data: Record<string, unknown>;
}

export interface RunTraceEvent {
  kind: 'plan' | 'agent';
  actor: string;
  status: 'planned' | 'started' | 'completed' | 'failed';
  detail: string;
  at: string;
}

export interface RunOutcome {
  runId: string;
  startedAt: string;
  finishedAt: string;
  bugsDetected: number;
  bugsImproved: number;
  /** Total estimated savings from all applied improvements. */
  savings: { energyKwh: number; carbonKgCo2e: number };
  /** Reported usage and estimated footprint; null footprint when usage is incomplete. */
  selfCost: {
    energyKwh: number | null;
    carbonKgCo2e: number | null;
    tokens: number | null;
    knownTokens: number;
    usageComplete: boolean;
    llmCalls: number;
    unknownLlmCalls: number;
    toolCalls: number;
    retries: number;
    events: SelfCostEvent[];
  };
  trace?: RunTraceEvent[];
  /** Azure subscription baseline rollup (modeled), when the run used a baseline. */
  baselineRollup?: BaselineRollup;
  /** Estimated net = savings - selfCost; unknown if model usage is incomplete. */
  net: { energyKwh: number | null; carbonKgCo2e: number | null; netPositive: boolean | null };
}

interface LedgerFile {
  version: 1;
  entries: LedgerEntry[];
  outcomes: RunOutcome[];
  operationalOutcomes?: OperationalOutcome[];
}

export class SustainabilityLedger {
  private readonly path: string;
  private file: LedgerFile;
  private seq = 0;

  constructor(path: string) {
    this.path = path;
    if (existsSync(path)) {
      this.file = JSON.parse(readFileSync(path, 'utf8')) as LedgerFile;
      this.seq = this.file.entries.length;
    } else {
      this.file = { version: 1, entries: [], outcomes: [] };
    }
  }

  /** Append one stage entry. Never mutates existing entries. */
  public append(entry: Omit<LedgerEntry, 'seq' | 'timestamp'>): LedgerEntry {
    const full: LedgerEntry = {
      ...entry,
      seq: this.seq++,
      timestamp: new Date().toISOString(),
    };
    this.file.entries.push(full);
    this.persist();
    return full;
  }

  /** Record the final outcome of a run, computing the net-savings headline. */
  public recordOutcome(params: {
    runId: string;
    startedAt: string;
    bugsDetected: number;
    bugsImproved: number;
    savings: { energyKwh: number; carbonKgCo2e: number };
    selfCost: SelfCostSummary;
    trace?: RunTraceEvent[];
    baselineRollup?: BaselineRollup;
  }): RunOutcome {
    const netEnergy =
      params.selfCost.energyKwh === null
        ? null
        : params.savings.energyKwh - params.selfCost.energyKwh;
    const netCarbon =
      params.selfCost.carbonKgCo2e === null
        ? null
        : params.savings.carbonKgCo2e - params.selfCost.carbonKgCo2e;
    const outcome: RunOutcome = {
      runId: params.runId,
      startedAt: params.startedAt,
      finishedAt: new Date().toISOString(),
      bugsDetected: params.bugsDetected,
      bugsImproved: params.bugsImproved,
      savings: params.savings,
      selfCost: {
        energyKwh: params.selfCost.energyKwh,
        carbonKgCo2e: params.selfCost.carbonKgCo2e,
        tokens: params.selfCost.totalTokens,
        knownTokens: params.selfCost.knownTokens,
        usageComplete: params.selfCost.usageComplete,
        llmCalls: params.selfCost.llmCalls,
        unknownLlmCalls: params.selfCost.unknownLlmCalls,
        toolCalls: params.selfCost.totalToolCalls,
        retries: params.selfCost.totalRetries,
        events: params.selfCost.events,
      },
      trace: params.trace,
      ...(params.baselineRollup ? { baselineRollup: params.baselineRollup } : {}),
      net: {
        energyKwh: netEnergy,
        carbonKgCo2e: netCarbon,
        netPositive: netEnergy === null ? null : netEnergy > 0,
      },
    };
    this.file.outcomes.push(outcome);
    this.persist();
    return outcome;
  }

  public entriesForBug(bugId: string): LedgerEntry[] {
    return this.file.entries.filter((e) => e.bugId === bugId);
  }

  public allEntries(): LedgerEntry[] {
    return [...this.file.entries];
  }

  public allOutcomes(): RunOutcome[] {
    return [...this.file.outcomes];
  }

  /** Operational planning/discovery is not an applied-savings RunOutcome. Keep the distinction explicit. */
  public recordOperationalOutcome(outcome: OperationalOutcome): void {
    const records = (this.file.operationalOutcomes ??= []);
    if (records.some((r) => r.runId === outcome.runId))
      throw new Error('Operational outcome already recorded.');
    records.push(structuredClone(outcome));
    this.persist();
  }

  public allOperationalOutcomes(): OperationalOutcome[] {
    return structuredClone(this.file.operationalOutcomes ?? []);
  }

  /**
   * Crash-safe replace: write the full document to a sibling temp file, fsync it,
   * then rename it over the ledger. Readers (e.g. the dashboard) and a crash
   * mid-write see either the previous complete ledger or the new one, never a
   * truncated file. The JSON document format is unchanged for existing readers.
   */
  private persist(): void {
    const dir = dirname(this.path);
    mkdirSync(dir, { recursive: true });
    const tempPath = join(dir, `.${basename(this.path)}.${randomBytes(6).toString('hex')}.tmp`);
    try {
      const fd = openSync(tempPath, 'wx');
      try {
        writeSync(fd, JSON.stringify(this.file, null, 2), null, 'utf8');
        fsyncSync(fd);
      } finally {
        closeSync(fd);
      }
      renameWithRetry(tempPath, this.path);
    } catch (error) {
      rmSync(tempPath, { force: true });
      throw error;
    }
  }
}

/** Windows can briefly refuse to replace a file another process has open (e.g. a dashboard read). */
const TRANSIENT_RENAME_CODES = new Set(['EPERM', 'EACCES', 'EBUSY']);

function renameWithRetry(from: string, to: string, attempts = 5): void {
  for (let attempt = 1; ; attempt++) {
    try {
      renameSync(from, to);
      return;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (attempt >= attempts || !code || !TRANSIENT_RENAME_CODES.has(code)) throw error;
      // Short synchronous back-off; persist() is synchronous by contract.
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 20 * attempt);
    }
  }
}
