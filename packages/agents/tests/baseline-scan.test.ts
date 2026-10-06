import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { simulateSustainabilityImpact } from '../../agent/src/impact.js';
import {
  BASELINE_METRIC,
  isBaselineFile,
  loadBaselineBundle,
  subscriptionFootprint,
} from '../src/baseline-scan.js';
import { OrchestratorAgent } from '../src/orchestrator.js';
import { PipelineEfficiencyAgent } from '../src/pipeline-efficiency.js';

const root = resolve(__dirname, '../../..');
const baselinePath = resolve(root, 'fixtures/azure-baseline/subscription.json');
const legacyDir = resolve(root, 'fixtures/greenops-mock');

function runBaselineFleet() {
  const orchestrator = new OrchestratorAgent();
  return orchestrator.run(
    orchestrator.list().map((agent) => ({ agent, sourcePath: baselinePath })),
  );
}

const symbols = (result: ReturnType<typeof runBaselineFleet>, category: string) =>
  result.bugs
    .filter((b) => b.category === category)
    .map((b) => b.location.symbol)
    .sort();

describe('baseline detection', () => {
  const result = runBaselineFleet();

  it('runs all seven agents on the shared subscription without errors', () => {
    expect(result.perAgentErrors).toEqual({});
    expect(result.findings.map((f) => f.agentId).sort()).toEqual([
      'ai-efficiency',
      'architecture',
      'carbon-incident',
      'collaboration',
      'digital-waste',
      'disaster-recovery',
      'pipeline-efficiency',
    ]);
    expect(result.bugs).toHaveLength(31);
  });

  it('finds the planted Digital Waste and leaves healthy resources alone', () => {
    expect(symbols(result, 'idle-compute')).toEqual([
      'asp-dev-preview',
      'vm-dev-sandbox-02',
      'vm-dev-sandbox-03',
      'vm-legacy-batch-01',
    ]);
    expect(symbols(result, 'off-hours-runtime')).toEqual(['vm-dev-sandbox-04']);
    expect(symbols(result, 'overprovisioned-compute')).toEqual([
      'api-gateway',
      'asp-marketing-site',
      'batch-worker',
    ]);
    expect(symbols(result, 'unattached-storage')).toEqual([
      'disk-migration-legacy',
      'disk-snap-restore-04',
    ]);
    expect(symbols(result, 'oversized-image')).toEqual([
      'api-gateway:latest',
      'batch-worker:latest',
    ]);
    expect(symbols(result, 'verbose-logging')).toEqual(['ApiGatewayDebug_CL']);
    const flagged = new Set(result.bugs.map((b) => b.location.symbol));
    for (const healthy of [
      'vm-dev-active-05',
      'asp-commerce-api',
      'disk-scratch-tmp',
      'disk-etl-data-01',
      'auth-service',
      'auth-service:slim',
      'AuditTrail_CL',
      'AppRequests',
    ])
      expect(flagged.has(healthy), healthy).toBe(false);
  });

  it('finds AI waste on the right workloads and spares the efficient one', () => {
    expect(symbols(result, 'uncached-completion')).toEqual(['support-assistant']);
    expect(symbols(result, 'prompt-overhead')).toEqual(['support-assistant']);
    expect(symbols(result, 'model-tier-mismatch')).toEqual(['ticket-classifier']);
    expect(symbols(result, 'oversized-token-request')).toEqual(['ticket-classifier']);
    expect(symbols(result, 'ai-retry-storm')).toEqual(['weekly-report-generator']);
    expect(result.bugs.some((b) => b.location.symbol === 'pr-code-review-agent')).toBe(false);
  });

  it('finds carbon, architecture, DR and collaboration waste', () => {
    expect(result.bugs.filter((b) => b.category === 'carbon-anomaly')).toHaveLength(2);
    expect(symbols(result, 'no-autoscale')).toEqual(['vmss-web-frontend']);
    expect(symbols(result, 'high-carbon-region')).toEqual(['vm-reporting-01']);
    expect(symbols(result, 'over-replication')).toEqual(['reporting-db']);
    expect(symbols(result, 'rto-rpo-mismatch')).toEqual(['reporting-db']);
    expect(symbols(result, 'idle-standby')).toEqual(['redis-session-cache']);
    expect(symbols(result, 'redundant-recording')).toEqual(['rec-002']);
    expect(symbols(result, 'excessive-retention')).toEqual(['rec-001']);
    const flagged = new Set(result.bugs.map((b) => b.location.symbol));
    for (const healthy of ['billing-db', 'vmss-build-agents', 'rec-004', 'rec-003'])
      expect(flagged.has(healthy), healthy).toBe(false);
  });

  it('finds pipeline waste and spares the efficient pipeline', () => {
    expect(symbols(result, 'pipeline-cache-miss')).toEqual(['commerce-api-ci']);
    expect(symbols(result, 'redundant-pipeline-run')).toEqual([
      'commerce-api-ci',
      'web-frontend-ci',
    ]);
    expect(symbols(result, 'artifact-bloat')).toEqual(['commerce-api-ci']);
    expect(result.bugs.some((b) => b.location.symbol === 'data-platform-ci')).toBe(false);
    const cache = result.bugs.find((b) => b.category === 'pipeline-cache-miss')!;
    expect(cache.evidence.carbonPerRunG).not.toBe('unknown');
    expect(cache.evidence.carbonPerPrMergedG).not.toBe('unknown');
  });

  it('attaches a modeled saving, team, region and synthetic evidence to every finding', () => {
    for (const bug of result.bugs) {
      expect(bug.evidence.team, bug.title).toBeTruthy();
      expect(bug.evidence.region, bug.title).toBeTruthy();
      expect(bug.evidence.subscriptionId).toBe('sub-contoso-retail-01');
      expect(bug.evidence.evidenceKind).toBe('synthetic');
      if (bug.estimatedWaste.metric !== BASELINE_METRIC) continue;
      // Relocation saves carbon at unchanged energy; every other remediation saves energy.
      if (bug.category === 'high-carbon-region')
        expect(bug.estimatedWaste.perRun).toBeCloseTo(0, 9);
      else expect(bug.estimatedWaste.perRun, bug.title).toBeGreaterThan(0);
      expect(bug.estimatedWaste.periodKgCo2e, bug.title).toBeGreaterThan(0);
      expect(bug.estimatedWaste.assumptions.length, bug.title).toBeGreaterThan(0);
      expect(bug.estimatedWaste.evidenceKind).toBe('synthetic');
    }
  });

  it('credits no saving for unused output allowance', () => {
    const headroom = result.bugs.find((b) => b.category === 'oversized-token-request')!;
    expect(headroom.estimatedWaste.metric).toBe('tokens.headroom');
  });
});

describe('baseline savings in the seven-stage loop', () => {
  const bug = runBaselineFleet().bugs.find((b) => b.location.symbol === 'vm-legacy-batch-01')!;

  it('credits the engine-modeled saving once, without the hidden recurrence multiplier', () => {
    const sim = simulateSustainabilityImpact(bug, 1);
    // Hand calculation in packages/measure/tests/translate.test.ts: 16.8808 kWh, 15.5885 kgCO2e.
    expect(sim.energyKwh).toBeCloseTo(16.8808, 3);
    expect(sim.carbonKgCo2e).toBeCloseTo(15.58853, 3);
  });

  it('credits nothing when the recommended strategy has no effect', () => {
    const sim = simulateSustainabilityImpact(bug, 0);
    expect(sim.energyKwh).toBe(0);
    expect(sim.carbonKgCo2e).toBe(0);
  });
});

describe('compatibility', () => {
  it('keeps the legacy six-fixture fleet at 34 findings', () => {
    const orchestrator = new OrchestratorAgent();
    const files: Record<string, string> = {
      'ai-efficiency': 'ai-usage.json',
      'digital-waste': 'cloud-inventory.json',
      'carbon-incident': 'carbon-timeseries.json',
      architecture: 'iac-resources.json',
      'disaster-recovery': 'dr-config.json',
      collaboration: 'collab-catalog.json',
      'pipeline-efficiency': 'pipelines.json',
    };
    const result = orchestrator.run(
      orchestrator
        .list()
        .map((agent) => ({ agent, sourcePath: resolve(legacyDir, files[agent.id]!) })),
    );
    expect(result.perAgentErrors).toEqual({});
    expect(result.bugs).toHaveLength(34);
  });

  it('detects baseline files and rejects legacy fixtures', () => {
    expect(isBaselineFile(baselinePath)).toBe(true);
    expect(isBaselineFile(resolve(legacyDir, 'ai-usage.json'))).toBe(false);
    expect(new PipelineEfficiencyAgent().scan(resolve(legacyDir, 'missing.json')).bugs).toEqual([]);
  });

  it('models a positive footprint for the whole subscription', () => {
    const total = subscriptionFootprint(loadBaselineBundle(baselinePath));
    expect(total.energyKwh!).toBeGreaterThan(0);
    expect(total.kind).toBe('synthetic');
  });
});
