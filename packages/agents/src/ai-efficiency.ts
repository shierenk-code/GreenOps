/**
 * AI Efficiency Agent.
 *
 * Analyses a mock AI-application usage trace (LLM SDK calls) and flags:
 *   - uncached completions: identical prompts requested repeatedly (wasted tokens),
 *   - oversized token requests: max_tokens far above what the response needs,
 *   - ai retry storms: repeated failed calls retried without backoff.
 *
 * Mock fixture shape (JSON): see fixtures/greenops-mock/ai-usage.json.
 */

import type { SustainabilityBug } from '@greenops/detect';
import { createHash } from 'node:crypto';
import type { SpecializedAgent, SpecializedFinding } from './contract.js';
import { bugId, readJsonFixture } from './util.js';
import { isBaselineFile, loadBaselineBundle, scanAiEfficiencyBaseline } from './baseline-scan.js';

interface AiCall {
  id: string;
  prompt: string;
  maxTokens: number;
  completionTokens: number;
  promptTokens?: number;
  status: 'ok' | 'error';
  retries?: number;
  retryBackoffMs?: number;
  cacheable?: boolean;
}
interface AiUsageFixture {
  service: string;
  calls: AiCall[];
}

export class AiEfficiencyAgent implements SpecializedAgent {
  readonly id = 'ai-efficiency';
  readonly name = 'AI Efficiency Agent';
  readonly description =
    'Finds wasted LLM tokens: uncached completions, oversized requests, retry storms.';

  constructor(
    private readonly thresholds = { duplicateCalls: 2, tokenHeadroomRatio: 4, retryStorm: 3 },
  ) {}

  scan(sourcePath: string): SpecializedFinding {
    if (isBaselineFile(sourcePath)) {
      const result = scanAiEfficiencyBaseline(loadBaselineBundle(sourcePath));
      return { agentId: this.id, agentName: this.name, ...result };
    }
    const fx = readJsonFixture<AiUsageFixture>(sourcePath);
    const bugs: SustainabilityBug[] = [];

    // 1) Uncached completions: same prompt requested more than once.
    const byPrompt = new Map<string, AiCall[]>();
    for (const c of fx.calls) {
      const arr = byPrompt.get(c.prompt) ?? [];
      arr.push(c);
      byPrompt.set(c.prompt, arr);
    }
    for (const [prompt, group] of byPrompt) {
      if (
        group.length < this.thresholds.duplicateCalls ||
        group.some((call) => call.cacheable === false)
      )
        continue;
      const redundant = group.length - 1;
      const tokensPerCall = (group[0]?.promptTokens ?? 0) + (group[0]?.completionTokens ?? 0);
      const wastedTokens = redundant * tokensPerCall;
      const promptFingerprint = createHash('sha256').update(prompt).digest('hex').slice(0, 12);
      bugs.push({
        id: bugId('uncached-completion', `${fx.service}:${prompt}`),
        category: 'uncached-completion',
        severity: redundant >= 5 ? 'high' : 'medium',
        title: `Identical prompt requested ${group.length}x with no cache`,
        location: { filePath: sourcePath, startLine: 1, endLine: 1, symbol: fx.service },
        rationale:
          `A cacheable prompt (fingerprint ${promptFingerprint}) was sent ${group.length} times. Every repeat after ` +
          `the first consumed an estimated ${tokensPerCall} input/output tokens.`,
        evidence: {
          requests: group.length,
          redundant,
          tokensPerCall,
          wastedTokens,
          promptFingerprint,
        },
        estimatedWaste: {
          metric: 'tokens.avoided',
          perRun: wastedTokens,
          unit: 'tokens',
          assumptions: [],
        },
      });
    }

    // 2) Oversized token requests: max_tokens >> actual completion.
    for (const c of fx.calls) {
      if (
        c.maxTokens > 0 &&
        c.completionTokens > 0 &&
        c.maxTokens >= c.completionTokens * this.thresholds.tokenHeadroomRatio
      ) {
        const wasted = c.maxTokens - c.completionTokens;
        bugs.push({
          id: bugId('oversized-token-request', `${fx.service}:${c.id}`),
          category: 'oversized-token-request',
          severity: c.maxTokens >= c.completionTokens * 8 ? 'medium' : 'low',
          title: `Call '${c.id}' requests ${c.maxTokens} tokens but uses ${c.completionTokens}`,
          location: { filePath: sourcePath, startLine: 1, endLine: 1, symbol: c.id },
          rationale:
            `max_tokens (${c.maxTokens}) is ${(c.maxTokens / c.completionTokens).toFixed(1)}x the actual ` +
            `completion (${c.completionTokens}). Over-allocation reserves compute/KV-cache that is never used.`,
          evidence: {
            maxTokens: c.maxTokens,
            completionTokens: c.completionTokens,
            wastedHeadroom: wasted,
          },
          estimatedWaste: {
            // Headroom is a right-sizing opportunity, not consumed usage. It must
            // not be converted into avoided tokens or energy without metering.
            metric: 'tokens.headroom',
            perRun: wasted,
            unit: 'unused output tokens',
            assumptions: [],
          },
        });
      }
    }

    // 3) AI retry storms: calls retried many times.
    for (const c of fx.calls) {
      const r = c.retries ?? 0;
      if (r >= this.thresholds.retryStorm) {
        const tokensPerAttempt = (c.promptTokens ?? 0) + c.completionTokens;
        const wastedTokens = r * tokensPerAttempt;
        bugs.push({
          id: bugId('ai-retry-storm', `${fx.service}:${c.id}`),
          category: 'ai-retry-storm',
          severity: r >= 5 ? 'high' : 'medium',
          title: `Call '${c.id}' retried ${r} times`,
          location: { filePath: sourcePath, startLine: 1, endLine: 1, symbol: c.id },
          rationale:
            `Call '${c.id}' was retried ${r} times. Each retry re-sends the full prompt and re-runs inference; ` +
            `without backoff/circuit-breaking these tokens are burned for no successful result.`,
          evidence: {
            retries: r,
            status: c.status,
            retryBackoffMs: c.retryBackoffMs ?? 0,
            tokensPerAttempt,
            wastedTokens,
          },
          estimatedWaste: {
            metric: 'tokens.avoided',
            perRun: wastedTokens,
            unit: 'tokens',
            assumptions: [],
          },
        });
      }
    }

    return { agentId: this.id, agentName: this.name, scanned: { calls: fx.calls.length }, bugs };
  }
}
