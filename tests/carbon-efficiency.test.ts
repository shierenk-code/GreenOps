import { describe, expect, it, vi } from 'vitest';
import {
  averageIntensity,
  NesoGridCarbonProvider,
  validateForecast,
  type GridCarbonProvider,
} from '../packages/agents/src/carbon-grid.js';
import {
  planCarbonWorkload,
  validatePlan,
  fingerprint,
  type CarbonWorkload,
} from '../packages/agents/src/carbon-planner.js';
import {
  captureCarbonSource,
  executeCarbonPlan,
  observeCarbonJob,
  type CarbonApproval,
  type CarbonKubeApi,
  type KubeJob,
} from '../packages/agents/src/carbon-kubernetes.js';
import { carbonDemo } from '../packages/agents/src/carbon-demo.js';

const NOW = new Date('2026-10-05T10:00:00Z');
const raw = (forecast: unknown = 200, regionid = 12) => ({
  data: {
    regionid,
    data: [
      { from: '2026-10-05T10:00Z', to: '2026-10-05T10:30Z', intensity: { forecast } },
      { from: '2026-10-05T10:30Z', to: '2026-10-05T11:00Z', intensity: { forecast } },
    ],
  },
});

describe('live grid feed validation', () => {
  it('uses fixed public HTTPS endpoint, normalized units, bounded requests, and a short cache', async () => {
    const fetcher = vi.fn(async (url, init) => {
      expect(String(url)).toBe(
        'https://api.carbonintensity.org.uk/regional/intensity/2026-10-05T10:00Z/fw48h/regionid/12',
      );
      expect(init.redirect).toBe('error');
      expect(init.headers).toEqual({ Accept: 'application/json' });
      expect(init.signal).toBeInstanceOf(AbortSignal);
      return new Response(JSON.stringify(raw()));
    });
    const provider = new NesoGridCarbonProvider(fetcher);
    const first = await provider.forecast(12, NOW);
    first.intervals[0]!.gramsCo2PerKwh = 999;
    const second = await provider.forecast(12, new Date(NOW.getTime() + 60_000));
    expect(second.intervals[0]!.gramsCo2PerKwh).toBe(200);
    expect(second.provider).toBe('neso');
    expect(second.unit).toBe('gCO2/kWh');
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it.each([null, undefined, -1, NaN, '200', 9000])(
    'rejects invalid or missing intensity %s',
    async (value) => {
      const provider = new NesoGridCarbonProvider(
        async () => new Response(JSON.stringify(raw(value === undefined ? null : value))),
      );
      await expect(provider.forecast(12, NOW)).rejects.toThrow();
    },
  );
  it.each([0, 18, 1.5, NaN])('rejects unmapped region %s without fetching', async (id) => {
    const fetcher = vi.fn();
    await expect(new NesoGridCarbonProvider(fetcher).forecast(id, NOW)).rejects.toThrow('GB');
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('rejects wrong region, invalid bodies and oversized responses', async () => {
    for (const content of [JSON.stringify(raw(200, 7)), 'not json', 'x'.repeat(1024 * 1024 + 1)]) {
      await expect(
        new NesoGridCarbonProvider(async () => new Response(content)).forecast(12, NOW),
      ).rejects.toThrow();
    }
  });
  it('does not retain provider response bodies or retry a failed feed', async () => {
    const fetcher = vi.fn(async () => new Response('SECRET_ERROR_BODY', { status: 503 }));
    await expect(new NesoGridCarbonProvider(fetcher).forecast(12, NOW)).rejects.toThrow(
      'Grid feed HTTP 503',
    );
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('aborts a slow feed', async () => {
    vi.useFakeTimers();
    try {
      const fetcher: typeof fetch = (_url, init) =>
        new Promise((_resolve, reject) =>
          init?.signal?.addEventListener('abort', () => reject(new Error('private detail'))),
        );
      const pending = expect(new NesoGridCarbonProvider(fetcher).forecast(12, NOW)).rejects.toThrow(
        'timed out',
      );
      await vi.advanceTimersByTimeAsync(15_000);
      await pending;
    } finally {
      vi.useRealTimers();
    }
  });
  it('rejects stale retrievals and overlapping intervals', async () => {
    const { provider } = carbonDemo(NOW);
    const f = await provider.forecast(12, NOW);
    expect(() => validateForecast({ ...f, retrievedAt: '2026-10-05T09:00:00Z' }, 12, NOW)).toThrow(
      'stale',
    );
    expect(() =>
      validateForecast({ ...f, intervals: [f.intervals[0]!, f.intervals[0]!] }, 12, NOW),
    ).toThrow('overlapping');
    expect(() => validateForecast({ ...f, retrievedAt: '2026-10-05T11:00:00Z' }, 12, NOW)).toThrow(
      'future',
    );
  });
  it('integrates time-weighted intensity, not a minimum interval, and rejects coverage gaps', async () => {
    const f = await carbonDemo(NOW).provider.forecast(12, NOW);
    f.intervals[0]!.gramsCo2PerKwh = 100;
    f.intervals[1]!.gramsCo2PerKwh = 300;
    expect(averageIntensity(f, NOW.getTime() + 15 * 60_000, 30)).toBe(200);
    f.intervals.splice(1, 1);
    expect(averageIntensity(f, NOW.getTime(), 60)).toBeNull();
  });
});

describe('carbon-aware scheduling constraints', () => {
  it('holds a two-gram opportunity below the default benefit thresholds', async () => {
    const d = carbonDemo(NOW);
    d.workload.allowRegionShift = false;
    const provider: GridCarbonProvider = {
      async forecast(id, at) {
        const f = await d.provider.forecast(id, at);
        f.intervals.forEach((row, i) => {
          row.gramsCo2PerKwh = i < 2 ? 287 : 286;
        });
        return f;
      },
    };
    const plan = await planCarbonWorkload(d.workload, provider, NOW);
    expect(plan.status).toBe('below-threshold');
    expect(plan.projectedReductionKgCo2).toBeCloseTo(0.002);
    expect(plan.workload.minReductionKgCo2).toBe(0.01);
    expect(plan.workload.minReductionPercent).toBe(5);
    expect(() => validatePlan(plan)).toThrow();
  });
  it.each([{ minReductionKgCo2: 0.5 }, { minReductionPercent: 80 }])(
    'requires both absolute and relative benefit thresholds: %s',
    async (policy) => {
      const d = carbonDemo(NOW);
      Object.assign(d.workload, policy);
      const plan = await planCarbonWorkload(d.workload, d.provider, NOW);
      expect(plan.status).toBe('below-threshold');
      // Even recomputing a fingerprint cannot bypass policy validation.
      const { id: _id, ...payload } = { ...plan, status: 'ready' as const };
      expect(_id).toBe(plan.id);
      expect(() =>
        validatePlan({ ...payload, id: `carbon-${fingerprint(payload).slice(0, 24)}` }),
      ).toThrow('minimum-benefit');
    },
  );
  it.each([-1, NaN, Infinity, 101])(
    'rejects invalid relative threshold %s',
    async (minReductionPercent) => {
      const d = carbonDemo(NOW);
      d.workload.minReductionPercent = minReductionPercent;
      await expect(planCarbonWorkload(d.workload, d.provider, NOW)).rejects.toThrow();
    },
  );
  it('compares delayed and regional options including transfer energy and records provenance', async () => {
    const { workload, provider } = carbonDemo(NOW);
    const plan = await planCarbonWorkload(workload, provider, NOW);
    expect(plan.status).toBe('ready');
    expect(plan.selected).toMatchObject({
      regionId: 'south-wales',
      start: '2026-10-05T11:00:00.000Z',
      energyKwh: 2.1,
    });
    expect(plan.baseline!.estimatedKgCo2).toBeCloseTo(0.6);
    expect(plan.selected!.estimatedKgCo2).toBeCloseTo(0.168);
    expect(plan.projectedReductionKgCo2).toBeCloseTo(0.432);
    expect(plan.forecasts).toHaveLength(2);
    expect(() => validatePlan(plan)).not.toThrow();
  });
  it('reschedules in the original region when movement is forbidden', async () => {
    const d = carbonDemo(NOW);
    d.workload.allowRegionShift = false;
    const plan = await planCarbonWorkload(d.workload, d.provider, NOW);
    expect(plan.selected!.regionId).toBe('south-england');
    expect(plan.selected!.start).toBe('2026-10-05T11:00:00.000Z');
  });
  it.each(['residency', 'dataReady', 'cost', 'latency', 'overhead'] as const)(
    'rejects an unsuitable destination: %s',
    async (rule) => {
      const d = carbonDemo(NOW),
        r = d.workload.regions[1]!;
      if (rule === 'residency') r.residency = 'US';
      if (rule === 'dataReady') r.dataReady = false;
      if (rule === 'cost') r.estimatedCostUsd = 10;
      if (rule === 'latency') r.latencyMs = 999;
      if (rule === 'overhead') r.transferEnergyKwh = 100;
      expect((await planCarbonWorkload(d.workload, d.provider, NOW)).selected!.regionId).toBe(
        'south-england',
      );
    },
  );
  it('does not delay beyond maximum wait or deadline', async () => {
    const d = carbonDemo(NOW);
    d.workload.maxDelayMinutes = 0;
    d.workload.deadline = '2026-10-05T11:00:00Z';
    const plan = await planCarbonWorkload(d.workload, d.provider, NOW);
    expect(plan.options.every((o) => Date.parse(o.start) === NOW.getTime())).toBe(true);
    expect(plan.selected!.finish).toBe('2026-10-05T11:00:00.000Z');
  });
  it('blocks rather than fabricating savings when the baseline has no forecast', async () => {
    const d = carbonDemo(NOW);
    const p: GridCarbonProvider = {
      forecast: (id, now) =>
        id === 12 ? Promise.reject(new Error('unavailable')) : d.provider.forecast(id, now),
    };
    const plan = await planCarbonWorkload(d.workload, p, NOW);
    expect(plan.status).toBe('blocked');
    expect(plan.projectedReductionKgCo2).toBeNull();
  });
  it('keeps the current schedule when no improvement is possible', async () => {
    const d = carbonDemo(NOW);
    d.workload.allowRegionShift = false;
    d.workload.maxDelayMinutes = 0;
    const plan = await planCarbonWorkload(d.workload, d.provider, NOW);
    expect(plan.status).toBe('no-benefit');
    expect(() => validatePlan(plan)).toThrow();
  });
  it.each([
    (w: CarbonWorkload) => {
      w.durationMinutes = 0;
    },
    (w: CarbonWorkload) => {
      w.stateless = false;
    },
    (w: CarbonWorkload) => {
      w.idempotent = false;
    },
    (w: CarbonWorkload) => {
      w.regions[0]!.expectedEnergyKwh = NaN;
    },
    (w: CarbonWorkload) => {
      w.baselineStart = '2026-10-04T10:00:00Z';
    },
    (w: CarbonWorkload) => {
      w.regions[0]!.context = '--insecure-skip-tls-verify';
    },
  ])('rejects unsupported/invalid workload inputs', async (edit) => {
    const d = carbonDemo(NOW);
    edit(d.workload);
    await expect(planCarbonWorkload(d.workload, d.provider, NOW)).rejects.toThrow();
  });
  it('detects modification of an already reviewed plan', async () => {
    const d = carbonDemo(NOW);
    const plan = await planCarbonWorkload(d.workload, d.provider, NOW);
    plan.selected!.regionId = 'elsewhere';
    expect(() => validatePlan(plan)).toThrow('modified');
  });
});

async function setup(maxDelayMinutes = 120) {
  const d = carbonDemo(NOW);
  d.workload.maxDelayMinutes = maxDelayMinutes;
  const plan = await planCarbonWorkload(d.workload, d.provider, NOW);
  const approval: CarbonApproval = {
    planId: plan.id,
    approvedAt: NOW.toISOString(),
    reviewer: 'synthetic-test-not-human',
    reason: 'Test only',
    source: await captureCarbonSource(plan, d.api),
  };
  let clock = new Date(NOW);
  const event = vi.fn();
  const hooks = {
    event,
    now: () => clock,
    wait: async (ms: number) => {
      clock = new Date(clock.getTime() + ms);
    },
  };
  const api = {
    ...d.api,
    claim: vi.fn(d.api.claim),
    create: vi.fn(d.api.create),
    resume: vi.fn(d.api.resume),
  };
  return { ...d, api, plan, approval, hooks, event };
}

describe('approval-gated Kubernetes dispatch', () => {
  it('does not extend an existing source active deadline on the target', async () => {
    const s = await setup();
    const get = s.api.getJob;
    s.api.getJob = async (r, name) => {
      const job = await get(r, name);
      if (job && name === s.workload.sourceJob) job.spec.activeDeadlineSeconds = 3600;
      return job;
    };
    s.approval.source = await captureCarbonSource(s.plan, s.api);
    await executeCarbonPlan(s.plan, s.approval, s.api, s.provider, s.hooks);
    expect(s.api.create.mock.calls[0]![1].spec.activeDeadlineSeconds).toBe(3600);
  });
  it.each([
    'nfs',
    'csi',
    'azureDisk',
    'azureFile',
    'persistentVolumeClaim',
    'hostPath',
    'ephemeral',
    'futureDriver',
  ])('rejects unsupported %s volumes before any dispatch', async (sourceType) => {
    const s = await setup();
    const get = s.api.getJob;
    s.api.getJob = async (r, name) => {
      const job = await get(r, name);
      if (job) job.spec.template.spec.volumes = [{ name: 'data', [sourceType]: {} }];
      return job;
    };
    await expect(captureCarbonSource(s.plan, s.api)).rejects.toThrow('Unsupported volume');
    expect(s.api.claim).not.toHaveBeenCalled();
    expect(s.api.create).not.toHaveBeenCalled();
  });
  it.each(['emptyDir', 'configMap', 'secret', 'projected', 'downwardAPI'])(
    'accepts an explicitly supported %s volume for source review',
    async (sourceType) => {
      const s = await setup();
      const get = s.api.getJob;
      s.api.getJob = async (r, name) => {
        const job = await get(r, name);
        if (job) job.spec.template.spec.volumes = [{ name: 'data', [sourceType]: {} }];
        return job;
      };
      await expect(captureCarbonSource(s.plan, s.api)).resolves.toHaveProperty('uid');
    },
  );
  it.each([
    { completionMode: 'Indexed' },
    { managedBy: 'custom.example/controller' },
    { podFailurePolicy: {} },
    { successPolicy: {} },
    { backoffLimitPerIndex: 1 },
    { maxFailedIndexes: 1 },
    { podReplacementPolicy: 'Failed' },
    { ttlSecondsAfterFinished: 300 },
    { futureExecutionPolicy: {} },
  ])('rejects Job policies that would be silently dropped: %j', async (policy) => {
    const s = await setup();
    const get = s.api.getJob;
    s.api.getJob = async (r, name) => {
      const job = await get(r, name);
      if (job) Object.assign(job.spec, policy);
      return job;
    };
    await expect(captureCarbonSource(s.plan, s.api)).rejects.toThrow('execution policy');
    expect(s.api.create).not.toHaveBeenCalled();
  });
  it('does not claim a source when slow dry-run checks miss the approved dispatch window', async () => {
    const s = await setup();
    s.api.dryRun = async () => {
      await s.hooks.wait(61_000);
    };
    await expect(executeCarbonPlan(s.plan, s.approval, s.api, s.provider, s.hooks)).rejects.toThrow(
      'approved window',
    );
    expect(s.api.claim).not.toHaveBeenCalled();
  });
  it('leaves a created target suspended if the dispatch window expires before resume', async () => {
    const s = await setup();
    const create = s.api.create.getMockImplementation()!;
    s.api.create.mockImplementation(async (region, job) => {
      const result = await create(region, job);
      await s.hooks.wait(61_000);
      return result;
    });
    await expect(executeCarbonPlan(s.plan, s.approval, s.api, s.provider, s.hooks)).rejects.toThrow(
      'approved window',
    );
    expect(s.api.create).toHaveBeenCalledOnce();
    expect(s.api.resume).not.toHaveBeenCalled();
  });
  it('rechecks minimum benefit at dispatch even within the 5% forecast drift allowance', async () => {
    const s = await setup();
    s.workload.minReductionKgCo2 = 0.43;
    s.plan = await planCarbonWorkload(s.workload, s.provider, NOW);
    s.approval.planId = s.plan.id;
    const provider: GridCarbonProvider = {
      async forecast(id, at) {
        const f = await s.provider.forecast(id, at);
        f.intervals.forEach((row) => {
          row.gramsCo2PerKwh *= 1.02;
        });
        return f;
      },
    };
    await expect(executeCarbonPlan(s.plan, s.approval, s.api, provider, s.hooks)).rejects.toThrow(
      'Forecast no longer',
    );
    expect(s.api.claim).not.toHaveBeenCalled();
  });
  it('waits, claims source, creates suspended target, starts it once, and distinguishes Job completion from savings', async () => {
    const s = await setup();
    const receipt = await executeCarbonPlan(s.plan, s.approval, s.api, s.provider, s.hooks);
    expect(s.hooks.now().toISOString()).toBe(s.plan.selected!.start);
    expect(s.api.create.mock.calls[0]![1].spec.suspend).toBe(true);
    expect(s.api.resume).toHaveBeenCalledTimes(1);
    const source = await s.api.getJob(s.workload.regions[0]!, s.workload.sourceJob);
    expect(source!.spec.suspend).toBe(true);
    expect(await observeCarbonJob(receipt, s.api)).toEqual({
      status: 'completed',
      savingsVerified: false,
    });
    expect(s.event.mock.calls.map((call) => call[0])).toEqual(['approve', 'improve', 'improve']);
  });
  it('reconciles a repeat of the same still-fresh plan without creating or starting another Job', async () => {
    const s = await setup(0);
    const first = await executeCarbonPlan(s.plan, s.approval, s.api, s.provider, s.hooks);
    const again = await executeCarbonPlan(s.plan, s.approval, s.api, s.provider, s.hooks);
    expect(again.jobUid).toBe(first.jobUid);
    expect(s.api.create).toHaveBeenCalledTimes(1);
    expect(s.api.resume).toHaveBeenCalledTimes(1);
  });
  it.each(['wrong-plan', 'no-reviewer', 'no-reason', 'old-approval'] as const)(
    'prevents writes for %s',
    async (change) => {
      const s = await setup();
      if (change === 'wrong-plan') s.approval.planId = 'other';
      if (change === 'no-reviewer') s.approval.reviewer = '';
      if (change === 'no-reason') s.approval.reason = '';
      if (change === 'old-approval') s.approval.approvedAt = '2026-10-05T09:00:00Z';
      await expect(
        executeCarbonPlan(s.plan, s.approval, s.api, s.provider, s.hooks),
      ).rejects.toThrow('approval');
      expect(s.api.claim).not.toHaveBeenCalled();
    },
  );
  it('never dispatches synthetic forecasts to a real adapter', async () => {
    const s = await setup();
    const api: CarbonKubeApi = { ...s.api, mode: 'kubernetes' };
    await expect(executeCarbonPlan(s.plan, s.approval, api, s.provider, s.hooks)).rejects.toThrow(
      'Synthetic',
    );
    expect(s.api.create).not.toHaveBeenCalled();
  });
  it('rechecks carbon benefit after waiting', async () => {
    const s = await setup();
    const provider: GridCarbonProvider = {
      async forecast(id, at) {
        const f = await s.provider.forecast(id, at);
        for (const i of f.intervals) i.gramsCo2PerKwh = 900;
        return f;
      },
    };
    await expect(executeCarbonPlan(s.plan, s.approval, s.api, provider, s.hooks)).rejects.toThrow(
      'Forecast no longer',
    );
    expect(s.api.claim).not.toHaveBeenCalled();
  });
  it('rejects changed source templates, versions, missing nodes, existing pods, and claim conflicts', async () => {
    for (const condition of ['template', 'version', 'nodes', 'pods', 'claimed']) {
      const s = await setup();
      const getJob = s.api.getJob;
      if (condition === 'nodes') s.api.regionAvailable = async () => false;
      else if (condition === 'pods') s.api.podCount = async () => 1;
      else
        s.api.getJob = async (r, name) => {
          const j = await getJob(r, name);
          if (j) {
            if (condition === 'template')
              j.spec.template.spec.containers = [{ name: 'changed', image: 'changed' }];
            if (condition === 'version') j.metadata.resourceVersion = 'changed';
            if (condition === 'claimed')
              j.metadata.annotations = { 'greenops.dev/carbon-plan': 'another-plan' };
          }
          return j;
        };
      await expect(
        executeCarbonPlan(s.plan, s.approval, s.api, s.provider, s.hooks),
      ).rejects.toThrow();
      expect(s.api.claim).not.toHaveBeenCalled();
    }
  });
  it.each([
    (job: KubeJob) => {
      job.spec.suspend = false;
    },
    (job: KubeJob) => {
      job.status = { startTime: NOW.toISOString() };
    },
    (job: KubeJob) => {
      job.metadata.labels = {};
    },
    (job: KubeJob) => {
      job.metadata.ownerReferences = [{}];
    },
    (job: KubeJob) => {
      job.spec.template.spec.volumes = [{ persistentVolumeClaim: {} }];
    },
    (job: KubeJob) => {
      job.spec.template.spec.affinity = {};
    },
  ])('rejects unsafe or unsupported source jobs before approval', async (edit) => {
    const s = await setup();
    const get = s.api.getJob;
    s.api.getJob = async (r, name) => {
      const job = await get(r, name);
      if (job) edit(job);
      return job;
    };
    await expect(captureCarbonSource(s.plan, s.api)).rejects.toThrow();
  });
  it('keeps target suspended if reservation changes or resume fails', async () => {
    const s = await setup();
    s.api.resume.mockRejectedValue(new Error('API failed'));
    await expect(executeCarbonPlan(s.plan, s.approval, s.api, s.provider, s.hooks)).rejects.toThrow(
      'API failed',
    );
    const manifest = s.api.create.mock.calls[0]![1];
    const stored = await s.api.getJob(s.workload.regions[1]!, manifest.metadata.name);
    expect(stored!.spec.suspend).toBe(true);
    expect(s.event.mock.calls.some((c) => c[1].state === 'dispatched')).toBe(false);
  });
  it('does not write to the cluster if intent logging fails', async () => {
    const s = await setup();
    s.hooks.event = vi.fn((stage) => {
      if (stage === 'improve') throw new Error('disk full');
    });
    await expect(executeCarbonPlan(s.plan, s.approval, s.api, s.provider, s.hooks)).rejects.toThrow(
      'disk full',
    );
    expect(s.api.claim).not.toHaveBeenCalled();
  });
});
