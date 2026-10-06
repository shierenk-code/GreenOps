import { createServer } from 'node:http';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type OpenAI from 'openai';
import type { SustainabilityBug } from '@greenops/detect';
import { createReasonerFromEnv } from '../src/openai-reasoner.js';
import { OllamaReasoner } from '../src/ollama-reasoner.js';
import { PolicyApprover } from '../src/offline-reasoner.js';

const bug: SustainabilityBug = {
  id: 'private-id',
  category: 'ai-retry-storm',
  severity: 'high',
  title: 'Sensitive call title',
  rationale: 'Sensitive rationale',
  location: { filePath: 'private/usage.json', startLine: 1, endLine: 1 },
  evidence: {
    retries: 5,
    tokensPerAttempt: 1500,
    promptFingerprint: 'abc123def456',
    prompt: 'sensitive raw prompt',
    arbitrary: 'sensitive arbitrary evidence',
  },
  estimatedWaste: {
    metric: 'tokens.avoided',
    perRun: 7500,
    unit: 'tokens',
    assumptions: ['private assumption'],
  },
};

function guidance() {
  return {
    rootCause: 'Retries repeatedly process the same input.',
    strategies: [
      {
        id: 'backoff-circuit-breaker',
        title: 'Bound retries',
        description:
          'Use jittered backoff, retry transient errors only, and enforce a three-attempt budget.',
        expectedReductionFactor: 0.8,
        effort: 'small',
        reversible: true,
      },
    ],
    recommendedStrategyId: 'backoff-circuit-breaker',
    reasoning:
      'Five retries process 1,500 tokens each; confirm reduced attempts after a controlled change.',
  };
}

function completion(content = JSON.stringify(guidance()), finishReason = 'stop') {
  return {
    choices: [{ index: 0, finish_reason: finishReason, message: { role: 'assistant', content } }],
    usage: { prompt_tokens: 100, completion_tokens: 23, total_tokens: 123 },
  };
}

function mocked(create = vi.fn().mockResolvedValue(completion())) {
  return {
    create,
    reasoner: new OllamaReasoner({
      client: { chat: { completions: { create } } } as unknown as OpenAI,
    }),
  };
}

afterEach(() => vi.unstubAllEnvs());

describe('OllamaReasoner', () => {
  it('generates local guidance with per-finding provenance and minimized evidence', async () => {
    const { create, reasoner } = mocked();
    const result = await reasoner.investigate(bug);
    expect(result.analysis).toEqual({
      provider: 'ollama',
      model: 'gpt-oss:20b',
      status: 'generated',
      tokensUsed: 123,
      requestAttempted: true,
    });
    expect(result.tokensUsed).toBe(123);
    expect(reasoner.name).toBe('ollama-chat:gpt-oss:20b');
    const request = create.mock.calls[0]?.[0];
    expect(request.response_format.type).toBe('json_schema');
    const payload = JSON.parse(request.messages[1].content);
    expect(payload.evidence).toEqual({
      retries: 5,
      tokensPerAttempt: 1500,
      promptFingerprint: 'abc123def456',
    });
    for (const secret of ['sensitive', 'Sensitive', 'private', 'arbitrary']) {
      expect(JSON.stringify(request)).not.toContain(secret);
    }
  });

  it('keeps non-AI findings offline', async () => {
    const { create, reasoner } = mocked();
    const result = await reasoner.investigate({ ...bug, category: 'duplicate-import' });
    expect(create).not.toHaveBeenCalled();
    expect(result.analysis).toEqual({
      provider: 'offline',
      status: 'offline',
      tokensUsed: 0,
      requestAttempted: false,
    });
    expect(reasoner.name).toBe('offline-rule-reasoner');
  });

  it.each([
    [
      'connection',
      Object.assign(new Error('secret provider response'), { name: 'APIConnectionError' }),
    ],
    [
      'timeout',
      Object.assign(new Error('secret provider response'), { name: 'APIConnectionTimeoutError' }),
    ],
    ['missing model', Object.assign(new Error('secret provider response'), { status: 404 })],
  ])(
    'opens a per-instance circuit after %s failure without leaking provider errors',
    async (_label, error) => {
      const { create, reasoner } = mocked(vi.fn().mockRejectedValue(error));
      const first = await reasoner.investigate(bug);
      const second = await reasoner.investigate(bug);
      expect(create).toHaveBeenCalledTimes(1);
      expect(first.analysis?.status).toBe('fallback');
      expect(second.analysis?.reason).toBe(first.analysis?.reason);
      expect(first.tokensUsed).toBeNull();
      expect(first.analysis?.requestAttempted).toBe(true);
      expect(second.tokensUsed).toBe(0);
      expect(second.analysis?.requestAttempted).toBe(false);
      expect(JSON.stringify(first)).not.toContain('secret provider response');
    },
  );

  it.each([
    ['invalid JSON', '{broken'],
    ['null', 'null'],
    ['missing root cause', JSON.stringify({ ...guidance(), rootCause: '' })],
    [
      'unknown strategy',
      JSON.stringify({
        ...guidance(),
        strategies: [{ ...guidance().strategies[0], id: 'delete-everything' }],
      }),
    ],
    [
      'wrong recommendation',
      JSON.stringify({ ...guidance(), recommendedStrategyId: 'delete-everything' }),
    ],
    [
      'invalid reduction',
      JSON.stringify({
        ...guidance(),
        strategies: [{ ...guidance().strategies[0], expectedReductionFactor: 2 }],
      }),
    ],
    [
      'missing reversibility',
      JSON.stringify({
        ...guidance(),
        strategies: [{ ...guidance().strategies[0], reversible: undefined }],
      }),
    ],
    [
      'duplicate strategy',
      JSON.stringify({
        ...guidance(),
        strategies: [guidance().strategies[0], guidance().strategies[0]],
      }),
    ],
    ['injected property', JSON.stringify({ ...guidance(), analysis: { status: 'generated' } })],
  ])('rejects %s while accounting for consumed model tokens', async (_label, content) => {
    const { reasoner } = mocked(vi.fn().mockResolvedValue(completion(content)));
    const result = await reasoner.investigate(bug);
    expect(result.tokensUsed).toBe(123);
    expect(result.analysis).toMatchObject({ status: 'fallback', tokensUsed: 123 });
    expect(result.analysis?.reason).toContain('structured validation');
    expect(result.recommendedStrategyId).toBe('backoff-circuit-breaker');
  });

  it.each([
    'requires more system memory',
    'out of memory',
    'unable to allocate',
    'not enough memory',
  ])(
    'reports %s without exposing provider error details or repeatedly retrying',
    async (phrase) => {
      const error = Object.assign(
        new Error(`private-server-path: ${phrase}; private-request-data`),
        { status: 500 },
      );
      const { create, reasoner } = mocked(vi.fn().mockRejectedValue(error));
      const result = await reasoner.investigate(bug);
      await reasoner.investigate(bug);
      expect(result.analysis?.reason).toBe(
        'Local model could not load because there is not enough memory; free memory or use a larger machine.',
      );
      expect(result.analysis?.status).toBe('fallback');
      expect(JSON.stringify(result)).not.toContain('private-server-path');
      expect(JSON.stringify(result)).not.toContain('private-request-data');
      expect(create).toHaveBeenCalledTimes(1);
    },
  );

  it('rejects truncated output even if its content happens to be valid JSON', async () => {
    const { reasoner } = mocked(
      vi.fn().mockResolvedValue(completion(JSON.stringify(guidance()), 'length')),
    );
    expect((await reasoner.investigate(bug)).analysis).toMatchObject({
      status: 'fallback',
      tokensUsed: 123,
    });
  });

  it('does not let model-supplied effort or estimates relax approval policy', async () => {
    const content = {
      ...guidance(),
      strategies: [{ ...guidance().strategies[0], effort: 'trivial', expectedReductionFactor: 1 }],
    };
    const { reasoner } = mocked(vi.fn().mockResolvedValue(completion(JSON.stringify(content))));
    const result = await reasoner.investigate(bug);
    expect(result.strategies[0]?.effort).toBe('small');
    expect(result.strategies[0]?.expectedReductionFactor).toBe(0.8);
    expect((await new PolicyApprover().decide(bug, result)).approved).toBe(false);
  });

  it('uses only the local endpoint and dummy auth, ignoring inherited cloud credentials', async () => {
    vi.stubEnv('OPENAI_API_KEY', 'test-cloud-secret');
    vi.stubEnv('OPENAI_ORG_ID', 'test-private-org');
    vi.stubEnv('OPENAI_PROJECT_ID', 'test-private-project');
    vi.stubEnv('OPENAI_BASE_URL', 'https://example.invalid/v1');
    let received: { url?: string; headers: Record<string, unknown>; body: string } | undefined;
    const server = createServer(async (req, res) => {
      let body = '';
      for await (const part of req) body += part.toString();
      received = { url: req.url, headers: req.headers, body };
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify(completion()));
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Local test listener failed.');
    try {
      const reasoner = new OllamaReasoner({ baseURL: `http://127.0.0.1:${address.port}/v1` });
      const result = await reasoner.investigate(bug);
      expect(result.analysis?.status).toBe('generated');
      expect(received?.url).toBe('/v1/chat/completions');
      expect(received?.headers.authorization).toBe('Bearer ollama');
      expect(JSON.stringify(received)).not.toContain('test-cloud-secret');
      expect(JSON.stringify(received)).not.toContain('test-private-');
    } finally {
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    }
  });

  it('does not follow redirects from the local service', async () => {
    let requests = 0;
    const server = createServer((_req, res) => {
      requests++;
      res.writeHead(302, { Location: '/redirect-target' });
      res.end();
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Local test listener failed.');
    try {
      const reasoner = new OllamaReasoner({ baseURL: `http://127.0.0.1:${address.port}/v1` });
      const result = await reasoner.investigate(bug);
      await reasoner.investigate(bug);
      expect(result.analysis?.status).toBe('fallback');
      expect(requests).toBe(1);
    } finally {
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    }
  });
});

describe('provider selection and configuration', () => {
  it('preserves auto-selection but allows explicit offline and key-free Ollama overrides', () => {
    expect(createReasonerFromEnv({}).name).toBe('offline-rule-reasoner');
    expect(createReasonerFromEnv({ OPENAI_API_KEY: 'test-key' }).name).toBe(
      'openai-responses:gpt-5',
    );
    expect(
      createReasonerFromEnv({ GREENOPS_LLM_PROVIDER: 'offline', OPENAI_API_KEY: 'test-key' }).name,
    ).toBe('offline-rule-reasoner');
    expect(createReasonerFromEnv({ GREENOPS_LLM_PROVIDER: 'ollama' }).name).toBe(
      'ollama-chat:gpt-oss:20b',
    );
    expect(
      createReasonerFromEnv({
        GREENOPS_LLM_PROVIDER: 'ollama',
        OLLAMA_MODEL: 'local-model',
        OPENAI_API_KEY: 'test-key',
      }).name,
    ).toBe('ollama-chat:local-model');
  });

  it('fails explicitly for invalid provider configuration without echoing values', () => {
    expect(() => createReasonerFromEnv({ GREENOPS_LLM_PROVIDER: 'secret-unsupported' })).toThrow(
      'GREENOPS_LLM_PROVIDER must be',
    );
    expect(() => createReasonerFromEnv({ GREENOPS_LLM_PROVIDER: 'openai' })).toThrow(
      'OPENAI_API_KEY is required',
    );
    for (const value of ['0', '999', '300001', 'NaN', '1000.5']) {
      expect(() =>
        createReasonerFromEnv({ GREENOPS_LLM_PROVIDER: 'ollama', OLLAMA_TIMEOUT_MS: value }),
      ).toThrow('OLLAMA_TIMEOUT_MS must be');
    }
    for (const baseURL of [
      'https://remote.example/v1',
      'http://user:secret@localhost:11434/v1',
      'http://localhost:11434/v1?key=secret',
    ]) {
      expect(() => new OllamaReasoner({ baseURL })).toThrow('OLLAMA_BASE_URL must be');
    }
  });

  it.each([
    'gpt-oss:120b-cloud',
    'gpt-oss:cloud',
    'remote-cloud',
    'remote-cloud:latest',
    'remote:CLOUD',
  ])('rejects known cloud model tag %s without echoing configuration', (model) => {
    expect(() => new OllamaReasoner({ model })).toThrow(
      'OLLAMA_MODEL must select a local model; cloud model tags are not supported.',
    );
  });
});
