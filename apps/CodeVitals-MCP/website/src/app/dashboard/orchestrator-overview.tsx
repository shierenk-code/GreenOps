'use client';

import Link from 'next/link';
import { useState } from 'react';
import type { Finding } from './ledger-dashboard';
import {
  buildOverviewData,
  type DashboardRun,
  type OverviewAgentCard,
  type OverviewAgentId,
  type OverviewData,
  type OverviewEvidence,
} from './overview-data';
import { withRecordedRun } from './dashboard-run';
import { agentModulePath } from './agent-paths';
import styles from './orchestrator-overview.module.css';

const chartColors = ['#059669', '#0ea5e9', '#8b5cf6', '#f59e0b', '#94a3b8'];
const cardPositions: Record<OverviewAgentId, string> = {
  'ai-efficiency': 'ai',
  'digital-waste': 'waste',
  'carbon-incident': 'carbon',
  architecture: 'architecture',
  collaboration: 'collaboration',
  'disaster-recovery': 'recovery',
  'pipeline-efficiency': 'pipeline',
  'code-analysis': 'code',
};
const agentDescriptions: Record<OverviewAgentId, string> = {
  'carbon-incident': 'Understand energy spikes and where workloads exceed their baseline.',
  'digital-waste': 'Find unused storage, oversized compute, and resources worth clearing.',
  'ai-efficiency': 'Reduce repeated requests, unnecessary retries, and oversized token limits.',
  architecture: 'Review infrastructure sizing, autoscaling, and deployment choices.',
  'disaster-recovery': 'Balance backup and standby capacity with your recovery requirements.',
  collaboration: 'Reduce duplicate recordings and keep useful knowledge for the right duration.',
  'pipeline-efficiency': 'Cut CI/CD reruns, cache misses and oversized build artifacts.',
  'code-analysis': 'Review code-level opportunities to use fewer resources.',
};

function AgentIcon({ id }: { id: OverviewAgentId }) {
  const paths: Record<OverviewAgentId, string> = {
    'ai-efficiency':
      'M8 3v3m8-3v3M8 18v3m8-3v3M3 8h3m-3 8h3m12-8h3m-3 8h3M7 6h10a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1Zm3 4h4v4h-4Z',
    'digital-waste': 'M4 6v12c0 4 16 4 16 0V6M4 12c0 4 16 4 16 0M4 6c0-4 16-4 16 0s-16 4-16 0Z',
    'carbon-incident': 'M4 18C2 9 9 3 20 4c1 10-5 17-13 15M5 20l10-10',
    architecture: 'M12 8v4M5 16v-4h14v4M9 2h6v6H9ZM2 16h6v6H2Zm14 0h6v6h-6Z',
    collaboration:
      'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M22 21v-2a4 4 0 0 0-3-4M9 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8Zm7 0a4 4 0 0 1 0 8',
    'disaster-recovery': 'M4 8a9 9 0 1 1-1 7M4 3v5h5M12 7v5l3 2',
    'pipeline-efficiency': 'M3 3h6v6H3Zm12 12h6v6h-6ZM6 9v3a3 3 0 0 0 3 3h6',
    'code-analysis': 'm8 6-6 6 6 6m8-12 6 6-6 6m-3-14-2 16',
  };
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={paths[id]} />
    </svg>
  );
}

function Arrow() {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      aria-hidden="true"
    >
      <path d="M3 10h13m-5-5 5 5-5 5" />
    </svg>
  );
}

function formatNumber(value: number | null): string {
  return value === null
    ? 'Not recorded'
    : value.toLocaleString(
        'en-US',
        value !== 0 && Math.abs(value) < 0.01
          ? { maximumSignificantDigits: 2 }
          : { maximumFractionDigits: 2 },
      );
}

const metricLabels: Record<string, string> = {
  'wasted-tokens': 'Potentially avoidable tokens',
  'unused-allowance': 'Unused output allowance',
  'retry-attempts': 'Retry attempts',
  'excess-cores': 'Est. excess capacity',
  'unattached-storage': 'Unattached storage',
  'peak-energy': 'Peak interval energy',
  'peak-baseline-ratio': 'Peak vs baseline',
  regions: 'Regions flagged',
  'sizing-excess': 'Est. oversized capacity',
  'excess-replicas': 'Est. extra replicas',
  'hot-standby-cores': 'Hot standby capacity',
  'duplicate-media': 'Duplicate media',
  'longest-retention': 'Longest retention',
};

function matchesEvidence(finding: OverviewEvidence, query: string) {
  return `${finding.title} ${finding.category} ${finding.agentId} ${finding.severity}`
    .toLowerCase()
    .includes(query);
}

/** Search only public presentation fields, never prompts, reasoning, or raw evidence. */
export function filterOverview(data: OverviewData, search: string) {
  const query = search.trim().toLowerCase();
  if (!query) return { agents: data.agents, priorityFindings: data.priorityFindings };
  const matchingAgentIds = new Set(
    data.agents
      .filter((agent) =>
        `${agent.name} ${agent.scope} ${agent.categories.map((category) => category.label).join(' ')} ${agent.metrics.map((metric) => metric.label).join(' ')}`
          .toLowerCase()
          .includes(query),
      )
      .map((agent) => agent.id),
  );
  return {
    agents: data.agents.filter(
      (agent) =>
        matchingAgentIds.has(agent.id) ||
        agent.topEvidence.some((finding) => matchesEvidence(finding, query)) ||
        data.priorityFindings.some(
          (finding) => finding.agentId === agent.id && matchesEvidence(finding, query),
        ),
    ),
    priorityFindings: data.priorityFindings.filter(
      (finding) =>
        matchingAgentIds.has(finding.agentId as OverviewAgentId) || matchesEvidence(finding, query),
    ),
  };
}

function CategoryBars({ agent }: { agent: OverviewAgentCard }) {
  const maximum = Math.max(1, ...agent.categories.map((category) => category.count));
  return (
    <div className={styles.categorySection}>
      <p className={styles.chartLabel}>Findings by category</p>
      <ul className={styles.bars}>
        {agent.categories.map((category, index) => (
          <li key={category.id}>
            <div className={styles.barLabel}>
              <span>{category.label}</span>
              <strong>{category.count}</strong>
            </div>
            <div className={styles.barTrack} aria-hidden="true">
              <span
                style={{
                  width: `${(category.count / maximum) * 100}%`,
                  background: chartColors[index % chartColors.length],
                }}
              />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function NativeMetrics({ agent }: { agent: OverviewAgentCard }) {
  if (!agent.metrics.length) return null;
  return (
    <dl className={styles.nativeMetrics}>
      {agent.metrics.slice(0, 2).map((metric) => (
        <div key={metric.id}>
          <dt>
            {metricLabels[metric.id] ?? metric.label}
            {metric.id === 'unused-allowance' && (
              <span className={styles.metricQualifier}>Not consumed or saved tokens</span>
            )}
          </dt>
          <dd>
            {formatNumber(metric.value)}
            {metric.value !== null && metric.unit && (
              <span>
                {' '}
                {metric.id === 'unused-allowance'
                  ? 'allowance'
                  : metric.id === 'peak-baseline-ratio'
                    ? '×'
                    : metric.unit}
              </span>
            )}
          </dd>
          {metric.value !== null && metric.evidenceCount < metric.applicableFindings && (
            <small>
              {metric.evidenceCount} of {metric.applicableFindings} findings have this evidence
            </small>
          )}
        </div>
      ))}
    </dl>
  );
}

function AgentCard({ agent, runId }: { agent: OverviewAgentCard; runId: string | null }) {
  const link = (href: string) => withRecordedRun(href, runId);
  return (
    <section
      className={`${styles.agentCard} ${styles[cardPositions[agent.id]]}`}
      aria-labelledby={`overview-${agent.id}`}
    >
      <header className={styles.cardHeader}>
        <div className={styles.agentTitle}>
          <span className={styles.agentIcon}>
            <AgentIcon id={agent.id} />
          </span>
          <div>
            <h3 id={`overview-${agent.id}`}>{agent.name}</h3>
            <span className={styles.agentType}>Specialist agent</span>
          </div>
        </div>
        <span className={agent.highPriority ? styles.priorityBadge : styles.countBadge}>
          {agent.highPriority ? `${agent.highPriority} high priority` : `${agent.count} findings`}
        </span>
      </header>
      <div className={styles.cardContent}>
        <p className={styles.scope}>{agentDescriptions[agent.id]}</p>
        {agent.count === 0 ? (
          <div className={styles.emptyCard}>
            <strong>No recorded findings</strong>
            <p>
              Open the agent details to check its coverage. This does not establish a clean scan.
            </p>
          </div>
        ) : (
          <>
            <NativeMetrics agent={agent} />
            <div className={styles.cardStatus}>
              <span>{agent.count} findings to explore</span>
              <span>{agent.verified} verified</span>
            </div>
            <details className={styles.categoryDetails}>
              <summary>What was found</summary>
              <CategoryBars agent={agent} />
            </details>
          </>
        )}
      </div>
      <footer className={styles.cardFooter}>
        <Link href={link(`${agentModulePath(agent.id)}#agent-detail`)}>
          View agent <Arrow />
        </Link>
        <Link href={link(`/dashboard/findings?agent=${agent.id}`)}>
          Findings <Arrow />
        </Link>
      </footer>
    </section>
  );
}

function FindingsChart({ data }: { data: OverviewData }) {
  const maximum = Math.max(1, ...data.agents.map((agent) => agent.count));
  const recommendations = data.summary.recommendations;
  const sourceRows = [
    ['Model-generated', recommendations.modelGenerated],
    ['Offline fallback', recommendations.fallback],
    ['Rule-based', recommendations.ruleBased],
    ['Source unconfirmed', recommendations.unconfirmed],
    ['Not yet recorded', recommendations.notRecorded],
  ] as const;
  const chartDescription = data.agents
    .map((agent) => `${agent.name}: ${agent.count} findings, ${agent.verified} verified`)
    .join('; ');
  return (
    <div className={styles.insightsGrid}>
      <section className={styles.chartPanel} aria-labelledby="overview-finding-coverage">
        <div className={styles.sectionHeading}>
          <div>
            <h2 id="overview-finding-coverage">Opportunities and verified progress</h2>
            <p>Compare findings across your specialist agents.</p>
          </div>
          <div className={styles.chartLegend} aria-hidden="true">
            <span>
              <i className={styles.foundKey} />
              Findings
            </span>
            <span>
              <i className={styles.verifiedKey} />
              Verified
            </span>
          </div>
        </div>
        <div className={styles.comparisonChart} role="img" aria-label={chartDescription}>
          {data.agents.map((agent) => (
            <div className={styles.comparisonRow} key={agent.id} aria-hidden="true">
              <span>{agent.name}</span>
              <div className={styles.pairedBars}>
                <div>
                  <i
                    className={styles.findingsBar}
                    style={{ width: `${(agent.count / maximum) * 100}%` }}
                  />
                </div>
                <div>
                  <i
                    className={styles.verifiedBar}
                    style={{ width: `${(agent.verified / maximum) * 100}%` }}
                  />
                </div>
              </div>
              <span className={styles.chartValues}>
                <strong>{agent.count}</strong> / {agent.verified}
              </span>
            </div>
          ))}
        </div>
        <div className={styles.chartFooter}>
          <span>{data.summary.applied} applied changes recorded</span>
          <Link href={withRecordedRun('/dashboard/improvements', data.runId)}>
            Review progress <Arrow />
          </Link>
        </div>
      </section>
      <section className={styles.sourcePanel} aria-labelledby="overview-recommendation-sources">
        <div className={styles.sectionHeading}>
          <div>
            <h2 id="overview-recommendation-sources">Recommendation sources</h2>
            <p>See how your next steps were prepared.</p>
          </div>
        </div>
        <dl className={styles.sourceList}>
          {sourceRows.map(([label, count]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{formatNumber(count)}</dd>
            </div>
          ))}
        </dl>
        <p className={styles.sourceNote}>
          {recommendations.fallback > 0
            ? 'Some recommendations use offline guidance. Review their evidence before deciding.'
            : 'A recommendation is a proposed next step, not an applied or verified change.'}
        </p>
        <Link
          className={styles.sourceLink}
          href={withRecordedRun('/dashboard/reports#technical-diagnostics', data.runId)}
        >
          Review recommendation quality <Arrow />
        </Link>
      </section>
    </div>
  );
}

function Progression({ data }: { data: OverviewData }) {
  const link = (href: string) => withRecordedRun(href, data.runId);
  const recommendations = data.summary.recommendations;
  const recordedRecommendations = recommendations.total;
  const recordedStages = data.stages.filter((stage) => stage.count > 0).length;
  const steps = [
    {
      title: 'Status',
      value: data.runId === null ? 'No run selected' : 'Saved results',
      href: '/dashboard/trace',
    },
    {
      title: 'Activity',
      value: `${recordedStages} ${recordedStages === 1 ? 'stage' : 'stages'} recorded`,
      href: '/dashboard/trace',
    },
    { title: 'Evidence', value: `${data.summary.findings} findings`, href: '/dashboard/findings' },
    {
      title: 'Recommendation',
      value: `${recordedRecommendations} recorded`,
      href: '/dashboard/findings',
    },
    { title: 'Human decision', value: 'Review proposed changes', href: '/dashboard/approvals' },
    {
      title: 'Verified result',
      value: `${data.summary.verified} verified`,
      href: '/dashboard/improvements?state=verified',
    },
  ];
  return (
    <section className={styles.progression} aria-labelledby="overview-progression">
      <div className={styles.sectionHeading}>
        <h2 id="overview-progression">From evidence to outcome</h2>
        <Link href={link('/dashboard/trace')}>
          Open run trace <Arrow />
        </Link>
      </div>
      <ol>
        {steps.map((step, index) => (
          <li key={step.title}>
            <Link href={link(step.href)}>
              <span className={styles.stepIndex}>{index + 1}</span>
              <span>
                <strong>{step.title}</strong>
                <small>{step.value}</small>
              </span>
            </Link>
            {index < steps.length - 1 && (
              <span className={styles.stepArrow} aria-hidden="true">
                ›
              </span>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}

export default function OrchestratorOverview({
  findings,
  run,
  initialQuery = '',
}: {
  findings: Finding[];
  run: DashboardRun | null;
  initialQuery?: string;
}) {
  const [query, setQuery] = useState(initialQuery);
  const data = buildOverviewData(findings, run);
  const filtered = filterOverview(data, query);
  const link = (href: string) => withRecordedRun(href, data.runId);
  const summary = data.summary;
  const priorityRows = filtered.priorityFindings.filter((finding) => !finding.verified).slice(0, 5);
  return (
    <div className={styles.overview}>
      <section className={styles.startHere} aria-labelledby="overview-next-step">
        <span className={styles.startIcon} aria-hidden="true">
          ↗
        </span>
        <div>
          <h2 id="overview-next-step">Turn opportunities into improvements</h2>
          <p>
            Explore an agent, review the evidence, and choose a safe next step. Changes need review
            before their results can be verified.
          </p>
        </div>
        <Link href={link('/dashboard/approvals')}>
          Review proposed changes <Arrow />
        </Link>
      </section>

      <div className={styles.toolbar}>
        <div>
          <h2>Your specialist agents</h2>
          <p>Seven areas of focus. One place to decide what happens next.</p>
        </div>
        <div className={styles.searchGroup}>
          <label className={styles.search}>
            <span>Search agents or opportunities</span>
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search agents or opportunities…"
            />
          </label>
          {query && (
            <button type="button" className={styles.clearSearch} onClick={() => setQuery('')}>
              Clear search
            </button>
          )}
        </div>
      </div>
      {query && (
        <p className={styles.searchStatus} role="status">
          {filtered.agents.length} matching agent groups · {filtered.priorityFindings.length}{' '}
          matching priority findings. Summary totals remain for the selected run.
        </p>
      )}

      {filtered.agents.length ? (
        <div className={`${styles.agentGrid} ${query.trim() ? styles.filteredGrid : ''}`}>
          {filtered.agents.map((agent) => (
            <AgentCard key={agent.id} agent={agent} runId={data.runId} />
          ))}
        </div>
      ) : (
        <div className={styles.noMatches}>
          <h3>No matching agents</h3>
          <p>Try another agent name, resource, or finding category.</p>
          <button type="button" onClick={() => setQuery('')}>
            Show all agents
          </button>
        </div>
      )}

      <FindingsChart data={data} />

      <Progression data={data} />

      <section className={styles.priorityPanel} aria-labelledby="overview-priorities">
        <div className={styles.sectionHeading}>
          <div>
            <h2 id="overview-priorities">Needs your attention</h2>
            <p>Unverified opportunities, ordered by recorded severity.</p>
          </div>
          <Link href={link('/dashboard/findings')}>
            View all findings <Arrow />
          </Link>
        </div>
        {priorityRows.length ? (
          <ul className={styles.priorityList}>
            {priorityRows.map((finding) => {
              const agentName =
                data.agents.find((agent) => agent.id === finding.agentId)?.name ?? 'Other findings';
              return (
                <li key={finding.findingId}>
                  <Link
                    href={link(
                      `/dashboard/review?finding=${encodeURIComponent(finding.findingId)}`,
                    )}
                  >
                    <span
                      className={`${styles.severity} ${finding.severity === 'critical' || finding.severity === 'high' ? styles.highSeverity : finding.severity === 'medium' ? styles.mediumSeverity : styles.lowSeverity}`}
                    >
                      {finding.severity === 'unknown' ? 'Unrated' : finding.severity}
                    </span>
                    <span className={styles.priorityTitle}>{finding.title}</span>
                    <span className={styles.priorityAgent}>{agentName}</span>
                    <span className={styles.reviewLink}>
                      Review <Arrow />
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className={styles.noPriority}>
            {query
              ? 'No priority findings match this search.'
              : summary.findings === 0
                ? 'No finding records are available for this selection. This is not a clean-scan result.'
                : 'No unverified priority findings in this selection. Open all findings to inspect recorded results.'}
          </p>
        )}
      </section>

      <div className={styles.demoActions}>
        <div>
          <Link href="/dashboard/ai-efficiency-demo">
            Try the isolated AI efficiency demo <Arrow />
          </Link>
          <p>Your saved fleet findings and real applications are not changed.</p>
        </div>
        <Link href={link('/dashboard/reports')}>
          View impact and measurement <Arrow />
        </Link>
      </div>
    </div>
  );
}
