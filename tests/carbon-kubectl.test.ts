import { EventEmitter } from 'node:events';
import { PassThrough, Writable } from 'node:stream';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { KubectlCarbonApi, type KubeJob } from '../packages/agents/src/carbon-kubernetes.js';
import { carbonDemo } from '../packages/agents/src/carbon-demo.js';

const mocked = vi.hoisted(() => ({ spawn: vi.fn() }));
vi.mock('node:child_process', () => ({ spawn: mocked.spawn }));
const region = carbonDemo(new Date('2026-10-05T10:00:00Z')).workload.regions[0]!;
let response: unknown, exitCode: number, input: string;
beforeEach(() => {
  response = {};
  exitCode = 0;
  input = '';
  mocked.spawn.mockReset();
  mocked.spawn.mockImplementation(() => {
    const child = Object.assign(new EventEmitter(), {
      stdout: new PassThrough(),
      stderr: new PassThrough(),
      stdin: new Writable({
        write(chunk, _encoding, callback) {
          input += chunk.toString();
          callback();
        },
      }),
      kill: vi.fn(),
    });
    child.stdin.on('finish', () => {
      child.stdout.write(JSON.stringify(response));
      if (exitCode) child.stderr.write('PRIVATE_CLUSTER_CREDENTIAL');
      child.emit('close', exitCode);
    });
    return child;
  });
});
afterEach(() => vi.restoreAllMocks());

describe('kubectl execution boundaries', () => {
  it('always targets an explicit context and namespace, with no shell or credential output', async () => {
    response = { items: [] };
    await new KubectlCarbonApi().podCount(region, 'source-uid');
    expect(mocked.spawn).toHaveBeenCalledWith(
      'kubectl',
      [
        '--context',
        region.context,
        '--namespace',
        region.namespace,
        '--request-timeout=15s',
        'get',
        'pods',
        '-o',
        'json',
      ],
      { shell: false, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] },
    );
  });
  it('detects both owner references and legacy/current controller labels', async () => {
    response = {
      items: [
        { metadata: { ownerReferences: [{ uid: 'source-uid' }] } },
        { metadata: { labels: { 'controller-uid': 'source-uid' } } },
        { metadata: { labels: { 'batch.kubernetes.io/controller-uid': 'source-uid' } } },
        { metadata: { ownerReferences: [{ uid: 'another-job' }] } },
      ],
    };
    expect(await new KubectlCarbonApi().podCount(region, 'source-uid')).toBe(3);
  });
  it('claims with UID/version/suspend tests and does not copy unrelated annotations onto the command line', async () => {
    const source = await carbonDemo().api.getJob(region, 'nightly-etl');
    source!.metadata.annotations = { 'private-existing-value': 'PRIVATE_CLUSTER_CREDENTIAL' };
    await new KubectlCarbonApi().claim(region, source!, 'carbon-plan');
    const args = mocked.spawn.mock.calls[0]![1] as string[];
    const patch = JSON.parse(args[args.indexOf('-p') + 1]!);
    expect(patch).toEqual([
      { op: 'test', path: '/metadata/uid', value: source!.metadata.uid },
      { op: 'test', path: '/metadata/resourceVersion', value: '1' },
      { op: 'test', path: '/spec/suspend', value: true },
      { op: 'add', path: '/metadata/annotations/greenops.dev~1carbon-plan', value: 'carbon-plan' },
    ]);
    expect(args.join(' ')).not.toContain('PRIVATE_CLUSTER_CREDENTIAL');
  });
  it('uses server dry-run and stdin for the proposed manifest', async () => {
    const job = (await carbonDemo().api.getJob(region, 'nightly-etl'))!;
    await new KubectlCarbonApi().dryRun(region, job);
    const args = mocked.spawn.mock.calls[0]![1] as string[];
    expect(args).toContain('--dry-run=server');
    expect(JSON.parse(input)).toEqual(job);
  });
  it('resumes only the same resource version and UID', async () => {
    const job = (await carbonDemo().api.getJob(region, 'nightly-etl'))!;
    response = job;
    await new KubectlCarbonApi().resume(region, job);
    const args = mocked.spawn.mock.calls[0]![1] as string[];
    expect(JSON.parse(args[args.indexOf('-p') + 1]!)).toContainEqual({
      op: 'test',
      path: '/metadata/resourceVersion',
      value: '1',
    });
    expect(JSON.parse(args[args.indexOf('-p') + 1]!)).toContainEqual({
      op: 'replace',
      path: '/spec/suspend',
      value: false,
    });
  });
  it('rejects option injection before creating a process', async () => {
    await expect(new KubectlCarbonApi().getJob(region, '--all-namespaces')).rejects.toThrow(
      'Invalid',
    );
    await expect(
      new KubectlCarbonApi().getJob({ ...region, context: '--other' }, 'job'),
    ).rejects.toThrow('Invalid');
    expect(mocked.spawn).not.toHaveBeenCalled();
  });
  it('sanitizes command errors', async () => {
    exitCode = 1;
    const result = new KubectlCarbonApi().getJob(region, 'job');
    await expect(result).rejects.toThrow('Kubernetes command failed');
  });
  it('requires Ready nodes and excludes unschedulable nodes', async () => {
    response = {
      items: [
        {
          spec: { unschedulable: true },
          status: { conditions: [{ type: 'Ready', status: 'True' }] },
        },
      ],
    };
    expect(await new KubectlCarbonApi().regionAvailable(region)).toBe(false);
    response = { items: [{ status: { conditions: [{ type: 'Ready', status: 'True' }] } }] };
    expect(await new KubectlCarbonApi().regionAvailable(region)).toBe(true);
  });
  it('fails closed on an invalid pods listing', async () => {
    response = {} satisfies Partial<KubeJob>;
    await expect(new KubectlCarbonApi().podCount(region, 'uid')).rejects.toThrow('Cannot verify');
  });
});
