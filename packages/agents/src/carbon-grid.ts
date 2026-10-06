/** Public GB forecasts; no credentials, guessed regions, or constant-factor fallback. */
export interface CarbonInterval {
  from: string;
  to: string;
  gramsCo2PerKwh: number;
}

export interface GridForecast {
  provider: 'neso' | 'synthetic';
  gridRegionId: number;
  retrievedAt: string;
  source: string;
  unit: 'gCO2/kWh';
  intervals: CarbonInterval[];
}

export interface GridCarbonProvider {
  forecast(gridRegionId: number, now: Date): Promise<GridForecast>;
}

export function timestamp(value: unknown): number {
  if (
    typeof value !== 'string' ||
    !/^\d{4}-\d\d-\d\dT.*Z$/.test(value) ||
    !Number.isFinite(Date.parse(value))
  ) {
    throw new Error('Expected a valid UTC timestamp ending in Z.');
  }
  return Date.parse(value);
}

export function validateForecast(input: GridForecast, regionId: number, now: Date): GridForecast {
  if (
    !input ||
    input.gridRegionId !== regionId ||
    input.unit !== 'gCO2/kWh' ||
    !['neso', 'synthetic'].includes(input.provider) ||
    typeof input.source !== 'string' ||
    !input.source ||
    !Array.isArray(input.intervals) ||
    input.intervals.length === 0 ||
    input.intervals.length > 200
  ) {
    throw new Error('Missing, mismatched, or unsupported grid forecast.');
  }
  const age = now.getTime() - timestamp(input.retrievedAt);
  if (age < -60_000 || age > 15 * 60_000)
    throw new Error('Grid forecast retrieval is stale or in the future.');
  const sorted = [...input.intervals].sort((a, b) => timestamp(a.from) - timestamp(b.from));
  let previousEnd = -Infinity;
  for (const interval of sorted) {
    const from = timestamp(interval.from),
      to = timestamp(interval.to);
    if (
      to <= from ||
      to - from > 60 * 60_000 ||
      from < previousEnd ||
      !Number.isFinite(interval.gramsCo2PerKwh) ||
      interval.gramsCo2PerKwh < 0 ||
      interval.gramsCo2PerKwh > 5000
    ) {
      throw new Error('Invalid or overlapping grid-carbon intervals.');
    }
    previousEnd = to;
  }
  return { ...input, intervals: sorted };
}

export class NesoGridCarbonProvider implements GridCarbonProvider {
  private readonly cache = new Map<number, GridForecast>();

  constructor(private readonly fetcher: typeof fetch = fetch) {}

  async forecast(gridRegionId: number, now: Date): Promise<GridForecast> {
    if (!Number.isInteger(gridRegionId) || gridRegionId < 1 || gridRegionId > 17) {
      throw new Error(
        'NESO supports GB grid region IDs 1–17 only. Explicit region mapping is required.',
      );
    }
    const cached = this.cache.get(gridRegionId);
    const age = cached ? now.getTime() - timestamp(cached.retrievedAt) : Infinity;
    if (
      cached &&
      age >= 0 &&
      age < 5 * 60_000 &&
      timestamp(cached.intervals[cached.intervals.length - 1]!.to) > now.getTime()
    )
      return structuredClone(cached);
    const from = now.toISOString().slice(0, 16) + 'Z';
    const source = `https://api.carbonintensity.org.uk/regional/intensity/${from}/fw48h/regionid/${gridRegionId}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15_000);
    try {
      const response = await this.fetcher(source, {
        headers: { Accept: 'application/json' },
        signal: controller.signal,
        redirect: 'error',
      });
      if (!response.ok) throw new Error(`Grid feed HTTP ${response.status}.`);
      if (!response.body) throw new Error('Grid feed has no body.');
      const reader = response.body.getReader();
      const chunks: Uint8Array[] = [];
      let size = 0;
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          size += value.byteLength;
          if (size > 1024 * 1024) throw new Error('Grid feed exceeds 1 MiB limit.');
          chunks.push(value);
        }
      } finally {
        await reader.cancel().catch(() => undefined);
      }
      const raw = JSON.parse(Buffer.concat(chunks).toString('utf8')) as {
        data?: {
          regionid?: number;
          data?: Array<{ from: string; to: string; intensity?: { forecast?: unknown } }>;
        };
      };
      if (raw.data?.regionid !== gridRegionId || !Array.isArray(raw.data.data))
        throw new Error('Invalid grid-feed region.');
      const intervals = raw.data.data.map((row) => {
        if (typeof row.intensity?.forecast !== 'number')
          throw new Error('Missing forecast intensity; not treated as zero.');
        return { from: row.from, to: row.to, gramsCo2PerKwh: row.intensity.forecast };
      });
      const forecast = validateForecast(
        {
          provider: 'neso',
          gridRegionId,
          retrievedAt: now.toISOString(),
          source,
          unit: 'gCO2/kWh',
          intervals,
        },
        gridRegionId,
        now,
      );
      this.cache.set(gridRegionId, structuredClone(forecast));
      return forecast;
    } catch (error) {
      if (controller.signal.aborted)
        throw new Error('Grid feed timed out; no scheduling decision is safe.');
      // Do not propagate arbitrary HTTP bodies or network configuration.
      if (
        error instanceof Error &&
        /^(Grid feed|Grid forecast|Invalid|Missing|Expected)/.test(error.message)
      )
        throw error;
      throw new Error('Grid feed unavailable or invalid; no constant-factor fallback.');
    } finally {
      clearTimeout(timer);
    }
  }
}

/** Integrates the complete execution window; a single missing minute invalidates the estimate. */
export function averageIntensity(
  forecast: GridForecast,
  startMs: number,
  durationMinutes: number,
): number | null {
  const endMs = startMs + durationMinutes * 60_000;
  let cursor = startMs,
    integral = 0;
  for (const row of forecast.intervals) {
    const from = timestamp(row.from),
      to = timestamp(row.to);
    if (to <= cursor) continue;
    if (from > cursor) return null;
    const end = Math.min(to, endMs);
    integral += (end - cursor) * row.gramsCo2PerKwh;
    cursor = end;
    if (cursor >= endMs) return integral / (endMs - startMs);
  }
  return null;
}
