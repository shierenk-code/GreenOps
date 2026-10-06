/**
 * Executive rollup of an Azure subscription baseline run.
 *
 * Built by @greenops/agents from the baseline, the translation engine and the
 * findings of one fleet run, and stored on the ledger's run outcome. Every amount
 * is a modeled estimate for the baseline period, never a measured or verified saving.
 */

import type { EvidenceKind } from './baseline.js';

export interface RollupAmount {
  energyKwh: number | null;
  /** Operational + embodied where modeled (see `gaps`). */
  kgCo2e: number | null;
  /** Operational (grid) carbon only. */
  operationalKgCo2e: number | null;
}

export type MaturityGrade = 'A' | 'B' | 'C' | 'D' | 'E' | 'F';

export interface MaturityCriterion {
  id: 'remediation' | 'placement' | 'pipelines' | 'ai' | 'evidence' | 'accountability';
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
  schemaVersion: 1;
  subscriptionId: string;
  organization: string;
  provenance: 'measured' | 'synthetic' | 'mixed';
  period: { start: string; end: string; hours: number };
  /** Weakest evidence kind behind any amount in this rollup. */
  evidenceKind: EvidenceKind;
  /** Modeled burn of the whole subscription over the period. */
  current: RollupAmount;
  /** Sum of modeled savings if every finding were remediated. */
  identifiedSaving: RollupAmount;
  /** current − identifiedSaving. */
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
  /** GreenOps' own estimated footprint for this run. */
  agentFootprint: { energyKwh: number | null; kgCo2e: number | null; usageComplete: boolean };
  /** How much of the optimized period it takes to repay GreenOps' own energy. */
  breakEven: { minutes: number | null; note: string };
  maturity: { current: MaturityScore; projected: MaturityScore };
  method: string;
  gaps: string[];
}

/** A ≥ 85, B ≥ 70, C ≥ 55, D ≥ 40, E ≥ 25, F below. */
export function maturityGrade(score: number): MaturityGrade {
  if (score >= 85) return 'A';
  if (score >= 70) return 'B';
  if (score >= 55) return 'C';
  if (score >= 40) return 'D';
  if (score >= 25) return 'E';
  return 'F';
}
