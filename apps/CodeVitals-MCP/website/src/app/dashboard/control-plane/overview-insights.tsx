'use client';
import { useState, type MouseEvent } from 'react';
import Link from 'next/link';
import { ArrowRight, ChartNoAxesCombined } from 'lucide-react';
import { Chart } from './ui';
import type { ControlPlaneData, ControlTab, Opportunity } from './types';
import styles from './overview-insights.module.css';

const stages: { id: Opportunity['status']; label: string; color: string }[] = [
  { id: 'pending', label: 'Needs review', color: 'var(--cp-accent)' },
  { id: 'revision-requested', label: 'Revision requested', color: 'var(--cp-amber)' },
  { id: 'approved', label: 'Plan approved', color: 'var(--cp-blue)' },
  { id: 'applied', label: 'Applied', color: 'var(--cp-purple)' },
  { id: 'verified', label: 'Check passed', color: 'var(--cp-green)' },
  { id: 'rejected', label: 'Rejected', color: 'var(--cp-rose)' },
];
export function OverviewInsights({
  data,
  href,
  onNavigate,
}: {
  data: ControlPlaneData;
  href: (tab: ControlTab, patch?: Record<string, string | null>) => string;
  onNavigate: (event: MouseEvent<HTMLAnchorElement>) => void;
}) {
  const [view, setView] = useState(data.mode === 'recorded' ? 'categories' : 'coverage');
  const [status, setStatus] = useState<Opportunity['status']>('pending');
  const total = data.opportunities.length;
  const counts = stages.map((stage) => ({
    ...stage,
    count: data.opportunities.filter((o) => o.status === stage.id).length,
  }));
  const selected = data.opportunities.filter((o) => o.status === status);
  let offset = 0;
  const segments = counts.map((stage) => {
    const start = offset;
    offset += total ? (stage.count / total) * 100 : 0;
    return `${stage.color} ${start}% ${offset}%`;
  });
  const chart =
    view === 'categories' && data.reviewCategories ? data.reviewCategories : view === 'projection'
      ? data.trend
      : {
          title: 'Findings across your agents',
          description: 'Distinct findings in the selected scope.',
          primaryLabel: 'Findings',
          primaryUnit: 'findings',
          points: data.agents.map((a) => ({
            label: a.name.replace(' Efficiency', ''),
            primary: a.rows.length,
          })),
        };
  return (
    <div className={styles.grid}>
      <section className={styles.chartPanel} aria-label="Workspace insights">
        <header>
          <div>
            <p className={styles.eyebrow}>
              <ChartNoAxesCombined size={14} aria-hidden="true" /> SIGNALS, NOT GUESSWORK
            </p>
            <h3>{chart.title}</h3>
          </div>
          <select
            value={view}
            onChange={(e) => setView(e.target.value)}
            aria-label="Overview chart"
          >
            <option value="coverage">Agent findings</option>
            {data.reviewCategories && <option value="categories">Review categories</option>}
            <option value="projection">
              {data.mode === 'sample' ? 'Sample projections' : 'Measured savings'}
            </option>
          </select>
        </header>
        <p className={styles.description}>{chart.description}</p>
        <Chart key={view} data={chart} kind={view === 'projection' ? 'area' : 'bar'} embedded />
      </section>
      <section className={styles.decisions} aria-label="Decision distribution">
        <header>
          <div>
            <p className={styles.eyebrow}>EVERY DECISION COUNTS</p>
            <h3>Your review landscape</h3>
          </div>
          <span>{data.mode === 'sample' ? 'Sample' : 'Recorded + local decisions'}</span>
        </header>
        <div className={styles.mix}>
          <div
            className={styles.donut}
            style={{
              background: total ? `conic-gradient(${segments.join(',')})` : 'var(--cp-border)',
            }}
            role="img"
            aria-label={`${total} findings. ${counts.map((c) => `${c.label}: ${c.count}`).join('. ')}`}
          >
            <div>
              <strong>{total}</strong>
              <span>findings</span>
            </div>
          </div>
          <div className={styles.legend}>
            {counts.map((stage) => (
              <button
                type="button"
                key={stage.id}
                aria-pressed={status === stage.id}
                onClick={() => setStatus(stage.id)}
              >
                <i style={{ background: stage.color }} />
                <span>{stage.label}</span>
                <strong>{stage.count}</strong>
              </button>
            ))}
          </div>
        </div>
        <div className={styles.selection} aria-live="polite">
          <span>
            {stages.find((s) => s.id === status)?.label} · {selected.length}
          </span>
          {selected.length ? (
            selected.slice(0, 2).map((item) => (
              <Link
                href={href(item.agentKey, { finding: item.id })}
                onClick={onNavigate}
                key={item.id}
              >
                {item.title}
                <ArrowRight size={14} aria-hidden="true" />
              </Link>
            ))
          ) : (
            <p>No findings with this status in the selected scope.</p>
          )}
        </div>
        <p className={styles.disclaimer}>
          Plan approval is not execution. A passed check is not metered carbon savings.
        </p>
      </section>
    </div>
  );
}
