'use client';

import { useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import type { Finding } from './ledger-dashboard';
import type { LedgerStage, SelectedRun } from './ledger-data';
import { STAGES } from './dashboard-format';
import { withRecordedRun } from './dashboard-run';
import {
  AGENT_CAPABILITIES,
  buildFindingAudit,
  buildRunAudit,
  safeAuditText,
} from './dashboard-audit';
import { Panel, SeverityBadge, SmallStat, StateBadge } from './dashboard-components';
import styles from './dashboard.module.css';

function RecordedTime({ value }: { value: string | null }) {
  if (!value) return <span>Time not recorded</span>;
  return (
    <time dateTime={value}>
      {new Date(value).toLocaleString('en-GB', {
        dateStyle: 'medium',
        timeStyle: 'medium',
        timeZone: 'UTC',
      })}{' '}
      UTC
    </time>
  );
}

export function AgentDetailView({
  agentId,
  agentName,
  scope,
  findings,
  run,
  children,
}: {
  agentId: string;
  agentName: string;
  scope: string;
  findings: Finding[];
  run: SelectedRun | null;
  children?: ReactNode;
}) {
  const runHref = (href: string) => withRecordedRun(href, run?.runId);
  const selected = findings.filter(
    (finding) =>
      finding.agentId === agentId &&
      run &&
      finding.entries.some((entry) => entry.runId === run.runId),
  );
  const audits = selected.map((finding) => ({ finding, audit: buildFindingAudit(finding) }));
  const sourceFiles = [
    ...new Set(
      audits.flatMap(({ audit }) =>
        audit.evidence.filter((fact) => fact.label === 'Source file').map((fact) => fact.value),
      ),
    ),
  ];
  const analysisCount = selected.filter((finding) =>
    finding.entries.some((entry) => entry.stage === 'investigate'),
  ).length;
  const recommendationCount = selected.filter((finding) =>
    finding.entries.some((entry) => entry.stage === 'compare'),
  ).length;
  const verifiedCount = audits.filter(
    ({ audit }) => audit.verification.state === 'confirmed',
  ).length;
  const recent = audits
    .flatMap(({ finding, audit }) => audit.activity.map((event) => ({ ...event, finding })))
    .sort((left, right) => right.sequence - left.sequence)
    .slice(0, 6);
  const capabilities = AGENT_CAPABILITIES[agentId] ?? [];
  const generatedCount = audits.filter(({ audit }) => audit.source.generated).length;
  const fallbackCount = audits.filter(({ audit }) => audit.source.fallback).length;

  return (
    <section className={styles.stack} aria-label={`${agentName} details`}>
      <div className={styles.auditHeader}>
        <div>
          <h2>{agentName}</h2>
          <p>{scope}</p>
        </div>
        <span className={`${styles.badge} ${styles.badgeNeutral}`}>
          {selected.length > 0 ? 'Recorded findings available' : 'No recorded findings'}
        </span>
      </div>
      {children}
      <div className={styles.auditGrid}>
        <Panel
          title="What this agent checks"
          subtitle="Supported checks, not a claim that every check ran."
        >
          {capabilities.length > 0 ? (
            <ul className={styles.checklist}>
              {capabilities.map((capability) => (
                <li key={capability}>{capability}</li>
              ))}
            </ul>
          ) : (
            <p>Capability information is not available for this agent.</p>
          )}
          <p className={styles.footerNote}>
            The dashboard reads saved results; it does not launch this agent or connect to your
            cloud account.
          </p>
        </Panel>
        <Panel
          title="Work recorded in this run"
          subtitle="Counts come from finding-level ledger entries."
        >
          <div className={styles.auditStats}>
            <SmallStat label="Findings" value={String(selected.length)} />
            <SmallStat label="Analysis records" value={String(analysisCount)} />
            <SmallStat label="Recommendations" value={String(recommendationCount)} />
            <SmallStat label="Verified changes" value={String(verifiedCount)} />
          </div>
          <p className={styles.footerNote}>
            {selected.length === 0
              ? 'No findings does not prove that this agent ran successfully. Agent start, completion, and zero-finding events are not recorded in this ledger.'
              : 'Finding ownership identifies this group. A separate agent execution or delegation log is not available.'}
          </p>
        </Panel>
      </div>
      <Panel
        title="Evidence and sources"
        subtitle="Selected recorded fields; prompts, internal reasoning and raw provider responses are excluded."
      >
        <div className={styles.auditMetadata}>
          <strong>Source files</strong>
          <span>
            {sourceFiles.length > 0
              ? sourceFiles.join(', ')
              : 'No supported source-file fields recorded'}
          </span>
          <strong>AI-assisted analysis</strong>
          <span>
            {generatedCount} {generatedCount === 1 ? 'finding' : 'findings'}
          </span>
          <strong>Rule-based fallback</strong>
          <span>
            {fallbackCount} {fallbackCount === 1 ? 'finding' : 'findings'}
          </span>
          <strong>Per-agent tool usage</strong>
          <span>Not recorded; only whole-run totals are available</span>
        </div>
      </Panel>
      <Panel
        title="Recommendations and decisions"
        subtitle="Review the evidence, approval gate and verified result for each finding."
      >
        {audits.length === 0 ? (
          <p className={styles.auditEmpty}>
            No finding records are available for this agent in the selected run.
          </p>
        ) : (
          <div
            className={styles.auditTableWrap}
            role="region"
            aria-label={`${agentName} findings`}
            tabIndex={0}
          >
            <table className={styles.table}>
              <caption>{agentName} recommendations and recorded decisions</caption>
              <thead>
                <tr>
                  <th scope="col">Finding</th>
                  <th scope="col">Recommendation</th>
                  <th scope="col">Decision</th>
                  <th scope="col">Result</th>
                </tr>
              </thead>
              <tbody>
                {audits.map(({ finding, audit }) => (
                  <tr key={finding.bugId}>
                    <th scope="row" className={styles.tableTitle}>
                      <Link
                        className={styles.auditLink}
                        href={runHref(
                          `/dashboard/review?finding=${encodeURIComponent(finding.bugId)}`,
                        )}
                      >
                        {finding.title}
                      </Link>
                      <p className={styles.tableSecondary}>
                        <SeverityBadge severity={finding.severity} />
                      </p>
                    </th>
                    <td>
                      {audit.recommendation.title}
                      <p className={styles.tableSecondary}>{audit.source.label}</p>
                    </td>
                    <td>{audit.decision.label}</td>
                    <td>
                      <StateBadge state={finding.state} />
                      <p className={styles.tableSecondary}>{audit.verification.label}</p>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
      <Panel
        title="Recent recorded activity"
        subtitle="Public activity summaries derived from saved stage fields. No live or internal reasoning stream."
        action={
          <Link
            className={styles.auditLink}
            href={runHref(`/dashboard/trace?agent=${encodeURIComponent(agentId)}`)}
          >
            View agent activity
          </Link>
        }
      >
        {recent.length === 0 ? (
          <p className={styles.auditEmpty}>No activity records to display.</p>
        ) : (
          <ol className={styles.auditTimeline}>
            {recent.map((event, index) => (
              <li
                className={styles.auditEvent}
                key={`${event.finding.bugId}:${event.sequence}:${index}`}
              >
                <div className={styles.auditHeader}>
                  <strong>{event.label}</strong>
                  <RecordedTime value={event.timestamp} />
                </div>
                <p>{event.detail}</p>
                <Link
                  className={styles.auditLink}
                  href={runHref(
                    `/dashboard/review?finding=${encodeURIComponent(event.finding.bugId)}`,
                  )}
                >
                  {event.finding.title}
                </Link>
              </li>
            ))}
          </ol>
        )}
      </Panel>
    </section>
  );
}

export function RunTraceView({ findings, run }: { findings: Finding[]; run: SelectedRun | null }) {
  const params = useSearchParams();
  return (
    <RunTraceContent
      key={`${run?.runId}:${params.toString()}`}
      findings={findings}
      run={run}
      initialStage={params.get('stage')}
      initialAgent={params.get('agent')}
      initialFinding={params.get('finding')}
    />
  );
}

function RunTraceContent({
  findings,
  run,
  initialStage,
  initialAgent,
  initialFinding,
}: {
  findings: Finding[];
  run: SelectedRun | null;
  initialStage: string | null;
  initialAgent: string | null;
  initialFinding: string | null;
}) {
  const runHref = (href: string) => withRecordedRun(href, run?.runId);
  const audit = buildRunAudit(findings, run);
  const [stage, setStage] = useState(() =>
    STAGES.includes(initialStage as LedgerStage) ? initialStage! : 'all',
  );
  const [agent, setAgent] = useState(() =>
    audit.groups.some((group) => group.id === initialAgent) ? initialAgent! : 'all',
  );
  const [limit, setLimit] = useState(30);
  const [findingFilter, setFindingFilter] = useState(initialFinding ?? 'all');
  const byFinding = new Map(findings.map((finding) => [finding.bugId, finding]));
  const filtered = audit.events.filter(
    (event) =>
      (stage === 'all' || event.stage === stage) &&
      (agent === 'all' || byFinding.get(event.bugId)?.agentId === agent) &&
      (findingFilter === 'all' || event.bugId === findingFilter),
  );
  const visible = filtered.slice(0, limit);

  return (
    <div className={styles.stack}>
      <Panel title="Recorded run progression" subtitle={audit.status}>
        <div className={styles.auditStageGrid} aria-label="Recorded workflow stages">
          {audit.stages.map((item) => (
            <button
              type="button"
              key={item.stage}
              aria-pressed={stage === item.stage}
              onClick={() => {
                setStage(item.stage);
                setLimit(30);
              }}
              className={`${styles.auditStage} ${stage === item.stage ? styles.auditStepActive : ''}`}
            >
              <span>{item.label}</span>
              <strong>{item.findings}</strong>
              <span>findings with records</span>
            </button>
          ))}
        </div>
        <p className={styles.footerNote}>
          Approval records include automatic policy decisions. Application and verification counts
          are stage records, not automatically successful changes.
        </p>
      </Panel>
      <div className={styles.auditGrid}>
        <Panel title="Agent contribution" subtitle={audit.groupingBasis}>
          {audit.groups.length === 0 ? (
            <p className={styles.auditEmpty}>No agent contribution can be derived from this run.</p>
          ) : (
            <div
              className={styles.auditTableWrap}
              role="region"
              aria-label="Agent contribution"
              tabIndex={0}
            >
              <table className={styles.table}>
                <caption>Agent grouping inferred from finding ownership</caption>
                <thead>
                  <tr>
                    <th scope="col">Agent</th>
                    <th scope="col">Findings</th>
                    <th scope="col">Applied</th>
                    <th scope="col">Verified</th>
                  </tr>
                </thead>
                <tbody>
                  {audit.groups.map((group) => (
                    <tr key={group.id}>
                      <th scope="row">
                        <Link
                          className={styles.auditLink}
                          href={runHref(`/dashboard/agents?agent=${encodeURIComponent(group.id)}`)}
                        >
                          {group.name}
                        </Link>
                      </th>
                      <td>{group.findings}</td>
                      <td>{group.applied}</td>
                      <td>{group.verified}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
        <Panel
          title="Tool and delegation evidence"
          subtitle="Only fields actually stored in the current ledger are shown."
        >
          <div className={styles.auditStats}>
            <SmallStat
              label="Whole-run tool calls"
              value={audit.toolCalls === null ? 'Not recorded' : String(audit.toolCalls)}
            />
            <SmallStat
              label="Whole-run retries"
              value={audit.retries === null ? 'Not recorded' : String(audit.retries)}
            />
          </div>
          <p className={styles.footerNote}>{audit.toolEvidence}</p>
          {audit.selfCostEvents.length > 0 && (
            <div
              className={styles.auditTableWrap}
              role="region"
              aria-label="Self-accounting events"
            >
              <table className={styles.table}>
                <caption>Recorded self-accounting events</caption>
                <thead>
                  <tr>
                    <th scope="col">Stage</th>
                    <th scope="col">Kind</th>
                    <th scope="col">Usage</th>
                    <th scope="col">Duration</th>
                    <th scope="col">Time</th>
                  </tr>
                </thead>
                <tbody>
                  {audit.selfCostEvents.map((event, index) => (
                    <tr key={`${event.stage}:${event.kind}:${index}`}>
                      <th scope="row">{event.stage}</th>
                      <td>{event.kind}</td>
                      <td>{event.tokens === null ? 'Not recorded' : `${event.tokens} tokens`}</td>
                      <td>
                        {event.durationMs === null ? 'Not recorded' : `${event.durationMs} ms`}
                      </td>
                      <td>
                        <RecordedTime value={event.timestamp} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {audit.orchestrationTrace.length > 0 && (
            <div className={styles.auditTableWrap} role="region" aria-label="Orchestration trace">
              <table className={styles.table}>
                <caption>Recorded orchestration and delegation events</caption>
                <thead>
                  <tr>
                    <th scope="col">Actor</th>
                    <th scope="col">Status</th>
                    <th scope="col">Detail</th>
                    <th scope="col">Time</th>
                  </tr>
                </thead>
                <tbody>
                  {audit.orchestrationTrace.map((event, index) => (
                    <tr key={`${event.actor}:${event.status}:${index}`}>
                      <th scope="row">{event.actor}</th>
                      <td>{event.status}</td>
                      <td>{event.detail}</td>
                      <td>
                        <RecordedTime value={event.timestamp} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className={styles.footerNote}>
            {audit.orchestrationTrace.length > 0
              ? 'Delegation events above are recorded for fleet runs. Older or non-fleet ledgers may not contain them.'
              : 'Orchestrator plans, hand-offs, and agent start/finish events are not recorded in this ledger. This view does not invent them from the architecture diagram.'}
          </p>
        </Panel>
      </div>
      <Panel
        title="Activity and decisions"
        subtitle="A chronological view of recorded stage events, not model chain-of-thought."
      >
        <div className={styles.auditToolbar}>
          <label className={styles.filterField}>
            Stage
            <select
              value={stage}
              onChange={(event) => {
                setStage(event.target.value);
                setLimit(30);
              }}
            >
              <option value="all">All stages</option>
              {audit.stages.map((item) => (
                <option key={item.stage} value={item.stage}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
          <label className={styles.filterField}>
            Agent
            <select
              value={agent}
              onChange={(event) => {
                setAgent(event.target.value);
                setLimit(30);
              }}
            >
              <option value="all">All agents</option>
              {audit.groups.map((group) => (
                <option key={group.id} value={group.id}>
                  {group.name}
                </option>
              ))}
            </select>
          </label>
          <label className={styles.filterField}>
            Finding
            <select
              value={findingFilter}
              onChange={(event) => {
                setFindingFilter(event.target.value);
                setLimit(30);
              }}
            >
              <option value="all">All findings</option>
              {findingFilter !== 'all' && !byFinding.has(findingFilter) && (
                <option value={findingFilter}>Finding unavailable</option>
              )}
              {findings.map((finding) => (
                <option key={finding.bugId} value={finding.bugId}>
                  {safeAuditText(finding.title, 'Recorded finding')}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className={styles.button}
            onClick={() => {
              setStage('all');
              setAgent('all');
              setFindingFilter('all');
              setLimit(30);
            }}
          >
            Clear activity filters
          </button>
        </div>
        <p className={styles.footerNote} role="status">
          {Math.min(limit, filtered.length)} of {filtered.length} recorded events shown
        </p>
        {visible.length === 0 ? (
          <p className={styles.auditEmpty}>No recorded activity matches these filters.</p>
        ) : (
          <ol className={styles.auditTimeline}>
            {visible.map((event, index) => {
              const finding = byFinding.get(event.bugId);
              return (
                <li className={styles.auditEvent} key={`${event.bugId}:${event.sequence}:${index}`}>
                  <div className={styles.auditHeader}>
                    <strong>{event.label}</strong>
                    <RecordedTime value={event.timestamp} />
                  </div>
                  <p>{event.detail}</p>
                  {finding ? (
                    <div className={styles.inline}>
                      <Link
                        className={styles.auditLink}
                        href={runHref(
                          `/dashboard/review?finding=${encodeURIComponent(finding.bugId)}`,
                        )}
                      >
                        {finding.title}
                      </Link>
                      <Link
                        className={styles.auditLink}
                        href={runHref(
                          `/dashboard/agents?agent=${encodeURIComponent(finding.agentId)}`,
                        )}
                      >
                        {finding.agentName}
                      </Link>
                    </div>
                  ) : (
                    <p className={styles.muted}>Finding details are not available.</p>
                  )}
                </li>
              );
            })}
          </ol>
        )}
        {limit < filtered.length && (
          <button
            type="button"
            className={styles.button}
            onClick={() => setLimit((value) => value + 30)}
          >
            Show more recorded events
          </button>
        )}
      </Panel>
    </div>
  );
}
