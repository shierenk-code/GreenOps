import { spawn } from 'node:child_process';
import {
  averageIntensity,
  timestamp,
  validateForecast,
  type GridCarbonProvider,
} from './carbon-grid.js';
import {
  fingerprint,
  validatePlan,
  meetsCarbonBenefit,
  type CarbonPlan,
  type CarbonRegion,
} from './carbon-planner.js';

const CLAIM = 'greenops.dev/carbon-plan';
const SOURCE = 'greenops.dev/source-uid';

export interface KubeJob {
  apiVersion: string;
  kind: string;
  metadata: {
    name: string;
    namespace?: string;
    uid?: string;
    resourceVersion?: string;
    labels?: Record<string, string>;
    annotations?: Record<string, string>;
    ownerReferences?: unknown[];
    deletionTimestamp?: string;
  };
  spec: {
    suspend?: boolean;
    completions?: number;
    parallelism?: number;
    manualSelector?: boolean;
    backoffLimit?: number;
    activeDeadlineSeconds?: number;
    completionMode?: string;
    managedBy?: string;
    podFailurePolicy?: unknown;
    successPolicy?: unknown;
    backoffLimitPerIndex?: number;
    maxFailedIndexes?: number;
    podReplacementPolicy?: string;
    template: {
      metadata?: { labels?: Record<string, string>; annotations?: Record<string, string> };
      spec: Record<string, unknown>;
    };
  };
  status?: {
    active?: number;
    succeeded?: number;
    failed?: number;
    startTime?: string;
    completionTime?: string;
    conditions?: Array<{ type: string; status: string }>;
  };
}

export interface SourceSnapshot {
  uid: string;
  resourceVersion: string;
  templateHash: string;
}
export interface CarbonApproval {
  planId: string;
  approvedAt: string;
  reviewer: string;
  reason: string;
  source: SourceSnapshot;
}
export interface CarbonReceipt {
  planId: string;
  target: CarbonRegion;
  jobName: string;
  jobUid: string;
  mode: 'kubernetes' | 'simulation';
  dispatchedAt: string;
  savingsVerified: false;
}
export interface CarbonKubeApi {
  readonly mode: 'kubernetes' | 'simulation';
  getJob(region: CarbonRegion, name: string): Promise<KubeJob | null>;
  podCount(region: CarbonRegion, sourceUid: string): Promise<number>;
  regionAvailable(region: CarbonRegion): Promise<boolean>;
  dryRun(region: CarbonRegion, job: KubeJob): Promise<void>;
  claim(region: CarbonRegion, job: KubeJob, planId: string): Promise<void>;
  create(region: CarbonRegion, job: KubeJob): Promise<KubeJob>;
  resume(region: CarbonRegion, job: KubeJob): Promise<KubeJob>;
}

function sourceRegion(plan: CarbonPlan): CarbonRegion {
  return plan.workload.regions.find((r) => r.id === plan.workload.sourceRegion)!;
}

function cleanTemplate(job: KubeJob): KubeJob['spec']['template'] {
  const template = structuredClone(job.spec.template);
  const labels = template.metadata?.labels;
  if (labels)
    for (const key of [
      'controller-uid',
      'job-name',
      'batch.kubernetes.io/controller-uid',
      'batch.kubernetes.io/job-name',
    ])
      delete labels[key];
  if (template.metadata?.labels && !Object.keys(template.metadata.labels).length)
    delete template.metadata.labels;
  if (template.metadata?.annotations && !Object.keys(template.metadata.annotations).length)
    delete template.metadata.annotations;
  if (template.metadata && !Object.keys(template.metadata).length) delete template.metadata;
  return template;
}

function assertQueued(
  job: KubeJob | null,
  region: CarbonRegion,
  name: string,
  managed = true,
): asserts job is KubeJob {
  if (
    !job ||
    job.kind !== 'Job' ||
    job.apiVersion !== 'batch/v1' ||
    job.metadata?.name !== name ||
    job.metadata.namespace !== region.namespace ||
    !job.metadata.uid ||
    !job.metadata.resourceVersion ||
    job.metadata.deletionTimestamp ||
    job.metadata.ownerReferences?.length ||
    (managed && job.metadata.labels?.['greenops.dev/carbon-managed'] !== 'true') ||
    job.spec?.suspend !== true ||
    (job.spec.completions ?? 1) !== 1 ||
    (job.spec.parallelism ?? 1) !== 1 ||
    job.spec.manualSelector ||
    job.status?.startTime ||
    job.status?.active ||
    job.status?.succeeded ||
    job.status?.failed ||
    job.status?.conditions?.some(
      (c) =>
        c.status === 'True' &&
        ['Complete', 'Failed', 'FailureTarget', 'SuccessCriteriaMet'].includes(c.type),
    )
  ) {
    throw new Error(
      'Only explicitly managed, suspended, never-started, single-run Jobs without owners are supported.',
    );
  }
  // Refuse semantics that the destination manifest does not preserve. Kubernetes defaults are allowed.
  const supportedSpecKeys = new Set([
    'suspend',
    'completions',
    'parallelism',
    'manualSelector',
    'backoffLimit',
    'activeDeadlineSeconds',
    'template',
    'completionMode',
    'managedBy',
    'selector',
    'podReplacementPolicy',
  ]);
  if (
    Object.keys(job.spec).some((key) => !supportedSpecKeys.has(key)) ||
    (job.spec.completionMode !== undefined && job.spec.completionMode !== 'NonIndexed') ||
    (job.spec.managedBy !== undefined && job.spec.managedBy !== 'kubernetes.io/job-controller') ||
    job.spec.podFailurePolicy !== undefined ||
    job.spec.successPolicy !== undefined ||
    job.spec.backoffLimitPerIndex !== undefined ||
    job.spec.maxFailedIndexes !== undefined ||
    (job.spec.podReplacementPolicy !== undefined &&
      job.spec.podReplacementPolicy !== 'TerminatingOrFailed')
  )
    throw new Error(
      'Unsupported Job execution policy; this adapter only supports standard NonIndexed Jobs.',
    );
  const pod = job.spec.template?.spec;
  if (
    !pod ||
    !Array.isArray(pod.containers) ||
    pod.containers.length === 0 ||
    pod.nodeName ||
    pod.affinity ||
    pod.schedulingGates ||
    pod.hostNetwork ||
    pod.hostPID ||
    pod.hostIPC ||
    (pod.restartPolicy !== 'Never' && pod.restartPolicy !== 'OnFailure')
  ) {
    throw new Error('Unsupported pod scheduling or isolation configuration.');
  }
  if (pod.volumes !== undefined) {
    const allowed = new Set(['emptyDir', 'configMap', 'secret', 'projected', 'downwardAPI']);
    if (
      !Array.isArray(pod.volumes) ||
      pod.volumes.some((v) => {
        if (!v || typeof v !== 'object' || Array.isArray(v)) return true;
        const volume = v as Record<string, unknown>;
        const sources = Object.keys(volume).filter((key) => key !== 'name');
        return (
          typeof volume.name !== 'string' ||
          !volume.name ||
          sources.length !== 1 ||
          !allowed.has(sources[0]!) ||
          !volume[sources[0]!] ||
          typeof volume[sources[0]!] !== 'object' ||
          Array.isArray(volume[sources[0]!])
        );
      })
    )
      throw new Error(
        'Unsupported volume: only explicitly allowed ephemeral/configuration volumes may be dispatched.',
      );
  }
}

export async function captureCarbonSource(
  plan: CarbonPlan,
  api: CarbonKubeApi,
): Promise<SourceSnapshot> {
  validatePlan(plan);
  if (api.mode === 'kubernetes' && plan.workload.simulationOnly)
    throw new Error('Synthetic workloads cannot target a real cluster.');
  const region = sourceRegion(plan),
    job = await api.getJob(region, plan.workload.sourceJob);
  assertQueued(job, region, plan.workload.sourceJob);
  if (job.metadata.annotations?.[CLAIM] && job.metadata.annotations[CLAIM] !== plan.id)
    throw new Error('Source Job is already claimed by another plan.');
  if ((await api.podCount(region, job.metadata.uid!)) !== 0)
    throw new Error('Source Job already has pods; refusing duplicate execution.');
  return {
    uid: job.metadata.uid!,
    resourceVersion: job.metadata.resourceVersion!,
    templateHash: fingerprint(cleanTemplate(job)),
  };
}

/** Foreground scheduler; no cloud writes until approved time, revalidation, and explicit approval. */
export async function executeCarbonPlan(
  plan: CarbonPlan,
  approval: CarbonApproval,
  api: CarbonKubeApi,
  provider: GridCarbonProvider,
  hooks: {
    now?: () => Date;
    wait?: (ms: number) => Promise<void>;
    event: (stage: string, data: Record<string, unknown>) => void;
  },
): Promise<CarbonReceipt> {
  validatePlan(plan);
  if (api.mode === 'kubernetes' && plan.workload.simulationOnly)
    throw new Error('Synthetic workloads cannot target a real cluster.');
  const now = hooks.now ?? (() => new Date());
  const initial = now().getTime();
  const planAge = initial - timestamp(plan.createdAt),
    approvalAge = initial - timestamp(approval.approvedAt);
  if (
    approval.planId !== plan.id ||
    !approval.reviewer?.trim() ||
    !approval.reason?.trim() ||
    planAge < 0 ||
    planAge > 15 * 60_000 ||
    approvalAge < 0 ||
    approvalAge > 5 * 60_000 ||
    !approval.source?.uid ||
    !approval.source.resourceVersion ||
    !approval.source.templateHash
  ) {
    throw new Error(
      'A fresh, explicit human approval bound to this plan and source snapshot is required.',
    );
  }
  if (api.mode === 'kubernetes' && plan.forecasts.some((f) => f.provider !== 'neso'))
    throw new Error('Synthetic forecasts cannot authorize real cluster dispatch.');
  const selected = plan.selected!,
    destination = plan.workload.regions.find((r) => r.id === selected.regionId);
  if (!destination) throw new Error('Destination is not in the approved region allowlist.');
  hooks.event('approve', {
    planId: plan.id,
    reviewer: approval.reviewer,
    reason: approval.reason,
    source: approval.source,
    identity: 'self-declared local reviewer; not authenticated enterprise identity',
  });
  const start = timestamp(selected.start);
  if (start > initial + 48 * 60 * 60_000)
    throw new Error('Dispatch exceeds the 48-hour scheduling limit.');
  const wait = hooks.wait ?? ((ms) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  while (now().getTime() < start) await wait(Math.min(30_000, start - now().getTime()));
  const dispatchTime = now();
  if (
    dispatchTime.getTime() > start + 60_000 ||
    dispatchTime.getTime() + plan.workload.durationMinutes * 60_000 >
      timestamp(plan.workload.deadline)
  ) {
    throw new Error('Approved dispatch window was missed; create a new plan.');
  }
  const fresh = validateForecast(
    await provider.forecast(destination.gridRegionId, dispatchTime),
    destination.gridRegionId,
    dispatchTime,
  );
  if (api.mode === 'kubernetes' && fresh.provider !== 'neso')
    throw new Error('Real dispatch requires a live forecast.');
  const intensity = averageIntensity(fresh, dispatchTime.getTime(), plan.workload.durationMinutes);
  const projected = intensity === null ? null : (selected.energyKwh * intensity) / 1000;
  if (
    projected === null ||
    !meetsCarbonBenefit(plan.workload, plan.baseline!.estimatedKgCo2, projected) ||
    projected > selected.estimatedKgCo2 * 1.05
  ) {
    throw new Error(
      'Forecast no longer supports the approved benefit (5% drift limit); re-plan and review.',
    );
  }
  const origin = sourceRegion(plan);
  let source = await api.getJob(origin, plan.workload.sourceJob);
  assertQueued(source, origin, plan.workload.sourceJob);
  const claimed = source.metadata.annotations?.[CLAIM];
  if (
    source.metadata.uid !== approval.source.uid ||
    fingerprint(cleanTemplate(source)) !== approval.source.templateHash ||
    (claimed
      ? claimed !== plan.id
      : source.metadata.resourceVersion !== approval.source.resourceVersion) ||
    (await api.podCount(origin, source.metadata.uid!)) !== 0
  )
    throw new Error('Source changed or was claimed since approval.');
  if (!(await api.regionAvailable(destination)))
    throw new Error('No ready, schedulable node matches the approved destination region.');
  const template = cleanTemplate(source);
  template.spec.nodeSelector = {
    ...(template.spec.nodeSelector as Record<string, string> | undefined),
    'topology.kubernetes.io/region': destination.nodeRegion,
  };
  const name = `go-${plan.workload.sourceJob.slice(0, 20)}-${plan.id.slice(-24)}`;
  const manifest: KubeJob = {
    apiVersion: 'batch/v1',
    kind: 'Job',
    metadata: {
      name,
      namespace: destination.namespace,
      labels: { 'greenops.dev/carbon-managed': 'true' },
      annotations: { [CLAIM]: plan.id, [SOURCE]: source.metadata.uid! },
    },
    spec: {
      suspend: true,
      parallelism: 1,
      completions: 1,
      backoffLimit: 0,
      activeDeadlineSeconds: Math.max(
        1,
        Math.min(
          source.spec.activeDeadlineSeconds ?? Infinity,
          Math.floor((timestamp(plan.workload.deadline) - dispatchTime.getTime()) / 1000),
        ),
      ),
      template,
    },
  };
  let target = await api.getJob(destination, name);
  if (!target) await api.dryRun(destination, manifest);
  const assertDispatchWindow = () => {
    const time = now().getTime();
    if (
      time > start + 60_000 ||
      time + plan.workload.durationMinutes * 60_000 > timestamp(plan.workload.deadline)
    )
      throw new Error(
        'Dispatch checks exceeded the approved window; do not resume the target. Re-plan and review.',
      );
  };
  assertDispatchWindow();
  hooks.event('improve', {
    state: 'dispatch-intent',
    planId: plan.id,
    sourceUid: source.metadata.uid,
    targetContext: destination.context,
    namespace: destination.namespace,
    job: name,
    refreshedForecast: fresh,
    projectedKgCo2: projected,
    measuredSavings: null,
  });
  if (!claimed) await api.claim(origin, source, plan.id);
  if (!target) target = await api.create(destination, manifest);
  if (
    target.metadata.annotations?.[CLAIM] !== plan.id ||
    target.metadata.annotations?.[SOURCE] !== source.metadata.uid ||
    !target.metadata.uid ||
    target.metadata.namespace !== destination.namespace ||
    fingerprint(cleanTemplate(target)) !== fingerprint(template) ||
    target.metadata.deletionTimestamp ||
    (target.spec.completions ?? 1) !== 1 ||
    (target.spec.parallelism ?? 1) !== 1 ||
    target.spec.backoffLimit !== 0
  ) {
    throw new Error(
      'Target Job differs from the approved dispatch; left suspended for manual review.',
    );
  }
  // Recheck source just before starting the target. Cross-cluster transactions are not available.
  source = await api.getJob(origin, plan.workload.sourceJob);
  assertQueued(source, origin, plan.workload.sourceJob);
  if (
    source.metadata.uid !== approval.source.uid ||
    source.metadata.annotations?.[CLAIM] !== plan.id ||
    fingerprint(cleanTemplate(source)) !== approval.source.templateHash ||
    (await api.podCount(origin, source.metadata.uid!)) !== 0
  ) {
    throw new Error('Source reservation changed; target is not resumed.');
  }
  if (target.spec.suspend === true) {
    assertDispatchWindow();
    assertQueued(target, destination, name);
    target = await api.resume(destination, target);
  }
  if (
    target.spec.suspend !== false ||
    !target.metadata.uid ||
    target.metadata.annotations?.[CLAIM] !== plan.id
  ) {
    throw new Error('Target dispatch was not confirmed; inspect the Job before retrying.');
  }
  const receipt: CarbonReceipt = {
    planId: plan.id,
    target: destination,
    jobName: name,
    jobUid: target.metadata.uid!,
    mode: api.mode,
    dispatchedAt: now().toISOString(),
    savingsVerified: false,
  };
  hooks.event('improve', {
    state: 'dispatched',
    ...receipt,
    originalJob: 'retained suspended; do not resume it',
    measuredSavings: null,
  });
  return receipt;
}

export async function observeCarbonJob(
  receipt: CarbonReceipt,
  api: CarbonKubeApi,
): Promise<{
  status: string;
  savingsVerified: false;
  executionWindow?: { start: string; finish: string };
}> {
  const job = await api.getJob(receipt.target, receipt.jobName);
  if (
    !job ||
    job.metadata.uid !== receipt.jobUid ||
    job.metadata.annotations?.[CLAIM] !== receipt.planId
  ) {
    return { status: 'missing-or-replaced', savingsVerified: false };
  }
  const conditions = job.status?.conditions ?? [];
  const status = conditions.some((c) => c.type === 'Complete' && c.status === 'True')
    ? 'completed'
    : conditions.some((c) => ['Failed', 'FailureTarget'].includes(c.type) && c.status === 'True')
      ? 'failed'
      : job.spec.suspend
        ? 'suspended'
        : 'pending-or-running';
  return {
    status,
    savingsVerified: false,
    ...(status === 'completed' && job.status?.startTime && job.status.completionTime
      ? { executionWindow: { start: job.status.startTime, finish: job.status.completionTime } }
      : {}),
  };
}

export class KubectlCarbonApi implements CarbonKubeApi {
  readonly mode = 'kubernetes' as const;

  private command(region: CarbonRegion, args: string[], input?: unknown): Promise<string> {
    // Always use explicit context and namespace; never the user's current kubectl context.
    for (const value of [region.context, region.namespace])
      if (!value || value.startsWith('-') || /[\r\n\0]/.test(value))
        throw new Error('Invalid Kubernetes target.');
    return new Promise((resolve, reject) => {
      const child = spawn(
        'kubectl',
        [
          '--context',
          region.context,
          '--namespace',
          region.namespace,
          '--request-timeout=15s',
          ...args,
        ],
        { shell: false, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] },
      );
      let output = '',
        size = 0,
        failed = false;
      const fail = () => {
        if (!failed) {
          failed = true;
          child.kill();
          reject(
            new Error(
              'Kubernetes command failed or exceeded limits; inspect cluster access/state locally.',
            ),
          );
        }
      };
      const timer = setTimeout(fail, 20_000);
      child.stdout.on('data', (chunk: Buffer) => {
        size += chunk.length;
        if (size > 2 * 1024 * 1024) fail();
        else output += chunk.toString('utf8');
      });
      child.stderr.on('data', () => undefined); // Never echo credentials or full manifests from provider errors.
      child.on('error', fail);
      child.on('close', (code) => {
        clearTimeout(timer);
        if (failed) return;
        if (code !== 0) fail();
        else resolve(output);
      });
      child.stdin.on('error', fail);
      child.stdin.end(input === undefined ? undefined : JSON.stringify(input));
    });
  }

  async getJob(region: CarbonRegion, name: string): Promise<KubeJob | null> {
    if (!/^[a-z0-9][a-z0-9.-]{0,62}$/.test(name)) throw new Error('Invalid Kubernetes Job name.');
    const raw = await this.command(region, [
      'get',
      'job',
      name,
      '--ignore-not-found=true',
      '-o',
      'json',
    ]);
    return raw.trim() ? (JSON.parse(raw) as KubeJob) : null;
  }
  async podCount(region: CarbonRegion, uid: string): Promise<number> {
    const result = JSON.parse(await this.command(region, ['get', 'pods', '-o', 'json'])) as {
      items?: Array<{
        metadata?: { ownerReferences?: Array<{ uid?: string }>; labels?: Record<string, string> };
      }>;
    };
    if (!Array.isArray(result.items)) throw new Error('Cannot verify source pods.');
    return result.items.filter(
      (pod) =>
        pod.metadata?.ownerReferences?.some((owner) => owner.uid === uid) ||
        pod.metadata?.labels?.['batch.kubernetes.io/controller-uid'] === uid ||
        pod.metadata?.labels?.['controller-uid'] === uid,
    ).length;
  }
  async regionAvailable(region: CarbonRegion): Promise<boolean> {
    const result = JSON.parse(
      await this.command(region, [
        'get',
        'nodes',
        '-l',
        `topology.kubernetes.io/region=${region.nodeRegion}`,
        '-o',
        'json',
      ]),
    ) as {
      items?: Array<{
        spec?: { unschedulable?: boolean };
        status?: { conditions?: Array<{ type: string; status: string }> };
      }>;
    };
    return !!result.items?.some(
      (node) =>
        !node.spec?.unschedulable &&
        node.status?.conditions?.some((c) => c.type === 'Ready' && c.status === 'True'),
    );
  }
  async dryRun(region: CarbonRegion, job: KubeJob): Promise<void> {
    await this.command(region, ['create', '--dry-run=server', '-f', '-', '-o', 'json'], job);
  }
  async claim(region: CarbonRegion, job: KubeJob, planId: string): Promise<void> {
    await this.command(region, [
      'patch',
      'job',
      job.metadata.name,
      '--type=json',
      '-p',
      JSON.stringify([
        { op: 'test', path: '/metadata/uid', value: job.metadata.uid },
        { op: 'test', path: '/metadata/resourceVersion', value: job.metadata.resourceVersion },
        { op: 'test', path: '/spec/suspend', value: true },
        ...(!job.metadata.annotations
          ? [{ op: 'add', path: '/metadata/annotations', value: {} }]
          : []),
        { op: 'add', path: '/metadata/annotations/greenops.dev~1carbon-plan', value: planId },
      ]),
    ]);
  }
  async create(region: CarbonRegion, job: KubeJob): Promise<KubeJob> {
    return JSON.parse(
      await this.command(region, ['create', '-f', '-', '-o', 'json'], job),
    ) as KubeJob;
  }
  async resume(region: CarbonRegion, job: KubeJob): Promise<KubeJob> {
    return JSON.parse(
      await this.command(region, [
        'patch',
        'job',
        job.metadata.name,
        '--type=json',
        '-p',
        JSON.stringify([
          { op: 'test', path: '/metadata/uid', value: job.metadata.uid },
          { op: 'test', path: '/metadata/resourceVersion', value: job.metadata.resourceVersion },
          { op: 'test', path: '/spec/suspend', value: true },
          { op: 'replace', path: '/spec/suspend', value: false },
        ]),
        '-o',
        'json',
      ]),
    ) as KubeJob;
  }
}
