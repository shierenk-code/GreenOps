import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type OpenAI from 'openai';
import { GreenOpsAgent } from '../src/agent.js';
import { SustainabilityLedger } from '@greenops/ledger';
import { OllamaReasoner } from '../src/ollama-reasoner.js';
import { GeminiReasoner } from '../src/gemini-reasoner.js';
import { OfflineReasoner, PolicyApprover } from '../src/offline-reasoner.js';

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const path of temporaryDirectories.splice(0)) rmSync(path, { recursive: true, force: true });
});

describe('GreenOpsAgent real sandbox improvement', () => {
  it('persists Gemini provenance and suggested code in the full agent ledger', async () => {
    const root = mkdtempSync(join(tmpdir(), 'greenops-agent-gemini-test-'));
    temporaryDirectories.push(root);
    const ledgerPath = join(root, 'ledger.json');
    const suggestedCode = 'const result = await cache.getOrCreate(prompt, complete);';
    const reasoner = new GeminiReasoner({
      apiKey: 'gemini-test-key',
      model: 'gemini-test',
      fetcher: async () =>
        new Response(
          JSON.stringify({
            candidates: [
              {
                finishReason: 'STOP',
                content: {
                  parts: [
                    {
                      text: JSON.stringify({
                        rootCause: 'Duplicate prompts are recomputed.',
                        reasoning: 'Cache repeated completions.',
                        recommendedStrategyId: 'add-response-cache',
                        suggestedCode,
                      }),
                    },
                  ],
                },
              },
            ],
            usageMetadata: { totalTokenCount: 45 },
          }),
        ),
    });
    await new GreenOpsAgent({
      targetPath: root,
      ledgerPath,
      reasoner,
      bugsProvider: () => ({
        scanned: { calls: 1 },
        bugs: [
          {
            id: 'cache-finding',
            category: 'uncached-completion',
            severity: 'medium',
            title: 'Repeated prompt',
            rationale: 'Repeated inference wastes tokens.',
            location: { filePath: 'trace.json', startLine: 1, endLine: 1 },
            evidence: { requests: 2 },
            estimatedWaste: {
              metric: 'tokens.avoided',
              perRun: 100,
              unit: 'tokens',
              assumptions: [],
            },
          },
        ],
      }),
    }).run();
    const ledger = new SustainabilityLedger(ledgerPath);
    expect(
      ledger.allEntries().find((entry) => entry.stage === 'investigate')?.data.analysis,
    ).toEqual({
      provider: 'gemini',
      model: 'gemini-test',
      status: 'generated',
      tokensUsed: 45,
      requestAttempted: true,
    });
    expect(ledger.allEntries().find((entry) => entry.stage === 'compare')?.data).toMatchObject({
      suggestedCode,
      reasoning: 'Cache repeated completions.',
    });
    expect(ledger.allOutcomes()[0]?.selfCost.tokens).toBe(45);
  });

  it('persists fallback provenance and tokens consumed by rejected local-model output', async () => {
    const root = mkdtempSync(join(tmpdir(), 'greenops-agent-llm-test-'));
    temporaryDirectories.push(root);
    const ledgerPath = join(root, 'ledger.json');
    const onEvent = vi.fn();
    const create = vi.fn().mockResolvedValue({
      choices: [{ finish_reason: 'length', message: { content: '{incomplete' } }],
      usage: { total_tokens: 99 },
    });
    const reasoner = new OllamaReasoner({
      client: { chat: { completions: { create } } } as unknown as OpenAI,
    });
    await new GreenOpsAgent({
      targetPath: root,
      ledgerPath,
      reasoner,
      onEvent,
      bugsProvider: () => ({
        scanned: { calls: 1 },
        bugs: [
          {
            id: 'retry-finding',
            category: 'ai-retry-storm',
            severity: 'high',
            title: 'Repeated retries',
            rationale: 'Retry waste',
            location: { filePath: 'trace.json', startLine: 1, endLine: 1 },
            evidence: { retries: 5, tokensPerAttempt: 100 },
            estimatedWaste: {
              metric: 'tokens.avoided',
              perRun: 500,
              unit: 'tokens',
              assumptions: [],
            },
          },
        ],
      }),
    }).run();
    const ledger = new SustainabilityLedger(ledgerPath);
    const investigation = ledger.allEntries().find((entry) => entry.stage === 'investigate');
    expect(investigation?.data.tokensUsed).toBe(99);
    expect(investigation?.data.analysis).toMatchObject({
      provider: 'ollama',
      model: 'gpt-oss:20b',
      status: 'fallback',
      tokensUsed: 99,
    });
    expect(ledger.allOutcomes()[0]?.selfCost.tokens).toBe(99);
    expect(onEvent.mock.calls.some(([message]) => message.includes('offline fallback'))).toBe(true);
  });

  it('merges duplicate imports in a sandbox, preserves the source, and verifies by re-detection', async () => {
    const root = mkdtempSync(join(tmpdir(), 'greenops-agent-test-'));
    temporaryDirectories.push(root);
    const target = join(root, 'target');
    const ledgerPath = join(root, 'ledger.json');
    const sourcePath = join(target, 'service.ts');
    cpSync(join(process.cwd(), 'fixtures', 'greenops-sample'), target, { recursive: true });
    const original = readFileSync(sourcePath, 'utf8');

    const agent = new GreenOpsAgent({
      targetPath: target,
      ledgerPath,
      reasoner: new OfflineReasoner(),
      approver: new PolicyApprover({ enabled: true, requireApproval: false, autoApply: true }),
    });
    await agent.run();

    expect(readFileSync(sourcePath, 'utf8')).toBe(original);
    const ledger = new SustainabilityLedger(ledgerPath);
    const improve = ledger
      .allEntries()
      .find((entry) => entry.stage === 'improve' && entry.data.applied === true);
    const verify = ledger
      .allEntries()
      .find((entry) => entry.stage === 'verify' && entry.data.confirmed === true);
    expect(improve?.data.mode).toBe('sandbox');
    expect(typeof improve?.data.beforeSha256).toBe('string');
    expect(improve?.data.beforeSha256).not.toBe(improve?.data.afterSha256);
    const sandboxFile = String(improve?.data.changedFile ?? '');
    temporaryDirectories.push(dirname(String(improve?.data.sandboxPath ?? '')));
    expect(existsSync(sandboxFile)).toBe(true);
    expect(readFileSync(sandboxFile, 'utf8')).toContain(
      "import { formatPrompt, formatPrompt as formatPromptAgain } from './util.js';",
    );
    expect(verify?.data.measurementBasis).toBe('observed-redetection+estimated-conversion');
    expect(ledger.allOutcomes()[0]?.bugsImproved).toBe(1);
  });

  it('persists fleet orchestration trace events separately from finding stages', async () => {
    const root = mkdtempSync(join(tmpdir(), 'greenops-agent-trace-test-'));
    temporaryDirectories.push(root);
    const ledgerPath = join(root, 'ledger.json');
    const agent = new GreenOpsAgent({
      targetPath: root,
      ledgerPath,
      reasoner: new OfflineReasoner(),
      bugsProvider: () => ({
        bugs: [],
        scanned: { agents: 1 },
        trace: [
          {
            kind: 'plan',
            actor: 'orchestrator',
            status: 'planned',
            detail: 'Planned 1 agent.',
            at: new Date().toISOString(),
          },
        ],
      }),
    });

    await agent.run();

    const outcome = new SustainabilityLedger(ledgerPath).allOutcomes()[0];
    expect(outcome?.trace).toHaveLength(1);
    expect(outcome?.trace?.[0]).toMatchObject({ kind: 'plan', actor: 'orchestrator' });
    expect(outcome?.selfCost.events.length).toBeGreaterThan(0);
  });
});
