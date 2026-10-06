import type { DemoCompletion, DemoEvidence, DemoProvider, DemoRecommendation } from './demo-types';

const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions';
const safeTokens = (value: unknown): number | null =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null;

export class DemoModelError extends Error {
  constructor(
    public readonly safeReason: string,
    public readonly tokens: number | null = null,
  ) {
    super(safeReason);
  }
}

/** Fixed official endpoint; no user-controlled URL, prompts, code or uploaded data. */
export function createGeminiDemoProvider(options: {
  apiKey: string;
  model: string;
  fetcher?: typeof fetch;
  timeoutMs?: number;
}): DemoProvider {
  const fetcher = options.fetcher ?? fetch;
  let calls = 0;
  async function request(
    system: string,
    input: unknown,
  ): Promise<{ value: Record<string, unknown>; tokens: number | null }> {
    if (++calls > 9) throw new DemoModelError('The per-action model-call limit was reached.');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 15_000);
    let tokens: number | null = null;
    try {
      const response = await fetcher(ENDPOINT, {
        method: 'POST',
        redirect: 'error',
        signal: controller.signal,
        headers: { Authorization: `Bearer ${options.apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: options.model,
          temperature: 0,
          max_tokens: 1024,
          reasoning_effort: 'low',
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: JSON.stringify(input) },
          ],
        }),
      });
      if (!response.ok) {
        const reason =
          response.status === 401 || response.status === 403
            ? 'Gemini rejected the credentials or model access. Check the server configuration.'
            : response.status === 429
              ? 'Gemini quota or rate limit reached. No automatic retry was made.'
              : response.status === 404
                ? 'The configured Gemini model is unavailable.'
                : response.status === 400
                  ? 'Gemini rejected the request parameters. Check model compatibility. No automatic retry was made.'
                  : response.status >= 500
                    ? 'Gemini reported a service error. No automatic retry was made.'
                    : 'Gemini could not complete the request. No automatic retry was made.';
        // Error response bodies may contain request/account data; never save or echo them.
        await response.body?.cancel();
        throw new DemoModelError(reason);
      }
      const payload = await response.json();
      tokens = safeTokens(payload?.usage?.total_tokens);
      const choice = payload?.choices?.[0];
      if (
        choice?.finish_reason !== 'stop' ||
        choice?.message?.refusal ||
        typeof choice?.message?.content !== 'string'
      ) {
        throw new DemoModelError(
          'Gemini returned an incomplete answer; reported usage is retained.',
          tokens,
        );
      }
      const content = choice.message.content;
      if (content.length > 12_000)
        throw new DemoModelError('Gemini output exceeded the demo limit.', tokens);
      const value: unknown = JSON.parse(content);
      if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('shape');
      return { value: value as Record<string, unknown>, tokens };
    } catch (error) {
      if (error instanceof DemoModelError) throw error;
      throw new DemoModelError(
        controller.signal.aborted
          ? 'Gemini timed out. No automatic retry was made.'
          : tokens !== null
            ? 'Gemini returned invalid JSON; reported usage is retained.'
            : 'Could not complete the Gemini request. Check connectivity and server configuration.',
        tokens,
      );
    } finally {
      clearTimeout(timer);
    }
  }
  const fallback = (reason: string, tokens: number | null): Omit<DemoRecommendation, 'digest'> => ({
    strategy: 'exact-match-cache',
    title: 'Reuse answers for repeated public questions',
    explanation:
      'Cache only identical public requests within this synthetic replay. Always bypass user-specific requests.',
    source: 'fallback',
    model: options.model,
    tokens,
    risk: 'Stale answers or shared personal information if the cache scope is broadened.',
    confidence: 'Rule-supported for this fixed synthetic workload only.',
    fallbackReason: reason,
  });
  return {
    mode: 'gemini',
    model: options.model,
    async complete(item): Promise<DemoCompletion> {
      try {
        const result = await request(
          'You answer a fictional support FAQ. Use the supplied synthetic knowledge verbatim. Return only JSON {"answer":"the exact supplied knowledge text"}. No tools or additional text.',
          { question: item.prompt, knowledge: item.expectedAnswer },
        );
        return {
          answer:
            typeof result.value.answer === 'string' && result.value.answer.length <= 500
              ? result.value.answer
              : '[Invalid answer]',
          tokens: result.tokens,
        };
      } catch (error) {
        // Validation failures retain billed usage and fail the quality check; no fixture substitution.
        if (error instanceof DemoModelError && error.tokens !== null)
          return { answer: '[Invalid model response]', tokens: error.tokens };
        throw error;
      }
    },
    async recommend(evidence: DemoEvidence) {
      try {
        const result = await request(
          'You advise on a fixed synthetic cache experiment. Return JSON with strategy:"exact-match-cache", explanation:string (one concise sentence), risk:string. Only recommend caching identical public prompts. Exclude private and changing data. No code, no internal reasoning, no claims of measured carbon savings.',
          evidence,
        );
        const { strategy, explanation, risk } = result.value;
        if (
          strategy !== 'exact-match-cache' ||
          typeof explanation !== 'string' ||
          explanation.length < 10 ||
          explanation.length > 600 ||
          typeof risk !== 'string' ||
          risk.length < 5 ||
          risk.length > 400
        ) {
          return fallback('The model recommendation failed validation.', result.tokens);
        }
        return {
          strategy,
          title: 'Reuse answers for repeated public questions',
          explanation,
          source: 'model',
          model: options.model,
          tokens: result.tokens,
          risk,
          confidence: 'Supported by the replay evidence; limited to this synthetic workload.',
        };
      } catch (error) {
        return fallback(
          error instanceof DemoModelError ? error.safeReason : 'Model advice was unavailable.',
          error instanceof DemoModelError ? error.tokens : null,
        );
      }
    },
  };
}
