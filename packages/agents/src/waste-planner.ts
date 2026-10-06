import { fingerprint } from './carbon-planner.js';
import { timestamp } from './carbon-grid.js';
import { validateWasteTarget, type WasteInventory, type WasteUsage } from './waste-inventory.js';

export interface WasteFinding {
  id: string;
  resourceUid: string;
  resourceVersion: string;
  resourceName: string;
  action: 'resize-cpu-request' | 'release-storage';
  container?: string;
  status: 'ready-for-review' | 'needs-evidence';
  risk: 'medium' | 'high';
  explanation: string;
  evidence: Record<string, unknown>;
  blockers: string[];
  manualSteps: string[];
  proposedCpuCores?: number;
  impact: {
    cpuReservationCores: number | null;
    storageGiB: number | null;
    estimatedMonthlyCostUsd: number | null;
    estimatedKgCo2: null;
    assumptions: string[];
  };
}
export interface WastePlan {
  version: 1;
  id: string;
  createdAt: string;
  inventory: WasteInventory;
  usage: WasteUsage[];
  findings: WasteFinding[];
  realExecutionEnabled: false;
}
export interface WasteDecision {
  version: 1;
  planId: string;
  findingId: string;
  decision: 'approve' | 'reject';
  reviewer: string;
  reason: string;
  decidedAt: string;
  scope: 'plan-review-only';
}

const text = (v: unknown): v is string =>
  typeof v === 'string' && v.trim().length > 0 && v.length <= 500;
const name = (v: unknown): v is string =>
  typeof v === 'string' && /^[a-z0-9][a-z0-9.-]{0,252}$/.test(v);
const finite = (v: unknown, max = 1e9): v is number =>
  typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= max;
const ageOf = (value: string, now: Date) => now.getTime() - timestamp(value);

function validateInventory(i: WasteInventory, now: Date): void {
  if (!i || i.version !== 1 || !['synthetic', 'kubernetes'].includes(i.mode))
    throw new Error('Unsupported waste inventory.');
  validateWasteTarget(i.target);
  if (ageOf(i.capturedAt, now) < 0 || ageOf(i.capturedAt, now) > 15 * 60_000)
    throw new Error('Inventory is stale or future-dated; discover again.');
  if (
    !i.coverage ||
    ['deployments', 'pods', 'claims', 'replicaSets', 'autoscalers', 'metrics'].some(
      (key) =>
        !['complete', 'unavailable'].includes(i.coverage[key as keyof WasteInventory['coverage']]),
    ) ||
    !Array.isArray(i.workloads) ||
    !Array.isArray(i.volumes) ||
    i.workloads.length > 5000 ||
    i.volumes.length > 5000 ||
    !Array.isArray(i.warnings) ||
    i.warnings.some((v) => !text(v))
  )
    throw new Error('Inventory coverage or resource lists are invalid.');
  const seen = new Set<string>();
  for (const w of i.workloads) {
    if (
      !w ||
      !name(w.name) ||
      !text(w.uid) ||
      seen.has(w.uid) ||
      !text(w.resourceVersion) ||
      !Number.isInteger(w.replicas) ||
      !finite(w.replicas, 10000) ||
      ![true, false, null].includes(w.autoscaled) ||
      !Array.isArray(w.containers) ||
      !w.containers.length ||
      w.containers.length > 100
    )
      throw new Error('Invalid or duplicate workload identity.');
    seen.add(w.uid);
    const containers = new Set<string>();
    for (const c of w.containers) {
      if (
        !c ||
        !name(c.name) ||
        containers.has(c.name) ||
        (c.requestedCpuCores !== null && !finite(c.requestedCpuCores, 1e6)) ||
        (c.observedCpuCores !== null && !finite(c.observedCpuCores, 1e6))
      )
        throw new Error('Invalid container resource quantities.');
      containers.add(c.name);
    }
  }
  for (const v of i.volumes) {
    if (
      !v ||
      !name(v.name) ||
      !text(v.uid) ||
      seen.has(v.uid) ||
      !text(v.resourceVersion) ||
      !text(v.phase) ||
      (v.capacityGiB !== null && !finite(v.capacityGiB)) ||
      ![true, false, null].includes(v.referencedByPods)
    )
      throw new Error('Invalid or duplicate storage identity.');
    seen.add(v.uid);
  }
  if (
    i.storagePricing &&
    (!finite(i.storagePricing.usdPerGiBMonth, 1e6) || !text(i.storagePricing.source))
  )
    throw new Error('Storage pricing requires a bounded rate and source.');
}

/** Local planning only. All live mutations remain unavailable even after human review. */
export function planDigitalWaste(
  inventory: WasteInventory,
  usage: WasteUsage[] = [],
  now = new Date(),
): WastePlan {
  validateInventory(inventory, now);
  if (!Array.isArray(usage) || usage.length > 10000)
    throw new Error('Invalid usage evidence list.');
  const usageIds = new Set<string>();
  for (const u of usage) {
    if (
      !u ||
      !text(u.workloadUid) ||
      !text(u.resourceVersion) ||
      !name(u.container) ||
      !text(u.source) ||
      !Number.isInteger(u.samples) ||
      !finite(u.samples, 1e9) ||
      !finite(u.coveragePercent, 100) ||
      !finite(u.p95CpuCores, 1e6) ||
      !finite(u.peakCpuCores, 1e6) ||
      u.peakCpuCores < u.p95CpuCores ||
      timestamp(u.to) <= timestamp(u.from) ||
      ageOf(u.to, now) < 0
    )
      throw new Error('Invalid historical utilization evidence.');
    const key = `${u.workloadUid}/${u.container}`;
    if (usageIds.has(key)) throw new Error('Duplicate utilization evidence.');
    usageIds.add(key);
    if (
      !inventory.workloads.some(
        (w) =>
          w.uid === u.workloadUid &&
          w.resourceVersion === u.resourceVersion &&
          w.containers.some((c) => c.name === u.container),
      )
    )
      throw new Error('Utilization evidence does not match this resource snapshot.');
  }
  const findings: WasteFinding[] = [];
  const protectedNamespace = ['default', 'kube-system', 'kube-public', 'kube-node-lease'].includes(
    inventory.target.namespace,
  );
  for (const w of inventory.workloads)
    for (const c of w.containers) {
      const h = usage.find((u) => u.workloadUid === w.uid && u.container === c.name);
      const observed = h?.p95CpuCores ?? c.observedCpuCores;
      if (
        c.requestedCpuCores === null ||
        c.requestedCpuCores <= 0 ||
        w.replicas === 0 ||
        observed === null ||
        observed / c.requestedCpuCores >= 0.4
      )
        continue;
      const blockers: string[] = [];
      if (protectedNamespace)
        blockers.push('Protected namespace: manual platform review required.');
      if (
        inventory.coverage.deployments !== 'complete' ||
        inventory.coverage.pods !== 'complete' ||
        inventory.coverage.replicaSets !== 'complete'
      )
        blockers.push('Workload inventory is incomplete.');
      if (w.autoscaled !== false || inventory.coverage.autoscalers !== 'complete')
        blockers.push('HPA ownership is active or unknown; coordinate scaling policy first.');
      if (
        !h ||
        timestamp(h.to) - timestamp(h.from) < 7 * 86_400_000 ||
        h.samples < 168 ||
        h.coveragePercent < 95 ||
        ageOf(h.to, now) > 86_400_000
      )
        blockers.push(
          'Require at least seven representative days, 168 samples, 95% coverage and evidence ending within 24 hours.',
        );
      // Conservative sizing target: preserve the recorded peak plus 20% headroom and p95 + 50%.
      const proposed = h
        ? Math.ceil(Math.max(0.1, h.p95CpuCores * 1.5, h.peakCpuCores * 1.2) * 1000) / 1000
        : null;
      if (proposed !== null && proposed >= c.requestedCpuCores * 0.9)
        blockers.push('Observed peaks leave less than 10% safe request reduction.');
      const ready = blockers.length === 0 && proposed !== null;
      findings.push({
        id: `waste-${fingerprint({ uid: w.uid, version: w.resourceVersion, container: c.name, action: 'resize' }).slice(0, 24)}`,
        resourceUid: w.uid,
        resourceVersion: w.resourceVersion,
        resourceName: w.name,
        container: c.name,
        action: 'resize-cpu-request',
        status: ready ? 'ready-for-review' : 'needs-evidence',
        risk: 'medium',
        explanation:
          'Low observed CPU relative to reserved CPU; reducing requests may free schedulable capacity, not necessarily electricity or billing.',
        evidence: {
          requestedCpuCores: c.requestedCpuCores,
          observedCpuCores: c.observedCpuCores,
          history: h ?? null,
          replicas: w.replicas,
        },
        blockers,
        ...(ready ? { proposedCpuCores: proposed! } : {}),
        manualSteps: [
          'Confirm representative peak traffic and absence of VPA/custom controllers or GitOps conflicts.',
          'Review resource requests with the service owner; keep memory, CPU limits and replica counts unchanged.',
          'Canary the request change in the owning manifest; monitor latency, errors, throttling and rollout health.',
          'Restore the previous request if quality regresses; collect actual capacity, energy and billing evidence before claiming savings.',
        ],
        impact: {
          cpuReservationCores: ready ? (c.requestedCpuCores - proposed!) * w.replicas : null,
          storageGiB: null,
          estimatedMonthlyCostUsd: null,
          estimatedKgCo2: null,
          assumptions: [
            'CPU reservations are not energy measurements; billing reduction requires actual billable capacity removal.',
          ],
        },
      });
    }
  for (const v of inventory.volumes) {
    if (v.referencedByPods === true) continue;
    const blockers: string[] = [];
    if (protectedNamespace) blockers.push('Protected namespace: manual platform review required.');
    if (
      inventory.coverage.claims !== 'complete' ||
      inventory.coverage.pods !== 'complete' ||
      v.referencedByPods !== false
    )
      blockers.push('Current PVC references are unknown.');
    if (v.phase !== 'Bound' || v.capacityGiB === null || v.capacityGiB <= 0)
      blockers.push('Provisioned bound capacity is not confirmed.');
    const e = v.releaseEvidence;
    let oldEnough = false;
    try {
      oldEnough = !!e && ageOf(e.lastUsedAt, now) >= 30 * 86_400_000;
    } catch {
      /* Missing evidence stays blocked. */
    }
    if (
      !e ||
      !text(e.source) ||
      e.ownerConfirmed !== true ||
      e.backupRestoreTested !== true ||
      e.retentionCleared !== true ||
      !oldEnough
    )
      blockers.push(
        'Require owner confirmation, tested backup, retention clearance and at least 30 days since last use.',
      );
    const ready = blockers.length === 0;
    findings.push({
      id: `waste-${fingerprint({ uid: v.uid, version: v.resourceVersion, action: 'release' }).slice(0, 24)}`,
      resourceUid: v.uid,
      resourceVersion: v.resourceVersion,
      resourceName: v.name,
      action: 'release-storage',
      status: ready ? 'ready-for-review' : 'needs-evidence',
      risk: 'high',
      explanation:
        'No current pod reference was observed. This does not prove the data is unused or permit deleting a disk.',
      evidence: {
        phase: v.phase,
        capacityGiB: v.capacityGiB,
        referencedByPods: v.referencedByPods,
        releaseEvidence: e ?? null,
      },
      blockers,
      manualSteps: [
        'Check dormant Deployments, StatefulSets, Jobs and CronJobs, external consumers and the data owner.',
        'Verify restoration from backup and legal/retention requirements; record reviewer evidence.',
        'Inspect PV reclaim policy, finalizers and underlying Azure disk ownership before proposing deletion.',
        'Perform any approved cleanup through the owning infrastructure workflow; verify backup integrity and actual billing/energy changes.',
      ],
      impact: {
        cpuReservationCores: null,
        storageGiB: ready ? v.capacityGiB : null,
        estimatedMonthlyCostUsd:
          ready && inventory.storagePricing
            ? v.capacityGiB! * inventory.storagePricing.usdPerGiBMonth
            : null,
        estimatedKgCo2: null,
        assumptions: [
          'Capacity is a potential reclaim amount, not deleted storage.',
          inventory.storagePricing
            ? `User-supplied linear storage rate: ${inventory.storagePricing.source}; excludes fixed/tier charges and backup costs.`
            : 'No price evidence; monetary savings remain unknown.',
          'No measured energy/grid evidence; carbon savings remain unknown.',
        ],
      },
    });
  }
  const payload = {
    version: 1 as const,
    createdAt: now.toISOString(),
    inventory: structuredClone(inventory),
    usage: structuredClone(usage),
    findings,
    realExecutionEnabled: false as const,
  };
  return { ...payload, id: `waste-plan-${fingerprint(payload).slice(0, 24)}` };
}

export function validateWastePlan(plan: WastePlan): void {
  if (!plan || plan.version !== 1 || plan.realExecutionEnabled !== false)
    throw new Error('Unsupported waste plan.');
  const rebuilt = planDigitalWaste(plan.inventory, plan.usage, new Date(plan.createdAt));
  if (fingerprint(plan) !== fingerprint(rebuilt))
    throw new Error('Waste plan or recommendations changed; generate and review again.');
}

export function reviewWastePlan(
  plan: WastePlan,
  findingId: string,
  decision: 'approve' | 'reject',
  reviewer: string,
  reason: string,
  now = new Date(),
): WasteDecision {
  validateWastePlan(plan);
  const finding = plan.findings.find((f) => f.id === findingId);
  if (
    !finding ||
    !['approve', 'reject'].includes(decision) ||
    !text(reviewer) ||
    !text(reason) ||
    ageOf(plan.createdAt, now) < 0 ||
    ageOf(plan.createdAt, now) > 15 * 60_000
  )
    throw new Error('A fresh plan, exact finding, reviewer and decision reason are required.');
  if (decision === 'approve' && finding.status !== 'ready-for-review')
    throw new Error('Required evidence is missing; approval cannot bypass safety checks.');
  return {
    version: 1,
    planId: plan.id,
    findingId,
    decision,
    reviewer,
    reason,
    decidedAt: now.toISOString(),
    scope: 'plan-review-only',
  };
}

export function simulateWastePlan(
  plan: WastePlan,
  decision: WasteDecision,
  current: WasteInventory,
  now = new Date(),
) {
  validateWastePlan(plan);
  validateInventory(current, now);
  if (plan.inventory.mode !== 'synthetic' || current.mode !== 'synthetic')
    throw new Error(
      'Live cleanup and resizing are disabled; only synthetic inventory can be simulated.',
    );
  if (
    !decision ||
    decision.version !== 1 ||
    decision.scope !== 'plan-review-only' ||
    decision.planId !== plan.id ||
    decision.decision !== 'approve' ||
    ageOf(decision.decidedAt, now) < 0 ||
    ageOf(decision.decidedAt, now) > 5 * 60_000
  )
    throw new Error('A recent approved decision for this plan is required.');
  reviewWastePlan(
    plan,
    decision.findingId,
    decision.decision,
    decision.reviewer,
    decision.reason,
    now,
  );
  if (fingerprint(current) !== fingerprint(plan.inventory))
    throw new Error('Inventory changed since review; rediscover and review again.');
  const finding = plan.findings.find((f) => f.id === decision.findingId)!;
  const after = structuredClone(current);
  if (finding.action === 'resize-cpu-request')
    after.workloads
      .find((w) => w.uid === finding.resourceUid)!
      .containers.find((c) => c.name === finding.container)!.requestedCpuCores =
      finding.proposedCpuCores!;
  else after.volumes = after.volumes.filter((v) => v.uid !== finding.resourceUid);
  return {
    mode: 'simulation' as const,
    planId: plan.id,
    findingId: finding.id,
    realCloudChanges: 0,
    savingsVerified: false,
    beforeHash: fingerprint(current),
    afterHash: fingerprint(after),
    after,
    potentialImpact: finding.impact,
    note: 'Synthetic state transition only. Approval is self-declared and local; no resource, quality, energy or billing outcome has been verified.',
  };
}
