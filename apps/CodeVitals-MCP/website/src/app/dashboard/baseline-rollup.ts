import type { RunOutcome } from './ledger-data';

/**
 * Website-side view of the subscription rollup that the fleet writes on a run
 * outcome (`outcome.baselineRollup`, see packages/measure/src/rollup.ts).
 *
 * The ledger is untrusted input, so the rollup is parsed field by field. A
 * malformed rollup is dropped (null) rather than failing the whole ledger, and
 * unknown amounts stay null; they are never coerced to zero.
 */

export type EvidenceKind = 'measured' | 'modeled' | 'synthetic';
export type MaturityGrade = 'A' | 'B' | 'C' | 'D' | 'E' | 'F';

export interface RollupAmount {
  energyKwh: number | null;
  kgCo2e: number | null;
  operationalKgCo2e: number | null;
}

export interface MaturityCriterion {
  id: string;
  label: string;
  points: number;
  max: number;
  detail: string;
}

export interface MaturityScore {
  score: number;
  grade: MaturityGrade;
  criteria: MaturityCriterion[];
}

export interface BaselineRollup {
  subscriptionId: string;
  organization: string;
  provenance: 'measured' | 'synthetic' | 'mixed';
  period: { start: string; end: string; hours: number };
  evidenceKind: EvidenceKind;
  current: RollupAmount;
  identifiedSaving: RollupAmount;
  optimized: RollupAmount;
  savingSharePct: number | null;
  byAgent: Array<{ agentId: string; findings: number; saving: RollupAmount }>;
  byTeam: Array<{ team: string; findings: number; current: RollupAmount; saving: RollupAmount }>;
  byRegion: Array<{
    region: string;
    gCo2PerKwh: number | null;
    current: RollupAmount;
    saving: RollupAmount;
  }>;
  agentFootprint: { energyKwh: number | null; kgCo2e: number | null; usageComplete: boolean };
  breakEven: { minutes: number | null; note: string };
  maturity: { current: MaturityScore; projected: MaturityScore };
  method: string;
  gaps: string[];
}

const GRADES: MaturityGrade[] = ['A', 'B', 'C', 'D', 'E', 'F'];
const KINDS: EvidenceKind[] = ['measured', 'modeled', 'synthetic'];
const PROVENANCE = ['measured', 'synthetic', 'mixed'] as const;
const MAX_TEXT = 600;
const MAX_ROWS = 200;

class Invalid extends Error {}

const object = (value: unknown): Record<string, unknown> => {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new Invalid();
  return value as Record<string, unknown>;
};
const text = (value: unknown, max = MAX_TEXT): string => {
  if (typeof value !== 'string' || value.length > max) throw new Invalid();
  return value;
};
const finite = (value: unknown): number => {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Invalid();
  return value;
};
const nullableFinite = (value: unknown): number | null =>
  value === null || value === undefined ? null : finite(value);
const nonNegativeCount = (value: unknown): number => {
  const n = finite(value);
  if (!Number.isSafeInteger(n) || n < 0) throw new Invalid();
  return n;
};
const oneOf = <T extends string>(value: unknown, values: readonly T[]): T => {
  if (typeof value !== 'string' || !values.includes(value as T)) throw new Invalid();
  return value as T;
};
const list = <T>(value: unknown, read: (item: unknown) => T): T[] => {
  if (!Array.isArray(value) || value.length > MAX_ROWS) throw new Invalid();
  return value.map(read);
};

function amount(value: unknown): RollupAmount {
  const a = object(value);
  return {
    energyKwh: nullableFinite(a.energyKwh),
    kgCo2e: nullableFinite(a.kgCo2e),
    operationalKgCo2e: nullableFinite(a.operationalKgCo2e),
  };
}

function maturity(value: unknown): MaturityScore {
  const m = object(value);
  const criteria = list(m.criteria, (item) => {
    const c = object(item);
    const points = finite(c.points);
    const max = finite(c.max);
    if (max <= 0 || points < 0 || points > max) throw new Invalid();
    return { id: text(c.id, 40), label: text(c.label, 120), points, max, detail: text(c.detail) };
  });
  const score = finite(m.score);
  if (score < 0 || score > 100) throw new Invalid();
  return { score, grade: oneOf(m.grade, GRADES), criteria };
}

/** Parse an untrusted rollup value. Returns null when absent or malformed. */
export function parseBaselineRollup(value: unknown): BaselineRollup | null {
  if (value === undefined || value === null) return null;
  try {
    const r = object(value);
    if (r.schemaVersion !== 1) return null;
    const period = object(r.period);
    const footprint = object(r.agentFootprint);
    const breakEven = object(r.breakEven);
    const maturityPair = object(r.maturity);
    return {
      subscriptionId: text(r.subscriptionId, 120),
      organization: text(r.organization, 120),
      provenance: oneOf(r.provenance, PROVENANCE),
      period: {
        start: text(period.start, 40),
        end: text(period.end, 40),
        hours: finite(period.hours),
      },
      evidenceKind: oneOf(r.evidenceKind, KINDS),
      current: amount(r.current),
      identifiedSaving: amount(r.identifiedSaving),
      optimized: amount(r.optimized),
      savingSharePct: nullableFinite(r.savingSharePct),
      byAgent: list(r.byAgent, (item) => {
        const a = object(item);
        return {
          agentId: text(a.agentId, 80),
          findings: nonNegativeCount(a.findings),
          saving: amount(a.saving),
        };
      }),
      byTeam: list(r.byTeam, (item) => {
        const t = object(item);
        return {
          team: text(t.team, 80),
          findings: nonNegativeCount(t.findings),
          current: amount(t.current),
          saving: amount(t.saving),
        };
      }),
      byRegion: list(r.byRegion, (item) => {
        const g = object(item);
        return {
          region: text(g.region, 80),
          gCo2PerKwh: nullableFinite(g.gCo2PerKwh),
          current: amount(g.current),
          saving: amount(g.saving),
        };
      }),
      agentFootprint: {
        energyKwh: nullableFinite(footprint.energyKwh),
        kgCo2e: nullableFinite(footprint.kgCo2e),
        usageComplete: footprint.usageComplete === true,
      },
      breakEven: { minutes: nullableFinite(breakEven.minutes), note: text(breakEven.note) },
      maturity: {
        current: maturity(maturityPair.current),
        projected: maturity(maturityPair.projected),
      },
      method: text(r.method),
      gaps: list(r.gaps, (gap) => text(gap)),
    };
  } catch (error) {
    if (error instanceof Invalid) return null;
    throw error;
  }
}

/** The rollup recorded on a run outcome, if the run came from an Azure baseline. */
export function rollupForOutcome(outcome: RunOutcome | undefined): BaselineRollup | null {
  if (!outcome) return null;
  return parseBaselineRollup((outcome as unknown as Record<string, unknown>).baselineRollup);
}
