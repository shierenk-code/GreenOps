'use client';

import Link from 'next/link';
import { useState, type MouseEvent } from 'react';
import { ArrowRight, Search, ShieldCheck } from 'lucide-react';
import type { AgentWorkspace, ControlPlaneData, ControlTab, Opportunity } from './types';
import { TAB_LABELS } from './types';
import { filterOpportunities, LedgerPage } from './audit-pages';
import { Chart, Empty, MetricGrid, StatusBadge } from './ui';
import { CarbonAtlas } from './carbon-atlas';
import { ResourceSummary } from './resource-summary';
import { EvidenceComparison } from './evidence-comparison';
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
}: PageProps & { recommendations?: boolean; initialQuery?: string }) {
  const [query, setQuery] = useState(initialQuery);
  const [status, setStatus] = useState('all');
  const shown = filterOpportunities(data.opportunities, query, status);
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
        {shown.length} of {data.opportunities.length} findings ·{' '}
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
                <th>Status / risk</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((item) => (
                <tr key={item.id}>
                  <th scope="row">
                    {item.target}
                    <small>{TAB_LABELS[item.agentKey]}</small>
                  </th>
                  <td>
                    <strong>{item.title}</strong>
                    <p>{recommendations ? item.recommendation : item.description}</p>
                  </td>
                  <td>
                    <StatusBadge status={item.status} />
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
                      Open <ArrowRight size={14} aria-hidden="true" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
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
  const opportunities = data.opportunities.filter((o) => o.agentKey === agent.key);
  const ids = new Set(opportunities.map((o) => o.id));
  const scoped = {
    ...data,
    opportunities,
    ledger: data.ledger.filter((row) =>
      row.findingId ? ids.has(row.findingId) : row.agent === agent.name,
    ),
  };
  const next = opportunities.find(isPending);
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
          <span>Findings</span>
          <strong>{opportunities.length}</strong>
        </article>
        <article>
          <span>Awaiting review</span>
          <strong>{opportunities.filter(isPending).length}</strong>
        </article>
        <article>
          <span>Risk not assessed</span>
          <strong>{opportunities.filter((o) => o.risk === 'Unknown').length}</strong>
        </article>
        <article>
          <span>Production savings</span>
          <strong className={styles.unknown}>Not measured</strong>
        </article>
      </div>
      {!sandbox && (agent.key === 'carbon' || agent.key === 'arch') && (
        <CarbonAtlas data={{ ...scoped, agents: [agent] }} href={href} onNavigate={onNavigate} />
      )}
      <nav className={styles.tabs} aria-label="Agent workspace sections">
        {WORKSPACE_SECTIONS.map((item) => (
          <Link
            key={item}
            href={href(agent.key, { section: item })}
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
      ) : (
        <>
          <div className={styles.columns}>
            <FindingList
              key={`${agent.key}-${section}`}
              data={scoped}
              onReview={onReview}
              recommendations={section === 'recommendations'}
            />
            <aside className={styles.aside}>
              {next && <EvidenceComparison item={next} />}
              <section className={styles.card}>
                <h3>{next ? `Start with ${next.target}` : 'Review complete for this selection'}</h3>
                <p>
                  {next?.description ??
                    'Reviewed plans still need separate implementation and follow-up evidence.'}
                </p>
                {next && (
                  <>
                    <dl>
                      <div>
                        <dt>Recommendation</dt>
                        <dd>{next.title}</dd>
                      </div>
                      <div>
                        <dt>Risk</dt>
                        <dd>{next.risk === 'Unknown' ? 'Not assessed' : next.risk}</dd>
                      </div>
                      <div>
                        <dt>Execution</dt>
                        <dd>Plan review only</dd>
                      </div>
                    </dl>
                    <button className={styles.button} onClick={() => onReview(next.id)}>
                      Review recommendation <ArrowRight size={16} aria-hidden="true" />
                    </button>
                  </>
                )}
              </section>
              <section className={styles.card}>
                <ShieldCheck size={23} aria-hidden="true" />
                <h3>Before making a change</h3>
                <p>
                  Confirm resource ownership, operating constraints and rollback. Missing evidence
                  is not permission to proceed.
                </p>
              </section>
            </aside>
          </div>
          <div className={styles.domainInsights}>
            <MetricGrid metrics={agent.metrics} />
            {agent.chart && <Chart data={agent.chart} kind="bar" />}
          </div>
          <details className={styles.card}>
            <summary>Domain measurements & source inventory</summary>
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
                  {agent.rows.map((row) => (
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
