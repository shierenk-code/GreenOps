import type { WasteInventory, WasteUsage } from './waste-inventory.js';

export function wasteDemo(now = new Date()): { inventory: WasteInventory; usage: WasteUsage[] } {
  const inventory: WasteInventory = {
    version: 1,
    mode: 'synthetic',
    target: { context: 'mock-aks-greenops', namespace: 'greenops-demo' },
    capturedAt: now.toISOString(),
    coverage: {
      deployments: 'complete',
      pods: 'complete',
      claims: 'complete',
      replicaSets: 'complete',
      autoscalers: 'complete',
      metrics: 'complete',
    },
    warnings: ['Synthetic inventory and usage. No cloud account was contacted.'],
    workloads: [
      {
        name: 'api-gateway',
        uid: 'mock-api',
        resourceVersion: '1',
        replicas: 3,
        autoscaled: false,
        containers: [{ name: 'api', requestedCpuCores: 2, observedCpuCores: 0.2 }],
      },
      {
        name: 'autoscaled-worker',
        uid: 'mock-worker',
        resourceVersion: '1',
        replicas: 2,
        autoscaled: true,
        containers: [{ name: 'worker', requestedCpuCores: 2, observedCpuCores: 0.1 }],
      },
    ],
    volumes: [
      {
        name: 'legacy-export',
        uid: 'mock-old-volume',
        resourceVersion: '1',
        phase: 'Bound',
        capacityGiB: 100,
        referencedByPods: false,
        releaseEvidence: {
          lastUsedAt: new Date(now.getTime() - 45 * 86_400_000).toISOString(),
          ownerConfirmed: true,
          backupRestoreTested: true,
          retentionCleared: true,
          source: 'Synthetic owner/backup/retention evidence; not a real authorization.',
        },
      },
      {
        name: 'unknown-owner',
        uid: 'mock-review-volume',
        resourceVersion: '1',
        phase: 'Bound',
        capacityGiB: 50,
        referencedByPods: false,
      },
      {
        name: 'active-data',
        uid: 'mock-active-volume',
        resourceVersion: '1',
        phase: 'Bound',
        capacityGiB: 200,
        referencedByPods: true,
      },
    ],
    storagePricing: {
      usdPerGiBMonth: 0.1,
      source: 'Synthetic illustrative USD/GiB-month rate; not an Azure quote.',
    },
  };
  return {
    inventory,
    usage: [
      {
        workloadUid: 'mock-api',
        resourceVersion: '1',
        container: 'api',
        from: new Date(now.getTime() - 8 * 86_400_000).toISOString(),
        to: now.toISOString(),
        samples: 2304,
        coveragePercent: 100,
        p95CpuCores: 0.3,
        peakCpuCores: 0.5,
        source: 'Synthetic eight-day five-minute utilization fixture.',
      },
    ],
  };
}
