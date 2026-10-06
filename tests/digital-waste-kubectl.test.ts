import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { KubectlWasteReader, type WasteResource } from '../packages/agents/src/waste-inventory.js';
const mocked = vi.hoisted(() => ({ spawn: vi.fn() }));
vi.mock('node:child_process', () => ({ spawn: mocked.spawn }));
const target = { context: 'mock-aks', namespace: 'demo' };
let response: string, code: number;
beforeEach(() => {
  response = JSON.stringify({ items: [] });
  code = 0;
  mocked.spawn.mockReset();
  mocked.spawn.mockImplementation(() => {
    const child = Object.assign(new EventEmitter(), {
      stdout: new PassThrough(),
      stderr: new PassThrough(),
      kill: vi.fn(),
    });
    queueMicrotask(() => {
      child.stderr.write('PRIVATE_CLUSTER_DETAIL');
      child.stdout.write(response);
      child.emit('close', code);
    });
    return child;
  });
});
describe('Digital Waste read-only command boundary', () => {
  it.each([
    'deployments',
    'pods',
    'persistentvolumeclaims',
    'replicasets',
    'horizontalpodautoscalers',
    'metrics',
  ] as const)('allows only a scoped get for %s', async (resource) => {
    await new KubectlWasteReader().list(target, resource);
    const [binary, args, options] = mocked.spawn.mock.calls[0]!;
    expect(binary).toBe('kubectl');
    expect(args.slice(0, 6)).toEqual([
      '--context',
      'mock-aks',
      '--namespace',
      'demo',
      '--request-timeout=15s',
      'get',
    ]);
    expect(options).toEqual({ shell: false, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    expect(
      args.some((arg: string) =>
        ['delete', 'patch', 'apply', 'secrets', '--all-namespaces'].includes(arg),
      ),
    ).toBe(false);
    if (resource === 'metrics')
      expect(args.slice(6)).toEqual(['--raw', '/apis/metrics.k8s.io/v1beta1/namespaces/demo/pods']);
  });
  it('rejects unsupported resource types before launching a process', async () => {
    await expect(new KubectlWasteReader().list(target, 'secrets' as WasteResource)).rejects.toThrow(
      'Unsupported',
    );
    expect(mocked.spawn).not.toHaveBeenCalled();
  });
  it.each(['bad-json', 'too-large', 'failed-command'] as const)(
    'fails safely on %s without leaking raw output',
    async (condition) => {
      if (condition === 'bad-json') response = 'PRIVATE_CLUSTER_DETAIL';
      if (condition === 'too-large') response = 'x'.repeat(4 * 1024 * 1024 + 1);
      if (condition === 'failed-command') code = 1;
      await expect(new KubectlWasteReader().list(target, 'pods')).rejects.toThrow(
        'raw cluster output is not logged',
      );
    },
  );
  it('terminates an unresponsive query at its process timeout', async () => {
    vi.useFakeTimers();
    try {
      const child = Object.assign(new EventEmitter(), {
        stdout: new PassThrough(),
        stderr: new PassThrough(),
        kill: vi.fn(),
      });
      mocked.spawn.mockReturnValue(child);
      const pending = expect(new KubectlWasteReader().list(target, 'pods')).rejects.toThrow(
        'exceeded limits',
      );
      await vi.advanceTimersByTimeAsync(20_000);
      await pending;
      expect(child.kill).toHaveBeenCalledOnce();
    } finally {
      vi.useRealTimers();
    }
  });
});
