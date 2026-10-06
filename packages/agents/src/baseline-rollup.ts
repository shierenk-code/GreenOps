/**
 * Executive rollup for an Azure subscription baseline run.
 *
 * Answers, for the baseline period:
 *   - What does the subscription burn today (modeled)?
 *   - How much would the identified findings save if every one were remediated?
 *   - Where (team, region, agent) is the waste?
 *   - How mature is the estate (A–F), now and if the findings were fixed?
 *   - How quickly would the savings repay GreenOps' own footprint?
 *
 * Every number comes from the translation engine over raw baseline facts, so the
 * whole rollup inherits the baseline's evidence kind (synthetic for the demo).
 */

import type { SustainabilityBug } from '@greenops/detect';
import {
  footprintOfResource,
  maturityGrade,
  sumFootprints,
  translateCompute,
  translateStorage,
  translateTokens,
  weakestKind,
  type AiAccount,
  type BaselineRollup,
  type ContainerRegistry,
  type EvidenceKind,
  type Footprint,
  type KubernetesCluster,
  type LogWorkspace,
  type MaturityCriterion,
  type MaturityScore,
  type RollupAmount,
} from '@greenops/measure';
import { BASELINE_METRIC, scaleFootprint, type BaselineBundle } from './baseline-scan.js';

/** The part of GreenOps' self-cost summary the rollup needs. */
export interface AgentUsage {
  energyKwh: number | null;
  carbonKgCo2e: number | null;
  usageComplete: boolean;
  knownTokens: number;
}

interface Component {
  team: string;
  region: string;
  footprint: Footprint;
}

const empty = (): RollupAmount => ({ energyKwh: 0, kgCo2e: 0, operationalKgCo2e: 0 });

function add(
  into: RollupAmount,
  fp: { energyKwh: number | null; kg: number | null; op: number | null },
) {
  into.energyKwh =
    into.energyKwh === null || fp.energyKwh === null ? null : into.energyKwh + fp.energyKwh;
  into.kgCo2e = into.kgCo2e === null || fp.kg === null ? null : into.kgCo2e + fp.kg;
  into.operationalKgCo2e =
    into.operationalKgCo2e === null || fp.op === null ? null : into.operationalKgCo2e + fp.op;
}

const fromFootprint = (fp: Footprint) => ({
  energyKwh: fp.energyKwh,
  kg: fp.totalKgCo2e,
  op: fp.operationalKgCo2e,
});

const minus = (a: number | null, b: number | null) => (a === null || b === null ? null : a - b);
const round = (n: number, digits = 2) => Number(n.toFixed(digits));

/**
 * Showback for a shared cluster: the workload pool (the largest, the one the
 * Digital Waste agent right-sizes against) is allocated to workload teams by
 * requested cores; unrequested capacity and the other pools stay with the
 * cluster owner. Without this, a workload team's saving would be measured
 * against a footprint booked to the platform team.
 */
function clusterComponents(k: KubernetesCluster, bundle: BaselineBundle): Component[] {
  const { factors: f, dataKind } = bundle;
  const owner = k.tags.team ?? 'unknown';
  const out: Component[] = [];
  const poolFp = (pool: KubernetesCluster['nodePools'][number]) =>
    translateCompute(
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
  const workloadPool = [...k.nodePools].sort((a, z) => z.vCpu * z.nodes - a.vCpu * a.nodes)[0];
  for (const pool of k.nodePools) {
    const fp = poolFp(pool);
    if (pool !== workloadPool) {
      out.push({ team: owner, region: k.region, footprint: fp });
      continue;
    }
    const capacity = pool.vCpu * pool.nodes;
    let allocated = 0;
    for (const w of k.workloads) {
      const share = Math.min(1 - allocated, (w.requestedCpuCores * w.replicas) / capacity);
      if (share <= 0) continue;
      allocated += share;
      out.push({ team: w.team, region: k.region, footprint: scaleFootprint(fp, share) });
    }
    if (allocated < 1)
      out.push({ team: owner, region: k.region, footprint: scaleFootprint(fp, 1 - allocated) });
  }
  return out;
}

/** Every modeled energy consumer in the subscription, attributed to a team and region. */
function components(bundle: BaselineBundle): Component[] {
  const { baseline: b, factors: f, dataKind } = bundle;
  const hours = b.period.hours;
  const out: Component[] = [];
  const team = (tags: Record<string, string>) => tags.team ?? 'unknown';

  for (const r of b.resources) {
    if (r.type === 'Microsoft.ContainerService/managedClusters') {
      out.push(...clusterComponents(r as KubernetesCluster, bundle));
      continue;
    }
    const fp = footprintOfResource(r, hours, f, dataKind);
    if (fp) out.push({ team: team(r.tags), region: r.region, footprint: fp });
    if (r.type === 'Microsoft.ContainerRegistry/registries') {
      for (const img of (r as ContainerRegistry).images)
        out.push({
          team: img.team,
          region: r.region,
          footprint: translateStorage(
            { sizeGb: img.sizeMb / 1000, media: 'ssd', redundancy: 'ZRS', hours, region: r.region },
            f,
            dataKind,
          ),
        });
    }
    if (r.type === 'Microsoft.OperationalInsights/workspaces') {
      for (const t of (r as LogWorkspace).tables)
        out.push({
          team: t.team,
          region: r.region,
          footprint: translateStorage(
            {
              sizeGb: t.gbPerDay * t.retentionDays,
              media: 'ssd',
              redundancy: 'LRS',
              hours,
              region: r.region,
            },
            f,
            dataKind,
          ),
        });
    }
  }

  for (const w of b.aiWorkloads) {
    const account = b.resources.find((r) => r.id === w.accountId) as AiAccount | undefined;
    const model = account?.deployments.find((d) => d.name === w.deployment)?.model ?? w.deployment;
    const region = account?.region ?? 'unknown';
    out.push({
      team: w.team,
      region,
      footprint: translateTokens(
        { inputTokens: w.inputTokens, outputTokens: w.outputTokens, model, region },
        f,
        dataKind,
      ),
    });
  }

  for (const p of b.pipelines) {
    let region = 'unknown';
    if (p.runner.kind === 'hosted') {
      // Self-hosted runner compute is already counted with its scale set.
      region = p.runner.region;
      const sku = f.skus[p.runner.sku];
      if (sku)
        out.push({
          team: p.team,
          region,
          footprint: translateCompute(
            {
              vCpu: sku.vCpu,
              memoryGb: sku.memoryGb,
              hours: (p.runsThisPeriod * p.durationMinutes.median) / 60,
              cpuAvgPct: p.cpuAvgPct,
              region,
            },
            f,
            dataKind,
          ),
        });
    } else {
      const runnerId = p.runner.resourceId;
      region = b.resources.find((r) => r.id === runnerId)?.region ?? 'unknown';
    }
    out.push({
      team: p.team,
      region,
      footprint: translateStorage(
        {
          sizeGb: (p.runsThisPeriod * p.artifactMbPerRun) / 1000,
          media: 'ssd',
          redundancy: 'LRS',
          hours,
          region,
        },
        f,
        dataKind,
      ),
    });
  }

  if (b.collaboration) {
    const c = b.collaboration;
    for (const rec of c.recordings)
      out.push({
        team: rec.team,
        region: c.storageRegion,
        footprint: translateStorage(
          {
            sizeGb: rec.sizeGb,
            media: 'hdd',
            redundancy: c.redundancy ?? 'LRS',
            hours,
            region: c.storageRegion,
          },
          f,
          dataKind,
        ),
      });
  }
  return out;
}

interface Saved {
  bug: SustainabilityBug;
  energyKwh: number;
  kg: number | null;
}

/**
 * Per-finding savings, with overlap removed. Findings modeled against the same
 * base footprint (same resource, symbol and "before" energy) — e.g. caching and
 * prompt trimming on one AI workload — cannot both remove their share of the
 * original: the second acts on what the first leaves. Their fractions combine
 * as 1 − Π(1 − sᵢ), and each finding is scaled down proportionally so the
 * group total matches. Findings on different footprints are summed.
 */
function savings(bugs: SustainabilityBug[]): Saved[] {
  const raw = bugs
    .filter((bug) => bug.estimatedWaste.metric === BASELINE_METRIC)
    .map((bug) => ({
      bug,
      energyKwh: Math.max(0, bug.estimatedWaste.perRun),
      kg: bug.estimatedWaste.periodKgCo2e ?? null,
    }));

  const groups = new Map<string, Saved[]>();
  for (const s of raw) {
    const before = Number(s.bug.evidence.beforeKwh);
    if (!Number.isFinite(before) || before <= 0) continue;
    const key = `${String(s.bug.evidence.resourceId ?? '')}|${s.bug.location.symbol ?? ''}|${before}`;
    groups.set(key, [...(groups.get(key) ?? []), s]);
  }
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    const before = Number(group[0]!.bug.evidence.beforeKwh);
    const summed = group.reduce((t, s) => t + s.energyKwh, 0);
    if (summed <= 0) continue;
    const remaining = group.reduce((p, s) => p * (1 - Math.min(1, s.energyKwh / before)), 1);
    const scale = Math.min(1, ((1 - remaining) * before) / summed);
    for (const s of group) {
      s.energyKwh *= scale;
      if (s.kg !== null) s.kg *= scale;
    }
  }
  return raw;
}

function maturity(
  bundle: BaselineBundle,
  bugs: SustainabilityBug[],
  current: RollupAmount,
  saved: Saved[],
  approvedIds: Set<string>,
  usage: AgentUsage | undefined,
  evidenceKind: EvidenceKind,
  projected: boolean,
): MaturityScore {
  const { baseline: b, factors: f } = bundle;
  const criteria: MaturityCriterion[] = [];
  const flagged = (category: string) =>
    new Set(bugs.filter((x) => x.category === category).map((x) => x.location.symbol));

  // 1) Remediation: share of identified carbon with an approved remediation.
  const identifiedKg = saved.reduce((s, x) => s + (x.kg ?? 0), 0);
  const approvedKg = saved
    .filter((x) => approvedIds.has(x.bug.id))
    .reduce((s, x) => s + (x.kg ?? 0), 0);
  const remediationShare = projected ? 1 : identifiedKg > 0 ? approvedKg / identifiedKg : 1;
  criteria.push({
    id: 'remediation',
    label: 'Identified waste with an approved remediation',
    points: round(30 * remediationShare, 1),
    max: 30,
    detail: projected
      ? 'Assumes every finding is approved and applied.'
      : `${round(approvedKg, 2)} of ${round(identifiedKg, 2)} kgCO2e approved in this run.`,
  });

  // 2) Placement: operational carbon intensity vs the cleanest region the subscription already uses.
  const regions = [...new Set(b.resources.map((r) => r.region))].filter((r) => f.grid[r]);
  const cleanest = Math.min(...regions.map((r) => f.grid[r]!.gCo2PerKwh));
  const relocationKg = saved
    .filter((x) => x.bug.category === 'high-carbon-region')
    .reduce((s, x) => s + (x.kg ?? 0), 0);
  const op = current.operationalKgCo2e;
  const kwh = current.energyKwh;
  const intensity =
    op === null || kwh === null || kwh <= 0
      ? null
      : ((op - (projected ? relocationKg : 0)) * 1000) / kwh;
  const placement = intensity === null ? 0 : Math.min(1, cleanest / intensity);
  criteria.push({
    id: 'placement',
    label: 'Carbon intensity of placement',
    points: round(20 * placement, 1),
    max: 20,
    detail:
      intensity === null
        ? 'Unknown: energy or carbon is incomplete.'
        : `${Math.round(intensity)} gCO2e/kWh against ${cleanest} in the cleanest region in use.`,
  });

  // 3) Pipelines: cache hit rate and duplicate-run rate.
  const cacheFlagged = flagged('pipeline-cache-miss');
  const dupFlagged = flagged('redundant-pipeline-run');
  let hits = 0;
  let lookups = 0;
  let dups = 0;
  let runs = 0;
  for (const p of b.pipelines) {
    const total = p.cache.hits + p.cache.misses;
    const hit =
      projected && cacheFlagged.has(p.id) ? Math.max(p.cache.hits, total * 0.8) : p.cache.hits;
    hits += hit;
    lookups += total;
    dups += projected && dupFlagged.has(p.id) ? 0 : p.runsWithDuplicateCommit;
    runs += p.runsThisPeriod;
  }
  const hitRate = lookups > 0 ? hits / lookups : 1;
  const dupRate = runs > 0 ? dups / runs : 0;
  criteria.push({
    id: 'pipelines',
    label: 'Pipeline efficiency',
    points: round(10 * hitRate + 5 * (1 - dupRate), 1),
    max: 15,
    detail: `Cache hit rate ${Math.round(hitRate * 100)}%, duplicate runs ${Math.round(dupRate * 100)}%.`,
  });

  // 4) AI: cache coverage of repeatable prompts and model-tier fit.
  const uncachedFlagged = flagged('uncached-completion');
  const tierFlagged = flagged('model-tier-mismatch');
  let covered = 0;
  let repeatable = 0;
  let misfit = 0;
  let requests = 0;
  for (const w of b.aiWorkloads) {
    const rep = w.repeatablePromptShare * w.requests;
    repeatable += rep;
    covered += projected && uncachedFlagged.has(w.id) ? rep : Math.min(w.cacheHits, rep);
    requests += w.requests;
    if (!projected && tierFlagged.has(w.id)) misfit += w.requests;
  }
  const coverage = repeatable > 0 ? covered / repeatable : 1;
  const fit = requests > 0 ? 1 - misfit / requests : 1;
  criteria.push({
    id: 'ai',
    label: 'AI efficiency',
    points: round(8 * coverage + 7 * fit, 1),
    max: 15,
    detail: `Cache covers ${Math.round(coverage * 100)}% of repeatable prompts; ${Math.round(fit * 100)}% of requests use a fitting model.`,
  });

  // 5) Evidence quality: share of the carbon that is measured.
  const measuredShare = evidenceKind === 'measured' ? 1 : 0;
  criteria.push({
    id: 'evidence',
    label: 'Evidence quality',
    points: 10 * measuredShare,
    max: 10,
    detail:
      evidenceKind === 'measured'
        ? 'All amounts are measured.'
        : `Amounts are ${evidenceKind}; measured metering would raise this score.`,
  });

  // 6) Agent accountability: GreenOps' own usage fully recorded.
  const accountability = !usage ? 0 : usage.usageComplete ? 1 : usage.knownTokens > 0 ? 0.5 : 0;
  criteria.push({
    id: 'accountability',
    label: 'GreenOps usage recorded',
    points: 10 * accountability,
    max: 10,
    detail: !usage
      ? 'No GreenOps usage was supplied.'
      : usage.usageComplete
        ? 'Every GreenOps model and tool call has recorded usage.'
        : 'Some GreenOps model usage is missing.',
  });

  const score = round(
    criteria.reduce((s, c) => s + c.points, 0),
    1,
  );
  return { score, grade: maturityGrade(score), criteria };
}

export function buildBaselineRollup(
  bundle: BaselineBundle,
  bugs: SustainabilityBug[],
  options: { approvedBugIds?: string[]; agentUsage?: AgentUsage } = {},
): BaselineRollup {
  const { baseline: b, factors: f } = bundle;
  const parts = components(bundle);
  const total = sumFootprints(parts.map((p) => p.footprint));
  const current: RollupAmount = {
    energyKwh: total.energyKwh,
    kgCo2e: total.totalKgCo2e,
    operationalKgCo2e: total.operationalKgCo2e,
  };

  const saved = savings(bugs);
  const identified = empty();
  for (const s of saved) add(identified, { energyKwh: s.energyKwh, kg: s.kg, op: s.kg });
  // Savings carry total (operational + embodied) carbon; operational share is not split per finding.
  identified.operationalKgCo2e = null;

  const optimized: RollupAmount = {
    energyKwh: minus(current.energyKwh, identified.energyKwh),
    kgCo2e: minus(current.kgCo2e, identified.kgCo2e),
    operationalKgCo2e: null,
  };

  const byAgentMap = new Map<string, { findings: number; saving: RollupAmount }>();
  for (const bug of bugs) {
    const id = bug.agentId ?? 'unknown';
    const entry = byAgentMap.get(id) ?? { findings: 0, saving: empty() };
    entry.findings += 1;
    byAgentMap.set(id, entry);
  }
  for (const s of saved) {
    const entry = byAgentMap.get(s.bug.agentId ?? 'unknown')!;
    add(entry.saving, { energyKwh: s.energyKwh, kg: s.kg, op: null });
  }

  const teamMap = new Map<
    string,
    { findings: number; current: RollupAmount; saving: RollupAmount }
  >();
  const regionMap = new Map<string, { current: RollupAmount; saving: RollupAmount }>();
  for (const p of parts) {
    const t = teamMap.get(p.team) ?? { findings: 0, current: empty(), saving: empty() };
    add(t.current, fromFootprint(p.footprint));
    teamMap.set(p.team, t);
    const r = regionMap.get(p.region) ?? { current: empty(), saving: empty() };
    add(r.current, fromFootprint(p.footprint));
    regionMap.set(p.region, r);
  }
  for (const bug of bugs) {
    const team = String(bug.evidence.team ?? 'unknown');
    const t = teamMap.get(team) ?? { findings: 0, current: empty(), saving: empty() };
    t.findings += 1;
    teamMap.set(team, t);
  }
  for (const s of saved) {
    const team = String(s.bug.evidence.team ?? 'unknown');
    const region = String(s.bug.evidence.region ?? 'unknown');
    add(teamMap.get(team)!.saving, { energyKwh: s.energyKwh, kg: s.kg, op: null });
    const r = regionMap.get(region) ?? { current: empty(), saving: empty() };
    add(r.saving, { energyKwh: s.energyKwh, kg: s.kg, op: null });
    regionMap.set(region, r);
  }
  for (const entry of [...teamMap.values(), ...regionMap.values()])
    entry.saving.operationalKgCo2e = null;
  for (const entry of byAgentMap.values()) entry.saving.operationalKgCo2e = null;

  const evidenceKind = weakestKind(
    total.kind,
    ...saved.map((s) => s.bug.estimatedWaste.evidenceKind ?? 'synthetic'),
  );
  const usage = options.agentUsage;
  const approved = new Set(options.approvedBugIds ?? []);

  let breakEven: BaselineRollup['breakEven'];
  if (!usage || usage.energyKwh === null) {
    breakEven = {
      minutes: null,
      note: 'GreenOps usage is incomplete, so its own footprint is unknown.',
    };
  } else if (!identified.energyKwh) {
    breakEven = { minutes: null, note: 'No energy saving was identified in this run.' };
  } else {
    const perMinute = identified.energyKwh / (b.period.hours * 60);
    const minutes = usage.energyKwh / perMinute;
    breakEven = {
      minutes,
      note: `GreenOps used about ${usage.energyKwh.toPrecision(3)} kWh${usage.knownTokens === 0 ? ' (tool calls only; no model tokens were used, so an LLM-backed run will cost more)' : ''}; the identified savings repay that after ${minutes < 1 ? `${(minutes * 60).toPrecision(2)} seconds` : `${minutes.toPrecision(3)} minutes`} of the optimized period, if every finding is applied.`,
    };
  }

  const gaps = [
    ...new Set([
      'Findings on the same footprint are combined (1 − Π(1 − sᵢ)), not summed; cross-resource interactions are not modeled.',
      'Shared AKS capacity is allocated to workload teams by requested CPU (showback); unrequested capacity stays with the cluster owner.',
      'Savings are modeled for one baseline period and are not verified.',
      ...total.gaps,
    ]),
  ];

  return {
    schemaVersion: 1,
    subscriptionId: b.subscriptionId,
    organization: b.organization,
    provenance: b.provenance,
    period: b.period,
    evidenceKind,
    current,
    identifiedSaving: identified,
    optimized,
    savingSharePct:
      current.kgCo2e && identified.kgCo2e !== null
        ? round((identified.kgCo2e / current.kgCo2e) * 100, 1)
        : null,
    byAgent: [...byAgentMap.entries()]
      .map(([agentId, v]) => ({ agentId, ...v }))
      .sort((a, z) => (z.saving.kgCo2e ?? 0) - (a.saving.kgCo2e ?? 0)),
    byTeam: [...teamMap.entries()]
      .map(([team, v]) => ({ team, ...v }))
      .sort((a, z) => (z.saving.kgCo2e ?? 0) - (a.saving.kgCo2e ?? 0)),
    byRegion: [...regionMap.entries()]
      .map(([region, v]) => ({ region, gCo2PerKwh: f.grid[region]?.gCo2PerKwh ?? null, ...v }))
      .sort((a, z) => (z.current.kgCo2e ?? 0) - (a.current.kgCo2e ?? 0)),
    agentFootprint: {
      energyKwh: usage?.energyKwh ?? null,
      kgCo2e: usage?.carbonKgCo2e ?? null,
      usageComplete: usage?.usageComplete ?? false,
    },
    breakEven,
    maturity: {
      current: maturity(bundle, bugs, current, saved, approved, usage, evidenceKind, false),
      projected: maturity(bundle, bugs, current, saved, approved, usage, evidenceKind, true),
    },
    method:
      'Utilization-based compute power, capacity-based storage and per-token inference energy, × PUE, × location-based grid factor per region; embodied carbon for compute. Factors and sources: fixtures/azure-baseline/factors.json.',
    gaps,
  };
}
