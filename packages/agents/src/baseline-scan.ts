/**
 * Baseline mode for the specialist agents.
 *
 * When an agent's source file is an Azure subscription baseline
 * (fixtures/azure-baseline/subscription.json), the agent runs these rules instead
 * of its legacy fixture rules. Each rule:
 *   - detects waste from raw facts only (the baseline carries no conclusions),
 *   - models the before/after state with the @greenops/measure translation engine,
 *   - attaches the engine's saving, assumptions, evidence kind and gaps to the bug.
 *
 * Savings are modeled for the baseline period (one billing month); nothing is
 * extrapolated beyond it, and nothing here is a measured or verified saving.
 */

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { BugCategory, Severity, SustainabilityBug } from '@greenops/detect';
import {
  compareFootprints,
  footprintOfResource,
  sumFootprints,
  translateCompute,
  translateStorage,
  translateTokens,
  validateBaseline,
  weakestKind,
  type AiAccount,
  type AiWorkload,
  type BaselineFactors,
  type BaselineResource,
  type ComputeResource,
  type ComputeUsage,
  type ContainerRegistry,
  type Disk,
  type DrReplica,
  type EvidenceKind,
  type Footprint,
  type KubernetesCluster,
  type LogWorkspace,
  type PipelineRuns,
  type Saving,
  type SubscriptionBaseline,
} from '@greenops/measure';
import { bugId } from './util.js';

export interface BaselineBundle {
  baseline: SubscriptionBaseline;
  factors: BaselineFactors;
  /** Evidence kind of the baseline's raw metrics. */
  dataKind: EvidenceKind;
  path: string;
}

/** Metric used by baseline findings: `perRun` is kWh saved over the baseline period. */
export const BASELINE_METRIC = 'baseline.period_kwh';

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, 'utf-8'));
}

/** True when the file is an Azure subscription baseline rather than a legacy fixture. */
export function isBaselineFile(path: string): boolean {
  try {
    const doc = readJson(path) as Partial<SubscriptionBaseline>;
    return doc?.schemaVersion === 1 && typeof doc.subscriptionId === 'string';
  } catch {
    return false;
  }
}

/** Load and validate a baseline plus the factors.json next to it. */
export function loadBaselineBundle(path: string): BaselineBundle {
  const factorsPath = join(dirname(path), 'factors.json');
  if (!existsSync(factorsPath))
    throw new Error(`GreenOps baseline: missing factors file next to '${path}'.`);
  const baseline = readJson(path) as SubscriptionBaseline;
  const factors = readJson(factorsPath) as BaselineFactors;
  const { ok, errors } = validateBaseline(baseline, factors);
  if (!ok)
    throw new Error(
      `GreenOps baseline '${path}' is invalid: ${errors.slice(0, 5).join(' ')}${
        errors.length > 5 ? ` (+${errors.length - 5} more)` : ''
      }`,
    );
  const dataKind: EvidenceKind = baseline.provenance === 'measured' ? 'measured' : 'synthetic';
  return { baseline, factors, dataKind, path };
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

const round = (n: number, digits = 3) => Number(n.toFixed(digits));
const show = (n: number | null, digits = 3): number | string =>
  n === null ? 'unknown' : round(n, digits);

interface FindingInput {
  category: BugCategory;
  key: string;
  severity: Severity;
  title: string;
  rationale: string;
  evidence: Record<string, number | string>;
  saving: Saving;
  team: string;
  region: string;
  resourceId: string;
  symbol: string;
}

function finding(bundle: BaselineBundle, input: FindingInput): SustainabilityBug {
  const s = input.saving;
  return {
    id: bugId(input.category, `${bundle.baseline.subscriptionId}:${input.key}`),
    category: input.category,
    severity: input.severity,
    title: input.title,
    location: { filePath: bundle.path, startLine: 1, endLine: 1, symbol: input.symbol },
    rationale: input.rationale,
    evidence: {
      ...input.evidence,
      team: input.team,
      region: input.region,
      resourceId: input.resourceId,
      subscriptionId: bundle.baseline.subscriptionId,
      periodHours: bundle.baseline.period.hours,
      savingKwh: show(s.deltaKwh),
      savingKgCo2e: show(s.deltaKgCo2e),
      beforeKwh: show(s.before.energyKwh),
      beforeKgCo2e: show(s.before.totalKgCo2e),
      evidenceKind: s.kind,
      savingMethod: s.method,
      gaps: s.gaps.join(' | ') || 'none',
    },
    estimatedWaste: {
      metric: BASELINE_METRIC,
      perRun: s.deltaKwh ?? 0,
      unit: `kWh over the ${bundle.baseline.period.hours} h baseline period`,
      assumptions: s.before.assumptions,
      periodKgCo2e: s.deltaKgCo2e,
      evidenceKind: s.kind,
      gaps: s.gaps,
    },
  };
}

function scanned(extra: Record<string, number>): Record<string, number> {
  return { subscriptions: 1, ...extra };
}

const COMPUTE_TYPES = new Set<string>([
  'Microsoft.Compute/virtualMachines',
  'Microsoft.Compute/virtualMachineScaleSets',
  'Microsoft.Web/serverFarms',
  'Microsoft.Sql/servers/databases',
  'Microsoft.Cache/redis',
]);

function computeResources(b: SubscriptionBaseline): ComputeResource[] {
  return b.resources.filter((r): r is ComputeResource => COMPUTE_TYPES.has(r.type));
}

function usageOf(c: ComputeResource, overrides: Partial<ComputeUsage> = {}): ComputeUsage {
  return {
    vCpu: c.vCpu,
    memoryGb: c.memoryGb,
    instances: c.instances,
    hours: c.metrics.runtimeHours,
    cpuAvgPct: c.metrics.cpu.avgPct,
    region: c.region,
    ...overrides,
  };
}

const ZERO = (usage: ComputeUsage): ComputeUsage => ({ ...usage, hours: 0 });

/** Smallest SKU in the same family with at least `neededVCpu`, if smaller than the current one. */
function smallerSku(
  current: string,
  currentVCpu: number,
  neededVCpu: number,
  f: BaselineFactors,
): { sku: string; vCpu: number; memoryGb: number } | null {
  const family = current.startsWith('P') ? 'P' : current.startsWith('Standard_') ? 'Standard_' : '';
  if (!family) return null;
  const candidates = Object.entries(f.skus)
    .filter(([sku]) => sku.startsWith(family) && !sku.startsWith('Hosted-'))
    .map(([sku, spec]) => ({ sku, ...spec }))
    .filter((c) => c.vCpu >= neededVCpu && c.vCpu < currentVCpu)
    .sort((a, b) => a.vCpu - b.vCpu || a.memoryGb - b.memoryGb);
  return candidates[0] ?? null;
}

// ---------------------------------------------------------------------------
// Digital Waste
// ---------------------------------------------------------------------------

const IDLE_P95_PCT = 10;
const OFF_HOURS_IDLE_PCT = 5;
const ORPHAN_MIN_DAYS = 14;
const RIGHTSIZE_TARGET_P95_PCT = 60;

export function scanDigitalWasteBaseline(bundle: BaselineBundle): {
  bugs: SustainabilityBug[];
  scanned: Record<string, number>;
} {
  const { baseline: b, factors: f, dataKind } = bundle;
  const bugs: SustainabilityBug[] = [];
  const hours = b.period.hours;

  // 1) Idle compute: shut down non-production, right-size production.
  for (const c of computeResources(b)) {
    if (c.type !== 'Microsoft.Compute/virtualMachines' && c.type !== 'Microsoft.Web/serverFarms')
      continue;
    const cpu = c.metrics.cpu;
    if (cpu.p95Pct >= IDLE_P95_PCT || cpu.samples < 168) continue;
    const usage = usageOf(c);
    const before = translateCompute(usage, f, dataKind);
    const isProd = c.tags.env === 'prod';
    if (!isProd) {
      const saving = compareFootprints(
        before,
        translateCompute(ZERO(usage), f, dataKind),
        'deallocate idle non-production resource',
      );
      bugs.push(
        finding(bundle, {
          category: 'idle-compute',
          key: c.id,
          severity: 'high',
          title: `Idle ${c.tags.env} ${c.type.endsWith('serverFarms') ? 'App Service plan' : 'VM'} '${c.name}' (p95 CPU ${cpu.p95Pct}%) ran ${c.metrics.runtimeHours} h`,
          rationale:
            `'${c.name}' (${c.sku}, ${c.vCpu} vCPU) peaked at ${cpu.p95Pct}% CPU over ${cpu.samples} samples but ran the whole period. ` +
            `Deallocating it (or scheduling it only when needed) removes its energy and the host share of embodied carbon. ` +
            `Confirm with the owner (${c.tags.owner ?? c.tags.team}) that nothing depends on it.`,
          evidence: {
            sku: c.sku ?? 'unknown',
            vCpu: c.vCpu,
            cpuAvgPct: cpu.avgPct,
            cpuP95Pct: cpu.p95Pct,
            runtimeHours: c.metrics.runtimeHours,
            env: c.tags.env ?? 'unknown',
            costUsd: c.costUsd ?? 'unknown',
          },
          saving,
          team: c.tags.team ?? 'unknown',
          region: c.region,
          resourceId: c.id,
          symbol: c.name,
        }),
      );
      continue;
    }
    const instances = c.instances ?? 1;
    const neededPerInstance = (c.vCpu * cpu.p95Pct) / RIGHTSIZE_TARGET_P95_PCT;
    const target = c.sku ? smallerSku(c.sku, c.vCpu, neededPerInstance, f) : null;
    if (!target) continue;
    const afterUtil = Math.min(100, (cpu.avgPct * c.vCpu) / target.vCpu);
    const after = translateCompute(
      usageOf(c, { vCpu: target.vCpu, memoryGb: target.memoryGb, cpuAvgPct: afterUtil }),
      f,
      dataKind,
    );
    const saving = compareFootprints(before, after, `right-size ${c.sku} to ${target.sku}`);
    bugs.push(
      finding(bundle, {
        category: 'overprovisioned-compute',
        key: c.id,
        severity: 'high',
        title: `Production '${c.name}' runs ${instances}× ${c.sku} at ${cpu.p95Pct}% p95 CPU; ${target.sku} fits`,
        rationale:
          `'${c.name}' peaks at ${cpu.p95Pct}% of ${c.vCpu} vCPU. ${target.sku} (${target.vCpu} vCPU) keeps p95 under ` +
          `${RIGHTSIZE_TARGET_P95_PCT}% with the same instance count. Validate memory and latency in a canary before resizing.`,
        evidence: {
          sku: c.sku ?? 'unknown',
          targetSku: target.sku,
          vCpu: c.vCpu,
          targetVCpu: target.vCpu,
          instances,
          cpuAvgPct: cpu.avgPct,
          cpuP95Pct: cpu.p95Pct,
          requestedCpuCores: c.vCpu * instances,
          usedCpuCores: round((c.vCpu * instances * cpu.p95Pct) / 100, 2),
          wastedCores: (c.vCpu - target.vCpu) * instances,
        },
        saving,
        team: c.tags.team ?? 'unknown',
        region: c.region,
        resourceId: c.id,
        symbol: c.name,
      }),
    );
  }

  // 2) Non-production running off-hours while idle (busy during the day).
  for (const c of computeResources(b)) {
    if (c.tags.env === 'prod' || c.metrics.cpu.p95Pct < IDLE_P95_PCT) continue;
    const off = c.metrics.offHoursRuntimeHours ?? 0;
    const offAvg = c.metrics.cpu.offHoursAvgPct;
    if (off <= 0 || offAvg === undefined || offAvg >= OFF_HOURS_IDLE_PCT) continue;
    const runtime = c.metrics.runtimeHours;
    const businessHours = runtime - off;
    const businessAvg =
      businessHours > 0 ? (c.metrics.cpu.avgPct * runtime - offAvg * off) / businessHours : 0;
    const before = translateCompute(usageOf(c), f, dataKind);
    const after = translateCompute(
      usageOf(c, { hours: businessHours, cpuAvgPct: Math.max(0, Math.min(100, businessAvg)) }),
      f,
      dataKind,
    );
    const saving = compareFootprints(before, after, 'auto-shutdown outside business hours');
    bugs.push(
      finding(bundle, {
        category: 'off-hours-runtime',
        key: c.id,
        severity: 'medium',
        title: `'${c.name}' runs ${off} off-hours at ${offAvg}% CPU`,
        rationale:
          `'${c.name}' is used during business hours (p95 ${c.metrics.cpu.p95Pct}%) but stays on for ${off} of ${runtime} hours ` +
          `outside them at ${offAvg}% CPU. An auto-shutdown schedule keeps the daytime work and removes the idle hours.`,
        evidence: {
          sku: c.sku ?? 'unknown',
          vCpu: c.vCpu,
          runtimeHours: runtime,
          offHoursRuntimeHours: off,
          offHoursAvgPct: offAvg,
          cpuP95Pct: c.metrics.cpu.p95Pct,
        },
        saving,
        team: c.tags.team ?? 'unknown',
        region: c.region,
        resourceId: c.id,
        symbol: c.name,
      }),
    );
  }

  // 3) Over-requested Kubernetes workloads.
  for (const k of b.resources.filter(
    (r): r is KubernetesCluster => r.type === 'Microsoft.ContainerService/managedClusters',
  )) {
    const pool = [...k.nodePools].sort((a, z) => z.vCpu * z.nodes - a.vCpu * a.nodes)[0];
    if (!pool) continue;
    const poolVCpu = pool.vCpu * pool.nodes;
    const poolFp = translateCompute(
      {
        vCpu: pool.vCpu,
        memoryGb: pool.memoryGb,
        instances: pool.nodes,
        hours: pool.metrics.runtimeHours,
        cpuAvgPct: pool.metrics.cpu.avgPct,
        region: k.region,
      },
      f,
      dataKind,
    );
    for (const w of k.workloads) {
      if (w.requestedCpuCores <= 0) continue;
      const util = w.usedCpuCoresP95 / w.requestedCpuCores;
      if (util >= 0.4) continue;
      const newRequest = Math.max(0.1, w.usedCpuCoresP95 * 1.3);
      const freedCores = (w.requestedCpuCores - newRequest) * w.replicas;
      const share = Math.min(1, freedCores / poolVCpu);
      const after = scaleFootprint(poolFp, 1 - share);
      const saving = compareFootprints(poolFp, after, 'right-size CPU requests with 30% headroom');
      saving.gaps.push(
        `Assumes the cluster autoscaler removes the freed capacity from node pool '${pool.name}'; the pool minimum (${pool.autoscale?.min ?? 'unknown'} nodes) can limit it.`,
      );
      bugs.push(
        finding(bundle, {
          category: 'overprovisioned-compute',
          key: `${k.id}:${w.name}`,
          severity: util < 0.2 ? 'high' : 'medium',
          title: `Workload '${w.name}' uses ${Math.round(util * 100)}% of requested CPU (${w.replicas} replicas)`,
          rationale:
            `'${w.name}' requests ${w.requestedCpuCores} cores per replica but peaks at ${w.usedCpuCoresP95}. ` +
            `Lowering the request to ${round(newRequest, 2)} cores frees ${round(freedCores, 1)} cores of '${pool.name}' capacity.`,
          evidence: {
            cluster: k.name,
            nodePool: pool.name,
            requestedCpuCores: w.requestedCpuCores,
            usedCpuCores: w.usedCpuCoresP95,
            replicas: w.replicas,
            wastedCores: round(freedCores, 2),
          },
          saving,
          team: w.team,
          region: k.region,
          resourceId: k.id,
          symbol: w.name,
        }),
      );
    }
  }

  // 4) Orphaned disks.
  for (const d of b.resources.filter((r): r is Disk => r.type === 'Microsoft.Compute/disks')) {
    if (d.metrics.attachedTo !== null || d.metrics.unattachedDays < ORPHAN_MIN_DAYS) continue;
    const before = translateStorage(
      { sizeGb: d.sizeGb, media: d.media, redundancy: d.redundancy, hours, region: d.region },
      f,
      dataKind,
    );
    const after = translateStorage(
      { sizeGb: 0, media: d.media, redundancy: d.redundancy, hours, region: d.region },
      f,
      dataKind,
    );
    bugs.push(
      finding(bundle, {
        category: 'unattached-storage',
        key: d.id,
        severity: d.sizeGb >= 512 ? 'high' : 'medium',
        title: `Orphaned ${d.sku} disk '${d.name}' (${d.sizeGb} GB) unattached for ${d.metrics.unattachedDays} days`,
        rationale:
          `'${d.name}' has not been attached for ${d.metrics.unattachedDays} days and was last read ${d.metrics.lastReadDaysAgo ?? 'an unknown number of'} days ago. ` +
          `Snapshot it to cheaper storage if needed, then delete it. Confirm ownership and retention first.`,
        evidence: {
          sku: d.sku ?? 'unknown',
          gb: d.sizeGb,
          attached: 'false',
          unattachedDays: d.metrics.unattachedDays,
          costUsd: d.costUsd ?? 'unknown',
        },
        saving: compareFootprints(before, after, 'snapshot and delete orphaned disk'),
        team: d.tags.team ?? 'unknown',
        region: d.region,
        resourceId: d.id,
        symbol: d.name,
      }),
    );
  }

  // 5) Oversized container images.
  for (const reg of b.resources.filter(
    (r): r is ContainerRegistry => r.type === 'Microsoft.ContainerRegistry/registries',
  )) {
    for (const img of reg.images) {
      if (img.sizeMb <= 800) continue;
      const slimMb = 300;
      const before = translateStorage(
        { sizeGb: img.sizeMb / 1000, media: 'ssd', redundancy: 'ZRS', hours, region: reg.region },
        f,
        dataKind,
      );
      const after = translateStorage(
        { sizeGb: slimMb / 1000, media: 'ssd', redundancy: 'ZRS', hours, region: reg.region },
        f,
        dataKind,
      );
      const saving = compareFootprints(before, after, `slim base image (target ${slimMb} MB)`);
      saving.gaps.push(
        `Network transfer for ${img.pullsPerMonth} pulls/month and node-local image caches are not modeled; the real saving is larger.`,
      );
      bugs.push(
        finding(bundle, {
          category: 'oversized-image',
          key: `${reg.id}:${img.name}`,
          severity: img.sizeMb > 2000 ? 'medium' : 'low',
          title: `Image '${img.name}' is ${img.sizeMb} MB and pulled ${img.pullsPerMonth} times a month`,
          rationale:
            `'${img.name}' is ${img.sizeMb} MB. A slim base and multi-stage build typically reach ~${slimMb} MB, ` +
            `cutting registry storage and every pull on scale-out.`,
          evidence: {
            registry: reg.name,
            sizeMb: img.sizeMb,
            excessMb: img.sizeMb - slimMb,
            pullsPerMonth: img.pullsPerMonth,
          },
          saving,
          team: img.team,
          region: reg.region,
          resourceId: reg.id,
          symbol: img.name,
        }),
      );
    }
  }

  // 6) Verbose, rarely-queried logs.
  for (const ws of b.resources.filter(
    (r): r is LogWorkspace => r.type === 'Microsoft.OperationalInsights/workspaces',
  )) {
    for (const t of ws.tables) {
      const storedGb = t.gbPerDay * t.retentionDays;
      if (t.complianceRetentionDays !== undefined || t.queriesLast30Days >= 10 || storedGb <= 50)
        continue;
      const targetRetention = 30;
      const targetIngestShare = 0.3;
      const before = translateStorage(
        { sizeGb: storedGb, media: 'ssd', redundancy: 'LRS', hours, region: ws.region },
        f,
        dataKind,
      );
      const after = translateStorage(
        {
          sizeGb: t.gbPerDay * targetIngestShare * targetRetention,
          media: 'ssd',
          redundancy: 'LRS',
          hours,
          region: ws.region,
        },
        f,
        dataKind,
      );
      const saving = compareFootprints(before, after, 'info log level and 30-day retention');
      saving.gaps.push(
        'Ingestion and query compute are not modeled; storage redundancy assumed LRS.',
      );
      bugs.push(
        finding(bundle, {
          category: 'verbose-logging',
          key: `${ws.id}:${t.name}`,
          severity: storedGb > 500 ? 'medium' : 'low',
          title: `Log table '${t.name}': ${t.gbPerDay} GB/day kept ${t.retentionDays} days, queried ${t.queriesLast30Days} times`,
          rationale:
            `'${t.name}' stores about ${storedGb} GB but was queried ${t.queriesLast30Days} times in 30 days. ` +
            `Dropping debug logging (~${Math.round(targetIngestShare * 100)}% of today's volume) and keeping ${targetRetention} days covers how it is used.`,
          evidence: {
            workspace: ws.name,
            gbPerDay: t.gbPerDay,
            retentionDays: t.retentionDays,
            gbStored: storedGb,
            queriesLast30Days: t.queriesLast30Days,
          },
          saving,
          team: t.team,
          region: ws.region,
          resourceId: ws.id,
          symbol: t.name,
        }),
      );
    }
  }

  return {
    bugs,
    scanned: scanned({
      resources: b.resources.length,
      computeResources: computeResources(b).length,
    }),
  };
}

/** Scale a footprint's quantities, keeping its assumptions and boundary. */
export function scaleFootprint(fp: Footprint, factor: number): Footprint {
  const scale = (n: number | null) => (n === null ? null : n * factor);
  return {
    ...fp,
    energyKwh: scale(fp.energyKwh),
    operationalKgCo2e: scale(fp.operationalKgCo2e),
    embodiedKgCo2e: scale(fp.embodiedKgCo2e),
    totalKgCo2e: scale(fp.totalKgCo2e),
    gaps: [...fp.gaps],
  };
}

// ---------------------------------------------------------------------------
// AI Efficiency
// ---------------------------------------------------------------------------

function modelOf(w: AiWorkload, b: SubscriptionBaseline): string {
  const account = b.resources.find((r) => r.id === w.accountId) as AiAccount | undefined;
  return account?.deployments.find((d) => d.name === w.deployment)?.model ?? w.deployment;
}

function regionOf(id: string, b: SubscriptionBaseline): string {
  return b.resources.find((r) => r.id === id)?.region ?? 'unknown';
}

export function scanAiEfficiencyBaseline(bundle: BaselineBundle): {
  bugs: SustainabilityBug[];
  scanned: Record<string, number>;
} {
  const { baseline: b, factors: f, dataKind } = bundle;
  const bugs: SustainabilityBug[] = [];

  for (const w of b.aiWorkloads) {
    const model = modelOf(w, b);
    const region = regionOf(w.accountId, b);
    const tier = f.modelTiers[model] ?? 'unknown';
    const totalTokens = w.inputTokens + w.outputTokens;
    const tokensPerRequest = w.requests > 0 ? totalTokens / w.requests : 0;
    const avgOutput = w.requests > 0 ? w.outputTokens / w.requests : 0;
    const avgInput = w.requests > 0 ? w.inputTokens / w.requests : 0;
    const usage = (input: number, output: number) =>
      translateTokens({ inputTokens: input, outputTokens: output, model, region }, f, dataKind);
    const before = usage(w.inputTokens, w.outputTokens);
    const common = { team: w.team, region, resourceId: w.accountId };

    // 1) Repeatable prompts served without the cache.
    const repeatable = w.repeatablePromptShare * w.requests;
    const missed = Math.max(0, repeatable - w.cacheHits);
    if (w.requests > 0 && missed / w.requests > 0.1) {
      const keep = 1 - missed / w.requests;
      const saving = compareFootprints(
        before,
        usage(w.inputTokens * keep, w.outputTokens * keep),
        'serve repeatable prompts from a semantic cache',
      );
      bugs.push(
        finding(bundle, {
          ...common,
          category: 'uncached-completion',
          key: `${w.id}:cache`,
          severity: missed / w.requests > 0.25 ? 'high' : 'medium',
          title: `'${w.id}': ${Math.round(missed)} repeatable requests a month miss the cache`,
          rationale:
            `${Math.round(w.repeatablePromptShare * 100)}% of '${w.id}' requests repeat a known prompt, but only ${w.cacheHits} of ${w.requests} were cache hits. ` +
            `Caching the repeatable share avoids about ${Math.round(missed)} model calls a month.`,
          evidence: {
            workload: w.id,
            model,
            modelTier: tier,
            requests: w.requests,
            cacheHits: w.cacheHits,
            avoidableRequests: Math.round(missed),
            tokensPerRequest: Math.round(tokensPerRequest),
          },
          saving,
          symbol: w.id,
        }),
      );
    }

    // 2) Repeated context in prompts.
    if (w.repeatedContextTokens > 0 && w.repeatedContextTokens / Math.max(1, w.inputTokens) > 0.2) {
      const compressedShare = 0.5;
      const removed = w.repeatedContextTokens * compressedShare;
      const saving = compareFootprints(
        before,
        usage(w.inputTokens - removed, w.outputTokens),
        'compress and reuse repeated prompt context',
      );
      bugs.push(
        finding(bundle, {
          ...common,
          category: 'prompt-overhead',
          key: `${w.id}:context`,
          severity: 'medium',
          title: `'${w.id}' resends ${(w.repeatedContextTokens / 1e6).toFixed(1)}M tokens of repeated context a month`,
          rationale:
            `${Math.round((w.repeatedContextTokens / w.inputTokens) * 100)}% of '${w.id}' input tokens are repeated context. ` +
            `Prompt caching or retrieval of only the relevant context can roughly halve that overhead.`,
          evidence: {
            workload: w.id,
            model,
            inputTokens: w.inputTokens,
            repeatedContextTokens: w.repeatedContextTokens,
            removableTokens: Math.round(removed),
          },
          saving,
          symbol: w.id,
        }),
      );
    }

    // 3) Large model used for short classification-style calls.
    if (tier === 'large' && avgOutput < 20 && avgInput < 500) {
      const smallModel = Object.entries(f.modelTiers).find(([, t]) => t === 'small')?.[0];
      if (smallModel) {
        const after = translateTokens(
          { inputTokens: w.inputTokens, outputTokens: w.outputTokens, model: smallModel, region },
          f,
          dataKind,
        );
        bugs.push(
          finding(bundle, {
            ...common,
            category: 'model-tier-mismatch',
            key: `${w.id}:tier`,
            severity: 'high',
            title: `'${w.id}' uses ${model} for ${Math.round(avgOutput)}-token answers`,
            rationale:
              `'${w.id}' (${w.task}) averages ${Math.round(avgInput)} input and ${Math.round(avgOutput)} output tokens per call. ` +
              `A small model such as ${smallModel} usually handles this; validate accuracy on a labeled sample before switching.`,
            evidence: {
              workload: w.id,
              model,
              targetModel: smallModel,
              requests: w.requests,
              avgInputTokens: Math.round(avgInput),
              avgOutputTokens: Math.round(avgOutput),
            },
            saving: compareFootprints(before, after, `route to ${smallModel}`),
            symbol: w.id,
          }),
        );
      }
    }

    // 4) Output allowance far above use: recorded, but no saving is credited.
    if (avgOutput > 0 && w.maxTokensConfigured > avgOutput * 10) {
      bugs.push({
        id: bugId('oversized-token-request', `${b.subscriptionId}:${w.id}:max-tokens`),
        category: 'oversized-token-request',
        severity: 'low',
        title: `'${w.id}' allows ${w.maxTokensConfigured} output tokens but uses ~${Math.round(avgOutput)}`,
        location: { filePath: bundle.path, startLine: 1, endLine: 1, symbol: w.id },
        rationale:
          'Unused output allowance is a configuration risk, not consumed tokens. No energy or carbon saving is credited.',
        evidence: {
          workload: w.id,
          model,
          maxTokens: w.maxTokensConfigured,
          avgOutputTokens: Math.round(avgOutput),
          team: w.team,
          region,
          resourceId: w.accountId,
          subscriptionId: b.subscriptionId,
          evidenceKind: dataKind,
        },
        estimatedWaste: {
          metric: 'tokens.headroom',
          perRun: Math.round((w.maxTokensConfigured - avgOutput) * w.requests),
          unit: 'unused output-token allowance per period',
          assumptions: [],
        },
      });
    }

    // 5) Retry storms without backoff.
    if (
      w.retries > 0 &&
      (w.retryBackoffMs === 0 || w.retries > w.errors * 2) &&
      w.retries / Math.max(1, w.requests) > 0.5
    ) {
      const retryTokens = w.retries * avgInput;
      const retryBefore = usage(retryTokens, 0);
      const retryAfter = usage(retryTokens * 0.2, 0);
      bugs.push(
        finding(bundle, {
          ...common,
          category: 'ai-retry-storm',
          key: `${w.id}:retries`,
          severity: 'high',
          title: `'${w.id}' retried ${w.retries} times for ${w.requests} requests with ${w.retryBackoffMs} ms backoff`,
          rationale:
            `Each retry re-sends the full prompt (~${Math.round(avgInput)} tokens). Exponential backoff with a circuit breaker ` +
            `typically removes most of these attempts during an outage.`,
          evidence: {
            workload: w.id,
            model,
            requests: w.requests,
            errors: w.errors,
            retries: w.retries,
            retryBackoffMs: w.retryBackoffMs,
          },
          saving: compareFootprints(
            retryBefore,
            retryAfter,
            'exponential backoff and circuit breaker',
          ),
          symbol: w.id,
        }),
      );
    }
  }
  return { bugs, scanned: scanned({ aiWorkloads: b.aiWorkloads.length }) };
}

// ---------------------------------------------------------------------------
// Carbon Incident
// ---------------------------------------------------------------------------

export function scanCarbonIncidentBaseline(bundle: BaselineBundle): {
  bugs: SustainabilityBug[];
  scanned: Record<string, number>;
} {
  const { baseline: b, factors: f, dataKind } = bundle;
  const bugs: SustainabilityBug[] = [];
  let samples = 0;
  for (const series of b.timeseries.filter((s) => s.metric === 'cpuPct' && s.resourceId)) {
    const resource = b.resources.find((r) => r.id === series.resourceId) as
      ComputeResource | undefined;
    if (!resource || !COMPUTE_TYPES.has(resource.type)) continue;
    samples += series.samples.length;
    const values = series.samples.map((s) => s.value).sort((a, z) => a - z);
    const median = values[Math.floor(values.length / 2)] ?? 0;
    const grid = b.timeseries.find(
      (s) => s.metric === 'gridGCo2PerKwh' && s.region === resource.region,
    );
    const hours = series.intervalMinutes / 60;
    const interval = (cpu: number) =>
      translateCompute(usageOf(resource, { hours, cpuAvgPct: cpu }), f, dataKind);
    const cleanest = grid?.samples.length
      ? grid.samples.reduce((min, s) => (s.value < min.value ? s : min))
      : undefined;
    for (const sample of series.samples) {
      if (median <= 0 || sample.value < median * 3) continue;
      const before = interval(sample.value);
      const after = interval(median);
      const saving = compareFootprints(before, after, 'cap the runaway job at its normal load');
      const hourly = grid?.samples.find((s) => s.t === sample.t);
      if (hourly && saving.deltaKwh !== null) {
        // Use the hour's grid intensity instead of the annual average.
        saving.deltaKgCo2e =
          (saving.deltaKwh * hourly.value) / 1000 +
          ((saving.before.embodiedKgCo2e ?? 0) - (saving.after.embodiedKgCo2e ?? 0));
        saving.kind = weakestKind(saving.kind, grid?.kind ?? 'synthetic');
      }
      saving.gaps.push(
        'Observed on one day; recurrence is not established, so no monthly saving is claimed.',
      );
      bugs.push(
        finding(bundle, {
          category: 'carbon-anomaly',
          key: `${resource.id}:${sample.t}`,
          severity: sample.value >= median * 4 ? 'high' : 'medium',
          title: `'${resource.name}' spiked to ${sample.value}% CPU at ${sample.t.slice(11, 16)} UTC (${(sample.value / median).toFixed(1)}× normal)`,
          rationale:
            `Normal load is ${median}% CPU; this interval drew ${show(before.energyKwh, 4)} kWh against ${show(after.energyKwh, 4)} kWh. ` +
            (hourly && cleanest
              ? `Grid intensity was ${hourly.value} gCO2e/kWh; the cleanest hour that day was ${cleanest.value} at ${cleanest.t.slice(11, 16)} UTC.`
              : 'No hourly grid intensity is available for this region.'),
          evidence: {
            timestamp: sample.t,
            cpuPct: sample.value,
            baselineCpuPct: median,
            energyKwh: show(before.energyKwh, 4),
            baselineKwh: show(after.energyKwh, 4),
            gridGCo2PerKwh: hourly?.value ?? 'unknown',
            cleanestHour: cleanest?.t ?? 'unknown',
            cleanestGridGCo2PerKwh: cleanest?.value ?? 'unknown',
          },
          saving,
          team: resource.tags.team ?? 'unknown',
          region: resource.region,
          resourceId: resource.id,
          symbol: resource.name,
        }),
      );
    }
  }
  return { bugs, scanned: scanned({ samples }) };
}

// ---------------------------------------------------------------------------
// Architecture
// ---------------------------------------------------------------------------

export function scanArchitectureBaseline(bundle: BaselineBundle): {
  bugs: SustainabilityBug[];
  scanned: Record<string, number>;
} {
  const { baseline: b, factors: f, dataKind } = bundle;
  const bugs: SustainabilityBug[] = [];
  const compute = computeResources(b);
  const subscriptionRegions = [...new Set(b.resources.map((r) => r.region))];
  const cleanest = subscriptionRegions
    .filter((r) => f.grid[r])
    .sort((a, z) => f.grid[a]!.gCo2PerKwh - f.grid[z]!.gCo2PerKwh)[0];

  for (const c of compute) {
    const cpu = c.metrics.cpu;
    // 1) Fixed capacity without autoscale (idle resources are left to Digital Waste).
    const instances = c.instances ?? 1;
    if (
      (c.type === 'Microsoft.Compute/virtualMachineScaleSets' ||
        c.type === 'Microsoft.Web/serverFarms') &&
      c.autoscale?.enabled === false &&
      instances >= 2 &&
      c.tags.env === 'prod' &&
      cpu.p95Pct >= IDLE_P95_PCT &&
      cpu.p95Pct < 50
    ) {
      const needed = Math.max(1, Math.ceil((instances * cpu.avgPct) / RIGHTSIZE_TARGET_P95_PCT));
      if (needed < instances) {
        const before = translateCompute(usageOf(c), f, dataKind);
        const after = translateCompute(
          usageOf(c, {
            instances: needed,
            cpuAvgPct: Math.min(100, (cpu.avgPct * instances) / needed),
          }),
          f,
          dataKind,
        );
        bugs.push(
          finding(bundle, {
            category: 'no-autoscale',
            key: c.id,
            severity: 'medium',
            title: `'${c.name}' is fixed at ${instances} instances at ${cpu.avgPct}% average CPU`,
            rationale:
              `'${c.name}' has no autoscale rule (${c.tags.iacSource ?? 'IaC source unknown'}). Its average load fits on ${needed} instance(s); ` +
              `an autoscale rule with a minimum of ${needed} keeps headroom for peaks (p95 ${cpu.p95Pct}%).`,
            evidence: {
              sku: c.sku ?? 'unknown',
              instances,
              targetInstances: needed,
              cpuAvgPct: cpu.avgPct,
              cpuP95Pct: cpu.p95Pct,
              iacSource: c.tags.iacSource ?? 'unknown',
              instanceCores: c.vCpu,
              neededCores: c.vCpu * needed,
            },
            saving: compareFootprints(before, after, `autoscale to a minimum of ${needed}`),
            team: c.tags.team ?? 'unknown',
            region: c.region,
            resourceId: c.id,
            symbol: c.name,
          }),
        );
      }
    }

    // 2) Production placed in a much higher-carbon region without a residency constraint.
    const sourceGrid = f.grid[c.region];
    const targetGrid = cleanest ? f.grid[cleanest] : undefined;
    if (
      c.tags.env === 'prod' &&
      cleanest &&
      cleanest !== c.region &&
      sourceGrid &&
      targetGrid &&
      sourceGrid.gCo2PerKwh >= targetGrid.gCo2PerKwh * 1.5 &&
      c.tags.dataResidency === 'none'
    ) {
      const before = translateCompute(usageOf(c), f, dataKind);
      const after = translateCompute(usageOf(c, { region: cleanest }), f, dataKind);
      bugs.push(
        finding(bundle, {
          category: 'high-carbon-region',
          key: c.id,
          severity: 'medium',
          title: `'${c.name}' runs in ${c.region} (${sourceGrid.gCo2PerKwh} g/kWh); ${cleanest} is ${targetGrid.gCo2PerKwh} g/kWh`,
          rationale:
            `'${c.name}' declares no data-residency constraint. Moving it to ${cleanest}, already used by this subscription, ` +
            `keeps the same energy and cuts its grid carbon. Check latency to its users and data sources first.`,
          evidence: {
            sku: c.sku ?? 'unknown',
            targetRegion: cleanest,
            gridIntensityKgPerKwh: sourceGrid.gCo2PerKwh / 1000,
            targetGridIntensityKgPerKwh: targetGrid.gCo2PerKwh / 1000,
            instanceCores: c.vCpu * instances,
            iacSource: c.tags.iacSource ?? 'unknown',
          },
          saving: compareFootprints(before, after, `relocate to ${cleanest}`),
          team: c.tags.team ?? 'unknown',
          region: c.region,
          resourceId: c.id,
          symbol: c.name,
        }),
      );
    }
  }
  return { bugs, scanned: scanned({ computeResources: compute.length }) };
}

// ---------------------------------------------------------------------------
// Disaster Recovery
// ---------------------------------------------------------------------------

function drFootprint(c: ComputeResource, replicas: DrReplica[], bundle: BaselineBundle): Footprint {
  const { factors: f, dataKind } = bundle;
  const primary = translateCompute(usageOf(c, { instances: 1 }), f, dataKind);
  const replicaFps = replicas.map((r) =>
    translateCompute(
      {
        vCpu: r.vCpu,
        memoryGb: (c.memoryGb * r.vCpu) / c.vCpu,
        hours: c.metrics.runtimeHours,
        cpuAvgPct: r.cpuAvgPct,
        region: r.region,
      },
      f,
      dataKind,
    ),
  );
  return sumFootprints([primary, ...replicaFps]);
}

export function scanDisasterRecoveryBaseline(bundle: BaselineBundle): {
  bugs: SustainabilityBug[];
  scanned: Record<string, number>;
} {
  const { baseline: b } = bundle;
  const bugs: SustainabilityBug[] = [];
  const services = computeResources(b).filter((c) => c.dr);
  for (const c of services) {
    const dr = c.dr!;
    const criticality = c.tags.criticality ?? 'unknown';
    const hot = dr.replicas.filter((r) => r.mode === 'hot');
    const common = {
      team: c.tags.team ?? 'unknown',
      region: c.region,
      resourceId: c.id,
      symbol: c.name,
    };
    const baseEvidence = {
      criticality,
      replicas: dr.replicas.length,
      hotReplicas: hot.length,
      rpoTargetMinutes: dr.rpoTargetMinutes,
      rtoTargetMinutes: dr.rtoTargetMinutes,
      replicationMode: dr.replicationMode,
    };
    let remaining = dr.replicas;

    // 1) More hot replicas than a low-criticality service needs.
    if (criticality === 'low' && hot.length >= 2) {
      const keep = [hot[0]!];
      bugs.push(
        finding(bundle, {
          ...common,
          category: 'over-replication',
          key: `${c.id}:replicas`,
          severity: 'medium',
          title: `Low-criticality '${c.name}' keeps ${hot.length} hot geo-replicas`,
          rationale:
            `'${c.name}' is tagged low criticality with a ${dr.rpoTargetMinutes}-minute RPO target, yet runs ${hot.length} hot replicas. ` +
            'One replica meets that target.',
          evidence: { ...baseEvidence, targetReplicas: 1 },
          saving: compareFootprints(
            drFootprint(c, remaining, bundle),
            drFootprint(c, keep, bundle),
            'keep one replica',
          ),
        }),
      );
      remaining = keep;
    }

    // 2) Continuous replication for a recovery point measured in hours.
    if (dr.replicationMode === 'continuous' && dr.rpoTargetMinutes >= 240 && remaining.length > 0) {
      bugs.push(
        finding(bundle, {
          ...common,
          category: 'rto-rpo-mismatch',
          key: `${c.id}:rpo`,
          severity: 'medium',
          title: `'${c.name}' replicates continuously for a ${dr.rpoTargetMinutes / 60}-hour RPO target`,
          rationale:
            `A ${dr.rpoTargetMinutes}-minute RPO and ${dr.rtoTargetMinutes}-minute RTO can be met with scheduled geo-backups ` +
            'instead of an always-on replica.',
          evidence: { ...baseEvidence },
          saving: compareFootprints(
            drFootprint(c, remaining, bundle),
            drFootprint(c, [], bundle),
            'scheduled geo-backup instead of a live replica',
          ),
        }),
      );
      continue;
    }

    // 3) Idle hot standby where the recovery target allows warm standby.
    const idleHot = remaining.filter((r) => r.mode === 'hot' && (r.cpuAvgPct ?? 100) < 5);
    if (criticality !== 'high' && dr.rtoTargetMinutes >= 60 && idleHot.length >= 2) {
      const warm = remaining.map((r, i) =>
        r.mode === 'hot' && i > 0
          ? { ...r, mode: 'warm' as const, vCpu: Math.max(1, r.vCpu / 2) }
          : r,
      );
      bugs.push(
        finding(bundle, {
          ...common,
          category: 'idle-standby',
          key: `${c.id}:standby`,
          severity: 'medium',
          title: `'${c.name}' keeps ${idleHot.length} idle hot replicas for a ${dr.rtoTargetMinutes}-minute RTO`,
          rationale: `The standby replicas average under 5% CPU. Keeping one hot replica and running the rest warm at half size still meets a ${dr.rtoTargetMinutes}-minute RTO.`,
          evidence: {
            ...baseEvidence,
            idleHotReplicas: idleHot.length,
            standbyCores: idleHot.reduce((s, r) => s + r.vCpu, 0),
          },
          saving: compareFootprints(
            drFootprint(c, remaining, bundle),
            drFootprint(c, warm, bundle),
            'one hot replica, others warm at half size',
          ),
        }),
      );
    }
  }
  return { bugs, scanned: scanned({ services: services.length }) };
}

// ---------------------------------------------------------------------------
// Collaboration
// ---------------------------------------------------------------------------

export function scanCollaborationBaseline(bundle: BaselineBundle): {
  bugs: SustainabilityBug[];
  scanned: Record<string, number>;
} {
  const { baseline: b, factors: f, dataKind } = bundle;
  const bugs: SustainabilityBug[] = [];
  const collab = b.collaboration;
  if (!collab) return { bugs, scanned: scanned({ recordings: 0 }) };
  const storage = (gb: number) =>
    translateStorage(
      {
        sizeGb: gb,
        media: 'hdd',
        redundancy: collab.redundancy ?? 'LRS',
        hours: b.period.hours,
        region: collab.storageRegion,
      },
      f,
      dataKind,
    );
  for (const rec of collab.recordings) {
    const common = {
      team: rec.team,
      region: collab.storageRegion,
      resourceId: `${b.tenantId}/recordings/${rec.id}`,
      symbol: rec.id,
    };
    const evidence = {
      meeting: rec.meeting,
      sizeGb: rec.sizeGb,
      ageDays: rec.ageDays,
      retentionDays: rec.retentionDays,
      views30d: rec.views30d,
      aiSummaries: rec.aiSummaries,
    };
    if (rec.duplicateOf) {
      bugs.push(
        finding(bundle, {
          ...common,
          category: 'redundant-recording',
          key: rec.id,
          severity: rec.sizeGb >= 2 ? 'medium' : 'low',
          title: `Recording '${rec.id}' duplicates '${rec.duplicateOf}' (${rec.sizeGb} GB)`,
          rationale: `'${rec.meeting}' is stored twice. Keeping the original and its transcript preserves the content.`,
          evidence: { ...evidence, duplicateOf: rec.duplicateOf },
          saving: compareFootprints(
            storage(rec.sizeGb),
            storage(0),
            'delete the duplicate recording',
          ),
        }),
      );
      continue;
    }
    if (!rec.complianceHold && rec.ageDays > 180 && rec.views30d === 0) {
      bugs.push(
        finding(bundle, {
          ...common,
          category: 'excessive-retention',
          key: rec.id,
          severity: 'low',
          title: `Recording '${rec.id}' is ${rec.ageDays} days old, unviewed for 30 days, kept ${rec.retentionDays} days`,
          rationale:
            `'${rec.meeting}' has a transcript${rec.aiSummaries ? ' and an AI summary' : ''}. ` +
            'Archiving or ageing out the video keeps the searchable record at a fraction of the storage.',
          evidence,
          saving: compareFootprints(
            storage(rec.sizeGb),
            storage(0),
            'age out the video, keep the transcript',
          ),
        }),
      );
    }
  }
  return { bugs, scanned: scanned({ recordings: collab.recordings.length }) };
}

// ---------------------------------------------------------------------------
// Pipeline Efficiency
// ---------------------------------------------------------------------------

function runnerUsage(p: PipelineRuns, bundle: BaselineBundle): Omit<ComputeUsage, 'hours'> | null {
  const { baseline: b, factors: f } = bundle;
  if (p.runner.kind === 'hosted') {
    const sku = f.skus[p.runner.sku];
    return sku
      ? { vCpu: sku.vCpu, memoryGb: sku.memoryGb, cpuAvgPct: p.cpuAvgPct, region: p.runner.region }
      : null;
  }
  const runnerId = p.runner.resourceId;
  const host = b.resources.find((r) => r.id === runnerId) as ComputeResource | undefined;
  return host
    ? { vCpu: host.vCpu, memoryGb: host.memoryGb, cpuAvgPct: p.cpuAvgPct, region: host.region }
    : null;
}

export function scanPipelineEfficiencyBaseline(bundle: BaselineBundle): {
  bugs: SustainabilityBug[];
  scanned: Record<string, number>;
} {
  const { baseline: b, factors: f, dataKind } = bundle;
  const bugs: SustainabilityBug[] = [];
  for (const p of b.pipelines) {
    const runner = runnerUsage(p, bundle);
    if (!runner) continue;
    const run = (runs: number, minutes: number) =>
      translateCompute({ ...runner, hours: (runs * minutes) / 60 }, f, dataKind);
    const all = run(p.runsThisPeriod, p.durationMinutes.median);
    const perRunG = all.totalKgCo2e === null ? null : (all.totalKgCo2e * 1000) / p.runsThisPeriod;
    const perPrG =
      all.totalKgCo2e === null ? null : (all.totalKgCo2e * 1000) / Math.max(1, p.prsMerged);
    const totalCache = p.cache.hits + p.cache.misses;
    const hitRate = totalCache > 0 ? p.cache.hits / totalCache : null;
    const common = {
      team: p.team,
      region: runner.region,
      resourceId: p.runner.kind === 'self-hosted' ? p.runner.resourceId : `hosted:${p.runner.sku}`,
      symbol: p.id,
    };
    const baseEvidence = {
      pipeline: p.id,
      repository: p.repository,
      system: p.system,
      runs: p.runsThisPeriod,
      prsMerged: p.prsMerged,
      medianMinutes: p.durationMinutes.median,
      carbonPerRunG: show(perRunG, 1),
      carbonPerPrMergedG: show(perPrG, 1),
    };

    // 1) Low dependency-cache hit rate.
    const extra = f.pipeline?.cacheMissExtraShare;
    if (hitRate !== null && hitRate < 0.5 && extra !== undefined) {
      const targetHit = 0.8;
      const base = p.durationMinutes.median / (1 + extra * (1 - hitRate));
      const target = base * (1 + extra * (1 - targetHit));
      const saving = compareFootprints(
        all,
        run(p.runsThisPeriod, target),
        `raise cache hit rate to ${targetHit * 100}%`,
      );
      saving.gaps.push(`Cache-miss penalty is an assumption: ${f.pipeline!.source}`);
      bugs.push(
        finding(bundle, {
          ...common,
          category: 'pipeline-cache-miss',
          key: `${p.id}:cache`,
          severity: hitRate < 0.3 ? 'high' : 'medium',
          title: `Pipeline '${p.id}' hits its dependency cache on ${Math.round(hitRate * 100)}% of runs${p.dockerLayerReuse ? '' : ', no Docker layer reuse'}`,
          rationale:
            `'${p.id}' runs ${p.runsThisPeriod} times a month at a ${p.durationMinutes.median}-minute median. ` +
            `Restoring dependency and${p.dockerLayerReuse ? '' : ' Docker'} layer caches would cut the median to about ${Math.round(target)} minutes.`,
          evidence: {
            ...baseEvidence,
            cacheHitRatePct: Math.round(hitRate * 100),
            dockerLayerReuse: String(p.dockerLayerReuse),
            targetMedianMinutes: round(target, 1),
          },
          saving,
        }),
      );
    }

    // 2) Duplicate runs for the same commit.
    const dupShare = p.runsWithDuplicateCommit / Math.max(1, p.runsThisPeriod);
    if (dupShare > 0.1) {
      const saving = compareFootprints(
        all,
        run(p.runsThisPeriod - p.runsWithDuplicateCommit, p.durationMinutes.median),
        'deduplicate push and pull_request triggers',
      );
      bugs.push(
        finding(bundle, {
          ...common,
          category: 'redundant-pipeline-run',
          key: `${p.id}:duplicates`,
          severity: dupShare > 0.2 ? 'medium' : 'low',
          title: `Pipeline '${p.id}' ran ${p.runsWithDuplicateCommit} duplicate builds for already-built commits`,
          rationale:
            `${Math.round(dupShare * 100)}% of '${p.id}' runs rebuild a commit that was already built (triggers: ${p.triggers.join(', ')}). ` +
            'Run on pull_request only, or skip duplicates with concurrency groups.',
          evidence: {
            ...baseEvidence,
            duplicateRuns: p.runsWithDuplicateCommit,
            triggers: p.triggers.join(','),
          },
          saving,
        }),
      );
    }

    // 3) Large artifacts uploaded on every run.
    if (p.artifactMbPerRun > 1000) {
      const targetMb = 300;
      const retentionNote = 'Artifact retention assumed to cover the whole period.';
      const stored = (mb: number) =>
        translateStorage(
          {
            sizeGb: (p.runsThisPeriod * mb) / 1000,
            media: 'ssd',
            redundancy: 'LRS',
            hours: b.period.hours,
            region: runner.region,
          },
          f,
          dataKind,
        );
      const saving = compareFootprints(
        stored(p.artifactMbPerRun),
        stored(targetMb),
        'trim build artifacts',
      );
      saving.gaps.push(retentionNote);
      bugs.push(
        finding(bundle, {
          ...common,
          category: 'artifact-bloat',
          key: `${p.id}:artifacts`,
          severity: 'low',
          title: `Pipeline '${p.id}' uploads ${p.artifactMbPerRun} MB of artifacts per run`,
          rationale:
            `'${p.id}' stores ${p.artifactMbPerRun} MB per run (${Math.round((p.runsThisPeriod * p.artifactMbPerRun) / 1000)} GB a month). ` +
            'Upload only deployable outputs and shorten retention for intermediate files.',
          evidence: {
            ...baseEvidence,
            artifactMbPerRun: p.artifactMbPerRun,
            targetArtifactMb: targetMb,
          },
          saving,
        }),
      );
    }
  }
  return { bugs, scanned: scanned({ pipelines: b.pipelines.length }) };
}

/** Total modeled footprint of every resource in the baseline, for rollups and tests. */
export function subscriptionFootprint(bundle: BaselineBundle): Footprint {
  const { baseline: b, factors: f, dataKind } = bundle;
  const items = b.resources
    .map((r: BaselineResource) => footprintOfResource(r, b.period.hours, f, dataKind))
    .filter((fp): fp is Footprint => fp !== null);
  return sumFootprints(items);
}
