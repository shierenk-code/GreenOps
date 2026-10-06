'use client';

import { LiveWorkspace } from './live-workspace';
import { useState } from 'react';
import DemoClient from '../ai-efficiency-demo/demo-client';
import WasteWorkflowClient from '../digital-waste/workflow-client';
import type {
  AgentKey,
  AgentWorkspace,
  ControlPlaneData,
  Fact,
  Opportunity,
  ResourceRow,
  Tone,
} from './types';
import { Callout, Chart, Empty, MetricGrid, Panel, StatusBadge } from './ui';
import styles from './agent-pages.module.css';

interface AgentPagesProps {
  agent: AgentWorkspace;
  data: ControlPlaneData;
  onReview: (id: string) => void;
}

const pageDetails: Record<AgentKey, { title: string; description: string; tone: Tone }> = {
  ai: {
    title: 'AI Efficiency Agent Overview',
    description:
      'Understand token waste, inspect repeated prompts and retries, and review a practical plan for more efficient AI workloads.',
    tone: 'purple',
  },
  waste: {
    title: 'Digital Waste Agent Overview',
    description:
      'Bring unused storage, idle compute, container images, and excessive log retention into one cleanup review queue.',
    tone: 'amber',
  },
  carbon: {
    title: 'Carbon Intensity & Workload Efficiency',
    description:
      'Compare regional evidence and energy spikes before deciding whether to reschedule or move a workload.',
    tone: 'green',
  },
  arch: {
    title: 'Architecture & Code Review',
    description:
      'Review source-code findings, repeated work, infrastructure sizing and scaling policies. Inspect each recorded recommendation before making changes.',
    tone: 'blue',
  },
  dr: {
    title: 'Disaster Recovery & Redundancy Balancer',
    description:
      'Balance standby resources and backup storage against recovery objectives. Reliability requirements come before any reduction.',
    tone: 'rose',
  },
  collab: {
    title: 'Collaboration & Workspace Lifecycle',
    description:
      'Review recording retention, duplicate media, and knowledge assets while keeping the information your team needs.',
    tone: 'purple',
  },
  pipeline: {
    title: 'CI/CD Pipeline Efficiency',
    description:
      'Find build runs that repeat work already done: cache misses, duplicate runs for one commit, and artifacts larger than deployment needs.',
    tone: 'blue',
  },
};

export function filterWorkspaceRows(rows: ResourceRow[], query: string): ResourceRow[] {
  const search = query.trim().toLocaleLowerCase();
  if (!search) return rows;
  return rows.filter((row) =>
    [
      row.name,
      ...row.cells,
      row.status ?? '',
      ...(row.facts ?? []).flatMap((fact) => [fact.label, fact.value]),
    ].some((value) => value.toLocaleLowerCase().includes(search)),
  );
}

function Facts({ facts, compact = false }: { facts: Fact[]; compact?: boolean }) {
  return (
    <dl className={`${styles.facts} ${compact ? styles.compactFacts : ''}`}>
      {facts.map((fact, index) => (
        <div key={`${fact.label}-${index}`}>
          <dt>{fact.label}</dt>
          <dd>{fact.value}</dd>
        </div>
      ))}
    </dl>
  );
}

function rowFacts(agent: AgentWorkspace, row: ResourceRow): Fact[] {
  return row.facts?.length
    ? row.facts
    : row.cells.map((value, index) => ({
        label: agent.columns[index] ?? `Detail ${index + 1}`,
        value,
      }));
}

function ReviewButton({
  id,
  opportunities,
  onReview,
  label = 'Review recommendation',
}: {
  id?: string;
  opportunities: Opportunity[];
  onReview: (id: string) => void;
  label?: string;
}) {
  const opportunity = opportunities.find((item) => item.id === id);
  if (!opportunity) return <span className={styles.unavailable}>No recommendation linked</span>;
  return (
    <button
      type="button"
      className={styles.reviewButton}
      onClick={() => onReview(opportunity.id)}
      aria-label={`${label}: ${opportunity.title}`}
    >
      {label}
      <span aria-hidden="true">↗</span>
    </button>
  );
}

function ResourceTable({
  agent,
  rows = agent.rows,
  opportunities,
  onReview,
  emptyMessage,
}: {
  agent: AgentWorkspace;
  rows?: ResourceRow[];
  opportunities: Opportunity[];
  onReview: (id: string) => void;
  emptyMessage?: string;
}) {
  if (!rows.length)
    return (
      <Empty>
        {emptyMessage ??
          'No matching resources are available in this view. Load an analysis or explore the sample workspace.'}
      </Empty>
    );
  return (
    <div
      className={styles.tableScroll}
      role="region"
      aria-label={`${agent.name} resource details`}
      tabIndex={0}
    >
      <table className={styles.table}>
        <thead>
          <tr>
            <th scope="col">Resource</th>
            {agent.columns.map((column, index) => (
              <th key={`${column}-${index}`} scope="col">
                {column}
              </th>
            ))}
            <th scope="col">Action</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              <th scope="row">
                <span className={styles.resourceName}>{row.name}</span>
                {row.status && <StatusBadge status={row.status} />}
              </th>
              {agent.columns.map((column, index) => (
                <td key={`${column}-${index}`}>{row.cells[index] || 'Not recorded'}</td>
              ))}
              <td>
                <ReviewButton
                  id={row.opportunityId}
                  opportunities={opportunities}
                  onReview={onReview}
                  label="Review fix"
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Recommendations({
  opportunities,
  onReview,
  emptyMessage = 'Recommendations will appear when an analysis identifies an opportunity.',
}: {
  opportunities: Opportunity[];
  onReview: (id: string) => void;
  emptyMessage?: string;
}) {
  if (!opportunities.length) return <Empty>{emptyMessage}</Empty>;
  return (
    <div className={styles.recommendations}>
      {opportunities.map((opportunity, index) => (
        <article className={styles.recommendation} key={opportunity.id}>
          <div className={styles.cardTop}>
            <span className={styles.step}>{String(index + 1).padStart(2, '0')}</span>
            <span className={styles.risk} data-risk={opportunity.risk}>
              {opportunity.risk} risk
            </span>
          </div>
          <h3>{opportunity.title}</h3>
          <p>
            {opportunity.recommendation || 'Review the finding evidence to decide the next step.'}
          </p>
          <div className={styles.recommendationMeta}>
            <span>{opportunity.confidence || 'Confidence not recorded'}</span>
            <StatusBadge status={opportunity.status} />
          </div>
          <ReviewButton id={opportunity.id} opportunities={opportunities} onReview={onReview} />
        </article>
      ))}
    </div>
  );
}

function AiPage({
  agent,
  opportunities,
  onReview,
}: AgentPagesProps & { opportunities: Opportunity[] }) {
  const comparison = agent.chart?.primaryUnit !== 'findings' ? agent.chart : undefined;
  const [showDemo, setShowDemo] = useState(false);
  return (
    <>
      <MetricGrid metrics={agent.metrics} />
      <Panel
        title="Model routing: cost & carbon comparison"
        description="Compare model tiers only where the analysis provides a common workload and measurement basis."
      >
        {comparison ? (
          <Chart data={comparison} kind="bar" embedded />
        ) : (
          <Empty>
            No model-tier comparison was recorded. A routing recommendation needs task-quality
            checks, token usage, and a consistent cost and carbon basis.
          </Empty>
        )}
      </Panel>
      <Panel
        title={agent.inventoryTitle || 'Prompt & tool call inspection'}
        description="Inspect the calls behind token waste before changing a model, cache, or retry policy."
      >
        <ResourceTable agent={agent} opportunities={opportunities} onReview={onReview} />
      </Panel>
      <Panel
        title="Your token-saving plan"
        description="Evidence-led recommendations. Review the scope and risks before approving a plan."
        action={
          <button
            type="button"
            className={styles.reviewButton}
            aria-expanded={showDemo}
            onClick={() => setShowDemo(!showDemo)}
          >
            {showDemo ? 'Close cache test' : 'Test cache optimization here'}
          </button>
        }
      >
        <Recommendations opportunities={opportunities} onReview={onReview} />
      </Panel>
      {showDemo && <DemoClient embedded />}
    </>
  );
}

function WastePage({
  agent,
  opportunities,
  onReview,
}: AgentPagesProps & { opportunities: Opportunity[] }) {
  return (
    <>
      <MetricGrid metrics={agent.metrics} />
      <Panel
        title={agent.inventoryTitle || 'Unused resources awaiting review'}
        description="An unused-resource signal is a reason to investigate, not permission to delete it."
      >
        <ResourceTable agent={agent} opportunities={opportunities} onReview={onReview} />
      </Panel>
      <div className={styles.twoColumns}>
        <Panel
          title="Cleanup & retention proposals"
          description="Check ownership, retention obligations, and restore options for each resource."
        >
          <Recommendations opportunities={opportunities} onReview={onReview} />
        </Panel>
        <Panel title="Waste profile" description="Resource measurements from this workspace.">
          {agent.chart ? (
            <Chart data={agent.chart} kind="bar" embedded />
          ) : (
            <div className={styles.policySummary}>
              <span className={styles.largeNumber}>{agent.rows.length}</span>
              <h3>resources to investigate</h3>
              <p>
                Review individual evidence and confirm the resource owner before proposing a
                retention or cleanup change.
              </p>
              <ul>
                <li>Confirm the asset is not in use.</li>
                <li>Check legal hold and backup requirements.</li>
                <li>Approve a reversible cleanup plan.</li>
                <li>Measure the result after implementation.</li>
              </ul>
            </div>
          )}
        </Panel>
      </div>
    </>
  );
}

function CarbonPage({
  agent,
  data,
  opportunities,
  onReview,
}: AgentPagesProps & { opportunities: Opportunity[] }) {
  const regions = agent.rows.slice(0, 3);
  const comparison = agent.chart?.primaryUnit !== 'findings' ? agent.chart : undefined;
  const regionColumn = agent.columns.findIndex((column) => /region/i.test(column));
  return (
    <>
      <div className={styles.regionGrid}>
        {regions.map((row) => (
          <article className={styles.regionCard} key={row.id}>
            <div className={styles.cardTop}>
              <span className={styles.regionSymbol} aria-hidden="true">
                ◎
              </span>
              {row.status && <StatusBadge status={row.status} />}
            </div>
            <h2>
              {regionColumn >= 0 && row.cells[regionColumn] ? row.cells[regionColumn] : row.name}
            </h2>
            {regionColumn >= 0 && row.cells[regionColumn] && (
              <p className={styles.regionWorkload}>{row.name}</p>
            )}
            <Facts facts={rowFacts(agent, row)} />
            <ReviewButton
              id={row.opportunityId}
              opportunities={opportunities}
              onReview={onReview}
              label="Review workload plan"
            />
          </article>
        ))}
        {!regions.length && (
          <Panel title="Regional carbon evidence">
            <Empty>
              No regional readings are available for this analysis. Grid intensity and relocation
              suitability must be established before suggesting a destination.
            </Empty>
          </Panel>
        )}
      </div>
      <MetricGrid metrics={agent.metrics} />
      <div className={styles.twoColumns}>
        <Panel
          title="Energy spikes & regional comparison"
          description={
            data.mode === 'sample'
              ? 'Illustrative readings for the sample scenario—not a live grid feed.'
              : 'Evidence from the selected analysis—not a live grid feed.'
          }
        >
          {comparison ? (
            <Chart data={comparison} kind="bar" embedded />
          ) : (
            <Empty>
              No time-aligned energy or grid comparison is available. A new analysis needs interval
              readings and a comparable baseline.
            </Empty>
          )}
        </Panel>
        <Panel
          title="Carbon-aware workload decisions"
          description="Review scheduling, region, latency, and residency constraints together."
        >
          <Recommendations opportunities={opportunities} onReview={onReview} />
        </Panel>
      </div>
      {agent.rows.length > 3 && (
        <Panel title={agent.inventoryTitle}>
          <ResourceTable agent={agent} opportunities={opportunities} onReview={onReview} />
        </Panel>
      )}
    </>
  );
}

function ArchitecturePage({
  agent,
  opportunities,
  onReview,
}: AgentPagesProps & { opportunities: Opportunity[] }) {
  return (
    <>
      <MetricGrid metrics={agent.metrics} />
      <Panel
        title="Infrastructure-as-Code eco-audit findings"
        description="Review proposed architecture changes against the source evidence and deployment constraints."
      >
        {opportunities.length ? (
          <div className={styles.auditList}>
            {opportunities.map((opportunity) => (
              <article className={styles.auditCard} key={opportunity.id}>
                <div className={styles.auditIcon} aria-hidden="true">
                  {'</>'}
                </div>
                <div className={styles.auditContent}>
                  <div className={styles.cardTop}>
                    <span className={styles.risk} data-risk={opportunity.risk}>
                      {opportunity.risk} risk
                    </span>
                    <StatusBadge status={opportunity.status} />
                  </div>
                  <h3>{opportunity.title}</h3>
                  <code className={styles.fileTarget}>{opportunity.target}</code>
                  <p>{opportunity.description}</p>
                  <div className={styles.proposedChange}>
                    <span>Recommended change</span>
                    <p>{opportunity.recommendation || 'No recommendation recorded yet.'}</p>
                  </div>
                  {opportunity.evidence.length > 0 && (
                    <details className={styles.details}>
                      <summary>Inspect supporting evidence</summary>
                      <Facts facts={opportunity.evidence} compact />
                    </details>
                  )}
                </div>
                <div className={styles.auditAction}>
                  {opportunity.monthlyUsd !== null ? (
                    <strong className={styles.projectedImpact}>
                      ${opportunity.monthlyUsd.toLocaleString()} / mo{' '}
                      <span>projected opportunity</span>
                    </strong>
                  ) : (
                    <span className={styles.unavailable}>Cost impact not recorded</span>
                  )}
                  <ReviewButton
                    id={opportunity.id}
                    opportunities={opportunities}
                    onReview={onReview}
                    label="Review refactor"
                  />
                </div>
              </article>
            ))}
          </div>
        ) : (
          <Empty>
            No architecture findings are available. Analyse infrastructure definitions to populate
            the audit and proposed changes.
          </Empty>
        )}
      </Panel>
      {agent.rows.length > 0 && (
        <Panel title={agent.inventoryTitle || 'Infrastructure inventory'}>
          <ResourceTable agent={agent} opportunities={opportunities} onReview={onReview} />
        </Panel>
      )}
    </>
  );
}

function RecoveryPage({
  agent,
  data,
  opportunities,
  onReview,
}: AgentPagesProps & { opportunities: Opportunity[] }) {
  const comparison = agent.chart?.primaryUnit !== 'findings' ? agent.chart : undefined;
  return (
    <>
      <MetricGrid metrics={agent.metrics} />
      <div className={styles.twoColumns}>
        <Panel
          title="Hot standby vs. cold storage footprint"
          description="Compare the overhead of standby resources before considering a lower-cost recovery strategy."
        >
          {comparison ? (
            <Chart data={comparison} kind="bar" embedded />
          ) : (
            <Empty>
              No matched hot, warm, and cold storage comparison was recorded. Recovery tests and
              comparable cost measurements are needed to assess this tradeoff.
            </Empty>
          )}
          <div className={styles.constraint}>
            <strong>Recovery first</strong>
            <p>
              A colder tier is only suitable when restore time, data loss tolerance, and
              dependencies remain acceptable.
            </p>
          </div>
        </Panel>
        <Panel
          title="RTO/RPO readiness & recovery requirements"
          description={
            data.mode === 'sample'
              ? 'Illustrative recovery scenarios. No live failover drill has been performed.'
              : 'Recorded requirements and evidence. Findings alone do not prove failover readiness.'
          }
        >
          {agent.rows.length ? (
            <div className={styles.readinessList}>
              {agent.rows.map((row) => (
                <article className={styles.readinessCard} key={row.id}>
                  <div className={styles.cardTop}>
                    <h3>{row.name}</h3>
                    {row.status && <StatusBadge status={row.status} />}
                  </div>
                  <Facts facts={rowFacts(agent, row)} compact />
                  <ReviewButton
                    id={row.opportunityId}
                    opportunities={opportunities}
                    onReview={onReview}
                    label="Review recovery plan"
                  />
                </article>
              ))}
            </div>
          ) : (
            <Empty>
              No recovery requirements were recorded. Add RTO, RPO, replica topology, and drill
              results to establish readiness.
            </Empty>
          )}
        </Panel>
      </div>
      <Panel
        title="Resilience optimization proposals"
        description="Review the tradeoff and a rollback plan before changing replicas or standby capacity."
      >
        <Recommendations opportunities={opportunities} onReview={onReview} />
      </Panel>
    </>
  );
}

function CollaborationPage({
  agent,
  opportunities,
  onReview,
}: AgentPagesProps & { opportunities: Opportunity[] }) {
  const [query, setQuery] = useState('');
  const rows = filterWorkspaceRows(agent.rows, query);
  return (
    <>
      <MetricGrid metrics={agent.metrics} />
      <Panel
        title={agent.inventoryTitle || 'Meeting & workspace inventory'}
        description="Search recording, transcript, and retention evidence in the current workspace."
        action={
          <label className={styles.searchLabel}>
            <span className={styles.visuallyHidden}>Search workspace assets</span>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              type="search"
              placeholder="Search recordings or workspaces…"
            />
          </label>
        }
      >
        <div className={styles.searchSummary} role="status">
          {rows.length} of {agent.rows.length} workspace assets
        </div>
        <ResourceTable
          agent={agent}
          rows={rows}
          opportunities={opportunities}
          onReview={onReview}
          emptyMessage={
            query.trim()
              ? 'No workspace assets match your search. Try another name, retention period, or status.'
              : 'No collaboration assets are available in this analysis. Add recording and retention evidence to start a lifecycle review.'
          }
        />
      </Panel>
      <div className={styles.twoColumns}>
        <Panel
          title="Recording & knowledge lifecycle"
          description="Preserve useful knowledge while reviewing unnecessary storage."
        >
          <Recommendations opportunities={opportunities} onReview={onReview} />
        </Panel>
        <Panel title="Before changing retention">
          <div className={styles.lifecycleSteps}>
            <div>
              <span>1</span>
              <section>
                <h3>Keep the useful knowledge</h3>
                <p>
                  Confirm a transcript or summary exists and remains accessible to the right people.
                </p>
              </section>
            </div>
            <div>
              <span>2</span>
              <section>
                <h3>Confirm retention requirements</h3>
                <p>
                  Check the owner, consent, access rules, and any hold before proposing deletion.
                </p>
              </section>
            </div>
            <div>
              <span>3</span>
              <section>
                <h3>Review, apply, then measure</h3>
                <p>
                  A review records a decision. It does not remove recordings or establish a verified
                  saving.
                </p>
              </section>
            </div>
          </div>
        </Panel>
      </div>
    </>
  );
}

function PipelinePage({
  agent,
  opportunities,
  onReview,
}: AgentPagesProps & { opportunities: Opportunity[] }) {
  const [query, setQuery] = useState('');
  const rows = filterWorkspaceRows(agent.rows, query);
  return (
    <>
      <MetricGrid metrics={agent.metrics} />
      <Panel
        title={agent.inventoryTitle || 'Pipeline observations'}
        description="Run counts, cache hit rates and artifact sizes recorded for each pipeline. Runner energy is modeled from the runner SKU and utilization."
        action={
          <label className={styles.searchLabel}>
            <span className={styles.visuallyHidden}>Search pipelines</span>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              type="search"
              placeholder="Search pipelines…"
            />
          </label>
        }
      >
        <div className={styles.searchSummary} role="status">
          {rows.length} of {agent.rows.length} pipeline findings
        </div>
        <ResourceTable
          agent={agent}
          rows={rows}
          opportunities={opportunities}
          onReview={onReview}
          emptyMessage={
            query.trim()
              ? 'No pipelines match your search. Try another pipeline name or status.'
              : 'No pipeline findings are available in this analysis. Run the fleet on an Azure baseline that includes CI/CD pipelines.'
          }
        />
      </Panel>
      <Panel
        title="Pipeline recommendations"
        description="Each change edits a workflow file. Merge it through normal review so CI tests the change itself."
      >
        <Recommendations opportunities={opportunities} onReview={onReview} />
      </Panel>
    </>
  );
}

export function AgentPages({ agent, data, onReview }: AgentPagesProps) {
  const details = pageDetails[agent.key];
  const opportunities = data.opportunities.filter(
    (opportunity) => opportunity.agentKey === agent.key,
  );
  const props = { agent, data, onReview, opportunities };
  return (
    <section className={styles.page} aria-label={`${agent.name} workspace`}>
      <Callout title={details.title} tone={details.tone}>
        <p>{details.description}</p>
        <span className={styles.sourceLabel}>
          {data.mode === 'sample'
            ? 'Sample scenario · illustrative data'
            : 'Recorded analysis · review evidence before acting'}
        </span>
      </Callout>
      {agent.key === 'ai' && <AiPage {...props} />}
      {agent.key === 'waste' && (
        <>
          <WasteWorkflowClient />
          <WastePage {...props} />
        </>
      )}
      {agent.key === 'carbon' && (
        <>
          {data.mode !== 'sample' && <LiveWorkspace />}
          <CarbonPage {...props} />
        </>
      )}
      {agent.key === 'arch' && <ArchitecturePage {...props} />}
      {agent.key === 'dr' && <RecoveryPage {...props} />}
      {agent.key === 'collab' && <CollaborationPage {...props} />}
      {agent.key === 'pipeline' && <PipelinePage {...props} />}
    </section>
  );
}
