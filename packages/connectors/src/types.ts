import { PRReviewResult } from '@codevitals/review';
import type { SustainabilityReviewResult } from '@greenops/detect';

export interface PREvent {
  action: 'opened' | 'synchronize' | 'reopened' | 'comment';
  pullNumber: number;
  owner: string;
  repo: string;
  headSha: string;
  baseSha: string;
  title: string;
  sender: string;
  commentBody?: string;
  installationId?: number;
}

export interface InlineComment {
  path: string;
  line: number;
  body: string;
  side?: 'RIGHT' | 'LEFT';
}

export interface CheckRunAnnotation {
  path: string;
  start_line: number;
  end_line: number;
  annotation_level: 'notice' | 'warning' | 'failure';
  message: string;
  title?: string;
}

export interface CheckRunPayload {
  name: string;
  head_sha: string;
  status: 'queued' | 'in_progress' | 'completed';
  conclusion?: 'success' | 'failure' | 'neutral' | 'action_required';
  output: {
    title: string;
    summary: string;
    text?: string;
    annotations?: CheckRunAnnotation[];
  };
}

export interface ConnectorConfig {
  githubToken?: string;
  webhookSecret?: string;
  baseUrl?: string;
  appId?: string;
  appPrivateKey?: string;
  appPrivateKeyPath?: string;
}

export interface CodeVitalsConnector {
  verifySignature(rawBody: string, signatureHeader: string): boolean;
  parseWebhookEvent(headers: Record<string, string>, body: Record<string, unknown>): PREvent | null;
  postReviewSummary(pr: PREvent, reviewResult: PRReviewResult): Promise<{ commentId: number }>;
  postInlineComments(
    pr: PREvent,
    comments: InlineComment[],
    summaryBody?: string,
  ): Promise<void>;
  createCheckRun(pr: PREvent, reviewResult: PRReviewResult): Promise<{ checkRunId: number }>;
  postSustainabilitySummary(
    pr: PREvent,
    reviewResult: SustainabilityReviewResult,
  ): Promise<{ commentId: number }>;
  createSustainabilityCheckRun(
    pr: PREvent,
    reviewResult: SustainabilityReviewResult,
  ): Promise<{ checkRunId: number }>;
  fetchPRFiles(
    pr: PREvent,
  ): Promise<Array<{ filename: string; content?: string; patch?: string; status: string }>>;
  postComment(pr: PREvent, body: string): Promise<{ commentId: number }>;
}
