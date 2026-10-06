import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  DEMO_REQUESTS,
  analyzeDemo,
  applyDemo,
  createDemoRun,
  createFixtureProvider,
  decideDemo,
  rollbackDemo,
  verifyDemo,
} from '../apps/CodeVitals-MCP/website/src/app/dashboard/ai-efficiency-demo/demo-engine';
import type {
  DemoCompletion,
  DemoProvider,
  DemoRecommendation,
  DemoRequest,
  DemoRun,
} from '../apps/CodeVitals-MCP/website/src/app/dashboard/ai-efficiency-demo/demo-types';

const approval = {
  approved: true,
  actor: 'Demo reviewer',
  note: 'Approved for this isolated test only.',
  acknowledged: true,
};
const clone = <T>(value: T): T => structuredClone(value);

function liveProvider(overrides: Partial<DemoProvider> = {}): DemoProvider {
  return {
    mode: 'gemini',
    model: 'mock-live-model',
    complete: vi.fn(async (request: DemoRequest): Promise<DemoCompletion> => ({
      answer: request.expectedAnswer,
      tokens: 100,
    })),
    recommend: vi.fn(async (): Promise<Omit<DemoRecommendation, 'digest'>> => ({
      strategy: 'exact-match-cache',
      title: 'Cache public FAQs',
      explanation: 'Reuse exact public answers only.',
      source: 'model',
      model: 'mock-live-model',
      tokens: 70,
      risk: 'Low only for this isolated workload.',
      confidence: 'High for duplicate detection; replay required.',
    })),
    ...overrides,
  };
}

async function analyzed(provider = createFixtureProvider()): Promise<DemoRun> {
  return analyzeDemo(createDemoRun(provider.mode, provider.model), provider);
}

async function applied(provider = createFixtureProvider()): Promise<DemoRun> {
  return applyDemo(decideDemo(await analyzed(provider), approval));
}

describe('isolated synthetic AI efficiency demo engine', () => {
  it('defines an immutable eight-request synthetic corpus with four safe duplicates and two private exclusions', () => {
    expect(DEMO_REQUESTS).toHaveLength(8);
    const eligible = DEMO_REQUESTS.filter((request) => request.cacheable);
    const excluded = DEMO_REQUESTS.filter((request) => !request.cacheable);
    expect(eligible).toHaveLength(6);
    expect(new Set(eligible.map((request) => request.prompt)).size).toBe(2);
    expect(excluded).toHaveLength(2);
    expect(excluded[0].prompt).toBe(excluded[1].prompt);
    expect(excluded[0].expectedAnswer).not.toBe(excluded[1].expectedAnswer);
    expect(excluded.every((request) => request.bypassReason)).toBe(true);
    expect(Object.isFrozen(DEMO_REQUESTS)).toBe(true);
    expect(DEMO_REQUESTS.every(Object.isFrozen)).toBe(true);
  });

  it('creates unique runs with stable SHA-256 dataset identity and no applied configuration', () => {
    const provider = createFixtureProvider();
    const first = createDemoRun('fixture', provider.model);
    const second = createDemoRun('fixture', provider.model);
    expect(first.id).not.toBe(second.id);
    expect(first.datasetHash).toMatch(/^[a-f0-9]{64}$/);
    expect(first.datasetHash).toBe(second.datasetHash);
    expect(first).toMatchObject({ schemaVersion: 1, status: 'created', version: 1 });
    expect(first.application).toBeUndefined();
    expect(first.activity[0].summary).toContain('synthetic fixture');
  });

  it('benchmarks all requests, provides aggregate evidence and awaits a real review action', async () => {
    const provider = liveProvider();
    const run = await analyzed(provider);
    expect(provider.complete).toHaveBeenCalledTimes(8);
    expect(provider.recommend).toHaveBeenCalledWith({
      requests: 8,
      uniqueCacheablePrompts: 2,
      duplicateRequests: 4,
      excludedRequests: 2,
    });
    expect(run.status).toBe('awaiting-approval');
    expect(run.version).toBe(2);
    expect(run.baseline).toMatchObject({
      requests: 8,
      modelCalls: 8,
      cacheHits: 0,
      tokens: 800,
      qualityPassed: true,
      missingUsage: 0,
    });
    expect(run.recommendation).toMatchObject({
      source: 'model',
      model: provider.model,
      tokens: 70,
    });
    expect(run.recommendation?.digest).toMatch(/^[a-f0-9]{64}$/);
    expect(run.decision).toBeUndefined();
    expect(run.application).toBeUndefined();
  });

  it('completes the actual fixture cache algorithm without inventing measured energy', async () => {
    const provider = createFixtureProvider();
    const result = await verifyDemo(await applied(provider), provider);
    expect(result.status).toBe('verified');
    expect(result.version).toBe(5);
    expect(result.baseline).toMatchObject({ modelCalls: 8, tokens: 340, cacheHits: 0 });
    expect(result.verification).toMatchObject({
      passed: true,
      requestsSaved: 4,
      tokensSaved: 160,
      outputsEquivalent: true,
      estimatedEnergyWh: null,
      estimatedCarbonGrams: null,
      after: { requests: 8, modelCalls: 4, cacheHits: 4, tokens: 180, qualityPassed: true },
    });
    expect(result.recommendation?.source).toBe('fixture-rule');
    expect(result.verification?.checks.every((check) => check.passed)).toBe(true);
    expect(result.verification?.assumptions.join(' ')).toContain('Fixture tokens are synthetic');
  });

  it('reports provider-token differences without converting tokens into an unsupported SCI score', async () => {
    const provider = liveProvider();
    const run = await verifyDemo(await applied(provider), provider);
    expect(provider.complete).toHaveBeenCalledTimes(12);
    expect(provider.recommend).toHaveBeenCalledTimes(1);
    expect(run.verification).toMatchObject({ tokensSaved: 400, requestsSaved: 4 });
    expect(run.verification?.estimatedEnergyWh).toBeNull();
    expect(run.verification?.estimatedCarbonGrams).toBeNull();
    expect(run.carbonAssessment?.result.baseline.sciGramsPerUnit).toBeNull();
    expect(run.carbonAssessment?.result.after?.sciGramsPerUnit).toBeNull();
    expect(run.carbonAssessment?.result.comparison.status).toBe('not-comparable');
    expect(run.verification?.assumptions.join(' ')).toContain('not measured electricity');
    expect(run.verification?.assumptions.join(' ')).toContain('not net achieved carbon savings');
    expect(run.verification?.assumptions.join(' ')).toContain(
      'no daily, monthly, or fleet extrapolation',
    );
  });

  it('uses new provider request objects and protects the fixed corpus from provider mutations', async () => {
    const provider = liveProvider({
      complete: async (request) => {
        const answer = request.expectedAnswer;
        request.expectedAnswer = 'changed';
        request.cacheable = true;
        return { answer, tokens: 10 };
      },
    });
    const run = await verifyDemo(await applied(provider), provider);
    expect(run.status).toBe('verified');
    expect(DEMO_REQUESTS.find((request) => request.id === 'private-1')?.cacheable).toBe(false);
    expect(
      run.verification?.after.results
        .filter((result) => result.bypassReason)
        .every((result) => !result.cached),
    ).toBe(true);
  });

  it('preserves private account separation despite identical prompts', async () => {
    const run = await verifyDemo(await applied(), createFixtureProvider());
    const privateResults = run.verification!.after.results.filter((result) => result.bypassReason);
    expect(privateResults.map((result) => result.answer)).toEqual([
      'Synthetic account A: order A100 is dispatched.',
      'Synthetic account B: order B200 is processing.',
    ]);
    expect(privateResults.every((result) => result.cached === false && result.tokens === 50)).toBe(
      true,
    );
  });

  it('does not share cached answers across independently approved runs', async () => {
    const provider = liveProvider();
    const first = await verifyDemo(await applied(provider), provider);
    const second = await verifyDemo(await applied(provider), provider);
    expect(first.verification?.after.modelCalls).toBe(4);
    expect(second.verification?.after.modelCalls).toBe(4);
    expect(provider.complete).toHaveBeenCalledTimes(24);
  });

  it('returns deeply independent states and preserves originals at every step', async () => {
    const provider = createFixtureProvider();
    const initial = createDemoRun('fixture', provider.model);
    const before = clone(initial);
    const analysis = await analyzeDemo(initial, provider);
    expect(initial).toEqual(before);
    const analysisBefore = clone(analysis);
    const decision = decideDemo(analysis, approval);
    expect(analysis).toEqual(analysisBefore);
    const approvedBefore = clone(decision);
    const application = applyDemo(decision);
    expect(decision).toEqual(approvedBefore);
    const appliedBefore = clone(application);
    const verified = await verifyDemo(application, provider);
    expect(application).toEqual(appliedBefore);
    verified.baseline!.results[0].answer = 'not shared';
    expect(application.baseline!.results[0].answer).toBe(DEMO_REQUESTS[0].expectedAnswer);
    expect(initial.activity).toHaveLength(1);
  });

  it('requires an actor and explicit scope acknowledgement to approve', async () => {
    const run = await analyzed();
    expect(() => decideDemo(run, { ...approval, actor: ' ' })).toThrow(/reviewer name/);
    expect(() => decideDemo(run, { ...approval, acknowledged: false })).toThrow(/acknowledge/);
    expect(run.status).toBe('awaiting-approval');
  });

  it('records the exact recommendation binding and marks reviewer identity self-declared', async () => {
    const run = await analyzed();
    const decided = decideDemo(run, {
      ...approval,
      actor: ' Alice\nReviewer ',
      note: '  demo only  ',
    });
    expect(decided.decision).toMatchObject({
      actor: 'Alice Reviewer',
      note: 'demo only',
      identity: 'self-declared-demo',
      recommendationDigest: run.recommendation!.digest,
      approved: true,
    });
    expect(decided.decision?.at).toMatch(/^\d{4}-/);
  });

  it('records rejection without application and blocks later apply or verify', async () => {
    const run = decideDemo(await analyzed(), { ...approval, approved: false, acknowledged: false });
    expect(run.status).toBe('rejected');
    expect(run.decision?.approved).toBe(false);
    expect(run.application).toBeUndefined();
    expect(() => applyDemo(run)).toThrow(/not available/);
    await expect(verifyDemo(run, createFixtureProvider())).rejects.toThrow(/not available/);
  });

  it('rejects out-of-order and duplicate transitions', async () => {
    const provider = createFixtureProvider();
    const fresh = createDemoRun('fixture', provider.model);
    expect(() => decideDemo(fresh, approval)).toThrow(/not available/);
    expect(() => applyDemo(fresh)).toThrow(/not available/);
    const reviewed = await analyzed();
    await expect(analyzeDemo(reviewed, provider)).rejects.toThrow(/not available/);
    expect(() => applyDemo(reviewed)).toThrow(/not available/);
    const approved = decideDemo(reviewed, approval);
    expect(() => decideDemo(approved, approval)).toThrow(/not available/);
    await expect(verifyDemo(approved, provider)).rejects.toThrow(/not available/);
    const application = applyDemo(approved);
    expect(() => applyDemo(application)).toThrow(/not available/);
    const verified = await verifyDemo(application, provider);
    await expect(verifyDemo(verified, provider)).rejects.toThrow(/not available/);
  });

  it.each(['dataset', 'model', 'recommendation', 'baseline', 'version', 'decision'])(
    'rejects tampered %s before applying',
    async (field) => {
      const run = decideDemo(await analyzed(), approval);
      if (field === 'dataset') run.datasetHash = 'different';
      if (field === 'model') run.model = 'changed';
      if (field === 'recommendation') run.recommendation!.explanation = 'New recommendation';
      if (field === 'baseline') run.baseline!.tokens = 999999;
      if (field === 'version') run.version = 900;
      if (field === 'decision') run.decision!.recommendationDigest = 'stale-approval';
      expect(() => applyDemo(run)).toThrow();
    },
  );

  it('rejects a recommendation transplanted from a different run', async () => {
    const one = await analyzed();
    const two = await analyzed();
    two.recommendation = one.recommendation;
    expect(() => decideDemo(two, approval)).toThrow(/changed/);
  });

  it.each(['beforeHash', 'afterHash', 'scope', 'cacheEnabled'])(
    'rejects tampered applied config %s before verification',
    async (key) => {
      const run = await applied();
      if (key === 'cacheEnabled') run.application!.cacheEnabled = false;
      else run.application![key as 'beforeHash' | 'afterHash' | 'scope'] = 'different';
      await expect(verifyDemo(run, createFixtureProvider())).rejects.toThrow(
        /configuration changed/,
      );
    },
  );

  it('prevents model or provider switches between before and after measurements', async () => {
    const run = await applied();
    await expect(verifyDemo(run, liveProvider())).rejects.toThrow(/provider or model changed/);
    await expect(analyzeDemo(createDemoRun('gemini', 'different'), liveProvider())).rejects.toThrow(
      /provider or model changed/,
    );
  });

  it('sanitizes baseline provider failures, keeps partial usage evidence and never fabricates live outputs', async () => {
    let calls = 0;
    const provider = liveProvider({
      complete: vi.fn(async (request) => {
        calls += 1;
        if (calls === 3) throw new Error('API_KEY=secret-private-provider-error');
        return { answer: request.expectedAnswer, tokens: 100 };
      }),
    });
    const run = await analyzed(provider);
    expect(run.status).toBe('failed');
    expect(run.baseline).toMatchObject({
      modelCalls: 3,
      missingUsage: 1,
      tokens: null,
      qualityPassed: false,
    });
    expect(run.baseline?.results).toHaveLength(2);
    expect(run.recommendation).toBeUndefined();
    expect(provider.recommend).not.toHaveBeenCalled();
    expect(JSON.stringify(run)).not.toContain('secret-private');
    expect(() => decideDemo(run, approval)).toThrow();
  });

  it('retains failed-output usage while blocking approval of incorrect baseline answers', async () => {
    const provider = liveProvider({
      complete: async () => ({ answer: '[invalid output]', tokens: 111 }),
    });
    const run = await analyzed(provider);
    expect(run.status).toBe('failed');
    expect(run.baseline?.tokens).toBe(888);
    expect(run.baseline?.qualityPassed).toBe(false);
    expect(run.failure).toContain('expected-answer');
  });

  it('retains allowlisted quota diagnostics but never reflects an arbitrary provider safeReason', async () => {
    const allowed = 'Gemini quota or rate limit reached. No automatic retry was made.';
    const quotaProvider = liveProvider({
      complete: async () => {
        throw { safeReason: allowed, tokens: null };
      },
    });
    const quotaRun = await analyzed(quotaProvider);
    expect(quotaRun.failure).toContain(allowed);
    const arbitrary = liveProvider({
      complete: async () => {
        throw { safeReason: 'secret api key in error', tokens: 23 };
      },
    });
    const failed = await analyzed(arbitrary);
    expect(JSON.stringify(failed)).not.toContain('secret api key');
    expect(failed.baseline).toMatchObject({ tokens: 23, modelCalls: 1, missingUsage: 0 });
    expect(
      failed.activity.some((item) => item.summary.includes('23 reported tokens retained')),
    ).toBe(true);
  });

  it('preserves allowlisted recommendation fallback diagnostics and reported usage', async () => {
    const provider = liveProvider();
    const raw = await provider.recommend({
      requests: 8,
      duplicateRequests: 4,
      uniqueCacheablePrompts: 2,
      excludedRequests: 2,
    });
    provider.recommend = async () => ({
      ...raw,
      source: 'fallback',
      fallbackReason: 'The configured Gemini model is unavailable.',
      tokens: 17,
    });
    const run = await analyzed(provider);
    expect(run.recommendation).toMatchObject({
      source: 'fallback',
      fallbackReason: 'The configured Gemini model is unavailable.',
      tokens: 17,
    });
  });

  it('labels model recommendation failure as fallback without changing workload evidence', async () => {
    const provider = liveProvider({
      recommend: async () => {
        throw new Error('sensitive server detail');
      },
    });
    const run = await analyzed(provider);
    expect(run.status).toBe('awaiting-approval');
    expect(run.recommendation).toMatchObject({
      source: 'fallback',
      tokens: null,
      model: 'mock-live-model',
    });
    expect(run.recommendation?.fallbackReason).toContain('not substituted');
    expect(run.baseline?.tokens).toBe(800);
    expect(JSON.stringify(run)).not.toContain('sensitive server detail');
    expect((await verifyDemo(applyDemo(decideDemo(run, approval)), provider)).status).toBe(
      'verified',
    );
  });

  it('retains reported recommendation tokens even when model recommendation is invalid', async () => {
    const provider = liveProvider();
    const raw = await provider.recommend({
      requests: 8,
      duplicateRequests: 4,
      uniqueCacheablePrompts: 2,
      excludedRequests: 2,
    });
    provider.recommend = async () => ({ ...raw, title: '', tokens: 99 });
    const run = await analyzed(provider);
    expect(run.recommendation?.source).toBe('fallback');
    expect(run.recommendation?.tokens).toBe(99);
  });

  it('does not expose unsupported arbitrary fields returned by a recommendation provider', async () => {
    const provider = liveProvider();
    const base = await provider.recommend({
      requests: 8,
      duplicateRequests: 4,
      uniqueCacheablePrompts: 2,
      excludedRequests: 2,
    });
    provider.recommend = async () => ({
      ...base,
      reasoning: 'internal chain must not be in trace',
      raw: 'provider raw response',
    });
    const run = await analyzed(provider);
    expect(JSON.stringify(run)).not.toContain('internal chain');
    expect(JSON.stringify(run)).not.toContain('provider raw response');
  });

  it('can verify call reduction with unknown token usage without claiming token or energy savings', async () => {
    const provider = liveProvider({
      complete: async (request) => ({ answer: request.expectedAnswer, tokens: null }),
    });
    const run = await verifyDemo(await applied(provider), provider);
    expect(run.status).toBe('verified');
    expect(run.baseline).toMatchObject({ tokens: null, missingUsage: 8 });
    expect(run.verification).toMatchObject({
      requestsSaved: 4,
      tokensSaved: null,
      estimatedEnergyWh: null,
      estimatedCarbonGrams: null,
      after: { tokens: null, missingUsage: 4 },
    });
  });

  it.each([NaN, Infinity, -3, 1.5])(
    'treats malformed token usage %s as unknown, never as zero',
    async (tokens) => {
      const provider = liveProvider({
        complete: async (request) => ({ answer: request.expectedAnswer, tokens }),
      });
      const run = await analyzed(provider);
      expect(run.baseline?.tokens).toBeNull();
      expect(run.baseline?.missingUsage).toBe(8);
    },
  );

  it('preserves a valid zero-token usage value', async () => {
    const provider = liveProvider({
      complete: async (request) => ({ answer: request.expectedAnswer, tokens: 0 }),
    });
    const run = await analyzed(provider);
    expect(run.baseline).toMatchObject({ tokens: 0, missingUsage: 0 });
  });

  it('reports increases honestly rather than clamping live token differences to savings', async () => {
    const provider = liveProvider();
    const app = await applied(provider);
    provider.complete = async (request) => ({ answer: request.expectedAnswer, tokens: 500 });
    const run = await verifyDemo(app, provider);
    expect(run.verification?.tokensSaved).toBe(-1200);
    expect(run.verification?.estimatedEnergyWh).toBeNull();
    expect(run.verification?.requestsSaved).toBe(4);
  });

  it('fails replay safely, retaining baseline, decision and incomplete call accounting', async () => {
    const provider = liveProvider();
    const app = await applied(provider);
    let calls = 0;
    provider.complete = async (request) => {
      calls += 1;
      if (calls === 2) throw new Error('private error details');
      return { answer: request.expectedAnswer, tokens: 123 };
    };
    const run = await verifyDemo(app, provider);
    expect(run.status).toBe('verification-failed');
    expect(run.baseline).toEqual(app.baseline);
    expect(run.decision).toEqual(app.decision);
    expect(run.verification).toMatchObject({
      passed: false,
      requestsSaved: 0,
      tokensSaved: null,
      estimatedEnergyWh: null,
      after: { modelCalls: 2, tokens: null, missingUsage: 1 },
    });
    expect(JSON.stringify(run)).not.toContain('private error details');
    expect(rollbackDemo(run).status).toBe('rolled-back');
  });

  it('fails verification when cached answers diverge from expected answers or baseline', async () => {
    const provider = liveProvider();
    const app = await applied(provider);
    provider.complete = async (request) => ({
      answer: request.cacheable ? 'wrong FAQ' : request.expectedAnswer,
      tokens: 50,
    });
    const run = await verifyDemo(app, provider);
    expect(run.status).toBe('verification-failed');
    expect(run.verification?.outputsEquivalent).toBe(false);
    expect(run.verification?.after.qualityPassed).toBe(false);
    expect(run.verification?.estimatedEnergyWh).toBeNull();
    expect(
      run.verification?.checks.filter((check) => !check.passed).map((check) => check.label),
    ).toContain('All expected answers preserved');
  });

  it('rolls back only an applied demo while retaining the historical verified comparison', async () => {
    const verified = await verifyDemo(await applied(), createFixtureProvider());
    const original = clone(verified);
    const rolledBack = rollbackDemo(verified);
    expect(verified).toEqual(original);
    expect(rolledBack).toMatchObject({
      status: 'rolled-back',
      version: 6,
      application: { cacheEnabled: false },
    });
    expect(rolledBack.baseline).toEqual(verified.baseline);
    expect(rolledBack.verification).toEqual(verified.verification);
    expect(rolledBack.decision).toEqual(verified.decision);
    expect(() => rollbackDemo(rolledBack)).toThrow();
    const notApplied = decideDemo(await analyzed(), approval);
    expect(() => rollbackDemo(notApplied)).toThrow();
  });

  it('records ordered public activity, tool calls and review history without raw reasoning', async () => {
    const run = await verifyDemo(await applied(), createFixtureProvider());
    expect(run.activity.map((item) => item.sequence)).toEqual(
      run.activity.map((_, index) => index + 1),
    );
    expect(
      run.activity.every(
        (item) => !Number.isNaN(Date.parse(item.at)) && item.actor && item.stage && item.summary,
      ),
    ).toBe(true);
    expect(
      run.activity.filter((item) => item.actor === 'model' && item.summary.includes('started')),
    ).toHaveLength(12);
    expect(run.activity.filter((item) => item.actor === 'cache')).toHaveLength(4);
    expect(run.activity.some((item) => item.stage === 'human-decision')).toBe(true);
    expect(run.activity.at(-1)?.stage).toBe('verified-result');
  });

  it('never overwrites an existing fixture or ledger, and has no filesystem or network dependency', async () => {
    const paths = ['fixtures/greenops-mock/ai-usage.json', 'greenops-fleet-ledger.json']
      .map((path) => resolve(path))
      .filter(existsSync);
    const digest = (path: string) => createHash('sha256').update(readFileSync(path)).digest('hex');
    const before = paths.map(digest);
    await verifyDemo(await applied(), createFixtureProvider());
    expect(paths.map(digest)).toEqual(before);
    const source = readFileSync(
      resolve('apps/CodeVitals-MCP/website/src/app/dashboard/ai-efficiency-demo/demo-engine.ts'),
      'utf8',
    );
    expect(source).not.toMatch(/from ['"](?:node:)?(?:fs|http|https|child_process)/);
    expect(source).not.toContain('process.env');
    expect(source).not.toContain('fetch(');
  });
});
