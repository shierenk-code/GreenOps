import type { GridCarbonProvider, GridForecast } from './carbon-grid.js';
import type { CarbonWorkload, CarbonRegion } from './carbon-planner.js';
import type { CarbonKubeApi, KubeJob } from './carbon-kubernetes.js';

/** Separate synthetic fixture: these contexts and forecasts are not real AKS infrastructure. */
export function carbonDemo(now = new Date()): {
  workload: CarbonWorkload;
  provider: GridCarbonProvider;
  api: CarbonKubeApi;
} {
  const start = Math.ceil(now.getTime() / 1_800_000) * 1_800_000;
  const regions: CarbonRegion[] = [
    {
      id: 'south-england',
      gridRegionId: 12,
      context: 'mock-aks-england',
      namespace: 'greenops-demo',
      nodeRegion: 'mock-england',
      residency: 'GB',
      dataReady: true,
      expectedEnergyKwh: 2,
      transferEnergyKwh: 0,
      estimatedCostUsd: 1,
      latencyMs: 20,
    },
    {
      id: 'south-wales',
      gridRegionId: 7,
      context: 'mock-aks-wales',
      namespace: 'greenops-demo',
      nodeRegion: 'mock-wales',
      residency: 'GB',
      dataReady: true,
      expectedEnergyKwh: 2,
      transferEnergyKwh: 0.1,
      estimatedCostUsd: 1.1,
      latencyMs: 35,
    },
  ];
  const workload: CarbonWorkload = {
    id: 'nightly-etl',
    sourceJob: 'nightly-etl',
    sourceRegion: 'south-england',
    baselineStart: new Date(start).toISOString(),
    earliestStart: new Date(start).toISOString(),
    deadline: new Date(start + 3 * 3_600_000).toISOString(),
    durationMinutes: 60,
    maxDelayMinutes: 120,
    maxCostUsd: 2,
    maxLatencyMs: 100,
    requiredResidency: 'GB',
    allowRegionShift: true,
    idempotent: true,
    stateless: true,
    simulationOnly: true,
    energyEvidence: 'Synthetic 2 kWh batch estimate; not measured.',
    regions,
  };
  const provider: GridCarbonProvider = {
    async forecast(gridRegionId, at) {
      const forecast: GridForecast = {
        provider: 'synthetic',
        gridRegionId,
        retrievedAt: at.toISOString(),
        source: 'GreenOps synthetic UK scheduling fixture (not a cloud-to-grid mapping)',
        unit: 'gCO2/kWh',
        intervals: Array.from({ length: 10 }, (_, i) => ({
          from: new Date(start + i * 1_800_000).toISOString(),
          to: new Date(start + (i + 1) * 1_800_000).toISOString(),
          gramsCo2PerKwh: gridRegionId === 12 ? (i < 2 ? 300 : 180) : i < 2 ? 200 : 80,
        })),
      };
      return forecast;
    },
  };
  const jobs = new Map<string, KubeJob>();
  const key = (r: CarbonRegion, name: string) => `${r.context}/${r.namespace}/${name}`;
  const source: KubeJob = {
    apiVersion: 'batch/v1',
    kind: 'Job',
    metadata: {
      name: 'nightly-etl',
      namespace: 'greenops-demo',
      uid: 'synthetic-source-uid',
      resourceVersion: '1',
      labels: { 'greenops.dev/carbon-managed': 'true' },
    },
    spec: {
      suspend: true,
      template: {
        spec: {
          restartPolicy: 'Never',
          containers: [{ name: 'batch', image: 'example.invalid/synthetic-batch:demo' }],
        },
      },
    },
  };
  jobs.set(key(regions[0]!, source.metadata.name), source);
  const api: CarbonKubeApi = {
    mode: 'simulation',
    async getJob(r, name) {
      return structuredClone(jobs.get(key(r, name)) ?? null);
    },
    async podCount() {
      return 0;
    },
    async regionAvailable() {
      return true;
    },
    async dryRun() {
      /* In-memory simulation only. */
    },
    async claim(r, job, planId) {
      const current = jobs.get(key(r, job.metadata.name))!;
      if (current.metadata.resourceVersion !== job.metadata.resourceVersion)
        throw new Error('Synthetic conflict.');
      current.metadata.annotations = {
        ...current.metadata.annotations,
        'greenops.dev/carbon-plan': planId,
      };
      current.metadata.resourceVersion = '2';
    },
    async create(r, job) {
      if (jobs.has(key(r, job.metadata.name))) throw new Error('Synthetic duplicate.');
      const created = structuredClone(job);
      created.metadata.uid = 'synthetic-target-uid';
      created.metadata.resourceVersion = '1';
      jobs.set(key(r, job.metadata.name), created);
      return structuredClone(created);
    },
    async resume(r, job) {
      const target = jobs.get(key(r, job.metadata.name))!;
      if (target.metadata.resourceVersion !== job.metadata.resourceVersion)
        throw new Error('Synthetic conflict.');
      target.spec.suspend = false;
      target.metadata.resourceVersion = '2';
      target.status = { succeeded: 1, conditions: [{ type: 'Complete', status: 'True' }] };
      return structuredClone(target);
    },
  };
  return { workload, provider, api };
}
