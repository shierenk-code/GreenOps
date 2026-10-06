import { describe, expect, it } from 'vitest';
import {
  planDigitalWaste,
  reviewWastePlan,
  simulateWastePlan,
  validateWastePlan,
} from '../packages/agents/src/waste-planner.js';
import { wasteDemo } from '../packages/agents/src/waste-demo.js';
import { fingerprint } from '../packages/agents/src/carbon-planner.js';
import type { WasteInventory, WasteUsage } from '../packages/agents/src/waste-inventory.js';
const NOW = new Date('2026-10-05T10:00:00Z');
const setup = () => {
  const d = wasteDemo(NOW);
  return { ...d, plan: planDigitalWaste(d.inventory, d.usage, NOW) };
};

describe('Digital Waste plans', () => {
  it('produces two reviewable and two blocked findings without fictitious carbon savings', () => {
    const { plan } = setup();
    expect(plan.realExecutionEnabled).toBe(false);
    expect(plan.findings).toHaveLength(4);
    expect(plan.findings.filter((f) => f.status === 'ready-for-review')).toHaveLength(2);
    const cpu = plan.findings.find((f) => f.resourceName === 'api-gateway')!;
    expect(cpu.proposedCpuCores).toBe(0.6);
    expect(cpu.impact.cpuReservationCores).toBeCloseTo(4.2);
    expect(cpu.impact.estimatedMonthlyCostUsd).toBeNull();
    const storage = plan.findings.find((f) => f.resourceName === 'legacy-export')!;
    expect(storage.impact.storageGiB).toBe(100);
    expect(storage.impact.estimatedMonthlyCostUsd).toBe(10);
    expect(plan.findings.every((f) => f.impact.estimatedKgCo2 === null)).toBe(true);
    expect(() => validateWastePlan(plan)).not.toThrow();
  });
  it('does not approve CPU resizing from one snapshot', () => {
    const d = wasteDemo(NOW);
    const plan = planDigitalWaste(d.inventory, [], NOW);
    const cpu = plan.findings.find((f) => f.resourceName === 'api-gateway')!;
    expect(cpu.status).toBe('needs-evidence');
    expect(cpu.proposedCpuCores).toBeUndefined();
    expect(() => reviewWastePlan(plan, cpu.id, 'approve', 'tester', 'reviewed', NOW)).toThrow(
      'evidence',
    );
  });
  it.each([
    [
      'short history',
      (d: ReturnType<typeof wasteDemo>) => {
        d.usage[0]!.from = '2026-10-05T09:00:00Z';
      },
    ],
    [
      'sparse history',
      (d: ReturnType<typeof wasteDemo>) => {
        d.usage[0]!.samples = 10;
      },
    ],
    [
      'low coverage',
      (d: ReturnType<typeof wasteDemo>) => {
        d.usage[0]!.coveragePercent = 50;
      },
    ],
    [
      'stale history',
      (d: ReturnType<typeof wasteDemo>) => {
        d.usage[0]!.to = '2026-10-03T10:00:00Z';
      },
    ],
    [
      'high peaks',
      (d: ReturnType<typeof wasteDemo>) => {
        d.usage[0]!.peakCpuCores = 2;
      },
    ],
    [
      'autoscaler',
      (d: ReturnType<typeof wasteDemo>) => {
        d.inventory.workloads[0]!.autoscaled = true;
      },
    ],
    [
      'unknown autoscaler',
      (d: ReturnType<typeof wasteDemo>) => {
        d.inventory.workloads[0]!.autoscaled = null;
      },
    ],
    [
      'missing HPA inventory',
      (d: ReturnType<typeof wasteDemo>) => {
        d.inventory.coverage.autoscalers = 'unavailable';
      },
    ],
    [
      'partial pods',
      (d: ReturnType<typeof wasteDemo>) => {
        d.inventory.coverage.pods = 'unavailable';
      },
    ],
    [
      'protected namespace',
      (d: ReturnType<typeof wasteDemo>) => {
        d.inventory.target.namespace = 'kube-system';
      },
    ],
  ] as const)('blocks resizing with %s', (_label, edit) => {
    const d = wasteDemo(NOW);
    edit(d);
    const f = planDigitalWaste(d.inventory, d.usage, NOW).findings.find(
      (f) => f.resourceName === 'api-gateway',
    )!;
    expect(f.status).toBe('needs-evidence');
    expect(f.proposedCpuCores).toBeUndefined();
    expect(f.impact.cpuReservationCores).toBeNull();
  });
  it.each([
    [
      'owner',
      (v: WasteInventory['volumes'][number]) => {
        v.releaseEvidence!.ownerConfirmed = false;
      },
    ],
    [
      'backup',
      (v: WasteInventory['volumes'][number]) => {
        v.releaseEvidence!.backupRestoreTested = false;
      },
    ],
    [
      'retention',
      (v: WasteInventory['volumes'][number]) => {
        v.releaseEvidence!.retentionCleared = false;
      },
    ],
    [
      'source',
      (v: WasteInventory['volumes'][number]) => {
        v.releaseEvidence!.source = '';
      },
    ],
    [
      'recent use',
      (v: WasteInventory['volumes'][number]) => {
        v.releaseEvidence!.lastUsedAt = NOW.toISOString();
      },
    ],
    [
      'unknown references',
      (v: WasteInventory['volumes'][number]) => {
        v.referencedByPods = null;
      },
    ],
    [
      'unknown capacity',
      (v: WasteInventory['volumes'][number]) => {
        v.capacityGiB = null;
      },
    ],
    [
      'pending claim',
      (v: WasteInventory['volumes'][number]) => {
        v.phase = 'Pending';
      },
    ],
  ] as const)('blocks storage release without %s evidence', (_label, edit) => {
    const d = wasteDemo(NOW);
    edit(d.inventory.volumes[0]!);
    const f = planDigitalWaste(d.inventory, d.usage, NOW).findings.find(
      (f) => f.resourceName === 'legacy-export',
    )!;
    expect(f.status).toBe('needs-evidence');
    expect(f.impact.storageGiB).toBeNull();
  });
  it('keeps absent prices unknown and excludes actively referenced storage', () => {
    const d = wasteDemo(NOW);
    delete d.inventory.storagePricing;
    const plan = planDigitalWaste(d.inventory, d.usage, NOW);
    expect(
      plan.findings.find((f) => f.resourceName === 'legacy-export')!.impact.estimatedMonthlyCostUsd,
    ).toBeNull();
    expect(plan.findings.find((f) => f.resourceName === 'active-data')).toBeUndefined();
  });
  it.each([
    (u: WasteUsage) => {
      u.p95CpuCores = -1;
    },
    (u: WasteUsage) => {
      u.peakCpuCores = 0;
    },
    (u: WasteUsage) => {
      u.samples = NaN;
    },
    (u: WasteUsage) => {
      u.coveragePercent = 101;
    },
    (u: WasteUsage) => {
      u.resourceVersion = 'old';
    },
    (u: WasteUsage) => {
      u.workloadUid = 'different';
    },
    (u: WasteUsage) => {
      u.to = '2026-10-06T10:00:00Z';
    },
  ])('rejects invalid or mismatched history', (edit) => {
    const d = wasteDemo(NOW);
    edit(d.usage[0]!);
    expect(() => planDigitalWaste(d.inventory, d.usage, NOW)).toThrow();
  });
  it('rejects stale inventory and duplicate resource/evidence identity', () => {
    const d = wasteDemo(NOW);
    expect(() =>
      planDigitalWaste(d.inventory, d.usage, new Date(NOW.getTime() + 16 * 60_000)),
    ).toThrow('stale');
    expect(() => planDigitalWaste(d.inventory, [...d.usage, ...d.usage], NOW)).toThrow('Duplicate');
    d.inventory.workloads.push(d.inventory.workloads[0]!);
    expect(() => planDigitalWaste(d.inventory, d.usage, NOW)).toThrow('duplicate');
  });
  it('recomputes recommendations to detect altered plans even with a recomputed hash', () => {
    const { plan } = setup();
    plan.findings[0]!.proposedCpuCores = 0.001;
    const { id: oldId, ...payload } = plan;
    expect(oldId).toBeTruthy();
    plan.id = `waste-plan-${fingerprint(payload).slice(0, 24)}`;
    expect(() => validateWastePlan(plan)).toThrow('changed');
  });
});

describe('Digital Waste human decisions and simulation boundary', () => {
  it.each(['resize-cpu-request', 'release-storage'])(
    'simulates %s on a copy, with no verified savings',
    (action) => {
      const { plan, inventory } = setup(),
        original = fingerprint(inventory);
      const finding = plan.findings.find(
        (f) => f.action === action && f.status === 'ready-for-review',
      )!;
      const decision = reviewWastePlan(
        plan,
        finding.id,
        'approve',
        'synthetic-tester',
        'test',
        NOW,
      );
      const result = simulateWastePlan(plan, decision, inventory, NOW);
      expect(result.realCloudChanges).toBe(0);
      expect(result.savingsVerified).toBe(false);
      expect(result.beforeHash).toBe(original);
      expect(result.afterHash).not.toBe(original);
      expect(fingerprint(inventory)).toBe(original);
      expect(() => simulateWastePlan(plan, decision, result.after, NOW)).toThrow('changed');
    },
  );
  it('never executes a live inventory, even with approval', () => {
    const d = wasteDemo(NOW);
    d.inventory.mode = 'kubernetes';
    const plan = planDigitalWaste(d.inventory, d.usage, NOW);
    const decision = reviewWastePlan(
      plan,
      plan.findings[0]!.id,
      'approve',
      'reviewer',
      'reason',
      NOW,
    );
    expect(() => simulateWastePlan(plan, decision, d.inventory, NOW)).toThrow('Live cleanup');
  });
  it('records a rejection but cannot execute it', () => {
    const { plan, inventory } = setup();
    const decision = reviewWastePlan(
      plan,
      plan.findings[0]!.id,
      'reject',
      'reviewer',
      'unsafe',
      NOW,
    );
    expect(() => simulateWastePlan(plan, decision, inventory, NOW)).toThrow('approved');
  });
  it('requires fresh plan, decision, reviewer and reason', () => {
    const { plan, inventory } = setup();
    const id = plan.findings[0]!.id;
    expect(() => reviewWastePlan(plan, id, 'approve', '', 'reason', NOW)).toThrow();
    expect(() => reviewWastePlan(plan, id, 'approve', 'reviewer', '', NOW)).toThrow();
    expect(() =>
      reviewWastePlan(
        plan,
        id,
        'approve',
        'reviewer',
        'reason',
        new Date(NOW.getTime() + 16 * 60_000),
      ),
    ).toThrow();
    const decision = reviewWastePlan(plan, id, 'approve', 'reviewer', 'reason', NOW);
    expect(() =>
      simulateWastePlan(plan, decision, inventory, new Date(NOW.getTime() + 6 * 60_000)),
    ).toThrow('recent');
    decision.planId = 'other';
    expect(() => simulateWastePlan(plan, decision, inventory, NOW)).toThrow();
  });
});
