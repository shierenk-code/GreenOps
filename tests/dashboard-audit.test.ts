import { describe, expect, it } from 'vitest';
import {
  applicationFor,
  buildFindingAudit,
  buildRunAudit,
  decisionFor,
  evidenceFor,
  resolveRecordedRecommendation,
  safeAuditText,
  verificationFor,
} from '../apps/CodeVitals-MCP/website/src/app/dashboard/dashboard-audit.js';
import type { Finding } from '../apps/CodeVitals-MCP/website/src/app/dashboard/ledger-dashboard.js';
import type {
  LedgerEntry,
  LedgerStage,
  SelectedRun,
} from '../apps/CodeVitals-MCP/website/src/app/dashboard/ledger-data.js';

const entry = (stage: LedgerStage, data: Record<string, unknown> = {}, seq = 1): LedgerEntry => ({
  stage,
  data,
  seq,
  runId: 'r1',
  bugId: 'f1',
  timestamp: '2026-10-03T12:00:00Z',
  summary: 'RAW_INTERNAL_SUMMARY',
});
const finding = (entries: LedgerEntry[] = [], changes: Partial<Finding> = {}): Finding => ({
  bugId: 'f1',
  agentId: 'ai-efficiency',
  agentName: 'AI Efficiency',
  category: 'ai-retry-storm',
  severity: 'high',
  title: 'Five retry attempts',
  state: 'withheld',
  confidence: 'high',
  effort: 'small',
  recommendationId: 'backoff-circuit-breaker',
  recommendationTitle: 'Bound retries',
  recommendation: 'Use a bounded retry budget and test recovery.',
  expectedReductionFactor: 0.8,
  reversible: true,
  impactEnergyKwh: 10,
  impactCarbonKg: 4,
  entries,
  ...changes,
});
const run = (entries: LedgerEntry[] = []): SelectedRun => ({
  runId: 'r1',
  timestamp: '',
  kind: 'in-progress',
  entries,
});

describe('Dashboard recorded recommendation selection', () => {
  const candidate = {
    id: 'bound-retries',
    title: 'Bound retries',
    description: 'Set a retry budget.',
    effort: 'small',
  };

  it.each([undefined, '', 'missing-option'])(
    'does not promote the first candidate when the recommendation is %s',
    (recommended) => {
      const result = resolveRecordedRecommendation([
        entry('compare', { strategies: [candidate], recommended }),
      ]);
      expect(result.strategy).toEqual({});
      expect(result.recommendedId).toBe(recommended ?? '');
      expect(result.title).toBe(
        recommended ? 'Recommended option details not recorded' : 'No recommended option recorded',
      );
      expect(result.description).not.toContain(candidate.description);
    },
  );

  it('resolves the explicitly selected option even when it is not first', () => {
    const result = resolveRecordedRecommendation([
      entry('compare', {
        recommended: candidate.id,
        strategies: [{ id: 'other', title: 'Unselected option' }, candidate],
      }),
    ]);
    expect(result).toEqual({
      strategy: candidate,
      recommendedId: candidate.id,
      title: candidate.title,
      description: candidate.description,
    });
  });

  it('preserves review-ledger recommendation text and fix ID without inventing an option', () => {
    expect(
      resolveRecordedRecommendation([
        entry('compare', {
          recommendation: 'Merge the duplicate imports.',
          fix: { strategyId: 'merge-imports', reversible: true },
        }),
      ]),
    ).toEqual({
      strategy: {},
      recommendedId: 'merge-imports',
      title: 'Recorded recommendation',
      description: 'Merge the duplicate imports.',
    });
  });

  it('keeps absent recommendation data explicitly unknown', () => {
    expect(resolveRecordedRecommendation([])).toEqual({
      strategy: {},
      recommendedId: '',
      title: 'No recommended option recorded',
      description: 'A recommendation was not recorded.',
    });
  });
});

describe('Dashboard audit approval provenance', () => {
  it('does not turn missing data into approval or a human decision', () => {
    expect(decisionFor([])).toMatchObject({
      kind: 'missing',
      approved: null,
      humanRecorded: false,
    });
    expect(decisionFor([entry('approve')])).toMatchObject({
      kind: 'unattributed',
      approved: null,
      humanRecorded: false,
    });
  });
  it.each(['policy-approver', 'auto-approver'])(
    'does not claim human approval for %s',
    (approver) => {
      const decision = decisionFor([
        entry('approve', { approved: true, approver, reason: 'Human-approved in raw prose' }),
      ]);
      expect(decision.approved).toBe(true);
      expect(decision.humanRecorded).toBe(false);
      expect(decision.kind).toBe(approver === 'policy-approver' ? 'policy' : 'automatic');
      expect(decision.detail).toContain('not a human approval');
    },
  );
  it('keeps arbitrary approver names unattributed without a structured actor discriminator', () => {
    const decision = decisionFor([
      entry('approve', {
        approved: true,
        approver: 'Human Reviewer',
        reason: 'Approved by a human',
      }),
    ]);
    expect(decision).toMatchObject({ kind: 'unattributed', approved: true, humanRecorded: false });
    expect(JSON.stringify(decision)).not.toContain('Human Reviewer');
  });
  it('uses the latest recorded decision and does not treat withholding as application', () => {
    const entries = [
      entry('approve', { approved: true, approver: 'auto-approver' }),
      entry('approve', { approved: false, approver: 'policy-approver' }, 2),
    ];
    expect(decisionFor(entries).approved).toBe(false);
    expect(applicationFor(entries).state).toBe('not-recorded');
  });
});

describe('Dashboard audit stage evidence', () => {
  it('distinguishes missing, attempted, applied, and sandbox application', () => {
    expect(applicationFor([]).state).toBe('not-recorded');
    expect(applicationFor([entry('improve')]).state).toBe('unknown');
    expect(applicationFor([entry('improve', { applied: false })]).state).toBe('not-applied');
    expect(applicationFor([entry('improve', { applied: true, mode: 'sandbox' })])).toMatchObject({
      state: 'applied',
      label: 'Applied in a sandbox',
    });
    expect(applicationFor([entry('improve', { applied: true })]).detail).toContain(
      'not established',
    );
  });
  it('does not equate a verification stage with success or metered energy', () => {
    expect(verificationFor([]).state).toBe('not-recorded');
    expect(verificationFor([entry('verify')]).state).toBe('unknown');
    expect(verificationFor([entry('verify', { confirmed: false })]).state).toBe('failed');
    const verified = verificationFor([
      entry('verify', {
        confirmed: true,
        measurementBasis: 'observed-redetection+estimated-conversion',
      }),
    ]);
    expect(verified.state).toBe('confirmed');
    expect(verified.detail).toContain('model-based estimates');
  });
  it('only displays allowlisted evidence fields and strips directory paths', () => {
    const evidence = evidenceFor([
      entry('detect', {
        location: {
          filePath: 'C:\\Users\\private-user\\repo\\trace.json',
          startLine: 3,
          symbol: 'worker-1',
        },
        evidence: {
          retries: 5,
          wastedTokens: 7500,
          status: 'ok',
          token: 'secret-value',
          prompt: 'private customer prompt',
          retryBackoffMs: 0,
          rawReasoning: 'private thoughts',
          arbitrary: { nested: 'hidden' },
        },
      }),
    ]);
    expect(evidence).toContainEqual({ label: 'Source file', value: 'trace.json' });
    expect(evidence).toContainEqual({ label: 'Recorded retry attempts', value: '5' });
    expect(evidence).toContainEqual({ label: 'Recorded request status', value: 'ok' });
    for (const hidden of [
      'private-user',
      'secret-value',
      'customer prompt',
      'private thoughts',
      'nested',
    ]) {
      expect(JSON.stringify(evidence)).not.toContain(hidden);
    }
  });
  it('does not coerce strings, non-finite metrics, or arbitrary status text into evidence', () => {
    expect(
      evidenceFor([
        entry('detect', {
          evidence: {
            retries: '5',
            wastedTokens: Infinity,
            maxTokens: -1,
            status: 'private response',
            attached: 'false',
          },
        }),
      ]),
    ).toEqual([{ label: 'Storage attached', value: 'No' }]);
  });
  it('distinguishes output allowance from consumed tokens', () => {
    expect(evidenceFor([entry('detect', { evidence: { wastedHeadroom: 1985 } })])[0].label).toBe(
      'Unused allowance (not consumed tokens)',
    );
  });
  it('never returns raw summaries, root-cause reasoning, JSON payloads, or raw fallback errors', () => {
    const audit = buildFindingAudit(
      finding([
        entry('detect', { evidence: { retries: 5, prompt: 'PRIVATE_PROMPT' } }),
        entry(
          'investigate',
          {
            rootCause: 'PRIVATE_CHAIN_OF_THOUGHT',
            analysis: { provider: 'gemini', status: 'fallback', reason: 'PRIVATE_RAW_ERROR' },
          },
          2,
        ),
        entry(
          'compare',
          {
            reasoning: 'PRIVATE_RAW_REASONING',
            rawResponse: 'PRIVATE_PROVIDER_RESPONSE',
            strategies: [],
          },
          3,
        ),
      ]),
    );
    expect(audit.source).toEqual({
      label: 'Rule-based fallback',
      generated: false,
      fallback: true,
    });
    expect(audit.activity[1].detail).toContain('fallback');
    expect(audit.recommendation.description).toBe('Use a bounded retry budget and test recovery.');
    for (const hidden of [
      'RAW_INTERNAL_SUMMARY',
      'PRIVATE_',
      'rawResponse',
      'reasoning',
      'rootCause',
    ]) {
      expect(JSON.stringify(audit)).not.toContain(hidden);
    }
  });
  it('uses a generic failure result instead of leaking an exception', () => {
    const audit = buildFindingAudit(
      finding([entry('investigate', { error: 'PRIVATE_EXCEPTION token=abc' })]),
    );
    expect(audit.activity[0].detail).toContain('Analysis failed');
    expect(JSON.stringify(audit)).not.toContain('PRIVATE_EXCEPTION');
  });
  it('uses legacy comparison provenance consistently in finding and run activity', () => {
    const entries = [
      entry('investigate', { reasoner: 'gemini-reasoner', tokensUsed: 17 }),
      entry(
        'compare',
        {
          reasoning: 'Gemini unavailable; used the offline reasoner. PRIVATE_RAW_ERROR',
        },
        2,
      ),
    ];
    const currentFinding = finding(entries);
    const findingAudit = buildFindingAudit(currentFinding);
    const runAudit = buildRunAudit([currentFinding], run(entries));
    expect(findingAudit.source.fallback).toBe(true);
    expect(findingAudit.activity[0].detail).toBe('Rule-based fallback was used for this finding.');
    expect(runAudit.events[0].detail).toBe(findingAudit.activity[0].detail);
    expect(JSON.stringify([findingAudit, runAudit])).not.toContain('PRIVATE_RAW_ERROR');
  });
  it('does not borrow provenance from a later analysis attempt or another finding', () => {
    const entries = [
      entry('investigate', { reasoner: 'gemini-reasoner', tokensUsed: 17 }),
      entry('compare', { reasoning: 'Generated guidance.' }, 2),
      entry('investigate', { reasoner: 'gemini-reasoner', tokensUsed: 8 }, 3),
      entry(
        'compare',
        {
          reasoning: 'Gemini unavailable; used the offline reasoner. PRIVATE_RAW_ERROR',
        },
        4,
      ),
    ];
    const another = [
      { ...entry('investigate', { reasoner: 'gemini-reasoner', tokensUsed: 11 }, 5), bugId: 'f2' },
      { ...entry('compare', { reasoning: 'Generated guidance.' }, 6), bugId: 'f2' },
    ];
    const findingAudit = buildFindingAudit(finding(entries));
    expect(findingAudit.activity[0].detail).toBe(
      'A model-generated recommendation analysis was recorded.',
    );
    expect(findingAudit.activity[2].detail).toBe('Rule-based fallback was used for this finding.');
    const runAudit = buildRunAudit(
      [finding(entries), finding(another, { bugId: 'f2' })],
      run([...entries, ...another]),
    );
    expect(runAudit.events[0].detail).toBe(findingAudit.activity[0].detail);
    expect(runAudit.events[2].detail).toBe(findingAudit.activity[2].detail);
    expect(runAudit.events[4].detail).toBe(findingAudit.activity[0].detail);
  });
  it('keeps missing timestamps unknown', () => {
    const audit = buildFindingAudit(finding([{ ...entry('detect'), timestamp: 'not-a-date' }]));
    expect(audit.activity[0].timestamp).toBeNull();
  });
  it('redacts credentials in intended public text without reading raw model reasoning', () => {
    const text = safeAuditText(
      'See https://host/path?key=private and api_key=private Bearer private sk-secret',
      'None',
    );
    expect(text).not.toContain('private');
    expect(text).not.toContain('sk-secret');
    expect(safeAuditText(null, 'Not recorded')).toBe('Not recorded');
  });
});

describe('Dashboard run audit limitations', () => {
  it('keeps absent counts unknown and does not fabricate healthy agents', () => {
    const audit = buildRunAudit([], null);
    expect(audit.status).toBe('No recorded run');
    expect(audit.toolCalls).toBeNull();
    expect(audit.retries).toBeNull();
    expect(audit.groups).toEqual([]);
    expect(audit.events).toEqual([]);
  });
  it('labels groups as inferred and shows only aggregate tool usage', () => {
    const entries = [
      entry('detect'),
      entry('investigate', { analysis: { provider: 'gemini', status: 'generated' } }, 2),
    ];
    const current = run(entries);
    current.outcome = {
      runId: 'r1',
      startedAt: '',
      finishedAt: '',
      bugsDetected: 1,
      bugsImproved: 0,
      savings: { energyKwh: 0, carbonKgCo2e: 0 },
      selfCost: { energyKwh: 1, carbonKgCo2e: 1, tokens: 20, toolCalls: 47, retries: 0 },
      net: { energyKwh: -1, carbonKgCo2e: -1, netPositive: false },
    };
    const audit = buildRunAudit([finding(entries)], current);
    expect(audit.toolCalls).toBe(47);
    expect(audit.retries).toBe(0);
    expect(audit.groupingBasis).toContain('Inferred');
    expect(audit.groupingBasis).toContain('no delegation event log');
    expect(audit.toolEvidence).toContain('Only run-level totals');
    expect(audit.groups[0]).toMatchObject({ findings: 1, applied: 0, verified: 0 });
    expect(audit.events.map((event) => event.stage)).toEqual(['detect', 'investigate']);
    expect(JSON.stringify(audit)).not.toContain('RAW_INTERNAL_SUMMARY');
  });
  it('counts unique findings per stage and excludes findings from other runs', () => {
    const current = run([entry('detect'), entry('detect', {}, 2)]);
    const another = finding([{ ...entry('detect'), runId: 'r2' }], { agentId: 'architecture' });
    const audit = buildRunAudit([finding(current.entries), another], current);
    expect(audit.groups).toHaveLength(1);
    expect(audit.stages.find((stage) => stage.stage === 'detect')?.findings).toBe(1);
    expect(audit.status).toBe('No completion record');
  });
});
