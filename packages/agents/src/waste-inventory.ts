import { spawn } from 'node:child_process';

export interface WasteTarget {
  context: string;
  namespace: string;
}
export interface WasteUsage {
  workloadUid: string;
  resourceVersion: string;
  container: string;
  from: string;
  to: string;
  samples: number;
  coveragePercent: number;
  p95CpuCores: number;
  peakCpuCores: number;
  source: string;
}
export interface WasteInventory {
  version: 1;
  mode: 'kubernetes' | 'synthetic';
  target: WasteTarget;
  capturedAt: string;
  coverage: Record<
    'deployments' | 'pods' | 'claims' | 'replicaSets' | 'autoscalers' | 'metrics',
    'complete' | 'unavailable'
  >;
  warnings: string[];
  workloads: Array<{
    name: string;
    uid: string;
    resourceVersion: string;
    replicas: number;
    autoscaled: boolean | null;
    containers: Array<{
      name: string;
      requestedCpuCores: number | null;
      observedCpuCores: number | null;
    }>;
  }>;
  volumes: Array<{
    name: string;
    uid: string;
    resourceVersion: string;
    phase: string;
    capacityGiB: number | null;
    referencedByPods: boolean | null;
    releaseEvidence?: {
      lastUsedAt: string;
      ownerConfirmed: boolean;
      backupRestoreTested: boolean;
      retentionCleared: boolean;
      source: string;
    };
  }>;
  storagePricing?: { usdPerGiBMonth: number; source: string };
}

export function validateWasteTarget(target: WasteTarget): void {
  if (
    !target ||
    typeof target.context !== 'string' ||
    !target.context.trim() ||
    target.context.length > 250 ||
    target.context.startsWith('-') ||
    [...target.context].some((c) => c.charCodeAt(0) < 32) ||
    !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(target.namespace)
  )
    throw new Error('An explicit valid Kubernetes context and namespace are required.');
}

/** Supported Kubernetes quantities only; missing/unsupported quantities stay unknown, never zero. */
export function cpuCores(value: unknown): number | null {
  if (typeof value !== 'string' || !/^\d+(?:\.\d+)?(?:m|u|n)?$/.test(value)) return null;
  const n =
    parseFloat(value) *
    (value.endsWith('m') ? 1e-3 : value.endsWith('u') ? 1e-6 : value.endsWith('n') ? 1e-9 : 1);
  return Number.isFinite(n) && n <= 1e6 ? n : null;
}
export function storageGiB(value: unknown): number | null {
  if (typeof value !== 'string') return null;
  const match = /^(\d+(?:\.\d+)?)(Ki|Mi|Gi|Ti|Pi|K|M|G|T|P)?$/.exec(value);
  if (!match) return null;
  const suffix = match[2] ?? '';
  const powers: Record<string, number> = {
    '': 1,
    Ki: 1024,
    Mi: 1024 ** 2,
    Gi: 1024 ** 3,
    Ti: 1024 ** 4,
    Pi: 1024 ** 5,
    K: 1e3,
    M: 1e6,
    G: 1e9,
    T: 1e12,
    P: 1e15,
  };
  const size = (Number(match[1]) * powers[suffix]!) / 1024 ** 3;
  return Number.isFinite(size) && size <= 1e9 ? size : null;
}

export type WasteResource =
  | 'deployments'
  | 'pods'
  | 'persistentvolumeclaims'
  | 'replicasets'
  | 'horizontalpodautoscalers'
  | 'metrics';
interface Row {
  metadata: {
    name: string;
    namespace?: string;
    uid?: string;
    resourceVersion?: string;
    ownerReferences?: Array<{ uid: string; kind: string }>;
  };
  spec?: {
    replicas?: number;
    template?: {
      spec?: { containers?: Array<{ name: string; resources?: { requests?: { cpu?: unknown } } }> };
    };
    scaleTargetRef?: { kind?: string; name?: string };
    volumes?: Array<{ persistentVolumeClaim?: { claimName?: string } }>;
  };
  status?: { phase?: string; capacity?: { storage?: unknown } };
  timestamp?: string;
  containers?: Array<{ name: string; usage?: { cpu?: unknown } }>;
}
export interface WasteReader {
  list(target: WasteTarget, resource: WasteResource): Promise<unknown>;
}

/** There is deliberately no patch/delete/apply operation in this adapter. */
export class KubectlWasteReader implements WasteReader {
  async list(target: WasteTarget, resource: WasteResource): Promise<unknown> {
    validateWasteTarget(target);
    if (
      ![
        'deployments',
        'pods',
        'persistentvolumeclaims',
        'replicasets',
        'horizontalpodautoscalers',
        'metrics',
      ].includes(resource)
    )
      throw new Error('Unsupported inventory resource.');
    const args = [
      '--context',
      target.context,
      '--namespace',
      target.namespace,
      '--request-timeout=15s',
      'get',
    ];
    if (resource === 'metrics')
      args.push('--raw', `/apis/metrics.k8s.io/v1beta1/namespaces/${target.namespace}/pods`);
    else args.push(resource, '-o', 'json', '--chunk-size=200');
    return new Promise((resolve, reject) => {
      const child = spawn('kubectl', args, {
        shell: false,
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      const chunks: Buffer[] = [];
      let size = 0,
        settled = false;
      const fail = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        child.kill();
        reject(
          new Error(
            'Inventory query unavailable, invalid or exceeded limits; raw cluster output is not logged.',
          ),
        );
      };
      const timer = setTimeout(fail, 20_000);
      child.stdout.on('data', (chunk: Buffer) => {
        size += chunk.length;
        if (size > 4 * 1024 * 1024) fail();
        else chunks.push(chunk);
      });
      child.stderr.on('data', () => undefined);
      child.on('error', fail);
      child.on('close', (code) => {
        if (settled) return;
        if (code !== 0) {
          fail();
          return;
        }
        try {
          const result: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'));
          settled = true;
          clearTimeout(timer);
          resolve(result);
        } catch {
          fail();
        }
      });
    });
  }
}

export async function discoverWaste(
  target: WasteTarget,
  reader: WasteReader,
  now = new Date(),
): Promise<WasteInventory> {
  validateWasteTarget(target);
  const coverage: WasteInventory['coverage'] = {
    deployments: 'unavailable',
    pods: 'unavailable',
    claims: 'unavailable',
    replicaSets: 'unavailable',
    autoscalers: 'unavailable',
    metrics: 'unavailable',
  };
  const warnings: string[] = [];
  const load = async (resource: WasteResource, key: keyof typeof coverage): Promise<Row[]> => {
    try {
      const raw = (await reader.list(target, resource)) as {
        items?: Row[];
        metadata?: { continue?: string };
      };
      if (
        !raw ||
        !Array.isArray(raw.items) ||
        raw.items.length > 5000 ||
        raw.metadata?.continue ||
        raw.items.some(
          (row: Row) =>
            !row?.metadata || row.metadata.namespace !== target.namespace || !row.metadata.name,
        )
      )
        throw new Error('Incomplete or wrong-namespace resource list.');
      coverage[key] = 'complete';
      if (
        resource === 'pods' &&
        raw.items.some(
          (p) => !p.spec || (p.spec.volumes !== undefined && !Array.isArray(p.spec.volumes)),
        )
      )
        throw new Error('Malformed pod references.');
      return raw.items;
    } catch {
      coverage[key] = 'unavailable';
      warnings.push(`${key}: unavailable or incomplete; missing data is not zero.`);
      return [];
    }
  };
  // Six bounded read-only subprocess queries; kubectl may paginate internally. No retries or raw persistence.
  const deployments = await load('deployments', 'deployments');
  const pods = await load('pods', 'pods');
  const claims = await load('persistentvolumeclaims', 'claims');
  const replicaSets = await load('replicasets', 'replicaSets');
  const hpas = await load('horizontalpodautoscalers', 'autoscalers');
  const metrics = await load('metrics', 'metrics');
  const workloads: WasteInventory['workloads'] = [];
  for (const d of deployments) {
    if (
      !d.metadata.uid ||
      !d.metadata.resourceVersion ||
      !Array.isArray(d.spec?.template?.spec?.containers)
    ) {
      coverage.deployments = 'unavailable';
      warnings.push('Malformed deployment omitted.');
      continue;
    }
    const rsIds = new Set(
      replicaSets
        .filter((r) =>
          r.metadata.ownerReferences?.some(
            (o) => o.uid === d.metadata.uid && o.kind === 'Deployment',
          ),
        )
        .map((r) => r.metadata.uid),
    );
    const owned = pods.filter((p) =>
      p.metadata.ownerReferences?.some((o) => o.kind === 'ReplicaSet' && rsIds.has(o.uid)),
    );
    workloads.push({
      name: d.metadata.name,
      uid: d.metadata.uid,
      resourceVersion: d.metadata.resourceVersion,
      replicas: d.spec.replicas ?? 1,
      autoscaled:
        coverage.autoscalers === 'complete'
          ? hpas.some(
              (h) =>
                h.spec?.scaleTargetRef?.kind === 'Deployment' &&
                h.spec.scaleTargetRef.name === d.metadata.name,
            )
          : null,
      containers: d.spec.template.spec.containers.map((c) => {
        const values = owned.map((p) => {
          const m = metrics.find((row) => row.metadata.name === p.metadata.name);
          const age = now.getTime() - Date.parse(m?.timestamp ?? '');
          return Number.isFinite(age) && age >= 0 && age <= 5 * 60_000
            ? cpuCores(m?.containers?.find((item) => item.name === c.name)?.usage?.cpu)
            : null;
        });
        return {
          name: c.name,
          requestedCpuCores: cpuCores(c.resources?.requests?.cpu),
          observedCpuCores:
            coverage.pods === 'complete' &&
            coverage.replicaSets === 'complete' &&
            coverage.metrics === 'complete' &&
            values.length &&
            values.every((v) => v !== null)
              ? Math.max(...(values as number[]))
              : null,
        };
      }),
    });
  }
  const volumes: WasteInventory['volumes'] = [];
  for (const c of claims) {
    if (!c.metadata.uid || !c.metadata.resourceVersion) {
      coverage.claims = 'unavailable';
      warnings.push('Malformed claim omitted.');
      continue;
    }
    volumes.push({
      name: c.metadata.name,
      uid: c.metadata.uid,
      resourceVersion: c.metadata.resourceVersion,
      phase: c.status?.phase ?? 'Unknown',
      capacityGiB: storageGiB(c.status?.capacity?.storage),
      referencedByPods:
        coverage.pods === 'complete'
          ? pods.some((p) =>
              p.spec?.volumes?.some((v) => v.persistentVolumeClaim?.claimName === c.metadata.name),
            )
          : null,
    });
  }
  warnings.push(
    'Namespace-scoped Kubernetes inventory only; no Azure disk inventory, registry image sizes, log retention or historical utilization collected.',
  );
  return {
    version: 1,
    mode: 'kubernetes',
    target: { ...target },
    capturedAt: now.toISOString(),
    coverage,
    warnings,
    workloads,
    volumes,
  };
}
