'use client';

import Link from 'next/link';
import { useState, type MouseEvent } from 'react';
import { ArrowRight, Search, ShieldCheck } from 'lucide-react';
import type { AgentWorkspace, ControlPlaneData, ControlTab, Opportunity } from './types';
import { TAB_LABELS } from './types';
import { filterOpportunities, LedgerPage } from './audit-pages';
import { Chart, Empty, MetricGrid, StatusBadge } from './ui';
import { CarbonAtlas } from './carbon-atlas';
import { carbonObservations } from './carbon-map-data';
import { aiInsights, benefitFor, displayQuantity, statusLabel } from './agent-insights';
import { ResourceSummary } from './resource-summary';
import DemoClient from '../ai-efficiency-demo/demo-client';
import WasteWorkflowClient from '../digital-waste/workflow-client';
import styles from './workspace-pages.module.css';

export type WorkspaceSection = 'findings' | 'recommendations' | 'results' | 'activity';
export const WORKSPACE_SECTIONS: WorkspaceSection[] = [
  'findings',
  'recommendations',
  'results',
  'activity',
];
type Navigation = {
  href: (tab: ControlTab, patch?: Record<string, string | null>) => string;
  onNavigate: (event: MouseEvent<HTMLAnchorElement>) => void;
};
type PageProps = { data: ControlPlaneData; onReview: (id: string) => void };
const isPending = (item: Opportunity) => ['pending', 'revision-requested'].includes(item.status);
export function FindingList({
  data,
  onReview,
  recommendations = false,
  initialQuery = '',
  compact = false,
  statusFilter,
  onStatusChange,
}: PageProps & {
  recommendations?: boolean;
  initialQuery?: string;
  compact?: boolean;
  statusFilter?: string;
  onStatusChange?: (status: string) => void;
}) {
  const [query, setQuery] = useState(initialQuery);
  const [localStatus, setLocalStatus] = useState('all');
  const status = statusFilter ?? localStatus;
  const setStatus = onStatusChange ?? setLocalStatus;
  const [showAll, setShowAll] = useState(false);
  const shown = filterOpportunities(data.opportunities, query, status);
  const visible = compact && !showAll && !query && status === 'all' ? shown.slice(0, 3) : shown;
  return (
    <section
      className={styles.card}
      aria-label={recommendations ? 'Recommendations' : 'Resource findings'}
    >
      <h3>{recommendations ? 'Recommended changes' : 'Resource findings'}</h3>
      <div className={styles.filters}>
        <label className={styles.search}>
          <Search size={18} aria-hidden="true" />
          <input
            aria-label="Search findings"
            type="search"
            placeholder="Search resource, finding or agent"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <select
          aria-label="Finding status"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          <option value="all">All statuses</option>
          <option value="pending">Needs review</option>
          <option value="revision-requested">Revision requested</option>
          <option value="approved">Plan approved</option>
          <option value="rejected">Rejected</option>
          <option value="applied">Applied</option>
          <option value="verified">Change check passed</option>
        </select>
      </div>
      <p className={styles.caption}>
        {visible.length} of {data.opportunities.length} findings ·{' '}
        {data.mode === 'sample' ? 'Synthetic examples' : 'Selected analysis'}
      </p>
      {!shown.length ? (
        <Empty>No matching findings. Adjust the search or status filter.</Empty>
      ) : (
        <div className={styles.tableScroll}>
          <table>
            <caption className={styles.srOnly}>
              {recommendations ? 'Recommended changes' : 'Findings'} in this selection
            </caption>
            <thead>
              <tr>
                <th>Resource</th>
                <th>{recommendations ? 'Proposed change' : 'Finding'}</th>
                <th>Estimated benefit</th>
                <th>Status / risk</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((item) => (
                <tr key={item.id}>
                  <th scope="row">
                    {item.target}
                    <small>{TAB_LABELS[item.agentKey]}</small>
                  </th>
                  <td>
                    <strong>{recommendations ? item.title : item.description}</strong>
                    {!compact && <p>{recommendations ? item.recommendation : item.description}</p>}
                  </td>
                  <td>
                    <strong>{benefitFor(item).value}</strong>
                    <small>{benefitFor(item).label}</small>
                  </td>
                  <td>
                    <StatusBadge status={statusLabel(item.status)} />
                    {item.status === 'approved' && <small>Not applied · not verified</small>}
                    <small>
                      {item.risk === 'Unknown' ? 'Risk not assessed' : `${item.risk} risk`}
                    </small>
                  </td>
                  <td>
                    <button
                      className={styles.button}
                      onClick={() => onReview(item.id)}
                      aria-label={`Open ${item.title} for ${item.target}`}
                    >
                      {isPending(item) ? 'Review' : 'View decision'}{' '}
                      <ArrowRight size={14} aria-hidden="true" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {compact && shown.length > 3 && !query && status === 'all' && (
        <button className={styles.textButton} onClick={() => setShowAll(!showAll)}>
          {showAll ? 'Show fewer findings' : `View all ${shown.length} findings`}{' '}
          <ArrowRight size={14} aria-hidden="true" />
        </button>
      )}
    </section>
  );
}

export function RecommendationList({ data, onReview }: PageProps) {
  const [showAll, setShowAll] = useState(false);
  const items = [...data.opportunities.filter(isPending), ...data.opportunities.filter((item) => !isPending(item))];
  const visible = showAll ? items : items.slice(0, 3);
  return <section className={styles.card} aria-label="Recommended changes">
    <h3>Recommended changes</h3>
    <p>What to change and why. Review a plan before applying anything; approval alone does not pass a change check.</p>
    {!items.length ? <Empty>No recommendations in this selection. Check the run, date window and region filter.</Empty> :
      <div className={styles.recommendations}>{visible.map((item) => <article key={item.id}>
        <div className={styles.heading}><div><span className={styles.eyebrow}>{item.target}</span><h4>{item.title}</h4></div><StatusBadge status={statusLabel(item.status)} /></div>
        <p>{item.recommendation}</p>
        <dl><div><dt>Estimated benefit</dt><dd>{benefitFor(item).value} · {benefitFor(item).label}</dd></div>
          <div><dt>Before applying</dt><dd>{item.riskNote}</dd></div></dl>
        <details><summary>Why this change?</summary><p>{item.description}</p></details>
        <button type="button" className={styles.button} onClick={() => onReview(item.id)}>{isPending(item) ? 'Review plan' : 'View decision'} <ArrowRight size={14} aria-hidden="true" /></button>
      </article>)}</div>}
    {items.length > 3 && <button type="button" className={styles.textButton} onClick={() => setShowAll(!showAll)}>{showAll ? 'Show priority recommendations' : `View all ${items.length} recommendations`}</button>}
  </section>;
}

export function ResultsPage({
  data,
  onReview,
  embedded = false,
}: PageProps & { embedded?: boolean }) {
  function exportEvidence() {
    const report = {
      schema: 'greenops-ui-evidence-v1',
      exportedAt: new Date().toISOString(),
      mode: data.mode,
      runId: data.runId,
      scope: data.filterNote,
      note: 'Selected finding evidence only. Local plan approvals are not execution. No metered carbon savings are asserted. Separate sandbox runs are not included.',
      resourceUsage: data.resourceUsage ?? null,
      findings: data.opportunities,
    };
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' }),
    );
    const link = document.createElement('a');
    link.href = url;
    link.download = 'greenops-results-evidence.json';
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return (
    <section className={styles.page} aria-label="Results and evidence">
      <header className={styles.heading}>
        <div>
          <h2>{embedded ? 'Results for this specialist' : 'Results & Evidence'}</h2>
          <p>
            Compare the baseline, recorded change and follow-up check. Approval alone is not a
            result.
          </p>
        </div>
        <button className={styles.button} onClick={exportEvidence}>
          Export evidence
        </button>
      </header>
      <div className={styles.notice}>
        <ShieldCheck size={20} aria-hidden="true" />
        {data.mode === 'sample'
          ? 'Synthetic examples only. No production result has been verified.'
          : 'A passed change check is not proof of measured energy, carbon or billing savings.'}
      </div>
      {!data.opportunities.length ? (
        <Empty>No finding evidence in this selection.</Empty>
      ) : (
        <section className={styles.card}>
          <div className={styles.tableScroll}>
            <table>
              <caption className={styles.srOnly}>Before and after evidence</caption>
              <thead>
                <tr>
                  <th>Resource / finding</th>
                  <th>Baseline</th>
                  <th>Application</th>
                  <th>Follow-up</th>
                  <th>Evidence</th>
                </tr>
              </thead>
              <tbody>
                {data.opportunities.map((item) => (
                  <tr key={item.id}>
                    <th scope="row">
                      {item.target}
                      <small>{item.title}</small>
                    </th>
                    <td>
                      {item.verification?.baseline.find((f) => f.label.startsWith('Before'))
                        ?.value ?? 'Not recorded'}
                    </td>
                    <td>
                      {item.verification?.change.find((f) => f.label === 'Application')?.value ??
                        'Not recorded'}
                    </td>
                    <td>
                      {data.mode === 'sample'
                        ? 'Synthetic · not verified'
                        : (item.verification?.status ?? 'Not verified')}
                    </td>
                    <td>
                      <button
                        className={styles.textButton}
                        onClick={() => onReview(item.id)}
                        aria-label={`View evidence for ${item.title} on ${item.target}`}
                      >
                        View evidence →
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
      {!embedded && (
        <details className={styles.card}>
          <summary>Resources used by GreenOps</summary>
          <ResourceSummary data={data} />
        </details>
      )}
    </section>
  );
}

export function ActivityPage({
  data,
  onReview,
  embedded = false,
}: PageProps & { embedded?: boolean }) {
  return (
    <section className={styles.page} aria-label="Agent activity">
      <header className={styles.heading}>
        <div>
          <h2>{embedded ? 'Specialist activity' : 'Agent Activity'}</h2>
          <p>Recorded lifecycle events and local decisions. This is not a live telemetry stream.</p>
        </div>
      </header>
      <details className={styles.card}>
        <summary>Whole-run model and tool usage</summary>
        <ResourceSummary data={data} />
      </details>
      <LedgerPage data={data} onReview={onReview} />
    </section>
  );
}

export function InvestigationPage(props: PageProps & { query?: string }) {
  return (
    <section className={styles.page} aria-label="Investigations">
      <header className={styles.heading}>
        <div>
          <h2>Investigations</h2>
          <p>Find the problem, inspect its evidence, then decide what happens next.</p>
        </div>
      </header>
      <FindingList {...props} initialQuery={props.query} />
    </section>
  );
}

export function SpecialistWorkspace({
  agent,
  data,
  onReview,
  section,
  sandbox,
  href,
  onNavigate,
}: PageProps &
  Navigation & { agent: AgentWorkspace; section: WorkspaceSection; sandbox: boolean }) {
  const [statusFilter, setStatusFilter] = useState('all');
  const [region, setRegion] = useState<string | null>(null);
  const allOpportunities = data.opportunities.filter((o) => o.agentKey === agent.key);
  const mapData = { ...data, opportunities: allOpportunities, agents: [agent] };
  const observations = carbonObservations(mapData).observations;
  const activeRegion = observations.find((item) => item.region.id === region)?.region;
  const regionalIds = new Set(
    observations
      .filter((item) => item.region.id === activeRegion?.id)
      .map((item) => item.findingId),
  );
  const opportunities = activeRegion
    ? allOpportunities.filter((item) => regionalIds.has(item.id))
    : allOpportunities;
  const ai = agent.key === 'ai' ? aiInsights(opportunities) : null;
  const approved = opportunities.filter((item) => item.status === 'approved').length;
  const applied =
    data.mode === 'sample' ? 0 : opportunities.filter((item) => item.status === 'applied').length;
  const verified =
    data.mode === 'sample' ? 0 : opportunities.filter((item) => item.status === 'verified').length;
  const ids = new Set(opportunities.map((o) => o.id));
  const scoped = {
    ...data,
    opportunities,
    ledger: data.ledger.filter((row) =>
      row.findingId ? ids.has(row.findingId) : row.agent === agent.name,
    ),
  };
  const next = opportunities.find(isPending);
  const attentionFirst = [
    ...opportunities.filter(isPending),
    ...opportunities.filter((item) => !isPending(item)),
  ];
  const supportsSandbox = ['ai', 'waste'].includes(agent.key);
  return (
    <section className={styles.page} aria-label={`${TAB_LABELS[agent.key]} workspace`}>
      <header className={styles.heading}>
        <div>
          <span className={styles.eyebrow}>Specialists / {TAB_LABELS[agent.key]}</span>
          <h2>{TAB_LABELS[agent.key]}</h2>
          <p>{agent.description}</p>
        </div>
        {supportsSandbox && (
          <Link
            className={styles.button}
            href={href(agent.key, { sandbox: sandbox ? null : '1' })}
            onClick={onNavigate}
          >
            {sandbox ? 'Close sandbox' : 'Open sandbox'} <ArrowRight size={16} aria-hidden="true" />
          </Link>
        )}
      </header>
      <div className={styles.summary}>
        <article>
          <span>{ai ? 'Requests analysed' : 'Resources with findings'}</span>
          <strong className={ai?.requests === null ? styles.unknown : undefined}>
            {ai
              ? displayQuantity(ai.requests)
              : new Set(opportunities.map((item) => item.target)).size}
          </strong>
          <small>{ai ? `Known workload subtotal · ${ai.coverage}` : 'In this selection'}</small>
        </article>
        <article>
          <span>{ai ? 'Potentially avoidable tokens' : 'Findings'}</span>
          <strong className={ai?.largestOpportunity === null ? styles.unknown : undefined}>
            {ai ? displayQuantity(ai.largestOpportunity) : opportunities.length}
          </strong>
          <small>
            {ai ? 'Largest single opportunity · not a combined total' : 'Detected opportunities'}
          </small>
        </article>
        <article>
          <span>Awaiting review</span>
          <strong>{opportunities.filter(isPending).length}</strong>
          <small>Human decision needed</small>
        </article>
        <article>
          <span>Change checks passed</span>
          <strong>
            {data.mode === 'sample'
              ? 0
              : opportunities.filter((item) => item.status === 'verified').length}
          </strong>
          <small>
            {data.mode === 'sample'
              ? 'Synthetic examples · not verified'
              : 'Not proof of measured carbon savings'}
          </small>
        </article>
      </div>
      <section className={styles.progress} aria-label="Decision and execution progress">
        <div>
          <h3>Where your decisions stand</h3>
          <p>
            {data.mode === 'sample'
              ? 'Simulated reviews only. No real workload changes.'
              : 'Approval records a plan. Applying it and checking the result are separate steps.'}
          </p>
        </div>
        <div className={styles.progressSteps}>
          {[
            {
              status: 'approved',
              count: approved,
              label: 'Plan approved',
              detail: 'Not applied · not verified',
            },
            {
              status: 'applied',
              count: applied,
              label: 'Applied',
              detail: 'Follow-up check still needed',
            },
            {
              status: 'verified',
              count: verified,
              label: 'Check passed',
              detail: 'Not proof of carbon savings',
            },
          ].map((step) => (
            <button
              key={step.status}
              type="button"
              aria-pressed={statusFilter === step.status}
              onClick={() => {
                setStatusFilter(statusFilter === step.status ? 'all' : step.status);
                if (section !== 'findings' || sandbox) window.history.pushState(null, '', href(agent.key, { section: 'findings' }));
              }}
            >
              <strong>{step.count}</strong>
              <span>{step.label}</span>
              <small>{step.detail}</small>
            </button>
          ))}
        </div>
        <small>
          Separate current states, not cumulative totals. Select a state to filter the findings
          below.
        </small>
      </section>
      {!sandbox && (agent.key === 'carbon' || agent.key === 'arch') && (
        <CarbonAtlas
          data={mapData}
          href={href}
          onNavigate={onNavigate}
          selectedRegion={activeRegion?.id ?? null}
          onRegionChange={setRegion}
        />
      )}
      {activeRegion && (
        <div className={styles.notice}>
          Showing {activeRegion.name}: {opportunities.length} findings. Current or candidate region
          evidence.
          <button type="button" className={styles.textButton} onClick={() => setRegion(null)}>
            Clear region filter
          </button>
        </div>
      )}
      <nav className={styles.tabs} aria-label="Agent workspace sections">
        {WORKSPACE_SECTIONS.map((item) => (
          <Link
            key={item}
            href={href(agent.key, { section: item })}
            scroll={false}
            data-preserve-scroll="true"
            onClick={onNavigate}
            aria-current={!sandbox && section === item ? 'page' : undefined}
          >
            {item[0].toUpperCase() + item.slice(1)}
          </Link>
        ))}
      </nav>
      {sandbox && supportsSandbox ? (
        <section className={styles.card} aria-label="Separate synthetic sandbox">
          <h3>Separate synthetic sandbox</h3>
          <p className={styles.caption}>
            This workflow has its own findings, decisions and evidence. It does not update the
            recorded fleet counts above.
          </p>
          {agent.key === 'waste' ? <WasteWorkflowClient /> : <DemoClient embedded />}
        </section>
      ) : section === 'results' ? (
        <ResultsPage data={scoped} onReview={onReview} embedded />
      ) : section === 'activity' ? (
        <ActivityPage data={scoped} onReview={onReview} embedded />
      ) : section === 'recommendations' ? (
        <RecommendationList data={scoped} onReview={onReview} />
      ) : (
        <>
          <div className={styles.columns}>
            {ai?.chart.points.length || (!ai && agent.chart) ? (
              <Chart
                data={
                  ai
                    ? ai.chart
                    : activeRegion
                      ? {
                          title: 'Findings in selected region',
                          description:
                            'Recorded findings with current or candidate evidence for this region.',
                          primaryLabel: 'Findings',
                          primaryUnit: 'findings',
                          points: opportunities.map((item) => ({ label: item.target, primary: 1 })),
                        }
                      : agent.chart!
                }
                kind="bar"
              />
            ) : (
              <section className={styles.card}>
                <h3>{ai ? 'Avoidable tokens by application' : 'Workload comparison'}</h3>
                <Empty>
                  {ai
                    ? 'Not available. This selection has no supported token-reduction estimates. Unused token allowance is not a saving.'
                    : 'No comparable measurements in this selection. Review the findings below.'}
                </Empty>
              </section>
            )}
            <aside className={styles.aside}>
              <section className={styles.card}>
                <span className={styles.eyebrow}>Your next step</span>
                <h3>{next ? next.target : 'No pending decisions'}</h3>
                <p>
                  {next?.title ??
                    'Reviewed plans still need separate implementation and follow-up evidence.'}
                </p>
                {next && (
                  <>
                    <p className={styles.caption}>
                      {next.risk === 'Unknown' ? 'Risk not assessed' : `${next.risk} risk`} · Plan
                      review only
                    </p>
                    <button className={styles.button} onClick={() => onReview(next.id)}>
                      Review recommendation <ArrowRight size={16} aria-hidden="true" />
                    </button>
                  </>
                )}
              </section>
              {ai && (
                <section className={styles.card} aria-label="Before and after outcome">
                  <h3>Before &amp; after</h3>
                  <p>
                    {verified
                      ? `${verified} recorded change checks passed. Open Results for the baseline and follow-up evidence.`
                      : applied
                        ? 'A change was applied. Follow-up evidence is needed before showing an improvement.'
                        : approved
                          ? `${approved} plan(s) approved. No applied change or verified improvement is recorded for those plans.`
                          : 'No applied change yet. Review a recommendation first.'}
                  </p>
                  <Link
                    className={styles.textButton}
                    href={href(agent.key, { section: 'results' })}
                    scroll={false}
                    data-preserve-scroll="true"
                    onClick={onNavigate}
                  >
                    View recorded results →
                  </Link>
                  <p className={styles.caption}>
                    To try an actual cache change, open the separate sandbox. Its results do not
                    update this analysis.
                  </p>
                </section>
              )}
            </aside>
          </div>
          <FindingList
            key={`${agent.key}-${section}`}
            data={{ ...scoped, opportunities: attentionFirst }}
            onReview={onReview}
            compact
            statusFilter={statusFilter}
            onStatusChange={setStatusFilter}
          />
          <details className={styles.card}>
            <summary>Domain measurements & source inventory</summary>
            {activeRegion ? (
              <p>
                Region-filtered inventory below. Whole-specialist measurement totals are hidden
                while a region is selected.
              </p>
            ) : (
              <MetricGrid metrics={agent.metrics} />
            )}
            <div className={styles.tableScroll}>
              <table>
                <caption>{agent.inventoryTitle}</caption>
                <thead>
                  <tr>
                    <th>Resource</th>
                    {agent.columns.map((column, i) => (
                      <th key={i}>{column}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {agent.rows
                    .filter((row) => !activeRegion || regionalIds.has(row.opportunityId ?? row.id))
                    .map((row) => (
                      <tr key={row.id}>
                        <th scope="row">{row.name}</th>
                        {row.cells.map((cell, i) => (
                          <td key={i}>{cell}</td>
                        ))}
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
            {!agent.rows.length && <Empty>No resource records in this selection.</Empty>}
          </details>
        </>
      )}
    </section>
  );
}
