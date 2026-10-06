/**
 * Azure subscription baseline: one shared source of raw facts for every GreenOps agent.
 *
 * A baseline contains only what an inventory/metrics export would contain
 * (resources, SKUs, regions, utilization, cost, pipeline runs, AI gateway logs).
 * It must NOT contain conclusions such as waste labels, recommendations or carbon
 * results; agents and the translation engine compute those. `validateBaseline`
 * enforces that boundary so a demo cannot simply display numbers typed into a fixture.
 */

export type EvidenceKind = 'measured' | 'modeled' | 'synthetic';
export type BaselineProvenance = 'measured' | 'synthetic' | 'mixed';

export interface CpuMetrics {
  avgPct: number;
  p95Pct: number;
  /** Average during off-hours, when the export provides it. */
  offHoursAvgPct?: number;
  samples: number;
}

export interface ComputeMetrics {
  runtimeHours: number;
  /** Hours running outside the declared business hours. */
  offHoursRuntimeHours?: number;
  cpu: CpuMetrics;
}

export interface Autoscale {
  enabled: boolean;
  min?: number;
  max?: number;
}

export interface DrReplica {
  region: string;
  mode: 'hot' | 'warm' | 'cold';
  vCpu: number;
  cpuAvgPct?: number;
}

export interface DrConfig {
  rpoTargetMinutes: number;
  rtoTargetMinutes: number;
  replicationMode: 'continuous' | 'scheduled';
  replicas: DrReplica[];
}

export interface BaseResource {
  id: string;
  name: string;
  type: string;
  sku?: string;
  region: string;
  tags: Record<string, string>;
  costUsd?: number;
}

export interface ComputeResource extends BaseResource {
  type:
    | 'Microsoft.Compute/virtualMachines'
    | 'Microsoft.Compute/virtualMachineScaleSets'
    | 'Microsoft.Web/serverFarms'
    | 'Microsoft.Sql/servers/databases'
    | 'Microsoft.Cache/redis';
  vCpu: number;
  memoryGb: number;
  instances?: number;
  autoscale?: Autoscale;
  metrics: ComputeMetrics;
  dr?: DrConfig;
}

export interface NodePool {
  name: string;
  sku: string;
  vCpu: number;
  memoryGb: number;
  nodes: number;
  autoscale?: Autoscale;
  metrics: ComputeMetrics;
}

export interface KubernetesWorkload {
  name: string;
  team: string;
  requestedCpuCores: number;
  usedCpuCoresP95: number;
  replicas: number;
}

export interface KubernetesCluster extends BaseResource {
  type: 'Microsoft.ContainerService/managedClusters';
  nodePools: NodePool[];
  workloads: KubernetesWorkload[];
}

export interface Disk extends BaseResource {
  type: 'Microsoft.Compute/disks';
  sizeGb: number;
  media: 'ssd' | 'hdd';
  redundancy: string;
  metrics: { attachedTo: string | null; unattachedDays: number; lastReadDaysAgo?: number };
}

export interface ContainerRegistry extends BaseResource {
  type: 'Microsoft.ContainerRegistry/registries';
  images: Array<{ name: string; team: string; sizeMb: number; pullsPerMonth: number }>;
}

export interface LogWorkspace extends BaseResource {
  type: 'Microsoft.OperationalInsights/workspaces';
  tables: Array<{
    name: string;
    team: string;
    gbPerDay: number;
    retentionDays: number;
    queriesLast30Days: number;
    complianceRetentionDays?: number;
  }>;
}

export interface AiAccount extends BaseResource {
  type: 'Microsoft.CognitiveServices/accounts';
  deployments: Array<{ name: string; model: string; capacityTpm: number }>;
}

export type BaselineResource =
  ComputeResource | KubernetesCluster | Disk | ContainerRegistry | LogWorkspace | AiAccount;

export interface TimeSeries {
  resourceId?: string;
  region?: string;
  metric: 'cpuPct' | 'gridGCo2PerKwh';
  intervalMinutes: number;
  kind?: EvidenceKind;
  samples: Array<{ t: string; value: number }>;
}

export interface PipelineRuns {
  id: string;
  repository: string;
  team: string;
  system: string;
  runner:
    { kind: 'hosted'; sku: string; region: string } | { kind: 'self-hosted'; resourceId: string };
  runsThisPeriod: number;
  prsMerged: number;
  runsWithDuplicateCommit: number;
  durationMinutes: { median: number; p95: number };
  cpuAvgPct: number;
  cache: { hits: number; misses: number };
  dockerLayerReuse: boolean;
  artifactMbPerRun: number;
  triggers: string[];
}

export interface AiWorkload {
  id: string;
  team: string;
  accountId: string;
  deployment: string;
  task: string;
  requests: number;
  inputTokens: number;
  outputTokens: number;
  cacheHits: number;
  /** Share of requests whose prompt is repeatable (eligible for caching). */
  repeatablePromptShare: number;
  repeatedContextTokens: number;
  maxTokensConfigured: number;
  errors: number;
  retries: number;
  retryBackoffMs: number;
  /** Privacy-safe prompt fingerprints, never raw prompt text. */
  sampledCalls: Array<{
    fingerprint: string;
    inputTokens: number;
    outputTokens: number;
    cacheable: boolean;
    occurrences: number;
  }>;
}

export interface CollaborationRecording {
  id: string;
  team: string;
  meeting: string;
  sizeGb: number;
  ageDays: number;
  retentionDays: number;
  views30d: number;
  duplicateOf?: string;
  hasTranscript: boolean;
  aiSummaries: number;
  complianceHold?: boolean;
}

export interface SubscriptionBaseline {
  schemaVersion: 1;
  provenance: BaselineProvenance;
  note?: string;
  organization: string;
  subscriptionId: string;
  tenantId: string;
  period: { start: string; end: string; hours: number };
  businessHours?: { timezone: string; weekdays: string; start: string; end: string };
  regions: string[];
  teams: Array<{ id: string; name: string }>;
  resources: BaselineResource[];
  timeseries: TimeSeries[];
  pipelines: PipelineRuns[];
  aiWorkloads: AiWorkload[];
  collaboration?: {
    source: string;
    storageRegion: string;
    /** Storage redundancy of the collaboration platform, e.g. GRS. */
    redundancy?: string;
    recordings: CollaborationRecording[];
  };
}

/** Conversion factors referenced by the baseline (see fixtures/azure-baseline/factors.json). */
export interface BaselineFactors {
  schemaVersion: 1;
  grid: Record<string, { gCo2PerKwh: number; kind: EvidenceKind; source: string }>;
  pue: { value: number; kind: EvidenceKind; source: string };
  compute: {
    minWattsPerVCpu: number;
    maxWattsPerVCpu: number;
    memoryWattsPerGb: number;
    kind: EvidenceKind;
    source: string;
  };
  storage: {
    ssdWhPerTbHour: number;
    hddWhPerTbHour: number;
    replicationFactor: Record<string, number>;
    kind: EvidenceKind;
    source: string;
  };
  embodied: {
    hostKgCo2e: number;
    hostVCpu: number;
    hostLifetimeHours: number;
    kind: EvidenceKind;
    source: string;
  };
  ai: {
    whPer1kTokens: Record<string, number>;
    kind: EvidenceKind;
    source: string;
  };
  /** Optional CI/CD assumptions. */
  pipeline?: { cacheMissExtraShare: number; kind: EvidenceKind; source: string };
  modelTiers: Record<string, string>;
  skus: Record<string, { vCpu: number; memoryGb: number }>;
}

export interface BaselineValidation {
  ok: boolean;
  errors: string[];
}

const RESOURCE_TYPES = new Set<string>([
  'Microsoft.Compute/virtualMachines',
  'Microsoft.Compute/virtualMachineScaleSets',
  'Microsoft.Web/serverFarms',
  'Microsoft.Sql/servers/databases',
  'Microsoft.Cache/redis',
  'Microsoft.ContainerService/managedClusters',
  'Microsoft.Compute/disks',
  'Microsoft.ContainerRegistry/registries',
  'Microsoft.OperationalInsights/workspaces',
  'Microsoft.CognitiveServices/accounts',
]);

const COMPUTE_TYPES = new Set<string>([
  'Microsoft.Compute/virtualMachines',
  'Microsoft.Compute/virtualMachineScaleSets',
  'Microsoft.Web/serverFarms',
  'Microsoft.Sql/servers/databases',
  'Microsoft.Cache/redis',
]);

/**
 * Field names that would mean a fixture is carrying conclusions instead of facts.
 * Matched case-insensitively against every object key in the baseline.
 */
export const FORBIDDEN_BASELINE_KEYS = [
  'wasteType',
  'isIdle',
  'remediation',
  'remediationRecommendation',
  'recommendation',
  'actionableFix',
  'carbonScore',
  'carbonImpact',
  'carbonSaved',
  'carbonSaved_kgCO2e',
  'energySaved',
  'baselineKWh',
  'optimizedKWh',
  'optimizedKWhWithCaching',
  'estimated_gCO2e',
  'gCo2e',
  'kgCo2e',
  'energyKwh',
  'rating',
  'promptEfficiencyScore',
  'severity',
];

const forbidden = new Set(FORBIDDEN_BASELINE_KEYS.map((key) => key.toLowerCase()));

function findForbiddenKeys(value: unknown, path: string, out: string[]): void {
  if (Array.isArray(value)) {
    value.forEach((item, index) => findForbiddenKeys(item, `${path}[${index}]`, out));
    return;
  }
  if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      const childPath = path ? `${path}.${key}` : key;
      if (forbidden.has(key.toLowerCase())) out.push(childPath);
      findForbiddenKeys(child, childPath, out);
    }
  }
}

const isPct = (n: unknown): boolean => typeof n === 'number' && n >= 0 && n <= 100;

/**
 * Structural and referential checks. Returns every problem found rather than
 * stopping at the first, so a fixture author can fix them in one pass.
 */
export function validateBaseline(input: unknown, factors: BaselineFactors): BaselineValidation {
  const errors: string[] = [];
  const b = input as SubscriptionBaseline;
  if (!b || typeof b !== 'object') return { ok: false, errors: ['Baseline must be an object.'] };

  if (b.schemaVersion !== 1) errors.push('schemaVersion must be 1.');
  if (!['measured', 'synthetic', 'mixed'].includes(b.provenance))
    errors.push('provenance must be measured, synthetic or mixed.');
  if (!b.period || !(b.period.hours > 0)) errors.push('period.hours must be a positive number.');

  const hours = b.period?.hours ?? 0;
  const knownRegion = (region: string) => Object.hasOwn(factors.grid, region);
  const teams = new Set((b.teams ?? []).map((team) => team.id));
  const checkTeam = (team: string | undefined, where: string) => {
    if (!team) errors.push(`${where}: missing team.`);
    else if (!teams.has(team)) errors.push(`${where}: unknown team '${team}'.`);
  };

  for (const region of b.regions ?? []) {
    if (!knownRegion(region)) errors.push(`regions: no grid factor for '${region}'.`);
  }

  const leaked: string[] = [];
  findForbiddenKeys(b, '', leaked);
  for (const path of leaked)
    errors.push(`${path}: computed or conclusion field is not allowed in a baseline.`);

  const resources = new Map<string, BaselineResource>();
  for (const [index, r] of (b.resources ?? []).entries()) {
    const where = `resources[${index}] ${r?.name ?? ''}`.trim();
    if (!r?.id) {
      errors.push(`${where}: missing id.`);
      continue;
    }
    if (resources.has(r.id)) errors.push(`${where}: duplicate id.`);
    resources.set(r.id, r);
    if (!RESOURCE_TYPES.has(r.type)) errors.push(`${where}: unsupported type '${r.type}'.`);
    if (!knownRegion(r.region)) errors.push(`${where}: no grid factor for region '${r.region}'.`);
    checkTeam(r.tags?.team, where);

    if (COMPUTE_TYPES.has(r.type)) {
      const c = r as ComputeResource;
      if (!(c.vCpu > 0)) errors.push(`${where}: vCpu must be positive.`);
      if (!(c.memoryGb > 0)) errors.push(`${where}: memoryGb must be positive.`);
      checkComputeMetrics(c.metrics, hours, where, errors);
      for (const [ri, replica] of (c.dr?.replicas ?? []).entries()) {
        if (!knownRegion(replica.region))
          errors.push(`${where}: dr.replicas[${ri}] has no grid factor for '${replica.region}'.`);
      }
    }
    if (r.type === 'Microsoft.ContainerService/managedClusters') {
      const k = r as KubernetesCluster;
      for (const pool of k.nodePools ?? [])
        checkComputeMetrics(pool.metrics, hours, `${where} nodePool ${pool.name}`, errors);
      for (const w of k.workloads ?? []) {
        checkTeam(w.team, `${where} workload ${w.name}`);
        if (w.usedCpuCoresP95 > w.requestedCpuCores * 4)
          errors.push(`${where} workload ${w.name}: used CPU implausibly exceeds request.`);
      }
    }
    if (r.type === 'Microsoft.ContainerRegistry/registries')
      for (const image of (r as ContainerRegistry).images ?? [])
        checkTeam(image.team, `${where} image ${image.name}`);
    if (r.type === 'Microsoft.OperationalInsights/workspaces')
      for (const table of (r as LogWorkspace).tables ?? [])
        checkTeam(table.team, `${where} table ${table.name}`);
  }

  // Cross-references that need the full resource map.
  for (const r of resources.values()) {
    if (r.type !== 'Microsoft.Compute/disks') continue;
    const attachedTo = (r as Disk).metrics?.attachedTo;
    if (attachedTo && !resources.has(attachedTo))
      errors.push(`disk ${r.name}: attachedTo '${attachedTo}' is not in the baseline.`);
  }

  for (const [index, series] of (b.timeseries ?? []).entries()) {
    const where = `timeseries[${index}]`;
    if (series.resourceId && !resources.has(series.resourceId))
      errors.push(`${where}: resourceId is not in the baseline.`);
    if (series.region && !knownRegion(series.region))
      errors.push(`${where}: no grid factor for region '${series.region}'.`);
    if (!series.resourceId && !series.region) errors.push(`${where}: needs resourceId or region.`);
  }

  for (const p of b.pipelines ?? []) {
    const where = `pipeline ${p.id}`;
    checkTeam(p.team, where);
    if (p.runner?.kind === 'hosted') {
      if (!factors.skus[p.runner.sku])
        errors.push(`${where}: unknown hosted runner sku '${p.runner.sku}'.`);
      if (!knownRegion(p.runner.region)) errors.push(`${where}: no grid factor for runner region.`);
    } else if (p.runner?.kind === 'self-hosted') {
      const host = resources.get(p.runner.resourceId);
      if (!host || !COMPUTE_TYPES.has(host.type))
        errors.push(
          `${where}: self-hosted runner must reference a compute resource in the baseline.`,
        );
    } else errors.push(`${where}: runner.kind must be hosted or self-hosted.`);
    if (p.cache && p.cache.hits + p.cache.misses > p.runsThisPeriod)
      errors.push(`${where}: cache hits + misses exceed runs.`);
    if (p.runsWithDuplicateCommit > p.runsThisPeriod)
      errors.push(`${where}: duplicate-commit runs exceed runs.`);
    if (!isPct(p.cpuAvgPct)) errors.push(`${where}: cpuAvgPct must be 0-100.`);
  }

  for (const w of b.aiWorkloads ?? []) {
    const where = `aiWorkload ${w.id}`;
    checkTeam(w.team, where);
    const account = resources.get(w.accountId);
    if (!account || account.type !== 'Microsoft.CognitiveServices/accounts') {
      errors.push(`${where}: accountId must reference an AI account in the baseline.`);
    } else {
      const deployment = (account as AiAccount).deployments.find((d) => d.name === w.deployment);
      if (!deployment) errors.push(`${where}: deployment '${w.deployment}' not found.`);
      else if (!factors.modelTiers[deployment.model])
        errors.push(`${where}: no model tier for '${deployment.model}'.`);
    }
    if (w.cacheHits > w.requests) errors.push(`${where}: cacheHits exceed requests.`);
    if (w.repeatablePromptShare < 0 || w.repeatablePromptShare > 1)
      errors.push(`${where}: repeatablePromptShare must be 0-1.`);
    const sampled = (w.sampledCalls ?? []).reduce((sum, call) => sum + call.occurrences, 0);
    if (sampled > w.requests) errors.push(`${where}: sampled call occurrences exceed requests.`);
  }

  if (b.collaboration) {
    if (!knownRegion(b.collaboration.storageRegion))
      errors.push('collaboration: no grid factor for storageRegion.');
    const ids = new Set(b.collaboration.recordings.map((rec) => rec.id));
    for (const rec of b.collaboration.recordings) {
      checkTeam(rec.team, `recording ${rec.id}`);
      if (rec.duplicateOf && !ids.has(rec.duplicateOf))
        errors.push(`recording ${rec.id}: duplicateOf '${rec.duplicateOf}' not found.`);
    }
  }

  return { ok: errors.length === 0, errors };
}

function checkComputeMetrics(
  m: ComputeMetrics | undefined,
  periodHours: number,
  where: string,
  errors: string[],
): void {
  if (!m) {
    errors.push(`${where}: missing metrics.`);
    return;
  }
  if (!(m.runtimeHours >= 0) || m.runtimeHours > periodHours)
    errors.push(`${where}: runtimeHours must be between 0 and the period length.`);
  if (m.offHoursRuntimeHours !== undefined && m.offHoursRuntimeHours > m.runtimeHours)
    errors.push(`${where}: offHoursRuntimeHours exceed runtimeHours.`);
  if (!isPct(m.cpu?.avgPct) || !isPct(m.cpu?.p95Pct))
    errors.push(`${where}: cpu avgPct/p95Pct must be 0-100.`);
  else if (m.cpu.p95Pct < m.cpu.avgPct) errors.push(`${where}: cpu p95Pct is below avgPct.`);
}
