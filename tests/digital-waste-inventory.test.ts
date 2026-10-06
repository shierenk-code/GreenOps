import { describe, expect, it, vi } from 'vitest';
import {
  discoverWaste,
  cpuCores,
  storageGiB,
  validateWasteTarget,
  type WasteResource,
} from '../packages/agents/src/waste-inventory.js';
const NOW = new Date('2026-10-05T10:00:00Z');
const target = { context: 'mock-aks', namespace: 'demo' };
const meta = (name: string) => ({
  name,
  namespace: 'demo',
  uid: `${name}-uid`,
  resourceVersion: '1',
  annotations: { private: 'SECRET' },
});
function fixture() {
  const rows = {
    deployments: {
      items: [
        {
          metadata: meta('api'),
          spec: {
            replicas: 2,
            template: {
              spec: {
                containers: [
                  {
                    name: 'app',
                    env: [{ name: 'TOKEN', value: 'SECRET' }],
                    resources: { requests: { cpu: '1000m' } },
                  },
                ],
              },
            },
          },
        },
      ],
    },
    replicasets: {
      items: [
        { metadata: { ...meta('rs'), ownerReferences: [{ uid: 'api-uid', kind: 'Deployment' }] } },
      ],
    },
    pods: {
      items: [
        {
          metadata: { ...meta('pod'), ownerReferences: [{ uid: 'rs-uid', kind: 'ReplicaSet' }] },
          spec: { volumes: [{ persistentVolumeClaim: { claimName: 'used' } }] },
        },
      ],
    },
    persistentvolumeclaims: {
      items: ['used', 'unused'].map((name) => ({
        metadata: meta(name),
        status: { phase: 'Bound', capacity: { storage: '10Gi' } },
      })),
    },
    horizontalpodautoscalers: { items: [] },
    metrics: {
      items: [
        {
          metadata: meta('pod'),
          timestamp: NOW.toISOString(),
          containers: [{ name: 'app', usage: { cpu: '100000000n' } }],
        },
      ],
    },
  };
  const list = vi.fn(async (_target, resource: WasteResource): Promise<unknown> => rows[resource]);
  return { rows, list };
}
describe('read-only namespace inventory', () => {
  it('projects safe resource evidence without environment variables, annotations, secrets or full manifests', async () => {
    const f = fixture();
    const i = await discoverWaste(target, f, NOW);
    expect(f.list).toHaveBeenCalledTimes(6);
    expect(i.workloads[0]!.containers[0]).toEqual({
      name: 'app',
      requestedCpuCores: 1,
      observedCpuCores: 0.1,
    });
    expect(i.volumes[0]!.referencedByPods).toBe(true);
    expect(i.volumes[1]!.referencedByPods).toBe(false);
    expect(i.volumes[1]!.capacityGiB).toBe(10);
    expect(JSON.stringify(i)).not.toContain('SECRET');
    expect(JSON.stringify(i)).not.toContain('TOKEN');
  });
  it('keeps missing metrics unknown and autoscaler failure blocking', async () => {
    const f = fixture();
    const base = f.list.getMockImplementation()!;
    f.list.mockImplementation(async (t, r) => {
      if (r === 'metrics' || r === 'horizontalpodautoscalers') throw new Error('PRIVATE_TOKEN');
      return base(t, r);
    });
    const i = await discoverWaste(target, f, NOW);
    expect(i.workloads[0]!.containers[0]!.observedCpuCores).toBeNull();
    expect(i.workloads[0]!.autoscaled).toBeNull();
    expect(i.coverage.metrics).toBe('unavailable');
    expect(JSON.stringify(i)).not.toContain('PRIVATE_TOKEN');
  });
  it.each(['foreign-namespace', 'pagination', 'missing-pod-spec'] as const)(
    'fails closed on %s pod lists',
    async (condition) => {
      const f = fixture(),
        base = f.list.getMockImplementation()!;
      f.list.mockImplementation(async (t, r) => {
        if (r !== 'pods') return base(t, r);
        if (condition === 'pagination') return { ...f.rows.pods, metadata: { continue: 'more' } };
        if (condition === 'missing-pod-spec') return { items: [{ metadata: meta('pod') }] };
        return { items: [{ metadata: { ...meta('pod'), namespace: 'another' }, spec: {} }] };
      });
      const i = await discoverWaste(target, f, NOW);
      expect(i.coverage.pods).toBe('unavailable');
      expect(i.volumes.every((v) => v.referencedByPods === null)).toBe(true);
    },
  );
  it('does not treat stale or future metrics as current usage', async () => {
    for (const date of ['2026-10-04T10:00:00Z', '2026-10-06T10:00:00Z']) {
      const f = fixture();
      f.rows.metrics.items[0]!.timestamp = date;
      expect(
        (await discoverWaste(target, f, NOW)).workloads[0]!.containers[0]!.observedCpuCores,
      ).toBeNull();
    }
  });
  it.each(['--context=other', 'bad\ncontext', ''])('rejects unsafe context %s', (context) => {
    expect(() => validateWasteTarget({ ...target, context })).toThrow();
  });
  it.each(['../secrets', '--all-namespaces', 'Uppercase', ''])(
    'rejects unsafe namespace %s',
    (namespace) => {
      expect(() => validateWasteTarget({ ...target, namespace })).toThrow();
    },
  );
  it.each([
    ['1000m', 1],
    ['1000000u', 1],
    ['1000000000n', 1],
    ['0.25', 0.25],
    ['4', 4],
  ] as const)('parses CPU %s', (input, expected) => expect(cpuCores(input)).toBe(expected));
  it.each([null, undefined, '-1', 'NaN', '1e99', '1Ki'])(
    'preserves unsupported CPU %s as unknown',
    (input) => expect(cpuCores(input)).toBeNull(),
  );
  it('distinguishes binary storage units from decimal GB', () => {
    expect(storageGiB('1024Mi')).toBe(1);
    expect(storageGiB('1G')).toBeCloseTo(0.9313225746);
    expect(storageGiB(undefined)).toBeNull();
    expect(storageGiB('-1Gi')).toBeNull();
  });
});
