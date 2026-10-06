import { describe, expect, it } from 'vitest';
import {
  buildRecordedData,
  buildSampleData,
  findingsFromRun,
} from '../apps/CodeVitals-MCP/website/src/app/dashboard/control-plane/data';
import type {
  LedgerEntry,
  SelectedRun,
} from '../apps/CodeVitals-MCP/website/src/app/dashboard/ledger-data';
import type {
  AgentKey,
  TimeRange,
} from '../apps/CodeVitals-MCP/website/src/app/dashboard/control-plane/types';

const timestamp = '2026-10-04T12:00:00.000Z';
function detection(id = 'finding-1', environment?: string, at = timestamp): LedgerEntry {
  return {
    runId: 'selected',
    bugId: id,
    seq: 1,
    stage: 'detect',
    timestamp: at,
    summary: 'Repeated request in prod-service',
    data: {
      agentId: 'ai-efficiency',
      category: 'uncached-completion',
      severity: 'high',
      confidence: 'high',
      evidence: { wastedTokens: 300, promptTokens: 100, completionTokens: 50, environment },
      location: { filePath: 'fixtures/usage.json', symbol: 'prod-service' },
    },
  };
}
function entry(stage: LedgerEntry['stage'], data: Record<string, unknown>, seq = 2): LedgerEntry {
  return {
    ...detection(),
    stage,
    data,
    seq,
    summary: 'Raw internal reasoning should not be shown',
  };
}
const run = (entries: LedgerEntry[]): SelectedRun => ({
  runId: 'selected',
  entries,
  timestamp,
  kind: 'run',
});
const dataFor = (selectedRun: SelectedRun) =>
  buildRecordedData(selectedRun, findingsFromRun(selectedRun), 'All', '30d');

describe('control-plane recorded data adapter', () => {
  it('has empty truthful workspaces without a loaded run', () => {
    const data = buildRecordedData(null, [], 'All', '30d');
    expect(data.mode).toBe('recorded');
    expect(data.runId).toBeNull();
    expect(data.agents.map((agent) => agent.key)).toEqual([
      'carbon',
      'waste',
      'ai',
      'arch',
      'dr',
      'collab',
      'pipeline',
    ]);
    expect(
      data.agents.every(
        (agent) =>
          agent.rows.length === 0 && agent.savingsMonthly === null && agent.roiPercent === null,
      ),
    ).toBe(true);
    expect(data.trend.points).toEqual([]);
    expect(data.selfAudit[0].value).toBe('Total unknown');
    expect(data.filterNote).toContain('No saved run');
  });

  it('binds findings to the selected run and ignores orphan stages', () => {
    const selectedRun = run([
      detection(),
      { ...detection('other'), runId: 'not-selected' },
      { ...entry('compare', { recommendation: 'Not a finding' }), bugId: 'orphan' },
    ]);
    const findings = findingsFromRun(selectedRun);
    expect(findings).toHaveLength(1);
    expect(findings[0].bugId).toBe('finding-1');
    expect(findings[0].entries.every((item) => item.runId === 'selected')).toBe(true);
    expect(dataFor(selectedRun).opportunities).toHaveLength(1);
  });

  it('maps selected recommendation and allowlisted evidence without raw reasoning', () => {
    const selectedRun = run([
      detection(),
      entry('compare', {
        recommended: 'cache',
        strategies: [
          {
            id: 'cache',
            title: 'Cache repeated requests',
            description: 'Reuse matching safe responses.',
            effort: 'small',
            reversible: true,
          },
        ],
        rationale: 'PRIVATE RAW CHAIN',
      }),
    ]);
    const data = dataFor(selectedRun);
    expect(data.opportunities[0].title).toBe('Cache repeated requests');
    expect(data.opportunities[0].recommendation).toBe('Reuse matching safe responses.');
    expect(data.opportunities[0].evidence.some((fact) => fact.value.includes('300'))).toBe(true);
    expect(JSON.stringify(data)).not.toContain('PRIVATE RAW CHAIN');
    expect(JSON.stringify(data)).not.toContain('Raw internal reasoning');
    expect(data.opportunities[0].risk).toBe('Unknown');
  });

  it('never fabricates finance, tree equivalents or achieved carbon from estimated impact', () => {
    const selectedRun = run([
      detection(),
      entry('simulate', { savings: { energyKwh: 1200, carbonKgCo2e: 480 } }),
    ]);
    const data = dataFor(selectedRun);
    expect(
      data.agents.every(
        (agent) =>
          agent.savingsMonthly === null &&
          agent.runCostMonthly === null &&
          agent.roiPercent === null,
      ),
    ).toBe(true);
    expect(data.opportunities[0].monthlyUsd).toBeNull();
    expect(data.opportunities[0].carbonKg).toBeNull();
    expect(data.ledger.every((row) => row.carbonSaved === 'Not measured')).toBe(true);
    expect(data.executiveMetrics[0].value).toBe('Not measured');
    expect(data.trend.points).toEqual([]);
  });

  it('provides a fourth Waste metric from recorded log-retention findings', () => {
    const log = detection('logs');
    log.data = {
      ...log.data,
      agentId: 'digital-waste',
      category: 'verbose-logging',
      evidence: { retentionDays: 180 },
    };
    const data = dataFor(run([log]));
    const waste = data.agents.find((agent) => agent.key === 'waste')!;
    expect(waste.metrics).toHaveLength(4);
    expect(waste.metrics[3].label).toBe('Log retention findings');
    expect(waste.metrics[3].value).toBe('1 findings');
    expect(waste.metrics[3].hint).toContain('distinct count');
  });

  it('does not turn a policy approval into a human approval or successful application', () => {
    const data = dataFor(
      run([detection(), entry('approve', { approved: true, mode: 'automatic' })]),
    );
    expect(data.opportunities[0].status).toBe('pending');
    expect(data.executiveMetrics[1].value).toBe('0');
  });

  it('requires verification after the latest successful application', () => {
    const stale = run([
      detection(),
      entry('verify', { confirmed: true }, 2),
      entry('improve', { applied: true }, 3),
    ]);
    expect(findingsFromRun(stale)[0].state).toBe('unverified');
    expect(dataFor(stale).opportunities[0].status).toBe('applied');
    expect(dataFor(stale).executiveMetrics[1].value).toBe('0');
    const verified = run([
      detection(),
      entry('improve', { applied: true }, 2),
      entry('verify', { confirmed: true }, 3),
    ]);
    expect(dataFor(verified).opportunities[0].status).toBe('verified');
    expect(dataFor(verified).executiveMetrics[1].value).toBe('1');
    expect(dataFor(verified).executiveMetrics[0].value).toBe('Not measured');
  });

  it('uses explicit environment tags instead of guessing from resource names', () => {
    const selectedRun = run([
      detection('unknown'),
      detection('prod', 'production'),
      detection('staging', 'staging'),
    ]);
    const findings = findingsFromRun(selectedRun);
    expect(buildRecordedData(selectedRun, findings, 'All', '30d').opportunities).toHaveLength(3);
    expect(
      buildRecordedData(selectedRun, findings, 'Prod', '30d').opportunities.map((item) => item.id),
    ).toEqual(['prod']);
    expect(
      buildRecordedData(selectedRun, findings, 'Staging', '30d').opportunities.map(
        (item) => item.id,
      ),
    ).toEqual(['staging']);
    expect(buildRecordedData(selectedRun, findings, 'All', '30d').filterNote).toContain(
      '1 findings have no recognized environment tag',
    );
  });

  it('filters detection dates relative to the snapshot, not the wall clock', () => {
    const selectedRun = run([
      detection('recent'),
      detection('week', undefined, '2026-10-01T12:00:00Z'),
      detection('old', undefined, '2026-08-01T12:00:00Z'),
      detection('future', undefined, '2026-10-05T12:00:00Z'),
    ]);
    const findings = findingsFromRun(selectedRun);
    expect(
      buildRecordedData(selectedRun, findings, 'All', '24h').opportunities.map((item) => item.id),
    ).toEqual(['recent']);
    expect(
      buildRecordedData(selectedRun, findings, 'All', '7d').opportunities.map((item) => item.id),
    ).toEqual(['recent', 'week']);
    expect(
      buildRecordedData(selectedRun, findings, 'All', '1y').opportunities.map((item) => item.id),
    ).toEqual(['recent', 'week', 'old']);
  });

  it('rebuilds stale caller fields from the matching run', () => {
    const selectedRun = run([detection()]);
    const findings = findingsFromRun(selectedRun);
    findings[0].recommendation = 'Wrong run recommendation';
    findings[0].title = 'Wrong run title';
    findings[0].agentId = 'architecture';
    const data = buildRecordedData(selectedRun, findings, 'All', '30d');
    expect(data.opportunities[0].agentKey).toBe('ai');
    expect(JSON.stringify(data)).not.toContain('Wrong run');
  });

  it('keeps partial agent token usage unknown and run-wide after filters', () => {
    const selectedRun = run([detection('prod', 'Prod'), detection('staging', 'Staging')]);
    selectedRun.outcome = {
      runId: 'selected',
      startedAt: timestamp,
      finishedAt: timestamp,
      bugsDetected: 2,
      bugsImproved: 0,
      savings: { energyKwh: 0, carbonKgCo2e: 0 },
      selfCost: {
        tokens: null,
        knownTokens: 949,
        usageComplete: false,
        llmCalls: 2,
        unknownLlmCalls: 1,
        toolCalls: 8,
        retries: 1,
        energyKwh: null,
        carbonKgCo2e: null,
      },
      net: { energyKwh: null, carbonKgCo2e: null, netPositive: null },
    };
    const filtered = buildRecordedData(selectedRun, findingsFromRun(selectedRun), 'Prod', '24h');
    expect(filtered.selfAudit[0].value).toBe('Total unknown');
    expect(
      filtered.usageDetails.find((fact) => fact.label === 'Reported token subtotal')?.value,
    ).toBe('949');
    expect(filtered.usageDetails.find((fact) => fact.label === 'Usage scope')?.value).toContain(
      'not prorated',
    );
  });
});

describe('isolated reference-dashboard sample scenarios', () => {
  it('populates every specialist with distinct inventory and safe pending actions', () => {
    const data = buildSampleData('All', '30d');
    expect(data.mode).toBe('sample');
    expect(data.runId).toBeNull();
    expect(data.agents).toHaveLength(7);
    expect(new Set(data.agents.map((agent) => agent.inventoryTitle)).size).toBe(7);
    const scenarioAgents = data.agents.filter((agent) => agent.key !== 'pipeline');
    expect(
      scenarioAgents.every((agent) => agent.rows.length > 0 && agent.chart!.points.length > 0),
    ).toBe(true);
    // Pipeline Efficiency has no invented sample scenario; it stays empty until a recorded run.
    const pipeline = data.agents.find((agent) => agent.key === 'pipeline')!;
    expect(pipeline.rows).toEqual([]);
    expect(pipeline.savingsMonthly).toBeNull();
    expect(data.opportunities.some((item) => item.agentKey === 'pipeline')).toBe(false);
    expect(
      data.opportunities.every(
        (opportunity) =>
          opportunity.status === 'pending' && opportunity.source === 'Synthetic scenario',
      ),
    ).toBe(true);
    expect(data.ledger.every((row) => row.status === 'Sample verified' && !row.findingId)).toBe(
      true,
    );
    expect(data.executiveMetrics).toHaveLength(4);
    expect(data.agents.find((agent) => agent.key === 'waste')?.metrics).toHaveLength(4);
  });

  it('exposes synthetic carbon sources and recovery targets, without claiming SLA compliance', () => {
    const data = buildSampleData('All', '30d');
    const carbon = data.agents.find((agent) => agent.key === 'carbon')!;
    const recovery = data.agents.find((agent) => agent.key === 'dr')!;
    expect(carbon.rows[0].facts).toContainEqual({ label: 'Source', value: 'Synthetic scenario' });
    expect(carbon.rows[0].facts?.some((fact) => fact.label === 'Current grid intensity')).toBe(
      true,
    );
    expect(recovery.rows[0].facts?.some((fact) => fact.label === 'RTO target')).toBe(true);
    expect(recovery.rows[0].facts?.some((fact) => fact.label === 'RPO target')).toBe(true);
    expect(recovery.metrics.find((item) => item.label === 'Recovery compliance')?.value).toBe(
      'Not verified',
    );
  });

  it('recomputes projections, rows, timeline and audit history for environment filters', () => {
    const all = buildSampleData('All', '30d');
    const prod = buildSampleData('Prod', '30d');
    const staging = buildSampleData('Staging', '30d');
    const total = (data: typeof all) =>
      data.opportunities.reduce((sum, opportunity) => sum + opportunity.monthlyUsd!, 0);
    expect(prod.opportunities.every((item) => item.target.endsWith('Prod'))).toBe(true);
    expect(staging.opportunities.every((item) => item.target.endsWith('Staging'))).toBe(true);
    expect(total(prod) + total(staging)).toBe(total(all));
    expect(prod.ledger.length + staging.ledger.length).toBe(all.ledger.length);
    expect(prod.trend.points.length).toBeLessThan(all.trend.points.length);
    expect(prod.executiveMetrics[0].value).not.toBe(all.executiveMetrics[0].value);
  });

  it('uses real date windows and does not silently prorate monthly projections', () => {
    const counts = (['24h', '7d', '30d', '1y'] as TimeRange[]).map(
      (time) => buildSampleData('All', time).opportunities.length,
    );
    expect(counts).toEqual([6, 12, 24, 30]);
    expect(buildSampleData('All', '24h').filterNote).toContain('Projections remain monthly');
    expect(buildSampleData('All', '24h').filterNote).toContain('4 Oct 2026');
  });

  it('keeps independent sample data and does not recalculate savings after approval', () => {
    const first = buildSampleData('All', '30d');
    const previousValue = first.executiveMetrics[0].value;
    first.opportunities[0].status = 'approved';
    const second = buildSampleData('All', '30d');
    expect(first.executiveMetrics[0].value).toBe(previousValue);
    expect(second.executiveMetrics[0].value).toBe(previousValue);
    expect(second.opportunities[0].status).toBe('pending');
    expect(second.ledger).toHaveLength(4);
    expect(second.usageDetails.find((fact) => fact.label === 'Approval boundary')?.value).toContain(
      'never change projected savings',
    );
    expect(buildRecordedData(null, [], 'All', '30d').opportunities).toHaveLength(0);
  });

  it('computes net ROI consistently and distinguishes hypothetical equivalences', () => {
    const data = buildSampleData('All', '30d');
    // Pipeline Efficiency has no sample scenario, so its ROI stays unknown (null).
    expect(data.agents.find((agent) => agent.key === 'pipeline')!.roiPercent).toBeNull();
    for (const agent of data.agents.filter((item) => item.key !== 'pipeline')) {
      expect(agent.roiPercent).toBeCloseTo(
        ((agent.savingsMonthly! - agent.runCostMonthly!) / agent.runCostMonthly!) * 100,
      );
    }
    expect(data.executiveMetrics[1].hint).toContain('no trees planted');
    expect(data.executiveMetrics[2].hint).toContain('not measured travel');
    expect(data.usageDetails.find((fact) => fact.label === 'Price basis')?.value).toContain(
      'Invented scenario rates',
    );
  });

  it.each(['ai', 'waste', 'carbon', 'arch', 'dr', 'collab'] as AgentKey[])(
    'uses distinct %s scenarios, recommendations and targets in the default walkthrough',
    (key) => {
      const data = buildSampleData('All', '30d');
      const items = data.opportunities.filter((item) => item.agentKey === key);
      const agent = data.agents.find((candidate) => candidate.key === key)!;
      expect(items).toHaveLength(4);
      expect(new Set(items.map((item) => item.title)).size).toBe(4);
      expect(new Set(items.map((item) => item.description)).size).toBe(4);
      expect(new Set(items.map((item) => item.recommendation)).size).toBe(4);
      expect(new Set(items.map((item) => item.target)).size).toBe(4);
      expect(new Set(agent.rows.map((row) => row.name)).size).toBe(4);
      expect(
        agent.rows.every((row) => !/group \d|pipeline \d|cluster \d|archive \d/i.test(row.name)),
      ).toBe(true);
    },
  );

  it('keeps filtered storage charts aligned with the inventory and excludes compute units', () => {
    const data = buildSampleData('All', '1y');
    const waste = data.agents.find((agent) => agent.key === 'waste')!;
    expect(waste.rows.find((row) => row.id === 'sample-waste-5')?.cells[1]).toBe('16 vCPU');
    expect(waste.chart?.points.reduce((sum, point) => sum + point.primary, 0)).toBe(378);
    expect(waste.metrics[0].value).toBe('378 TB');
    expect(waste.metrics[3].value).toBe('84 TB');
    const recent = buildSampleData('All', '24h').agents.find((agent) => agent.key === 'waste')!;
    expect(recent.chart?.points).toEqual([{ label: 'Volumes', primary: 105 }]);
    expect(recent.metrics[3].value).toBe('0 TB');
  });

  it('varies recovery objectives and keeps the critical-service replica safeguard', () => {
    const data = buildSampleData('All', '30d');
    const recovery = data.agents.find((agent) => agent.key === 'dr')!;
    expect(new Set(recovery.rows.map((row) => row.cells[2])).size).toBe(4);
    expect(data.opportunities.find((item) => item.id === 'sample-dr-3')?.recommendation).toContain(
      'Keep hot failover replicas',
    );
  });

  it.each(['ai', 'waste', 'carbon', 'arch', 'dr', 'collab'] as AgentKey[])(
    'keeps %s row columns aligned and actions linked to existing opportunities',
    (key) => {
      const data = buildSampleData('All', '30d');
      const agent = data.agents.find((candidate) => candidate.key === key)!;
      for (const row of agent.rows) {
        expect(row.cells).toHaveLength(agent.columns.length);
        expect(data.opportunities.some((opportunity) => opportunity.id === row.opportunityId)).toBe(
          true,
        );
      }
    },
  );
});

it('includes core CLI code reviews without fleet agent IDs in queues and graph counts', () => {
  const entries: LedgerEntry[] = [];
  for (let index = 0; index < 119; index++) {
    const detect = detection(`code-${index}`);
    delete detect.data.agentId;
    detect.data.category = ['dead-code', 'duplicate-import', 'redundant-call'][index % 3];
    detect.data.source = 'local';
    entries.push(detect, { ...detect, seq: 2, stage: 'compare', data: { recommendation: 'Review this code improvement', fix: { available: true, requiresApproval: true } } });
  }
  const run: SelectedRun = { runId: 'selected', timestamp, kind: 'review', entries };
  const data = buildRecordedData(run, findingsFromRun(run), 'All', '30d');
  expect(data.opportunities).toHaveLength(119);
  expect(data.agents.find(agent => agent.key === 'arch')?.rows).toHaveLength(119);
  expect(data.agents.reduce((sum, agent) => sum + agent.rows.length, 0)).toBe(119);
});
