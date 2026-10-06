import { afterEach, describe, expect, it, vi } from 'vitest';
import { createSystemSampler } from '../apps/cli/src/system-telemetry';
import { validateTelemetry } from '../apps/CodeVitals-MCP/website/src/server/live-data';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.resetModules();
});
describe('live evidence', () => {
  it('samples actual OS counters without inventing first-sample CPU or energy', () => {
    const first = createSystemSampler()();
    expect(first.cpuPercent).toBeNull();
    expect(first.memoryTotalBytes).toBeGreaterThan(0);
    expect(validateTelemetry(first)).toEqual(first);
    expect(first).not.toHaveProperty('energyKwh');
    expect(() => validateTelemetry({ ...first, cpuPercent: 101 })).toThrow();
    expect(() =>
      validateTelemetry({ ...first, memoryUsedBytes: first.memoryTotalBytes + 1 }),
    ).toThrow();
    expect(() => validateTelemetry({ ...first, load1: NaN })).toThrow();
  });
  it('keeps location distinct from GB observations and withholds stale intensity', async () => {
    vi.stubEnv('GREENOPS_LOCAL_NAME', 'Ahmedabad');
    vi.stubEnv('GREENOPS_LOCAL_LAT', '23.0225');
    vi.stubEnv('GREENOPS_LOCAL_LON', '72.5714');
    vi.stubEnv('ELECTRICITY_MAPS_API_TOKEN', '');
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          Response.json({
            data: [{ from: '2001-01-01', to: '2001-01-02', intensity: { actual: 99 } }],
          }),
        ),
    );
    const { gridData } = await import('../apps/CodeVitals-MCP/website/src/server/live-data');
    const points = await gridData();
    expect(points[0]).toMatchObject({ name: 'Ahmedabad', intensity: null });
    expect(points[1]).toMatchObject({ id: 'gb', intensity: null });
    expect(points[1].status).toContain('stale');
  });
  it('distinguishes forecast from actual and preserves real zero intensity', async () => {
    vi.stubEnv('GREENOPS_LOCAL_NAME', '');
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          Response.json({
            data: [
              {
                from: new Date().toISOString(),
                to: new Date(Date.now() + 1800000).toISOString(),
                intensity: { actual: 0, forecast: 42 },
              },
            ],
          }),
        ),
    );
    const { gridData } = await import('../apps/CodeVitals-MCP/website/src/server/live-data');
    expect((await gridData())[0]).toMatchObject({
      intensity: 0,
      status: 'Reported actual grid intensity',
    });
  });
  it('does not call Gemini with no recent readings', async () => {
    vi.stubEnv('GEMINI_API_KEY', 'test');
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    const { explainTelemetry } =
      await import('../apps/CodeVitals-MCP/website/src/server/live-data');
    await expect(explainTelemetry([], [])).rejects.toThrow('Start greenops monitor');
    expect(fetch).not.toHaveBeenCalled();
  });
});
