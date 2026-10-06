'use client';

import Link from 'next/link';
import { useRef, useState, type KeyboardEvent } from 'react';
import type { Finding } from './ledger-dashboard';
import type { SelectedRun } from './ledger-data';
import { buildAgentModule, type AgentModuleData, type AgentModuleRow } from './agent-module-data';
import { withRecordedRun } from './dashboard-run';
import { buildManualGuide } from './dashboard-workflow';
import AgentActionWorkbench from './agent-action-workbench';
import styles from './agent-module.module.css';

const TABS = [
  { id: 'analysis', label: 'Analysis' },
  { id: 'recommendations', label: 'Recommendations' },
  { id: 'activity', label: 'Activity' },
  { id: 'actions', label: 'Plan an action' },
] as const;
type ModuleTab = (typeof TABS)[number]['id'];

const INVENTORY_TITLES: Record<AgentModuleData['id'], string> = {
  'ai-efficiency': 'Token & request inspection',
  'digital-waste': 'Unused asset inventory',
  'carbon-incident': 'Energy spike analysis',
  architecture: 'IaC resource audit',
  'disaster-recovery': 'Recovery configuration',
  collaboration: 'Recording lifecycle inventory',
  'pipeline-efficiency': 'CI/CD run inventory',
};

const NEXT_INTEGRATIONS: Record<AgentModuleData['id'], string> = {
  'ai-efficiency':
    'Daily usage by model and prompt-compression evaluation require request-level telemetry and quality checks.',
  'digital-waste': 'A live utilization heatmap requires time-series cloud telemetry.',
  'carbon-incident':
    'Live carbon-aware scheduling requires regional forecasts and workload constraints.',
  architecture: 'A dependency or 3D topology view requires a complete resource graph.',
  'disaster-recovery':
    'Recovery targets must be validated with a restore drill before changing resilience.',
  collaboration:
    'Transcript search and vector indexing require approved content ingestion and access controls.',
  'pipeline-efficiency':
    'Per-job duration and cache telemetry require read access to the CI provider run history.',
};

export interface AgentModuleViewProps {
  agentId: string;
  findings: Finding[];
  run: SelectedRun | null;
  initialTab?: ModuleTab;
  initialQuery?: string;
  initialCategory?: string;
}

/** Search all safe observations before pagination, not only the visible table page. */
export function filterAgentModuleRows(
  rows: AgentModuleRow[],
  query: string,
  category: string,
): AgentModuleRow[] {
  const term = query.trim().toLocaleLowerCase();
  return rows.filter((row) => {
    if (category && row.category !== category) return false;
    if (!term) return true;
    return [
      row.title,
      row.categoryLabel,
      row.resource,
      row.source,
      ...Object.values(row.cells),
      ...(row.recommendation.recorded
        ? [row.recommendation.title, row.recommendation.description]
        : []),
    ].some((value) => value?.toLocaleLowerCase().includes(term));
  });
}

export function nextModuleTab(current: number, key: string): number | null {
  if (key === 'ArrowRight') return (current + 1) % TABS.length;
  if (key === 'ArrowLeft') return (current + TABS.length - 1) % TABS.length;
  if (key === 'Home') return 0;
  if (key === 'End') return TABS.length - 1;
  return null;
}

const number = (value: number) =>
  value.toLocaleString(
    'en-US',
    value !== 0 && Math.abs(value) < 0.01
      ? { maximumSignificantDigits: 2 }
      : { maximumFractionDigits: 2 },
  );
const titleCase = (value: string) => value.charAt(0).toUpperCase() + value.slice(1);

function findingHref(data: AgentModuleData, row: AgentModuleRow): string {
  return withRecordedRun(
    `/dashboard/review?agent=${data.id}&finding=${encodeURIComponent(row.id)}`,
    data.runId,
  );
}

function ObservationStatus({ row }: { row: AgentModuleRow }) {
  return (
    <span
      className={`${styles.state} ${row.verified ? styles.verified : row.applied ? styles.applied : ''}`}
    >
      {row.verified ? 'Verified' : row.applied ? 'Awaiting verification' : 'Review needed'}
    </span>
  );
}

function Pagination({
  count,
  page,
  size,
  onChange,
}: {
  count: number;
  page: number;
  size: number;
  onChange: (page: number) => void;
}) {
  if (count === 0) return null;
  return (
    <div className={styles.pagination}>
      <span aria-live="polite">
        {page * size + 1}–{Math.min((page + 1) * size, count)} of {count}
      </span>
      {count > size && (
        <div>
          <button type="button" disabled={page === 0} onClick={() => onChange(page - 1)}>
            Previous
          </button>
          <button
            type="button"
            disabled={(page + 1) * size >= count}
            onClick={() => onChange(page + 1)}
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}

function EmptyObservations({ filtered }: { filtered: boolean }) {
  return (
    <div className={styles.empty}>
      <strong>
        {filtered ? 'No matching observations' : 'No findings recorded for this agent'}
      </strong>
      <p>
        {filtered
          ? 'Try another search or clear the category filter.'
          : 'This assessment has no findings for this module. It does not establish that every resource was checked.'}
      </p>
    </div>
  );
}

function Recommendation({ data, row }: { data: AgentModuleData; row: AgentModuleRow }) {
  const recommendation = row.recommendation;
  const guide = buildManualGuide({ category: row.category, recommendationId: '' });
  return (
    <article className={styles.recommendation}>
      <div className={styles.recommendationHeader}>
        <div>
          <Link href={findingHref(data, row)}>{row.title}</Link>
          <h3>{recommendation.title}</h3>
        </div>
        <ObservationStatus row={row} />
      </div>
      <p>{recommendation.description}</p>
      <div className={styles.recommendationFacts}>
        <span>
          <strong>Source:</strong> {recommendation.source}
        </span>
        <span>
          <strong>Finding confidence:</strong> {titleCase(recommendation.confidence)}
        </span>
        <span>
          <strong>Effort:</strong> {titleCase(recommendation.effort)}
        </span>
        <span>
          <strong>Reversible:</strong>{' '}
          {recommendation.reversible === null
            ? 'Not recorded'
            : recommendation.reversible
              ? 'Yes'
              : 'No'}
        </span>
      </div>
      {row.evidenceFacts.length > 0 && (
        <ul className={styles.facts} aria-label="Supporting observations">
          {row.evidenceFacts.slice(0, 3).map((fact, index) => (
            <li key={`${fact.label}-${index}`}>
              <strong>{fact.label}:</strong> {fact.value}
            </li>
          ))}
        </ul>
      )}
      {guide.risks[0] && (
        <div className={styles.risk}>
          <strong>Implementation consideration:</strong> {guide.risks[0]}
        </div>
      )}
      <div className={styles.recommendationFooter}>
        <span className={styles.caption}>{row.decision.label}</span>
        <Link href={findingHref(data, row)}>Review evidence and decision →</Link>
      </div>
    </article>
  );
}

function ModuleWorkspace({
  data,
  findings,
  run,
  initialTab = 'analysis',
  initialQuery = '',
  initialCategory = '',
}: AgentModuleViewProps & { data: AgentModuleData }) {
  const [tab, setTab] = useState<ModuleTab>(initialTab);
  const [query, setQuery] = useState(initialQuery);
  const [category, setCategory] = useState(initialCategory);
  const [page, setPage] = useState(0);
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const rows = filterAgentModuleRows(data.rows, query, category);
  const recommendations = rows.filter((row) => row.recommendation.recorded);
  const activity = rows
    .flatMap((row) => row.activity.map((event) => ({ row, event })))
    .sort((a, b) => b.event.sequence - a.event.sequence);
  const pageSize = tab === 'activity' ? 10 : 8;
  const total =
    tab === 'recommendations'
      ? recommendations.length
      : tab === 'activity'
        ? activity.length
        : rows.length;
  const currentPage = Math.min(page, Math.max(0, Math.ceil(total / pageSize) - 1));
  const start = currentPage * pageSize;
  const filterActive = Boolean(query.trim() || category);
  const inventoryTitle = INVENTORY_TITLES[data.id];
  const recommendationsHref = withRecordedRun(`/dashboard/findings?agent=${data.id}`, data.runId);
  const selectTab = (value: ModuleTab) => {
    setTab(value);
    setPage(0);
  };
  const selectCategory = (value: string) => {
    setCategory(value);
    setPage(0);
  };
  function onTabKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const next = nextModuleTab(index, event.key);
    if (next === null) return;
    event.preventDefault();
    selectTab(TABS[next].id);
    tabRefs.current[next]?.focus();
  }

  const filters = (
    <div className={styles.filterBar}>
      <label className={styles.field}>
        Search observations
        <input
          type="search"
          placeholder="Find a resource, finding or recommendation"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setPage(0);
          }}
        />
      </label>
      <label className={styles.field}>
        Category
        <select value={category} onChange={(event) => selectCategory(event.target.value)}>
          <option value="">All categories</option>
          {data.categories.map((item) => (
            <option key={item.id} value={item.id}>
              {item.label} ({item.count})
            </option>
          ))}
        </select>
      </label>
      {filterActive && (
        <button
          type="button"
          onClick={() => {
            setQuery('');
            selectCategory('');
          }}
        >
          Clear filters
        </button>
      )}
    </div>
  );

  return (
    <section className={styles.module} aria-labelledby={`module-${data.id}-title`}>
      <header className={styles.intro}>
        <div>
          <h2 id={`module-${data.id}-title`}>{data.name}</h2>
          <p>{data.goal}</p>
        </div>
        <div className={styles.introActions}>
          <span className={styles.badge}>{data.statusLabel}</span>
          {data.id === 'ai-efficiency' && (
            <Link className={styles.secondaryButton} href="/dashboard/ai-efficiency-demo">
              Try cache demo →
            </Link>
          )}
        </div>
      </header>

      <dl className={styles.metrics}>
        <div className={styles.metric}>
          <dt>Recorded findings</dt>
          <dd>{number(data.counts.findings)}</dd>
          <p>
            {data.counts.highPriority} high priority · {data.counts.verified} verified
          </p>
        </div>
        {data.metrics.slice(0, 3).map((metric) => (
          <div key={metric.id} className={styles.metric}>
            <dt>{metric.label}</dt>
            <dd>
              {metric.value === null ? (
                <span>Not recorded</span>
              ) : (
                <>
                  {number(metric.value)} <span>{metric.unit}</span>
                </>
              )}
            </dd>
            <p>
              {metric.id === 'unused-allowance' || /allowance|headroom/i.test(metric.label)
                ? 'Not consumed or saved tokens'
                : metric.value === null
                  ? metric.evidenceCount > 0
                    ? 'Partial evidence only'
                    : 'No supporting observation'
                  : `Evidence in ${metric.evidenceCount} finding${metric.evidenceCount === 1 ? '' : 's'}`}
            </p>
          </div>
        ))}
      </dl>

      <div className={styles.tabs} role="tablist" aria-label={`${data.name} views`}>
        {TABS.map((item, index) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            id={`module-${data.id}-tab-${item.id}`}
            aria-controls={`module-${data.id}-panel-${item.id}`}
            aria-selected={tab === item.id}
            tabIndex={tab === item.id ? 0 : -1}
            ref={(node) => {
              tabRefs.current[index] = node;
            }}
            onClick={() => selectTab(item.id)}
            onKeyDown={(event) => onTabKeyDown(event, index)}
          >
            {item.label}
            {item.id === 'recommendations' && (
              <span className={styles.tabCount}>{data.counts.recommendations.total}</span>
            )}
          </button>
        ))}
      </div>

      <div
        className={styles.panel}
        role="tabpanel"
        id={`module-${data.id}-panel-${tab}`}
        aria-labelledby={`module-${data.id}-tab-${tab}`}
        tabIndex={0}
      >
        {tab === 'analysis' && (
          <div className={styles.analysisLayout}>
            <section className={styles.card} aria-label={inventoryTitle}>
              <div className={styles.cardHeader}>
                <div>
                  <h3>{inventoryTitle}</h3>
                  <p>Recorded findings only · {data.rows.length} observations</p>
                </div>
                <Link href={recommendationsHref}>Open findings →</Link>
              </div>
              {filters}
              {rows.length === 0 ? (
                <EmptyObservations filtered={filterActive} />
              ) : (
                <div
                  className={styles.tableScroll}
                  role="region"
                  aria-label={`${inventoryTitle} table`}
                  tabIndex={0}
                >
                  <table className={styles.table}>
                    <caption className={styles.srOnly}>
                      {inventoryTitle}. Missing values are not recorded, not zero.
                    </caption>
                    <thead>
                      <tr>
                        <th scope="col">Observation</th>
                        {data.columns.map((column) => (
                          <th key={column.key} scope="col">
                            {column.label}
                          </th>
                        ))}
                        <th scope="col">Next step</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.slice(start, start + pageSize).map((row) => (
                        <tr key={row.id}>
                          <th scope="row">
                            <Link className={styles.observationTitle} href={findingHref(data, row)}>
                              {row.title}
                            </Link>
                            <span className={styles.observationMeta}>
                              {row.categoryLabel} · {titleCase(row.severity)} priority
                            </span>
                            {(row.resource || row.source) && (
                              <span className={styles.observationMeta}>
                                {row.resource || row.source}
                              </span>
                            )}
                          </th>
                          {data.columns.map((column) => (
                            <td key={column.key}>
                              <div className={styles.cellValue}>
                                {row.cells[column.key] ?? (
                                  <span className={styles.unknown}>Not recorded</span>
                                )}
                              </div>
                            </td>
                          ))}
                          <td>
                            <ObservationStatus row={row} />
                            <Link className={styles.observationMeta} href={findingHref(data, row)}>
                              Review finding →
                            </Link>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <Pagination
                count={rows.length}
                page={currentPage}
                size={pageSize}
                onChange={setPage}
              />
            </section>
            <aside className={styles.card} aria-label="Analysis coverage">
              <div className={styles.cardHeader}>
                <h3>Checks and patterns</h3>
              </div>
              <div className={styles.sideBody}>
                <div>
                  {data.categories.length === 0 ? (
                    <p>No categories recorded.</p>
                  ) : (
                    <ul className={styles.categoryList} aria-label="Filter by finding category">
                      {data.categories.map((item) => (
                        <li key={item.id}>
                          <button
                            type="button"
                            aria-pressed={category === item.id}
                            onClick={() => selectCategory(category === item.id ? '' : item.id)}
                          >
                            <span>
                              <span>{item.label}</span>
                              <span>{item.count}</span>
                            </span>
                            <div className={styles.categoryTrack} aria-hidden="true">
                              <i
                                style={{
                                  width: `${(item.count / Math.max(1, data.rows.length)) * 100}%`,
                                }}
                              />
                            </div>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <ul className={styles.checks} aria-label="Supported checks">
                  {data.supportedChecks.map((check) => (
                    <li key={check}>{check}</li>
                  ))}
                </ul>
              </div>
            </aside>
          </div>
        )}

        {tab === 'recommendations' && (
          <>
            <section className={styles.card}>
              <div className={styles.cardHeader}>
                <div>
                  <h3>Recorded recommendations</h3>
                  <p>Review the evidence and trade-offs before deciding on a change.</p>
                </div>
                <Link href={recommendationsHref}>All findings →</Link>
              </div>
              {filters}
            </section>
            <div className={styles.recommendations}>
              {recommendations.slice(start, start + pageSize).map((row) => (
                <Recommendation key={row.id} data={data} row={row} />
              ))}
              {recommendations.length === 0 && (
                <div className={`${styles.card} ${styles.empty}`}>
                  <strong>
                    {filterActive
                      ? 'No matching recommendations'
                      : 'No recommendation recorded yet'}
                  </strong>
                  <p>
                    {filterActive
                      ? 'Try a different search or category.'
                      : 'A detected issue is not an approved solution. Open a finding to review its evidence and manual investigation steps.'}
                  </p>
                  <Link href={recommendationsHref}>Review findings →</Link>
                </div>
              )}
            </div>
            <Pagination
              count={recommendations.length}
              page={currentPage}
              size={pageSize}
              onChange={setPage}
            />
          </>
        )}

        {tab === 'activity' && (
          <section className={styles.card}>
            <div className={styles.cardHeader}>
              <div>
                <h3>Recorded work summary</h3>
                <p>Lifecycle events from this assessment, with links to their evidence.</p>
              </div>
              <Link href={withRecordedRun(`/dashboard/trace?agent=${data.id}`, data.runId)}>
                Open run trace →
              </Link>
            </div>
            {filters}
            {activity.length === 0 ? (
              <div className={styles.empty}>
                <strong>No matching activity recorded</strong>
                <p>
                  Activity appears when lifecycle events are included in the selected assessment.
                </p>
              </div>
            ) : (
              <ol className={styles.activityList}>
                {activity.slice(start, start + pageSize).map(({ row, event }, index) => (
                  <li key={`${row.id}-${event.stage}-${event.sequence}-${index}`}>
                    <span className={styles.activityLabel}>{event.label}</span>
                    <div>
                      <Link href={findingHref(data, row)}>{row.title}</Link>
                      <p>{event.detail}</p>
                    </div>
                    {event.timestamp && Number.isFinite(Date.parse(event.timestamp)) ? (
                      <time dateTime={event.timestamp}>
                        {new Date(event.timestamp).toLocaleString('en-GB', {
                          dateStyle: 'medium',
                          timeStyle: 'short',
                          timeZone: 'UTC',
                        })}{' '}
                        UTC
                      </time>
                    ) : (
                      <span className={styles.unknown}>Time not recorded</span>
                    )}
                  </li>
                ))}
              </ol>
            )}
            <Pagination
              count={activity.length}
              page={currentPage}
              size={pageSize}
              onChange={setPage}
            />
          </section>
        )}

        {tab === 'actions' && (
          <AgentActionWorkbench
            key={`${data.id}:${data.runId ?? 'none'}`}
            agentId={data.id}
            findings={findings}
            run={run}
          />
        )}
      </div>

      <details className={styles.capabilities}>
        <summary>Module capabilities and next integrations</summary>
        <div className={styles.capabilityBody}>
          <div>
            <h3>Available in this prototype</h3>
            <ul>
              {data.supportedChecks.map((check) => (
                <li key={check}>{check}</li>
              ))}
              <li>
                Evidence review, recorded recommendations and a local action-planning workspace.
              </li>
            </ul>
          </div>
          <div>
            <h3>Not connected or verified yet</h3>
            <ul>
              {data.notAvailable.map((item) => (
                <li key={item}>{item}</li>
              ))}
              <li>{NEXT_INTEGRATIONS[data.id]}</li>
            </ul>
          </div>
        </div>
      </details>
    </section>
  );
}

export function AgentModuleView(props: AgentModuleViewProps) {
  const data = buildAgentModule(props.agentId, props.findings, props.run);
  if (!data)
    return (
      <section className={`${styles.module} ${styles.card}`}>
        <div className={styles.empty}>
          <h2>Agent module not available</h2>
          <p>Select a specialist from the overview.</p>
          <Link href={withRecordedRun('/dashboard', props.run?.runId)}>Back to overview →</Link>
        </div>
      </section>
    );
  return (
    <ModuleWorkspace
      key={`${data.id}:${data.runId ?? 'none'}:${data.recordedAt ?? ''}`}
      {...props}
      data={data}
    />
  );
}

export default AgentModuleView;
