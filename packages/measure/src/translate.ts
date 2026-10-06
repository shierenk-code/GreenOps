/**
 * Carbon & energy translation engine for the Azure subscription baseline.
 *
 * Converts raw baseline metrics (vCPU, memory, utilization, hours, storage, tokens)
 * into facility energy and carbon using the factors in `BaselineFactors`.
 *
 * Rules:
 * - Every result lists the assumptions (with sources) that produced it.
 * - Missing inputs give `null` plus a gap message, never zero.
 * - `kind` is the weakest evidence kind among the inputs
 *   (synthetic < modeled < measured), so a synthetic baseline can never
 *   produce a "measured" number.
 * - `boundary` states which carbon components are included; the total only
 *   sums included components, and excluded ones are reported as gaps.
 *
 * Compute power follows the utilization-based approach used by Cloud Carbon
 * Footprint: watts = minW + utilization × (maxW − minW) per vCPU, plus memory.
 * Energy is IT energy multiplied by PUE. Carbon is location-based.
 */

import type { Assumption } from './index.js';
import type {
  BaselineFactors,
  BaselineResource,
  ComputeResource,
  Disk,
  EvidenceKind,
  KubernetesCluster,
  NodePool,
} from './baseline.js';

export interface Footprint {
  /** Facility energy (IT energy × PUE). */
  energyKwh: number | null;
  operationalKgCo2e: number | null;
  embodiedKgCo2e: number | null;
  /** Sum of the components listed in `boundary`; null if an included component is unknown. */
  totalKgCo2e: number | null;
  boundary: { operational: boolean; embodied: boolean };
  kind: EvidenceKind;
  assumptions: Assumption[];
  gaps: string[];
}

export interface Saving {
  before: Footprint;
  after: Footprint;
  deltaKwh: number | null;
  deltaKgCo2e: number | null;
  kind: EvidenceKind;
  method: string;
  gaps: string[];
}

export interface ComputeUsage {
  vCpu: number;
  memoryGb: number;
  /** Instances or nodes; defaults to 1. */
  instances?: number;
  hours: number;
  /** Average CPU utilization over those hours, 0-100. */
  cpuAvgPct: number | null | undefined;
  region: string;
}

export interface StorageUsage {
  sizeGb: number;
  media: 'ssd' | 'hdd';
  redundancy: string;
  hours: number;
  region: string;
}

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  model: string;
  region: string;
}

const KIND_RANK: Record<EvidenceKind, number> = { synthetic: 0, modeled: 1, measured: 2 };

/** The weakest evidence kind wins. */
export function weakestKind(...kinds: EvidenceKind[]): EvidenceKind {
  return kinds.reduce<EvidenceKind>(
    (weakest, kind) => (KIND_RANK[kind] < KIND_RANK[weakest] ? kind : weakest),
    'measured',
  );
}

function assumption(
  key: string,
  description: string,
  value: number,
  unit: string,
  source: string,
): Assumption {
  return { key, description, value, unit, source };
}

function pueAssumption(f: BaselineFactors): Assumption {
  return assumption(
    'infra.pue',
    'Datacenter Power Usage Effectiveness',
    f.pue.value,
    'ratio',
    f.pue.source,
  );
}

function gridAssumption(f: BaselineFactors, region: string): Assumption | null {
  const grid = f.grid[region];
  if (!grid) return null;
  return assumption(
    `carbon.grid.${region}`,
    `Location-based grid carbon intensity for ${region}`,
    grid.gCo2PerKwh,
    'gCO2e / kWh',
    `${grid.source} (${grid.kind})`,
  );
}

/** Location-based carbon for facility energy in a region. */
export function carbonForEnergy(
  energyKwh: number | null,
  region: string,
  f: BaselineFactors,
): {
  kgCo2e: number | null;
  assumption: Assumption | null;
  kind: EvidenceKind | null;
  gap?: string;
} {
  const grid = f.grid[region];
  if (!grid) {
    return {
      kgCo2e: null,
      assumption: null,
      kind: null,
      gap: `No grid factor for region '${region}'.`,
    };
  }
  return {
    kgCo2e: energyKwh === null ? null : (energyKwh * grid.gCo2PerKwh) / 1000,
    assumption: gridAssumption(f, region),
    kind: grid.kind,
  };
}

function finish(
  energyKwh: number | null,
  embodiedKgCo2e: number | null,
  includeEmbodied: boolean,
  region: string,
  f: BaselineFactors,
  kinds: EvidenceKind[],
  assumptions: Assumption[],
  gaps: string[],
): Footprint {
  const carbon = carbonForEnergy(energyKwh, region, f);
  if (carbon.gap) gaps.push(carbon.gap);
  if (carbon.assumption) assumptions.push(carbon.assumption);
  if (carbon.kind) kinds.push(carbon.kind);
  if (!includeEmbodied)
    gaps.push('Embodied (manufacturing) carbon is not modeled for this resource.');
  const operational = carbon.kgCo2e;
  const total =
    operational === null || (includeEmbodied && embodiedKgCo2e === null)
      ? null
      : operational + (includeEmbodied ? (embodiedKgCo2e as number) : 0);
  return {
    energyKwh,
    operationalKgCo2e: operational,
    embodiedKgCo2e: includeEmbodied ? embodiedKgCo2e : null,
    totalKgCo2e: total,
    boundary: { operational: true, embodied: includeEmbodied },
    kind: weakestKind(...kinds),
    assumptions,
    gaps,
  };
}

/**
 * Compute footprint (VM, scale set, App Service plan, database, cache, node pool, CI runner).
 * `dataKind` is the evidence kind of the usage metrics themselves.
 */
export function translateCompute(
  usage: ComputeUsage,
  f: BaselineFactors,
  dataKind: EvidenceKind,
): Footprint {
  const c = f.compute;
  const instances = usage.instances ?? 1;
  const assumptions: Assumption[] = [
    assumption(
      'compute.min_watts_per_vcpu',
      'Power per vCPU at idle',
      c.minWattsPerVCpu,
      'W / vCPU',
      c.source,
    ),
    assumption(
      'compute.max_watts_per_vcpu',
      'Power per vCPU at full utilization',
      c.maxWattsPerVCpu,
      'W / vCPU',
      c.source,
    ),
    assumption(
      'compute.memory_watts_per_gb',
      'Power per GB of memory',
      c.memoryWattsPerGb,
      'W / GB',
      c.source,
    ),
    pueAssumption(f),
  ];
  const gaps: string[] = [];
  const kinds: EvidenceKind[] = [dataKind, c.kind, f.pue.kind];

  let energyKwh: number | null = null;
  const util = usage.cpuAvgPct;
  if (util === null || util === undefined || Number.isNaN(util)) {
    gaps.push('No CPU utilization: compute energy is unknown.');
  } else {
    const wattsPerVCpu = c.minWattsPerVCpu + (util / 100) * (c.maxWattsPerVCpu - c.minWattsPerVCpu);
    const itWatts = (usage.vCpu * wattsPerVCpu + usage.memoryGb * c.memoryWattsPerGb) * instances;
    energyKwh = ((itWatts * usage.hours) / 1000) * f.pue.value;
  }

  const e = f.embodied;
  assumptions.push(
    assumption(
      'embodied.host_kgco2e',
      `Manufacturing footprint of a ${e.hostVCpu}-vCPU host over ${e.hostLifetimeHours} h`,
      e.hostKgCo2e,
      'kgCO2e / host',
      e.source,
    ),
  );
  kinds.push(e.kind);
  const embodied =
    e.hostKgCo2e * (usage.hours / e.hostLifetimeHours) * ((usage.vCpu * instances) / e.hostVCpu);

  return finish(energyKwh, embodied, true, usage.region, f, kinds, assumptions, gaps);
}

/** Storage footprint for provisioned capacity (counted whether or not it is attached). */
export function translateStorage(
  usage: StorageUsage,
  f: BaselineFactors,
  dataKind: EvidenceKind,
): Footprint {
  const s = f.storage;
  const whPerTbHour = usage.media === 'ssd' ? s.ssdWhPerTbHour : s.hddWhPerTbHour;
  const assumptions: Assumption[] = [
    assumption(
      `storage.${usage.media}_wh_per_tb_hour`,
      `Power per TB of ${usage.media.toUpperCase()} storage`,
      whPerTbHour,
      'Wh / TB-hour',
      s.source,
    ),
    pueAssumption(f),
  ];
  const gaps: string[] = [];
  const kinds: EvidenceKind[] = [dataKind, s.kind, f.pue.kind];
  const replicationKey = Object.keys(s.replicationFactor).find((key) =>
    usage.redundancy.toUpperCase().endsWith(key),
  );
  const replication = replicationKey ? s.replicationFactor[replicationKey] : undefined;
  let energyKwh: number | null = null;
  if (!replicationKey || replication === undefined) {
    gaps.push(`Unknown redundancy '${usage.redundancy}': storage energy is unknown.`);
  } else {
    assumptions.push(
      assumption(
        `storage.replication.${replicationKey}`,
        `Copies kept for ${replicationKey} redundancy`,
        replication,
        'copies',
        s.source,
      ),
    );
    // Decimal TB (1 TB = 1000 GB), matching provider capacity units.
    const tb = usage.sizeGb / 1000;
    energyKwh = ((tb * whPerTbHour * replication * usage.hours) / 1000) * f.pue.value;
  }
  return finish(energyKwh, null, false, usage.region, f, kinds, assumptions, gaps);
}

/** Inference footprint from token volume; PUE is applied to the per-token estimate. */
export function translateTokens(
  usage: TokenUsage,
  f: BaselineFactors,
  dataKind: EvidenceKind,
): Footprint {
  const assumptions: Assumption[] = [pueAssumption(f)];
  const gaps: string[] = [];
  const kinds: EvidenceKind[] = [dataKind, f.ai.kind, f.pue.kind];
  const tier = f.modelTiers[usage.model];
  const whPer1k = tier ? f.ai.whPer1kTokens[tier] : undefined;
  let energyKwh: number | null = null;
  if (whPer1k === undefined) {
    gaps.push(`No energy factor for model '${usage.model}': inference energy is unknown.`);
  } else {
    assumptions.push(
      assumption(
        `ai.wh_per_1k_tokens.${tier}`,
        `Inference energy per 1k tokens for a ${tier} model (${usage.model})`,
        whPer1k,
        'Wh / 1k tokens',
        f.ai.source,
      ),
    );
    const tokens = usage.inputTokens + usage.outputTokens;
    energyKwh = ((tokens / 1000) * whPer1k * f.pue.value) / 1000;
  }
  return finish(energyKwh, null, false, usage.region, f, kinds, assumptions, gaps);
}

/** Add footprints that share a boundary; any unknown member makes the sum unknown. */
export function sumFootprints(items: Footprint[]): Footprint {
  const sum = (pick: (f: Footprint) => number | null): number | null =>
    items.reduce<number | null>((acc, item) => {
      const value = pick(item);
      return acc === null || value === null ? null : acc + value;
    }, 0);
  const embodied = items.every((item) => item.boundary.embodied);
  const mixedBoundary = !embodied && items.some((item) => item.boundary.embodied);
  const seen = new Set<string>();
  const assumptions = items
    .flatMap((item) => item.assumptions)
    .filter((a) => (seen.has(a.key) ? false : (seen.add(a.key), true)));
  return {
    energyKwh: sum((i) => i.energyKwh),
    operationalKgCo2e: sum((i) => i.operationalKgCo2e),
    embodiedKgCo2e: embodied ? sum((i) => i.embodiedKgCo2e) : null,
    totalKgCo2e: sum((i) => i.totalKgCo2e),
    boundary: { operational: true, embodied },
    kind: items.length ? weakestKind(...items.map((i) => i.kind)) : 'measured',
    assumptions,
    gaps: [
      ...new Set([
        ...(mixedBoundary
          ? ['Total includes embodied carbon for some items only (compute), not storage or AI.']
          : []),
        ...items.flatMap((i) => i.gaps),
      ]),
    ],
  };
}

/** Before − after with identical methods. Unknown on either side gives an unknown delta. */
export function compareFootprints(before: Footprint, after: Footprint, method: string): Saving {
  const gaps: string[] = [];
  if (before.boundary.embodied !== after.boundary.embodied)
    gaps.push('Before and after use different carbon boundaries; delta is not comparable.');
  const comparable = gaps.length === 0;
  const delta = (a: number | null, b: number | null) =>
    !comparable || a === null || b === null ? null : a - b;
  return {
    before,
    after,
    deltaKwh: delta(before.energyKwh, after.energyKwh),
    deltaKgCo2e: delta(before.totalKgCo2e, after.totalKgCo2e),
    kind: weakestKind(before.kind, after.kind),
    method,
    gaps: [...gaps, ...before.gaps, ...after.gaps].filter((g, i, all) => all.indexOf(g) === i),
  };
}

const COMPUTE_TYPES = new Set([
  'Microsoft.Compute/virtualMachines',
  'Microsoft.Compute/virtualMachineScaleSets',
  'Microsoft.Web/serverFarms',
  'Microsoft.Sql/servers/databases',
  'Microsoft.Cache/redis',
]);

function nodePoolUsage(pool: NodePool, region: string): ComputeUsage {
  return {
    vCpu: pool.vCpu,
    memoryGb: pool.memoryGb,
    instances: pool.nodes,
    hours: pool.metrics.runtimeHours,
    cpuAvgPct: pool.metrics.cpu.avgPct,
    region,
  };
}

/**
 * Footprint of one baseline resource over the baseline period.
 * Returns null for resource types whose energy is accounted elsewhere
 * (AI accounts via token usage) or not modeled (registries, log workspaces).
 */
export function footprintOfResource(
  resource: BaselineResource,
  periodHours: number,
  f: BaselineFactors,
  dataKind: EvidenceKind,
): Footprint | null {
  if (COMPUTE_TYPES.has(resource.type)) {
    const c = resource as ComputeResource;
    const primary = translateCompute(
      {
        vCpu: c.vCpu,
        memoryGb: c.memoryGb,
        instances: c.instances,
        hours: c.metrics.runtimeHours,
        cpuAvgPct: c.metrics.cpu.avgPct,
        region: c.region,
      },
      f,
      dataKind,
    );
    const replicas = (c.dr?.replicas ?? []).map((replica) =>
      translateCompute(
        {
          vCpu: replica.vCpu,
          memoryGb: (c.memoryGb * replica.vCpu) / c.vCpu,
          hours: c.metrics.runtimeHours,
          cpuAvgPct: replica.cpuAvgPct,
          region: replica.region,
        },
        f,
        dataKind,
      ),
    );
    return replicas.length ? sumFootprints([primary, ...replicas]) : primary;
  }
  if (resource.type === 'Microsoft.ContainerService/managedClusters') {
    const k = resource as KubernetesCluster;
    return sumFootprints(
      k.nodePools.map((pool) => translateCompute(nodePoolUsage(pool, k.region), f, dataKind)),
    );
  }
  if (resource.type === 'Microsoft.Compute/disks') {
    const d = resource as Disk;
    return translateStorage(
      {
        sizeGb: d.sizeGb,
        media: d.media,
        redundancy: d.redundancy,
        // Provisioned storage draws power for the whole period, attached or not.
        hours: periodHours,
        region: d.region,
      },
      f,
      dataKind,
    );
  }
  return null;
}
