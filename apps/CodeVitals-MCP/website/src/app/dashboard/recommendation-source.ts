type RecommendationStatus = 'generated' | 'fallback' | 'offline' | 'unconfirmed' | 'not-run';
type Provider = 'ollama' | 'openai' | 'gemini' | 'offline';

interface FindingWithEntries {
  entries: Array<{ stage: string; data: Record<string, unknown> }>;
}

interface RecommendationSource {
  status: RecommendationStatus;
  provider?: Provider;
  model?: string;
  tokens?: number;
  reason?: string;
}

const record = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
const tokenCount = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : undefined;

// Uploaded ledgers may contain arbitrary errors. Display only known safe explanations,
// never endpoint URLs, provider responses, request payloads, or credentials.
const FALLBACK_REASONS: Record<string, string> = {
  'connection-failed': 'Could not connect to the model service.',
  timeout: 'The model did not respond within the time limit.',
  'model-not-found': 'The requested model is not installed or available.',
  'invalid-response': 'The model response could not be used safely.',
  'invalid-config': 'The model configuration needs attention.',
  'api-error': 'The model service rejected the request.',
  'missing-api-key': 'No API key was configured.',
  'missing-model': 'No local model was configured.',
  'Model request timed out; further model requests are skipped for this run.':
    'The model timed out; further requests were skipped for this run.',
  'Model service could not be reached; further model requests are skipped for this run.':
    'The model service could not be reached; further requests were skipped for this run.',
  'Model or API route was not found; check the configured model and endpoint.':
    'The requested model or endpoint was not found. Check the model installation and configuration.',
  'Model service rejected access; check the provider credentials or permissions.':
    'The model service rejected access. Check provider credentials or permissions.',
  'Model service reported a quota or rate limit; further requests are skipped for this run.':
    'The model service reported a quota or rate limit; further requests were skipped for this run.',
  'Model service failed; further requests are skipped for this run.':
    'The model service failed; further requests were skipped for this run.',
  'Local model could not load because there is not enough memory; free memory or use a larger machine.':
    'There was not enough memory to load the local model. Free memory or use a machine with more RAM.',
  'Model request failed or returned unsupported data.':
    'The model request failed or returned unsupported data.',
  'Model output was incomplete or failed structured validation.':
    'The model output was incomplete or could not be used safely.',
};

const PROVIDER_LABELS: Record<Provider, string> = {
  ollama: 'Ollama (local)',
  openai: 'OpenAI',
  gemini: 'Gemini',
  offline: 'Rule-based',
};

const LEGACY_GEMINI_FALLBACK = 'Gemini unavailable; used the offline reasoner.';

/** Classify old error text, but never return any part of that untrusted text. */
function legacyGeminiFailure(reason: string): string {
  if (/timeout|timed out|aborterror|etimedout/i.test(reason)) return FALLBACK_REASONS.timeout;
  if (
    /connection|fetch failed|network|econnrefused|econnreset|enotfound|eai_again|unreachable/i.test(
      reason,
    )
  ) {
    return FALLBACK_REASONS['connection-failed'];
  }
  if (/\bHTTP\s+404\b/i.test(reason)) return 'The requested model or endpoint was not found.';
  if (/\bHTTP\s+(401|403)\b/i.test(reason))
    return 'The model service rejected access. Check provider credentials or permissions.';
  if (/\bHTTP\s+429\b/i.test(reason)) return 'The model service reported a quota or rate limit.';
  if (/\bHTTP\s+5\d\d\b/i.test(reason)) return 'The model service failed.';
  return 'The model was unavailable; a rule-based recommendation was used.';
}

export function sourceFor(finding: FindingWithEntries): RecommendationSource {
  const entry = finding.entries.findLast((candidate) => candidate.stage === 'investigate');
  if (!entry) return { status: 'not-run' };
  const analysis = record(entry.data.analysis);
  // An explicit unknown on the current analysis must not fall back to an old
  // numeric default on the surrounding entry (which historically could be 0).
  const tokens = Object.hasOwn(analysis, 'tokensUsed')
    ? tokenCount(analysis.tokensUsed)
    : tokenCount(entry.data.tokensUsed);
  const name = typeof entry.data.reasoner === 'string' ? entry.data.reasoner : '';
  const provider =
    typeof analysis.provider === 'string' &&
    ['ollama', 'openai', 'gemini', 'offline'].includes(analysis.provider)
      ? (analysis.provider as Provider)
      : undefined;

  // Older Gemini results spread the offline baseline, retaining its analysis
  // metadata even when Gemini produced the recommendation. Only per-finding
  // evidence can recover that provenance; a configured reasoner is insufficient.
  if (name === 'gemini-reasoner' && (!provider || provider === 'offline')) {
    const legacyTokens =
      tokenCount(entry.data.tokensUsed) ??
      (provider !== 'offline' ? tokenCount(analysis.tokensUsed) : undefined);
    const comparison = finding.entries.findLast((candidate) => candidate.stage === 'compare');
    const reasoning = comparison?.data.reasoning;
    if (typeof reasoning === 'string' && reasoning.startsWith(LEGACY_GEMINI_FALLBACK)) {
      return {
        status: 'fallback',
        provider: 'gemini',
        tokens: legacyTokens,
        reason: legacyGeminiFailure(reasoning.slice(LEGACY_GEMINI_FALLBACK.length)),
      };
    }
    return {
      status: legacyTokens !== undefined && legacyTokens > 0 ? 'generated' : 'unconfirmed',
      provider: 'gemini',
      tokens: legacyTokens,
    };
  }

  if (
    provider &&
    typeof analysis.status === 'string' &&
    ['generated', 'fallback', 'offline'].includes(analysis.status)
  ) {
    return {
      provider,
      status: analysis.status as RecommendationStatus,
      model: typeof analysis.model === 'string' ? analysis.model : undefined,
      tokens,
      reason:
        typeof analysis.reason === 'string'
          ? Object.hasOwn(FALLBACK_REASONS, analysis.reason)
            ? FALLBACK_REASONS[analysis.reason]
            : 'The model was unavailable; a rule-based recommendation was used.'
          : undefined,
    };
  }

  if (name.startsWith('offline-fallback:')) {
    return {
      status: 'fallback',
      provider: 'openai',
      model: name.slice('offline-fallback:'.length),
      tokens,
    };
  }
  if (
    name.startsWith('openai-responses:') ||
    name.startsWith('ollama:') ||
    name.startsWith('ollama-chat:')
  ) {
    const isLocal = name.startsWith('ollama:') || name.startsWith('ollama-chat:');
    const prefix = isLocal
      ? name.startsWith('ollama-chat:')
        ? 'ollama-chat:'
        : 'ollama:'
      : 'openai-responses:';
    return {
      // Older ledgers recorded the configured engine even when it failed. A run's
      // total tokens cannot establish which individual recommendations used it.
      status: tokens !== undefined && tokens > 0 ? 'generated' : 'unconfirmed',
      provider: isLocal ? 'ollama' : 'openai',
      model: name.slice(prefix.length),
      tokens,
    };
  }
  if (name === 'offline-rule-reasoner')
    return { status: 'offline', provider: 'offline', tokens: tokens ?? 0 };
  return { status: 'unconfirmed', tokens };
}

export function summarizeRecommendationSources(findings: FindingWithEntries[]) {
  const sources = findings.map(sourceFor);
  const count = (status: RecommendationStatus) =>
    sources.filter((source) => source.status === status).length;
  const generated = count('generated');
  const fallback = count('fallback');
  const offline = count('offline');
  const unconfirmed = count('unconfirmed');
  const notRun = count('not-run');
  const generatedProviders = new Set(
    sources.filter((source) => source.status === 'generated').map((source) => source.provider),
  );
  const generatedProvider = [...generatedProviders][0];
  const engine =
    generated > 0
      ? generatedProviders.size > 1
        ? 'Multiple models'
        : generatedProvider
          ? PROVIDER_LABELS[generatedProvider]
          : 'Unconfirmed'
      : fallback > 0
        ? 'Offline fallback'
        : offline > 0
          ? 'Rule-based'
          : unconfirmed > 0
            ? 'Unconfirmed'
            : 'Not run';
  const models = [
    ...new Set(
      sources
        .filter((source) => source.provider && source.provider !== 'offline' && source.model)
        .map((source) => `${PROVIDER_LABELS[source.provider!]}: ${source.model}`),
    ),
  ];
  const reasons = new Map<string, number>();
  for (const source of sources.filter((candidate) => candidate.status === 'fallback')) {
    const message =
      source.reason ??
      'The reason was not recorded. Re-run the analysis for current provider details.';
    reasons.set(message, (reasons.get(message) ?? 0) + 1);
  }
  return {
    engine,
    generated,
    fallback,
    offline,
    unconfirmed,
    notRun,
    models,
    // These providers are recorded in the ledger; this is not a connectivity check.
    providers: [
      ...new Set(sources.flatMap((source) => (source.provider ? [source.provider] : []))),
    ],
    tokens: sources.reduce((sum, source) => sum + (source.tokens ?? 0), 0),
    missingTokenCounts: sources.filter(
      (source) => source.status !== 'not-run' && source.tokens === undefined,
    ).length,
    localAttempted: sources.some((source) => source.provider === 'ollama'),
    reasons: [...reasons.entries()].map(([message, count]) => ({ message, count })),
  };
}
