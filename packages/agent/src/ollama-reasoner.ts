import OpenAI from 'openai';
import type { SustainabilityBug } from '@greenops/detect';
import type { Investigation, Reasoner } from './contracts.js';
import { OfflineReasoner } from './offline-reasoner.js';
import {
  AI_CATEGORIES,
  INVESTIGATION_INSTRUCTIONS,
  failureReason,
  fallbackInvestigation,
  investigationInput,
  investigationSchema,
  parseInvestigation,
  recordedTokens,
} from './llm-investigation.js';

export interface OllamaReasonerOptions {
  model?: string;
  baseURL?: string;
  timeoutMs?: number;
  client?: OpenAI;
  fallback?: Reasoner;
}

export function localOllamaURL(value = 'http://127.0.0.1:11434/v1'): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error('OLLAMA_BASE_URL must be a valid loopback HTTP(S) URL ending in /v1.');
  }
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    !['/v1', '/v1/'].includes(url.pathname)
  ) {
    throw new Error(
      'OLLAMA_BASE_URL must be a loopback HTTP(S) URL ending in /v1, without credentials or query parameters.',
    );
  }
  return url.toString().replace(/\/$/, '');
}

export function ollamaTimeout(value: number): number {
  if (!Number.isInteger(value) || value < 1000 || value > 300000) {
    throw new Error('OLLAMA_TIMEOUT_MS must be an integer from 1000 to 300000 milliseconds.');
  }
  return value;
}

/** Local-only model reasoning; OpenAI account credentials are never used for this provider. */
export class OllamaReasoner implements Reasoner {
  public readonly usesModel = true;
  private readonly client: OpenAI;
  private readonly model: string;
  private readonly fallback: Reasoner;
  private lastMode: 'configured' | 'generated' | 'offline' | 'fallback' = 'configured';
  private stoppedReason?: string;

  get name(): string {
    if (this.lastMode === 'offline') return this.fallback.name;
    return `${this.lastMode === 'fallback' ? 'offline-fallback' : 'ollama-chat'}:${this.model}`;
  }

  constructor(options: OllamaReasonerOptions = {}) {
    this.model = options.model?.trim() || 'gpt-oss:20b';
    if (/(?:[:-]cloud)(?::[^:]*)?$/i.test(this.model)) {
      throw new Error(
        'OLLAMA_MODEL must select a local model; cloud model tags are not supported.',
      );
    }
    const baseURL = localOllamaURL(options.baseURL);
    const timeout = ollamaTimeout(options.timeoutMs ?? 120000);
    this.client =
      options.client ??
      new OpenAI({
        apiKey: 'ollama',
        baseURL,
        timeout,
        maxRetries: 0,
        // Prevent OPENAI_ORG_ID / OPENAI_PROJECT_ID from leaking into local requests.
        organization: null,
        project: null,
        // Do not follow a local endpoint's redirect to another service.
        fetchOptions: { redirect: 'error' },
      });
    this.fallback = options.fallback ?? new OfflineReasoner();
  }

  async investigate(bug: SustainabilityBug): Promise<Investigation> {
    const fallback = await this.fallback.investigate(bug);
    if (!AI_CATEGORIES.has(bug.category)) {
      this.lastMode = 'offline';
      return fallback;
    }
    if (this.stoppedReason) {
      this.lastMode = 'fallback';
      return fallbackInvestigation(fallback, 'ollama', this.model, 0, this.stoppedReason, false);
    }
    let tokensUsed: number | null = null;
    let receivedResponse = false;
    try {
      const response = await this.client.chat.completions.create({
        model: this.model,
        messages: [
          { role: 'system', content: INVESTIGATION_INSTRUCTIONS },
          { role: 'user', content: investigationInput(bug, fallback) },
        ],
        reasoning_effort: 'low',
        max_tokens: 2048,
        response_format: {
          type: 'json_schema',
          json_schema: {
            name: 'greenops_ai_investigation',
            strict: true,
            schema: investigationSchema(fallback),
          },
        },
      });
      receivedResponse = true;
      tokensUsed = recordedTokens(response.usage?.total_tokens);
      const choice = response.choices[0];
      if (
        !choice ||
        choice.finish_reason !== 'stop' ||
        choice.message.refusal ||
        !choice.message.content
      ) {
        throw new Error('Incomplete structured response.');
      }
      const parsed = parseInvestigation(choice.message.content, fallback);
      this.lastMode = 'generated';
      return {
        ...parsed,
        tokensUsed,
        analysis: {
          provider: 'ollama',
          model: this.model,
          status: 'generated',
          tokensUsed,
          requestAttempted: true,
        },
      };
    } catch (error) {
      const lacksMemory =
        error instanceof Error &&
        /requires more system memory|out of memory|unable to allocate|not enough memory/i.test(
          error.message,
        );
      const failure = receivedResponse
        ? { reason: 'Model output was incomplete or failed structured validation.', stop: false }
        : lacksMemory
          ? {
              reason:
                'Local model could not load because there is not enough memory; free memory or use a larger machine.',
              stop: true,
            }
          : failureReason(error);
      if (failure.stop) this.stoppedReason = failure.reason;
      this.lastMode = 'fallback';
      return fallbackInvestigation(fallback, 'ollama', this.model, tokensUsed, failure.reason);
    }
  }
}
