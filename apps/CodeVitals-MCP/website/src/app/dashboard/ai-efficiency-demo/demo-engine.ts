import { createHash, randomUUID } from 'node:crypto';
import { assessDemoCarbon } from './demo-sci';
import type {
  DemoCompletion,
  DemoEvidence,
  DemoMode,
  DemoProvider,
  DemoRecommendation,
  DemoReplay,
  DemoRequest,
  DemoRun,
  DemoStatus,
} from './demo-types';

/** This corpus is synthetic. It never reads the repository, a ledger, or user data. */
export const DEMO_REQUESTS: readonly DemoRequest[] = Object.freeze(
  [
    {
      id: 'delivery-1',
      prompt: 'What is the standard delivery time?',
      expectedAnswer: 'Standard delivery takes 3–5 business days.',
      cacheable: true,
    },
    {
      id: 'returns-1',
      prompt: 'What is the returns policy?',
      expectedAnswer: 'Unused items can be returned within 30 days.',
      cacheable: true,
    },
    {
      id: 'delivery-2',
      prompt: 'What is the standard delivery time?',
      expectedAnswer: 'Standard delivery takes 3–5 business days.',
      cacheable: true,
    },
    {
      id: 'private-1',
      prompt: 'What is the status of my order?',
      expectedAnswer: 'Synthetic account A: order A100 is dispatched.',
      cacheable: false,
      bypassReason: 'User-specific response: never share across accounts.',
    },
    {
      id: 'returns-2',
      prompt: 'What is the returns policy?',
      expectedAnswer: 'Unused items can be returned within 30 days.',
      cacheable: true,
    },
    {
      id: 'delivery-3',
      prompt: 'What is the standard delivery time?',
      expectedAnswer: 'Standard delivery takes 3–5 business days.',
      cacheable: true,
    },
    {
      id: 'private-2',
      prompt: 'What is the status of my order?',
      expectedAnswer: 'Synthetic account B: order B200 is processing.',
      cacheable: false,
      bypassReason: 'User-specific response: never share across accounts.',
    },
    {
      id: 'returns-3',
      prompt: 'What is the returns policy?',
      expectedAnswer: 'Unused items can be returned within 30 days.',
      cacheable: true,
    },
  ].map((request) => Object.freeze(request)),
);

const SYSTEM_VERSION = 'synthetic-public-faq-v1';
const CACHE_SCOPE =
  'Isolated synthetic demo only; no repository, ledger, cloud, or production changes.';
const HASH = (value: unknown): string =>
  createHash('sha256').update(JSON.stringify(value)).digest('hex');
const DATASET_HASH = HASH({ version: SYSTEM_VERSION, requests: DEMO_REQUESTS });
// Exact public messages only: never trust an arbitrary exception message or provider response body.
const SAFE_PROVIDER_REASONS = new Set([
  'The per-action model-call limit was reached.',
  'Gemini rejected the credentials or model access. Check the server configuration.',
  'Gemini quota or rate limit reached. No automatic retry was made.',
  'The configured Gemini model is unavailable.',
  'Gemini could not complete the request. No automatic retry was made.',
  'Gemini rejected the request parameters. Check model compatibility. No automatic retry was made.',
  'Gemini reported a service error. No automatic retry was made.',
  'Gemini returned an incomplete answer; reported usage is retained.',
  'Gemini output exceeded the demo limit.',
  'Gemini timed out. No automatic retry was made.',
  'Gemini returned invalid JSON; reported usage is retained.',
  'Could not complete the Gemini request. Check connectivity and server configuration.',
  'The model recommendation failed validation.',
  'Model advice was unavailable.',
]);
const ASSUMPTIONS = [
  'Scope: one replay of the same eight synthetic requests; no daily, monthly, or fleet extrapolation.',
  'Token counters are not measured electricity; no token-to-energy coefficient is applied.',
  'SCI is incomplete: boundary-wide energy, regional grid intensity, embodied hardware and overhead allocation are missing.',
  'Workload difference only. Baseline, replay, and recommendation calls also consume resources; this benchmark is not net achieved carbon savings.',
  'Fixture tokens are synthetic, not measured usage. Missing live usage prevents a token, energy, or carbon estimate.',
];

function event(run: DemoRun, stage: string, actor: string, summary: string): void {
  run.activity.push({
    sequence: run.activity.length + 1,
    at: new Date().toISOString(),
    stage,
    actor,
    summary,
  });
}

function finish(run: DemoRun, status: DemoStatus): DemoRun {
  run.version += 1;
  run.status = status;
  run.updatedAt = new Date().toISOString();
  run.carbonAssessment = assessDemoCarbon(run);
  return run;
}

function assertRun(run: DemoRun, statuses: DemoStatus[]): void {
  if (
    run.schemaVersion !== 1 ||
    !Number.isSafeInteger(run.version) ||
    run.version < 1 ||
    !run.id ||
    (run.mode !== 'fixture' && run.mode !== 'gemini') ||
    !run.model ||
    run.datasetHash !== DATASET_HASH
  ) {
    throw new Error(
      'This demo record is invalid or belongs to a different workload. Start a new demo.',
    );
  }
  if (!statuses.includes(run.status))
    throw new Error('This action is not available at the current demo stage.');
  const expectedVersion: Partial<Record<DemoStatus, number>> = {
    created: 1,
    'awaiting-approval': 2,
    approved: 3,
    rejected: 3,
    applied: 4,
    verified: 5,
    'verification-failed': 5,
  };
  if (expectedVersion[run.status] !== undefined && run.version !== expectedVersion[run.status]) {
    throw new Error('The demo version does not match its stage. Reload the current demo.');
  }
}

function assertProvider(run: DemoRun, provider: DemoProvider): void {
  if (provider.mode !== run.mode || provider.model !== run.model) {
    throw new Error(
      'The provider or model changed. Start a new demo to keep the comparison consistent.',
    );
  }
}

function publicText(value: string, maximum: number): string {
  if (typeof value !== 'string') return '';
  return value
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .trim()
    .slice(0, maximum);
}

function usage(tokens: number | null): number | null {
  return typeof tokens === 'number' && Number.isSafeInteger(tokens) && tokens >= 0 ? tokens : null;
}

function safeReason(value: unknown): string | undefined {
  return typeof value === 'string' && SAFE_PROVIDER_REASONS.has(value) ? value : undefined;
}

function recommendationDigest(
  run: DemoRun,
  recommendation: Omit<DemoRecommendation, 'digest'>,
): string {
  return HASH({
    runId: run.id,
    datasetHash: run.datasetHash,
    mode: run.mode,
    model: run.model,
    baseline: run.baseline,
    strategy: recommendation.strategy,
    title: recommendation.title,
    explanation: recommendation.explanation,
    source: recommendation.source,
    recommendationModel: recommendation.model,
    tokens: recommendation.tokens,
    risk: recommendation.risk,
    confidence: recommendation.confidence,
    fallbackReason: recommendation.fallbackReason ?? null,
  });
}

function configHash(run: DemoRun, cacheEnabled: boolean): string {
  return HASH({
    runId: run.id,
    mode: run.mode,
    model: run.model,
    datasetHash: run.datasetHash,
    systemVersion: SYSTEM_VERSION,
    cacheEnabled,
    eligible: 'public-deterministic-exact-match-only',
    scope: CACHE_SCOPE,
  });
}

function assertRecommendation(run: DemoRun): void {
  if (
    !run.baseline?.qualityPassed ||
    run.baseline.results.length !== DEMO_REQUESTS.length ||
    !run.recommendation ||
    run.recommendation.digest !== recommendationDigest(run, run.recommendation)
  ) {
    throw new Error(
      'The evidence or recommendation changed. Run a new analysis and review it again.',
    );
  }
}

function assertApproval(run: DemoRun): void {
  assertRecommendation(run);
  if (
    !run.decision?.approved ||
    run.decision.identity !== 'self-declared-demo' ||
    !run.decision.actor ||
    run.decision.recommendationDigest !== run.recommendation?.digest
  ) {
    throw new Error('A matching human approval is required before changing this demo.');
  }
}

function assertApplication(run: DemoRun): void {
  assertApproval(run);
  if (
    !run.application?.cacheEnabled ||
    run.application.scope !== CACHE_SCOPE ||
    run.application.beforeHash !== configHash(run, false) ||
    run.application.afterHash !== configHash(run, true)
  ) {
    throw new Error('The applied configuration changed. Start a new approved demo.');
  }
}

export function createDemoRun(mode: DemoMode, model: string, id = randomUUID()): DemoRun {
  if ((mode !== 'fixture' && mode !== 'gemini') || !model?.trim() || !id?.trim())
    throw new Error('Choose a valid demo mode and model.');
  const now = new Date().toISOString();
  const run: DemoRun = {
    schemaVersion: 1,
    id,
    version: 1,
    mode,
    model,
    status: 'created',
    createdAt: now,
    updatedAt: now,
    datasetHash: DATASET_HASH,
    activity: [],
  };
  event(
    run,
    'status',
    'system',
    `Created an isolated ${mode === 'fixture' ? 'synthetic fixture' : 'live model / synthetic data'} demo with eight requests.`,
  );
  return run;
}

function ruleRecommendation(
  model: string,
  source: 'fixture-rule' | 'fallback',
): Omit<DemoRecommendation, 'digest'> {
  return {
    strategy: 'exact-match-cache',
    title: 'Reuse identical public FAQ answers',
    explanation:
      'Six public FAQ requests contain two unique questions. Cache their exact answers within this run; always bypass the cache for the two user-specific requests.',
    source,
    model,
    tokens: source === 'fixture-rule' ? 0 : null,
    risk: 'Low in this isolated workload. Never cache private, changing, or non-deterministic answers; production use needs expiry and invalidation.',
    confidence:
      'High for duplicate detection in this fixed workload; benefit and answer quality still require replay verification.',
    ...(source === 'fallback'
      ? {
          fallbackReason:
            'The model recommendation was unavailable or invalid. A disclosed deterministic recommendation is shown; workload results were not substituted.',
        }
      : {}),
  };
}

export function createFixtureProvider(): DemoProvider {
  const model = 'synthetic-fixture-v1';
  return {
    mode: 'fixture',
    model,
    async complete(request) {
      return { answer: request.expectedAnswer, tokens: request.cacheable ? 40 : 50 };
    },
    async recommend() {
      return ruleRecommendation(model, 'fixture-rule');
    },
  };
}

function evidence(): DemoEvidence {
  const eligible = DEMO_REQUESTS.filter((request) => request.cacheable);
  const unique = new Set(eligible.map((request) => request.prompt)).size;
  return {
    requests: DEMO_REQUESTS.length,
    uniqueCacheablePrompts: unique,
    duplicateRequests: eligible.length - unique,
    excludedRequests: DEMO_REQUESTS.length - eligible.length,
  };
}

function cleanRecommendation(
  run: DemoRun,
  raw: Omit<DemoRecommendation, 'digest'>,
): DemoRecommendation {
  const allowed =
    run.mode === 'fixture'
      ? raw.source === 'fixture-rule'
      : raw.source === 'model' || raw.source === 'fallback';
  if (
    raw.strategy !== 'exact-match-cache' ||
    !allowed ||
    raw.model !== run.model ||
    !publicText(raw.title, 160) ||
    !publicText(raw.explanation, 1600) ||
    !publicText(raw.risk, 700) ||
    !publicText(raw.confidence, 500)
  ) {
    throw new Error('Invalid recommendation.');
  }
  const recommendation: Omit<DemoRecommendation, 'digest'> = {
    strategy: 'exact-match-cache',
    title: publicText(raw.title, 160),
    explanation: publicText(raw.explanation, 1600),
    source: raw.source,
    model: run.model,
    tokens: usage(raw.tokens),
    risk: publicText(raw.risk, 700),
    confidence: publicText(raw.confidence, 500),
    ...(raw.source === 'fallback'
      ? {
          fallbackReason:
            safeReason(raw.fallbackReason) ??
            ruleRecommendation(run.model, 'fallback').fallbackReason,
        }
      : {}),
  };
  return { ...recommendation, digest: recommendationDigest(run, recommendation) };
}

async function replay(
  run: DemoRun,
  provider: DemoProvider,
  cacheEnabled: boolean,
): Promise<{ report: DemoReplay; failed: boolean; failureReason?: string }> {
  const started = Date.now();
  const cache = new Map<string, string>(); // New, isolated cache for every replay; no cross-run leakage.
  const report: DemoReplay = {
    requests: DEMO_REQUESTS.length,
    modelCalls: 0,
    cacheHits: 0,
    tokens: 0,
    missingUsage: 0,
    durationMs: 0,
    qualityPassed: false,
    results: [],
  };
  const phase = cacheEnabled ? 'verification' : 'baseline';
  let failed = false;
  let failureReason: string | undefined;
  for (const immutableRequest of DEMO_REQUESTS) {
    const request = structuredClone(immutableRequest);
    const key = HASH({
      model: provider.model,
      systemVersion: SYSTEM_VERSION,
      datasetHash: run.datasetHash,
      prompt: request.prompt,
    });
    const cachedAnswer = cacheEnabled && request.cacheable ? cache.get(key) : undefined;
    let answer: string;
    let tokens: number | null;
    if (cachedAnswer !== undefined) {
      answer = cachedAnswer;
      tokens = 0;
      report.cacheHits += 1;
      event(
        run,
        phase,
        'cache',
        `${request.id}: reused an exact public FAQ answer; no model call.`,
      );
    } else {
      report.modelCalls += 1;
      event(
        run,
        phase,
        'model',
        `${request.id}: started ${run.mode === 'fixture' ? 'synthetic fixture' : 'model'} call${request.cacheable ? '.' : '; shared cache bypassed for user-specific data.'}`,
      );
      let completion: DemoCompletion;
      try {
        completion = await provider.complete(request);
        if (typeof completion.answer !== 'string' || completion.answer.length > 4000)
          throw new Error('Invalid completion.');
      } catch (error) {
        const providerError = error as { safeReason?: unknown; tokens?: number | null } | null;
        failureReason = safeReason(providerError?.safeReason);
        const errorTokens = usage(providerError?.tokens ?? null);
        if (errorTokens === null) {
          report.missingUsage += 1;
          report.tokens = null;
        } else if (report.tokens !== null) {
          report.tokens += errorTokens;
        }
        failed = true;
        event(
          run,
          phase,
          'system',
          `${request.id}: ${failureReason ?? 'Provider call failed.'} ${errorTokens === null ? 'Usage is unknown.' : `${errorTokens} reported tokens retained.`} Stopped without substituting fixture results.`,
        );
        break;
      }
      answer = completion.answer.trim();
      tokens = usage(completion.tokens);
      if (tokens === null) {
        report.missingUsage += 1;
        report.tokens = null;
      } else if (report.tokens !== null) {
        report.tokens += tokens;
      }
      if (cacheEnabled && immutableRequest.cacheable) cache.set(key, answer);
      event(
        run,
        phase,
        'model',
        `${request.id}: response received; ${tokens === null ? 'token usage unavailable' : `${tokens} ${run.mode === 'fixture' ? 'synthetic' : 'reported'} tokens`}.`,
      );
    }
    report.results.push({
      id: immutableRequest.id,
      answer,
      correct: answer === immutableRequest.expectedAnswer,
      cached: cachedAnswer !== undefined,
      tokens,
      ...(immutableRequest.bypassReason ? { bypassReason: immutableRequest.bypassReason } : {}),
    });
  }
  report.durationMs = Math.max(0, Date.now() - started);
  report.qualityPassed =
    !failed &&
    report.results.length === DEMO_REQUESTS.length &&
    report.results.every((result) => result.correct);
  return { report, failed, failureReason };
}

export async function analyzeDemo(input: DemoRun, provider: DemoProvider): Promise<DemoRun> {
  assertRun(input, ['created']);
  assertProvider(input, provider);
  const run = structuredClone(input);
  event(
    run,
    'activity',
    'orchestrator',
    'Plan: benchmark eight requests, identify public duplicates, then request a recommendation for human review.',
  );
  const { report, failed, failureReason } = await replay(run, provider, false);
  run.baseline = report;
  if (failed || !report.qualityPassed) {
    run.failure = failed
      ? `${failureReason ?? 'The baseline provider call failed.'} No workload fallback was used. Start a new run after checking provider availability.`
      : 'The baseline did not pass the expected-answer checks. No change can be approved from this run.';
    event(run, 'evidence', 'verifier', run.failure);
    return finish(run, 'failed');
  }
  event(
    run,
    'evidence',
    'duplicate-detector',
    'Found four redundant public FAQ requests; excluded two user-specific requests from shared caching.',
  );
  let recommendationTokens: number | null = null;
  try {
    const raw = await provider.recommend(evidence());
    recommendationTokens = usage(raw.tokens);
    run.recommendation = cleanRecommendation(run, raw);
  } catch {
    run.recommendation = cleanRecommendation(run, {
      ...ruleRecommendation(run.model, run.mode === 'fixture' ? 'fixture-rule' : 'fallback'),
      tokens: recommendationTokens,
    });
  }
  event(
    run,
    'recommendation',
    run.recommendation.source,
    run.recommendation.source === 'fallback'
      ? 'Model recommendation unavailable. A labelled rule-based fallback is ready for review; live baseline results are retained.'
      : 'Recommendation ready: exact-match caching for public FAQ answers only. Human approval is required.',
  );
  return finish(run, 'awaiting-approval');
}

export function decideDemo(
  input: DemoRun,
  decision: { approved: boolean; actor: string; note: string; acknowledged: boolean },
): DemoRun {
  assertRun(input, ['awaiting-approval']);
  assertRecommendation(input);
  const actor = publicText(decision.actor, 80);
  if (
    !actor ||
    typeof decision.approved !== 'boolean' ||
    (decision.approved && decision.acknowledged !== true)
  ) {
    throw new Error(
      'Enter a reviewer name and acknowledge the isolated demo scope before approving.',
    );
  }
  const run = structuredClone(input);
  run.decision = {
    approved: decision.approved,
    actor,
    note: publicText(decision.note, 500),
    at: new Date().toISOString(),
    recommendationDigest: run.recommendation!.digest,
    identity: 'self-declared-demo',
  };
  event(
    run,
    'human-decision',
    actor,
    decision.approved
      ? 'Approved this recommendation and dataset for the isolated demo. Identity is self-declared, not enterprise-authenticated.'
      : 'Rejected the recommendation. No configuration was changed. Identity is self-declared, not enterprise-authenticated.',
  );
  return finish(run, decision.approved ? 'approved' : 'rejected');
}

export function applyDemo(input: DemoRun): DemoRun {
  assertRun(input, ['approved']);
  assertApproval(input);
  const run = structuredClone(input);
  run.application = {
    at: new Date().toISOString(),
    beforeHash: configHash(run, false),
    afterHash: configHash(run, true),
    cacheEnabled: true,
    scope: CACHE_SCOPE,
  };
  event(
    run,
    'apply',
    'sandbox',
    'Enabled exact-match caching in this demo configuration only. Private and non-deterministic requests remain excluded. No user files or cloud resources changed.',
  );
  return finish(run, 'applied');
}

export async function verifyDemo(input: DemoRun, provider: DemoProvider): Promise<DemoRun> {
  assertRun(input, ['applied']);
  assertApplication(input);
  assertProvider(input, provider);
  const run = structuredClone(input);
  const { report, failed, failureReason } = await replay(run, provider, true);
  const baseline = run.baseline!;
  const outputsEquivalent =
    report.results.length === baseline.results.length &&
    report.results.every(
      (result, index) =>
        result.id === baseline.results[index].id &&
        result.answer === baseline.results[index].answer,
    );
  const privateResults = report.results.filter(
    (result) => DEMO_REQUESTS.find((request) => request.id === result.id)?.cacheable === false,
  );
  const exclusionsPassed =
    privateResults.length === 2 &&
    privateResults.every((result) => !result.cached && result.correct);
  const complete = !failed && report.results.length === DEMO_REQUESTS.length;
  const checks = [
    {
      label: 'Same eight-request dataset and model',
      passed: complete && run.datasetHash === DATASET_HASH,
    },
    {
      label: 'All expected answers preserved',
      passed: baseline.qualityPassed && report.qualityPassed,
    },
    { label: 'Baseline and replay answers match', passed: outputsEquivalent },
    { label: 'Private requests bypass shared caching', passed: exclusionsPassed },
    {
      label: 'Four duplicate requests avoided',
      passed:
        complete && baseline.modelCalls === 8 && report.modelCalls === 4 && report.cacheHits === 4,
    },
  ];
  const passed = checks.every((check) => check.passed);
  const tokensSaved =
    complete && baseline.tokens !== null && report.tokens !== null
      ? baseline.tokens - report.tokens
      : null;
  run.verification = {
    at: new Date().toISOString(),
    passed,
    after: report,
    requestsSaved: complete ? baseline.modelCalls - report.modelCalls : 0,
    tokensSaved,
    outputsEquivalent,
    checks,
    estimatedEnergyWh: null,
    estimatedCarbonGrams: null,
    assumptions: [...ASSUMPTIONS],
  };
  if (!passed) {
    run.failure = failed
      ? `${failureReason ?? 'Replay provider call failed.'} Partial results are not verified savings. Approval and baseline are retained; you can roll back.`
      : 'Replay failed one or more answer-quality, isolation, or reduction checks. Do not claim verified improvement; you can roll back.';
  }
  event(
    run,
    'verified-result',
    'verifier',
    passed
      ? `All five checks passed: eight requests served with four ${run.mode === 'fixture' ? 'simulated' : 'live'} model calls instead of eight; private answers stayed separate.`
      : 'Verification failed. The baseline and human decision remain available; no verified benefit is claimed.',
  );
  return finish(run, passed ? 'verified' : 'verification-failed');
}

export function rollbackDemo(input: DemoRun): DemoRun {
  assertRun(input, ['applied', 'verified', 'verification-failed']);
  assertApplication(input);
  const run = structuredClone(input);
  run.application = { ...run.application!, cacheEnabled: false };
  event(
    run,
    'rollback',
    'sandbox',
    'Disabled this isolated demo cache. Historical comparison and decision records remain available; no production resources were changed.',
  );
  return finish(run, 'rolled-back');
}
