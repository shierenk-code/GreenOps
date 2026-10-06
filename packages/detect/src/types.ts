import { Assumption } from '@greenops/measure';

export type BugCategory =
  | 'dead-code'
  | 'duplicate-import'
  | 'redundant-call'
  | 'oversized-dependency'
  | 'retry-storm'
  // AI Efficiency agent
  | 'uncached-completion'
  | 'oversized-token-request'
  | 'ai-retry-storm'
  | 'prompt-overhead'
  | 'model-tier-mismatch'
  // Digital Waste agent (cloud/AKS)
  | 'overprovisioned-compute'
  | 'unattached-storage'
  | 'oversized-image'
  | 'verbose-logging'
  | 'idle-compute'
  | 'off-hours-runtime'
  // Pipeline Efficiency agent (CI/CD)
  | 'pipeline-cache-miss'
  | 'redundant-pipeline-run'
  | 'artifact-bloat'
  // Carbon Incident agent
  | 'carbon-anomaly'
  // Architecture agent (IaC)
  | 'no-autoscale'
  | 'high-carbon-region'
  | 'inefficient-sizing'
  // DR agent
  | 'over-replication'
  | 'idle-standby'
  | 'rto-rpo-mismatch'
  // Collaboration agent
  | 'redundant-recording'
  | 'excessive-retention';

export type Severity = 'low' | 'medium' | 'high';
export type FindingConfidence = 'high' | 'medium' | 'low';
export type FindingBlastRadius = 'low' | 'medium' | 'high';
export type FindingStatus =
  | 'detected'
  | 'investigating'
  | 'fix_proposed'
  | 'awaiting_approval'
  | 'fix_applied'
  | 'verified'
  | 'failed'
  | 'dismissed';

/** Provenance of the explanation, including usage from rejected model output. */
export interface FindingAnalysis {
  provider: 'gemini' | 'ollama' | 'openai' | 'offline';
  model?: string;
  status: 'generated' | 'fallback' | 'offline';
  /** null means the attempted provider request did not report valid usage. */
  tokensUsed: number | null;
  /** false identifies offline work or a circuit-breaker skip, not a model request. */
  requestAttempted?: boolean;
  reason?: string;
}

/**
 * A "Sustainability Bug": a concrete, evidenced source of technology waste found
 * statically in the codebase. Each bug carries the raw evidence that proves it,
 * plus a first-pass estimate of the recurring waste it causes.
 */
export interface SustainabilityBug {
  id: string;
  /** Specialist agent that produced the finding. Omitted for legacy/static detectors. */
  agentId?: string;
  /** Human-readable specialist name for reports and dashboards. */
  agentName?: string;
  category: BugCategory;
  severity: Severity;
  /** One-line title. */
  title: string;
  /** Where it is. */
  location: { filePath: string; startLine: number; endLine: number; symbol?: string };
  /** WHY it is waste, in plain language (feeds the ledger's "why" field). */
  rationale: string;
  /** Raw counts/facts that prove the bug exists (feeds "evidence"). */
  evidence: Record<string, number | string>;
  /** First-pass recurring-waste estimate, refined later in Simulate. */
  estimatedWaste: {
    metric: string;
    perRun: number;
    unit: string;
    assumptions: Assumption[];
    /**
     * Baseline findings only (metric `baseline.period_kwh`): modeled carbon saved over
     * the baseline period by the translation engine, using the resource's region.
     * null means unknown, never zero.
     */
    periodKgCo2e?: number | null;
    /** Weakest evidence kind behind the estimate. */
    evidenceKind?: 'measured' | 'modeled' | 'synthetic';
    /** Known limits of the estimate. */
    gaps?: string[];
  };
}

export interface DetectionResult {
  repositoryPath: string;
  bugs: SustainabilityBug[];
  scanned: { files: number; symbols: number; references: number; imports: number };
}

/**
 * The integration-neutral GreenOps review contract. Local CLI, CI, GitHub, and
 * future dashboard adapters must present this model instead of inventing their
 * own sustainability finding shapes.
 */
export interface SustainabilityFinding {
  id: string;
  agentId?: string;
  agentName?: string;
  category: BugCategory;
  severity: Severity;
  confidence: FindingConfidence;
  file: string;
  line?: number;
  endLine?: number;
  title: string;
  description: string;
  evidence: Record<string, number | string>;
  rootCause: string;
  reasoning?: string;
  tokensUsed?: number | null;
  analysis?: FindingAnalysis;
  impact?: { energyKwh: number; carbonKgCo2e: number };
  recommendation?: string;
  codeSnippet?: string;
  suggestedCode?: string;
  blastRadius: FindingBlastRadius;
  fix: {
    available: boolean;
    strategyId?: string;
    requiresApproval: boolean;
    trivial: boolean;
    reversible: boolean;
  };
  status: FindingStatus;
  verification: 'not_run' | 'verified' | 'failed';
}

export interface SustainabilityReviewSummary {
  filesAnalyzed: number;
  findings: number;
  severity: Record<Severity, number>;
  fixesAvailable: number;
  approvalRequired: number;
  estimatedEnergyKwh: number;
  estimatedCarbonKgCo2e: number;
  verified: number;
}

export interface SustainabilityReviewResult {
  analysisId: string;
  repositoryPath: string;
  mode: 'repository' | 'diff';
  commitSha?: string;
  generatedAt: string;
  findings: SustainabilityFinding[];
  summary: SustainabilityReviewSummary;
}
