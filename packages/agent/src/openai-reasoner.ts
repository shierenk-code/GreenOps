import OpenAI from 'openai';
import type { SustainabilityBug } from '@greenops/detect';
import type { Investigation, Reasoner } from './contracts.js';
import { OfflineReasoner } from './offline-reasoner.js';
import { OllamaReasoner } from './ollama-reasoner.js';
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

export interface OpenAIReasonerOptions {
  apiKey: string;
  model?: string;
  client?: OpenAI;
  fallback?: Reasoner;
}

/** Cloud reasoning uses the same minimized evidence and validation as local reasoning. */
export class OpenAIReasoner implements Reasoner {
  public readonly usesModel = true;
  private readonly client: OpenAI;
  private readonly model: string;
  private readonly fallback: Reasoner;
  private lastMode: 'configured' | 'openai' | 'offline' | 'fallback' = 'configured';
  private stoppedReason?: string;

  public get name(): string {
    if (this.lastMode === 'offline') return this.fallback.name;
    if (this.lastMode === 'fallback') return `offline-fallback:${this.model}`;
    return `openai-responses:${this.model}`;
  }

  constructor(options: OpenAIReasonerOptions) {
    this.model = options.model ?? 'gpt-5';
    this.client =
      options.client ?? new OpenAI({ apiKey: options.apiKey, maxRetries: 0, timeout: 120000 });
    this.fallback = options.fallback ?? new OfflineReasoner();
  }

  public async investigate(bug: SustainabilityBug): Promise<Investigation> {
    const fallback = await this.fallback.investigate(bug);
    if (!AI_CATEGORIES.has(bug.category)) {
      this.lastMode = 'offline';
      return fallback;
    }
    if (this.stoppedReason) {
      this.lastMode = 'fallback';
      return fallbackInvestigation(fallback, 'openai', this.model, 0, this.stoppedReason, false);
    }
    let tokensUsed: number | null = null;
    let receivedResponse = false;
    try {
      const response = await this.client.responses.create({
        model: this.model,
        instructions: INVESTIGATION_INSTRUCTIONS,
        input: investigationInput(bug, fallback),
        text: {
          verbosity: 'medium',
          format: {
            type: 'json_schema',
            name: 'greenops_ai_investigation',
            strict: true,
            schema: investigationSchema(fallback),
          },
        },
      });
      receivedResponse = true;
      tokensUsed = recordedTokens(response.usage?.total_tokens);
      if (response.status && response.status !== 'completed')
        throw new Error('Incomplete response.');
      const parsed = parseInvestigation(response.output_text, fallback);
      this.lastMode = 'openai';
      return {
        ...parsed,
        tokensUsed,
        analysis: {
          provider: 'openai',
          model: this.model,
          status: 'generated',
          tokensUsed,
          requestAttempted: true,
        },
      };
    } catch (error) {
      const failure = receivedResponse
        ? { reason: 'Model output was incomplete or failed structured validation.', stop: false }
        : failureReason(error);
      if (failure.stop) this.stoppedReason = failure.reason;
      this.lastMode = 'fallback';
      return fallbackInvestigation(fallback, 'openai', this.model, tokensUsed, failure.reason);
    }
  }
}

import { GeminiReasoner } from './gemini-reasoner.js';

function isPlaceholderKey(key?: string): boolean {
  if (!key) return true;
  return /your[-_].*key|your[-_]key|placeholder|dummy|example/i.test(key);
}

export function createDefaultReasoner(env: NodeJS.ProcessEnv = process.env): Reasoner {
  return createReasonerFromEnv(env);
}

export function createReasonerFromEnv(env: NodeJS.ProcessEnv = process.env): Reasoner {
  const provider = env.GREENOPS_LLM_PROVIDER?.trim().toLowerCase();
  if (provider === 'offline') return new OfflineReasoner();
  if (provider === 'ollama') {
    return new OllamaReasoner({
      model: env.OLLAMA_MODEL?.trim() || 'gpt-oss:20b',
      baseURL: env.OLLAMA_BASE_URL?.trim() || undefined,
      timeoutMs: env.OLLAMA_TIMEOUT_MS?.trim() ? Number(env.OLLAMA_TIMEOUT_MS) : undefined,
    });
  }
  if (provider === 'gemini') {
    const geminiKey = env.GEMINI_API_KEY?.trim() || env.GOOGLE_API_KEY?.trim();
    if (!geminiKey || isPlaceholderKey(geminiKey)) {
      throw new Error('GEMINI_API_KEY is required when GREENOPS_LLM_PROVIDER=gemini.');
    }
    return new GeminiReasoner({
      apiKey: geminiKey,
      model: env.GEMINI_MODEL?.trim(),
      endpoint: env.GEMINI_ENDPOINT?.trim(),
    });
  }
  if (provider && provider !== 'openai') {
    throw new Error('GREENOPS_LLM_PROVIDER must be gemini, ollama, openai, or offline.');
  }

  const geminiKey = env.GEMINI_API_KEY?.trim() || env.GOOGLE_API_KEY?.trim();
  if (geminiKey && !isPlaceholderKey(geminiKey) && !provider) {
    return new GeminiReasoner({
      apiKey: geminiKey,
      model: env.GEMINI_MODEL?.trim(),
      endpoint: env.GEMINI_ENDPOINT?.trim(),
    });
  }

  const apiKey = env.OPENAI_API_KEY?.trim();
  if (!apiKey || isPlaceholderKey(apiKey)) {
    if (provider === 'openai')
      throw new Error('OPENAI_API_KEY is required when GREENOPS_LLM_PROVIDER=openai.');
    return new OfflineReasoner();
  }
  return new OpenAIReasoner({ apiKey, model: env.OPENAI_MODEL?.trim() || 'gpt-5' });
}
