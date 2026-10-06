'use client';

import { useId, useState, type ReactNode } from 'react';
import { Info } from 'lucide-react';
import type { ChartData, Metric, Tone } from './types';
import styles from './control-plane.module.css';

export function Callout({
  title,
  children,
  tone = 'blue',
}: {
  title: string;
  children: ReactNode;
  tone?: Tone;
}) {
  return (
    <section className={styles.callout} data-tone={tone}>
      <Info size={20} aria-hidden="true" />
      <div>
        <h2>{title}</h2>
        <div>{children}</div>
      </div>
    </section>
  );
}
export function Panel({
  title,
  description,
  children,
  action,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <section className={styles.panel}>
      <header className={styles.panelHeader}>
        <div>
          <h2>{title}</h2>
          {description && <p>{description}</p>}
        </div>
        {action}
      </header>
      {children}
    </section>
  );
}
export function MetricGrid({ metrics }: { metrics: Metric[] }) {
  return (
    <div className={styles.metricGrid}>
      {metrics.map((metric) => (
        <article key={metric.label} className={styles.metric} data-tone={metric.tone ?? 'green'}>
          <h3>{metric.label}</h3>
          <strong>{metric.value}</strong>
          <p>{metric.hint}</p>
        </article>
      ))}
    </div>
  );
}
export function Empty({ children }: { children: ReactNode }) {
  return <div className={styles.empty}>{children}</div>;
}
export function StatusBadge({ status }: { status: string }) {
  const tone = /reject|failed|high/i.test(status)
    ? 'rose'
    : /pending|review|revision|medium/i.test(status)
      ? 'amber'
      : /verified|approved|low/i.test(status)
        ? 'green'
        : 'neutral';
  return (
    <span className={styles.badge} data-tone={tone}>
      {status}
    </span>
  );
}
export function money(value: number | null) {
  return value === null
    ? 'Not measured'
    : `$${value.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
}

/** Lightweight SVG charts: same visual grammar as the reference, no extra chart runtime. */
export function Chart({
  data,
  kind = 'area',
  embedded = false,
}: {
  data: ChartData;
  kind?: 'area' | 'bar';
  embedded?: boolean;
}) {
  const id = useId().replaceAll(':', '');
  const [point, setPoint] = useState<number | null>(null);
  const [chartKind, setChartKind] = useState(kind);
  const width = 800,
    height = 260,
    left = 64,
    right = 70,
    top = 20,
    bottom = 50;
  const plotWidth = width - left - right,
    plotHeight = height - top - bottom;
  const sameUnits = data.primaryUnit === data.secondaryUnit;
  const primaryMax = Math.max(1, ...data.points.map((p) => p.primary));
  const secondaryMax = Math.max(1, ...data.points.map((p) => p.secondary ?? 0));
  // Before/after values with the same unit must share a scale.
  const max1 = sameUnits ? Math.max(primaryMax, secondaryMax) : primaryMax;
  const max2 = sameUnits ? max1 : secondaryMax;
  const x = (index: number) => left + ((index + 0.5) * plotWidth) / Math.max(1, data.points.length);
  const y = (value: number, max: number) => top + plotHeight - (value / max) * plotHeight;
  const compact = (n: number) =>
    new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(n);
  const segments = (secondary = false) => {
    const result: { index: number; value: number }[][] = [];
    let current: { index: number; value: number }[] = [];
    data.points.forEach((p, index) => {
      const value = secondary ? p.secondary : p.primary;
      if (value === undefined) {
        if (current.length) result.push(current);
        current = [];
      } else current.push({ index, value });
    });
    if (current.length) result.push(current);
    return result;
  };
  const segmentPath = (points: { index: number; value: number }[], secondary: boolean) =>
    points
      .map((p, i) => `${i ? 'L' : 'M'}${x(p.index)},${y(p.value, secondary ? max2 : max1)}`)
      .join(' ');
  const path = (secondary = false) =>
    segments(secondary)
      .map((points) => segmentPath(points, secondary))
      .join(' ');
  const area = (secondary = false) =>
    segments(secondary)
      .map(
        (points) =>
          `${segmentPath(points, secondary)} L${x(points[points.length - 1].index)},${top + plotHeight} L${x(points[0].index)},${top + plotHeight} Z`,
      )
      .join(' ');
  const active = point === null ? null : data.points[point];
  const legend = (
    <div className={styles.legend}>
      <span>
        <i style={{ background: 'var(--cp-chart-primary)' }} />
        {data.primaryLabel} ({data.primaryUnit})
      </span>
      {data.secondaryLabel && (
        <span>
          <i style={{ background: 'var(--cp-chart-secondary)' }} />
          {data.secondaryLabel} ({data.secondaryUnit})
        </span>
      )}
    </div>
  );
  const content = (
    <>
      {!data.points.length ? (
        <Empty>
          No matching measurements are available for this chart. Sample data shows the complete
          example.
        </Empty>
      ) : (
        <>
          <div className={styles.chartToolbar}>
            <div role="group" aria-label={`${data.title} chart style`}>
              <button
                type="button"
                aria-pressed={chartKind === 'area'}
                onClick={() => setChartKind('area')}
              >
                Area
              </button>
              <button
                type="button"
                aria-pressed={chartKind === 'bar'}
                onClick={() => setChartKind('bar')}
              >
                Bars
              </button>
            </div>
            <label>
              Inspect{' '}
              <select
                aria-label={`${data.title} data point`}
                value={point !== null && data.points[point] ? point : ''}
                onChange={(e) => setPoint(e.target.value === '' ? null : Number(e.target.value))}
              >
                <option value="">Select a point</option>
                {data.points.map((p, index) => (
                  <option key={`${p.label}-${index}`} value={index}>
                    {p.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className={styles.chart}>
            <svg
              viewBox={`0 0 ${width} ${height}`}
              role="group"
              aria-roledescription="interactive chart"
              aria-label={`${data.title}. ${data.points.length} data points. Exact values are available in the chart data table.`}
            >
              <defs>
                <linearGradient id={`${id}-primary`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--cp-chart-primary)" stopOpacity=".22" />
                  <stop offset="100%" stopColor="var(--cp-chart-primary)" stopOpacity=".02" />
                </linearGradient>
                <linearGradient id={`${id}-secondary`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--cp-chart-secondary)" stopOpacity=".18" />
                  <stop offset="100%" stopColor="var(--cp-chart-secondary)" stopOpacity=".02" />
                </linearGradient>
              </defs>
              {[0, 0.25, 0.5, 0.75, 1].map((t) => (
                <g key={t}>
                  <line
                    x1={left}
                    x2={width - right}
                    y1={y(t * max1, max1)}
                    y2={y(t * max1, max1)}
                    stroke="var(--cp-border)"
                    strokeDasharray="4 5"
                  />
                  <text
                    x={left - 10}
                    y={y(t * max1, max1) + 4}
                    textAnchor="end"
                    fill="var(--cp-muted)"
                    fontSize="11"
                  >
                    {compact(t * max1)}
                  </text>
                  {data.secondaryLabel && !sameUnits && (
                    <text
                      x={width - right + 10}
                      y={y(t * max1, max1) + 4}
                      fill="var(--cp-muted)"
                      fontSize="11"
                    >
                      {compact(t * max2)}
                    </text>
                  )}
                </g>
              ))}
              {active && (
                <line
                  x1={x(point!)}
                  x2={x(point!)}
                  y1={top}
                  y2={top + plotHeight}
                  stroke="var(--cp-muted)"
                  strokeDasharray="3 5"
                  opacity=".5"
                />
              )}
              {chartKind === 'area' && (
                <>
                  <path d={area()} fill={`url(#${id}-primary)`} />
                  <path d={path()} fill="none" stroke="var(--cp-chart-primary)" strokeWidth="2.5" />
                  {data.secondaryLabel && (
                    <>
                      <path d={area(true)} fill={`url(#${id}-secondary)`} />
                      <path
                        d={path(true)}
                        fill="none"
                        stroke="var(--cp-chart-secondary)"
                        strokeWidth="2.5"
                      />
                    </>
                  )}
                </>
              )}
              {data.points.map((p, index) => (
                <g key={`${p.label}-${index}`} onMouseEnter={() => setPoint(index)}>
                  {chartKind === 'bar' ? (
                    <>
                      <rect
                        x={x(index) - 22}
                        y={y(p.primary, max1)}
                        width={data.secondaryLabel ? 20 : 40}
                        height={top + plotHeight - y(p.primary, max1)}
                        rx="4"
                        fill="var(--cp-chart-primary)"
                      />
                      {data.secondaryLabel && p.secondary !== undefined && (
                        <rect
                          x={x(index) + 3}
                          y={y(p.secondary ?? 0, max2)}
                          width="20"
                          height={top + plotHeight - y(p.secondary ?? 0, max2)}
                          rx="4"
                          fill="var(--cp-chart-secondary)"
                        />
                      )}
                    </>
                  ) : (
                    <circle
                      cx={x(index)}
                      cy={y(p.primary, max1)}
                      r={point === index ? 5 : 3}
                      fill="var(--cp-chart-primary)"
                    />
                  )}
                  <rect
                    x={x(index) - plotWidth / data.points.length / 2}
                    y={top}
                    width={plotWidth / data.points.length}
                    height={plotHeight}
                    fill="transparent"
                    tabIndex={0}
                    role="button"
                    aria-label={`${p.label}: ${p.primary} ${data.primaryUnit}${p.secondary === undefined ? '' : `, ${p.secondary} ${data.secondaryUnit}`}`}
                    onFocus={() => setPoint(index)}
                    onClick={() => setPoint(index)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        setPoint(index);
                      }
                    }}
                  >
                    <title>{`${p.label}: ${p.primary} ${data.primaryUnit}${p.secondary === undefined ? '' : `, ${p.secondary} ${data.secondaryUnit}`}`}</title>
                  </rect>
                  {(data.points.length <= 8 ||
                    index % Math.ceil(data.points.length / 8) === 0 ||
                    index === data.points.length - 1) && (
                    <text
                      x={x(index)}
                      y={height - 22}
                      textAnchor="middle"
                      fill="var(--cp-muted)"
                      fontSize="11"
                    >
                      {p.label.length > 14 ? `${p.label.slice(0, 12)}…` : p.label}
                    </text>
                  )}
                </g>
              ))}
            </svg>
            <div className={styles.chartReadout} aria-live="polite">
              {active ? (
                <>
                  <strong>{active.label}</strong>
                  <span>
                    {data.primaryLabel}: {active.primary.toLocaleString()} {data.primaryUnit}
                  </span>
                  {active.secondary !== undefined && (
                    <span>
                      {data.secondaryLabel}: {active.secondary.toLocaleString()}{' '}
                      {data.secondaryUnit}
                    </span>
                  )}
                </>
              ) : (
                <span>Hover, focus or select a point to inspect exact values.</span>
              )}
            </div>
          </div>
          <details className={styles.chartData}>
            <summary>View chart data</summary>
            <div className={styles.tableScroll}>
              <table>
                <caption>{data.title} — exact values</caption>
                <thead>
                  <tr>
                    <th scope="col">Period / category</th>
                    <th scope="col">
                      {data.primaryLabel} ({data.primaryUnit})
                    </th>
                    {data.secondaryLabel && (
                      <th scope="col">
                        {data.secondaryLabel} ({data.secondaryUnit})
                      </th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {data.points.map((p, index) => (
                    <tr key={`${p.label}-${index}`}>
                      <th scope="row">{p.label}</th>
                      <td>{p.primary.toLocaleString()}</td>
                      {data.secondaryLabel && (
                        <td>{p.secondary?.toLocaleString() ?? 'Not recorded'}</td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </>
      )}
    </>
  );
  return embedded ? (
    <>
      {legend}
      {content}
    </>
  ) : (
    <Panel title={data.title} description={data.description} action={legend}>
      {content}
    </Panel>
  );
}
