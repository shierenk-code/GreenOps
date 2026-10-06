import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  createWasteWorkflowService,
  parseWasteAction,
} from '../apps/CodeVitals-MCP/website/src/app/dashboard/digital-waste/workflow-service';
import {
  allowWasteRequest,
  readWasteAction,
} from '../apps/CodeVitals-MCP/website/src/app/dashboard/digital-waste/workflow-http';
import {
  findingStatus,
  proposedWasteChange,
  type WasteWorkflow,
} from '../apps/CodeVitals-MCP/website/src/app/dashboard/digital-waste/workflow-types';

let directory: string;
let now: Date;
let service: ReturnType<typeof createWasteWorkflowService>;
const session = randomUUID();
const base = (r: WasteWorkflow) => ({ runId: r.id, revision: r.revision });
const start = () => service.perform(session, { action: 'start', runId: null, revision: 0 });
const review = (r: WasteWorkflow, findingId: string, decision: 'approve' | 'reject' = 'approve') =>
  service.perform(session, {
    ...base(r),
    action: 'review',
    findingId,
    decision,
    reviewer: 'demo-reviewer',
    reason: 'Reviewed synthetic evidence.',
  });

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'greenops-waste-web-'));
  now = new Date('2026-10-06T10:00:00Z');
  service = createWasteWorkflowService(directory, () => now);
});
afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
});

describe('Digital Waste dashboard workflow', () => {
  it.each(['api-gateway', 'legacy-export'])(
    'runs %s from evidence to checked simulation and reloads',
    async (resource) => {
      let run = await start();
      expect(run.plan.findings).toHaveLength(4);
      const finding = run.plan.findings.find((f) => f.resourceName === resource)!;
      expect(findingStatus(run, finding.id)).toBe('Needs review');
      run = await review(run, finding.id);
      expect(findingStatus(run, finding.id)).toBe('Approved for simulation');
      run = await service.perform(session, {
        ...base(run),
        action: 'simulate',
        findingId: finding.id,
      });
      expect(run.simulation).toMatchObject({
        mode: 'simulation',
        savingsVerified: false,
        realCloudChanges: 0,
      });
      expect(run.checks).toBeNull();
      run = await service.perform(session, { ...base(run), action: 'check' });
      expect(run.checks?.every((c) => c.passed)).toBe(true);
      expect(findingStatus(run, finding.id)).toBe('Simulation checked');
      expect(run.operationalOutcomes).toHaveLength(4);
      for (const outcome of run.operationalOutcomes) {
        expect(outcome.selfCost).toMatchObject({
          llmCalls: 0,
          knownTokens: 0,
          totalToolCalls: 0,
          energyKwh: null,
          carbonKgCo2e: null,
        });
        expect(outcome.relatedPlanId).toBe(run.plan.id);
      }
      expect(await createWasteWorkflowService(directory).current(session)).toEqual(run);
      expect(await service.current(randomUUID())).toBeNull();
    },
  );
  it('blocks bypassing approval and checking before simulation', async () => {
    const run = await start();
    await expect(
      service.perform(session, {
        ...base(run),
        action: 'simulate',
        findingId: run.plan.findings[0].id,
      }),
    ).rejects.toThrow('Approve');
    await expect(service.perform(session, { ...base(run), action: 'check' })).rejects.toThrow(
      'Simulate once',
    );
    expect((await service.current(session))?.revision).toBe(1);
  });
  it('does not allow approval to bypass missing evidence', async () => {
    const run = await start();
    for (const f of run.plan.findings.filter((f) => f.status === 'needs-evidence')) {
      expect(findingStatus(run, f.id)).toMatch(/Blocked/);
      expect(proposedWasteChange(f)).toMatch(/No executable proposal/);
      expect(proposedWasteChange(f)).not.toContain('0 cores');
      await expect(review(run, f.id)).rejects.toThrow('cannot bypass');
    }
  });
  it('honors rejection and rejects stale tabs and duplicate simulation', async () => {
    const initial = await start();
    const id = initial.plan.findings[0].id;
    let run = await review(initial, id, 'reject');
    expect(findingStatus(run, id)).toBe('Rejected');
    await expect(
      service.perform(session, { ...base(run), action: 'simulate', findingId: id }),
    ).rejects.toThrow('Approve');
    await expect(review(initial, id)).rejects.toThrow('another tab');
    run = await review(run, id);
    run = await service.perform(session, { ...base(run), action: 'simulate', findingId: id });
    await expect(
      service.perform(session, { ...base(run), action: 'simulate', findingId: id }),
    ).rejects.toThrow('not be repeated');
    await expect(review(run, id)).rejects.toThrow('already simulated');
  });
  it('enforces plan and approval expiry without refreshing evidence dates', async () => {
    let run = await start();
    run = await review(run, run.plan.findings[0].id);
    now = new Date(now.getTime() + 6 * 60_000);
    await expect(
      service.perform(session, {
        ...base(run),
        action: 'simulate',
        findingId: run.plan.findings[0].id,
      }),
    ).rejects.toThrow('recent approved');
    now = new Date(now.getTime() + 10 * 60_000);
    await expect(review(run, run.plan.findings[0].id)).rejects.toThrow('fresh plan');
  });
  it('serializes concurrent writes and isolates a new scenario', async () => {
    const run = await start();
    const results = await Promise.allSettled([
      review(run, run.plan.findings[0].id),
      review(run, run.plan.findings[0].id),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const saved = (await service.current(session))!;
    const next = await service.perform(session, { ...base(saved), action: 'start' });
    expect(next.id).not.toBe(run.id);
    expect(next.decisions).toEqual([]);
    expect(next.simulation).toBeNull();
  });
  it('rejects unsafe session and action inputs', async () => {
    await expect(service.current('../outside')).rejects.toThrow();
    for (const action of [
      null,
      {},
      { action: 'start', runId: null, revision: -1 },
      { action: 'execute', runId: null, revision: 0 },
      {
        action: 'review',
        runId: null,
        revision: 0,
        findingId: 'waste-' + 'a'.repeat(24),
        decision: 'approve',
        reviewer: '',
        reason: 'why',
      },
    ])
      expect(() => parseWasteAction(action)).toThrow();
    expect(
      parseWasteAction({
        action: 'start',
        runId: null,
        revision: 0,
        context: 'untrusted-live-cluster',
      }),
    ).toEqual({ action: 'start', runId: null, revision: 0 });
  });
});

describe('local sandbox HTTP boundary', () => {
  const request = (
    headers: Record<string, string> = {},
    url = 'http://localhost:3003/dashboard/digital-waste/api',
  ) =>
    new Request(url, {
      method: 'POST',
      headers: {
        host: '127.0.0.1:3003',
        origin: 'http://127.0.0.1:3003',
        'content-type': 'application/json',
        'x-greenops-waste': '1',
        ...headers,
      },
      body: '{}',
    });
  it('accepts same-origin loopback including Next host normalization', () => {
    expect(allowWasteRequest(request())).toBe(true);
  });
  it.each([
    { origin: 'https://evil.example' },
    { host: 'evil.example' },
    { 'sec-fetch-site': 'cross-site' },
    { 'x-greenops-waste': '' },
    { 'content-type': 'text/plain' },
  ])('rejects unsafe headers %j', (headers) => {
    expect(allowWasteRequest(request(headers))).toBe(false);
  });
  it('rejects non-local URLs and does not trust forwarded-host', () => {
    expect(
      allowWasteRequest(
        request({ 'x-forwarded-host': 'localhost:3003' }, 'https://evil.example/api'),
      ),
    ).toBe(false);
  });
  it('bounds body bytes without relying on Content-Length', async () => {
    await expect(
      readWasteAction(new Request('http://localhost', { method: 'POST', body: 'x'.repeat(4097) })),
    ).rejects.toMatchObject({ status: 413 });
    await expect(
      readWasteAction(new Request('http://localhost', { method: 'POST', body: 'not JSON' })),
    ).rejects.toMatchObject({ status: 400 });
    expect(await readWasteAction(request())).toEqual({});
  });
});
