import { describe, expect, it } from 'vitest';
import {
  aiInsights,
  findingInsights,
  benefitFor,
} from '../apps/CodeVitals-MCP/website/src/app/dashboard/control-plane/agent-insights';
import {
  buildRecordedData,
  findingsFromRun,
} from '../apps/CodeVitals-MCP/website/src/app/dashboard/control-plane/data';
import type {
  LedgerEntry,
  SelectedRun,
} from '../apps/CodeVitals-MCP/website/src/app/dashboard/ledger-data';

function fromEvidence(rows: Array<{ category: string; evidence: Record<string, unknown> }>) {
  const timestamp = '2026-10-07T00:00:00.000Z';
  const run: SelectedRun = {
    runId: 'test-ai',
    kind: 'run',
    timestamp,
    entries: rows.map((row, i): LedgerEntry => ({
      runId: 'test-ai',
      bugId: `finding-${i}`,
      seq: 1,
      stage: 'detect',
      timestamp,
      summary: row.category,
      data: {
        ...row,
        agentId: 'ai-efficiency',
        location: { filePath: 'subscription.json', symbol: 'app' },
      },
    })),
  };
  return buildRecordedData(run, findingsFromRun(run), 'All', '30d').opportunities;
}

describe('AI specialist insights', () => {
  it('shows a carbon benefit when a region change leaves energy unchanged', () => {
    const items = fromEvidence([
      {
        category: 'high-carbon-region',
        evidence: { savingKwh: 0, savingKgCo2e: 2.5, periodHours: 720 },
      },
    ]);
    expect(benefitFor(items[0]).value).toBe('2.5 kg CO₂e / 720 h');
  });
  it('deduplicates workload request totals and does not sum overlapping token options', () => {
    const items = fromEvidence([
      {
        category: 'uncached-completion',
        evidence: {
          workload: 'helpdesk',
          requests: 1000,
          avoidableRequests: 200,
          tokensPerRequest: 100,
          periodHours: 720,
        },
      },
      {
        category: 'prompt-overhead',
        evidence: { workload: 'helpdesk', requests: 1000, removableTokens: 6000, periodHours: 720 },
      },
      {
        category: 'uncached-completion',
        evidence: { workload: 'catalog', requests: 500, wastedTokens: 3000, periodHours: 720 },
      },
    ]);
    const result = aiInsights(items);
    expect(result.requests).toBe(1500);
    expect(result.largestOpportunity).toBe(20000);
    expect(result.chart.points).toEqual([
      { label: 'helpdesk', primary: 20000 },
      { label: 'catalog', primary: 3000 },
    ]);
    expect(benefitFor(items[0]).value).toBe('20,000 tokens / 720 h');
  });
  it('never converts unused output allowance or model tier changes into avoided tokens', () => {
    const items = fromEvidence([
      {
        category: 'oversized-token-request',
        evidence: { workload: 'app', wastedHeadroom: 8000, wastedTokens: 8000 },
      },
      {
        category: 'model-tier-mismatch',
        evidence: { workload: 'app', savingKwh: 2.1, periodHours: 720 },
      },
    ]);
    expect(aiInsights(items).largestOpportunity).toBeNull();
    expect(aiInsights(items).requests).toBeNull();
    expect(benefitFor(items[0]).value).toContain('not consumed-token savings');
    expect(benefitFor(items[1]).value).toBe('2.1 kWh / 720 h');
  });
  it('keeps missing, malformed and contradictory requests unknown', () => {
    const items = fromEvidence([
      {
        category: 'uncached-completion',
        evidence: { workload: 'app', requests: 100, wastedTokens: -20 },
      },
      {
        category: 'prompt-overhead',
        evidence: { workload: 'app', requests: 500, removableTokens: '500' },
      },
      { category: 'uncached-completion', evidence: { requests: 600, wastedTokens: NaN } },
    ]);
    expect(aiInsights(items).requests).toBeNull();
    expect(aiInsights(items).largestOpportunity).toBeNull();
    expect(aiInsights(items).chart.points).toEqual([]);
  });
  it('preserves explicit zero and keeps legacy request groups out of workload totals', () => {
    const items = fromEvidence([
      {
        category: 'uncached-completion',
        evidence: { workload: 'app', requests: 0, wastedTokens: 0 },
      },
      { category: 'uncached-completion', evidence: { requests: 10, wastedTokens: 30 } },
    ]);
    expect(aiInsights(items).requests).toBe(0);
    expect(items[0].aiUsage?.avoidableTokens).toBe(0);
    expect(items[1].aiUsage?.requests).toBeNull();
  });
});
