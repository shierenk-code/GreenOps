import type { DemoCarbonAssessment } from './demo-sci';

/** Public, secret-free contracts for the isolated synthetic AI efficiency demo. */
export type DemoMode = 'fixture' | 'gemini';
export type DemoStatus =
  | 'created'
  | 'awaiting-approval'
  | 'approved'
  | 'rejected'
  | 'applied'
  | 'verified'
  | 'verification-failed'
  | 'failed'
  | 'rolled-back';
export interface DemoRequest {
  id: string;
  prompt: string;
  expectedAnswer: string;
  cacheable: boolean;
  bypassReason?: string;
}
export interface DemoCompletion {
  answer: string;
  tokens: number | null;
}
export interface DemoRecommendation {
  strategy: 'exact-match-cache';
  title: string;
  explanation: string;
  source: 'fixture-rule' | 'model' | 'fallback';
  model: string;
  tokens: number | null;
  risk: string;
  confidence: string;
  fallbackReason?: string;
  digest: string;
}
export interface DemoReplay {
  requests: number;
  modelCalls: number;
  cacheHits: number;
  tokens: number | null;
  missingUsage: number;
  durationMs: number;
  qualityPassed: boolean;
  results: Array<{
    id: string;
    answer: string;
    correct: boolean;
    cached: boolean;
    tokens: number | null;
    bypassReason?: string;
  }>;
}
export interface DemoEvent {
  sequence: number;
  at: string;
  stage: string;
  actor: string;
  summary: string;
}
export interface DemoRun {
  schemaVersion: 1;
  id: string;
  version: number;
  mode: DemoMode;
  model: string;
  status: DemoStatus;
  createdAt: string;
  updatedAt: string;
  datasetHash: string;
  baseline?: DemoReplay;
  recommendation?: DemoRecommendation;
  decision?: {
    approved: boolean;
    actor: string;
    note: string;
    at: string;
    recommendationDigest: string;
    identity: 'self-declared-demo';
  };
  application?: {
    at: string;
    beforeHash: string;
    afterHash: string;
    cacheEnabled: boolean;
    scope: string;
  };
  verification?: {
    at: string;
    passed: boolean;
    after: DemoReplay;
    requestsSaved: number;
    tokensSaved: number | null;
    outputsEquivalent: boolean;
    checks: Array<{ label: string; passed: boolean }>;
    estimatedEnergyWh: number | null;
    estimatedCarbonGrams: number | null;
    assumptions: string[];
  };
  activity: DemoEvent[];
  /** SCI readiness and its exact input evidence; absent in older saved runs. */
  carbonAssessment?: DemoCarbonAssessment;
  failure?: string;
}
export interface DemoEvidence {
  requests: number;
  uniqueCacheablePrompts: number;
  duplicateRequests: number;
  excludedRequests: number;
}
export interface DemoProvider {
  mode: DemoMode;
  model: string;
  complete(request: DemoRequest): Promise<DemoCompletion>;
  recommend(evidence: DemoEvidence): Promise<Omit<DemoRecommendation, 'digest'>>;
}
export interface DemoConfig {
  geminiAvailable: boolean;
  model: string | null;
  liveRequestLimit: number;
}
export interface DemoResponse {
  run: DemoRun | null;
  config: DemoConfig;
  dataset?: Array<Pick<DemoRequest, 'id' | 'prompt' | 'cacheable' | 'bypassReason'>>;
  error?: string;
}
export type DemoAction =
  | { action: 'start'; mode: DemoMode; liveConsent?: boolean }
  | {
      action: 'decide';
      runId: string;
      version: number;
      approved: boolean;
      actor: string;
      note: string;
      acknowledged: boolean;
    }
  | { action: 'apply' | 'verify' | 'rollback'; runId: string; version: number };
