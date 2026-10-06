'use client';
import { useCloud, useCloudIdentity } from '../../cloud-client';
import Link from 'next/link';

import { Fragment, useEffect, useId, useRef, useState, type FormEvent } from 'react';
import type { LocalDecision } from '../approval-decisions';
import type { ApprovalInput } from '../approval-decisions';
import { withRecordedRun } from '../dashboard-run';
import type {
  AuditRow,
  ControlPlaneData,
  DataMode,
  Fact,
  Opportunity,
  SaveDecision,
} from './types';
import { TAB_LABELS } from './types';
import { Callout, Empty, MetricGrid, Panel, StatusBadge } from './ui';
import styles from './audit-pages.module.css';
import { EvidenceComparison } from './evidence-comparison';

type ReviewProps = { data: ControlPlaneData; onReview: (id: string) => void };

const currency = (value: number | null) =>
  value === null || !Number.isFinite(value)
    ? 'Not measured'
    : new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        maximumFractionDigits: 0,
      }).format(value);
const carbon = (value: number | null) =>
  value === null || !Number.isFinite(value)
    ? 'Not measured'
    : `${new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(value)} kg CO₂e`;

export function filterOpportunities(
  items: Opportunity[],
  query: string,
  status: string,
): Opportunity[] {
  const search = query.trim().toLocaleLowerCase();
  return items.filter(
    (item) =>
      (status === 'all' || item.status === status) &&
      (!search ||
        [item.title, item.target, item.description, TAB_LABELS[item.agentKey], item.risk].some(
          (value) => value.toLocaleLowerCase().includes(search),
        )),
  );
}

export function filterAuditRows(items: AuditRow[], query: string, status: string): AuditRow[] {
  const search = query.trim().toLocaleLowerCase();
  return items.filter(
    (item) =>
      (status === 'all' || item.status === status) &&
      (!search ||
        [item.id, item.agent, item.action, item.timestamp].some((value) =>
          value.toLocaleLowerCase().includes(search),
        )),
  );
}

export function validateReviewInput(input: {
  decision: string;
  reviewer: string;
  reason: string;
  acknowledged: boolean;
}): string | null {
  if (
    !['approved', 'rejected', 'revision-requested'].includes(input.decision) ||
    !input.reviewer.trim() ||
    !input.reason.trim() ||
    !input.acknowledged
  ) {
    return 'Choose a decision, add your name and reason, and acknowledge the review scope.';
  }
  if (input.reviewer.trim().length > 100 || input.reason.trim().length > 1000) {
    return 'Use up to 100 characters for your name and 1,000 characters for the decision reason.';
  }
  return null;
}

function Icon({ type }: { type: 'shield' | 'search' | 'ledger' | 'arrow' | 'close' | 'check' }) {
  const paths = {
    shield: 'M12 3 4 6v6c0 4 4 7 8 9 4-2 8-5 8-9V6l-8-3Zm-4 9 3 3 5-6',
    search: 'M21 21l-5-5M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0Z',
    ledger: 'M6 3h9l4 4v14H6V3Zm8 0v5h5M9 12h7M9 16h7',
    arrow: 'M5 12h14m-5-5 5 5-5 5',
    close: 'm6 6 12 12M6 18 18 6',
    check: 'm5 12 4 4L19 6',
  };
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={paths[type]} />
    </svg>
  );
}

function Facts({
  facts,
  empty = 'No supporting details were recorded.',
}: {
  facts: Fact[];
  empty?: string;
}) {
  if (!facts.length) return <p className={styles.muted}>{empty}</p>;
  return (
    <dl className={styles.facts}>
      {facts.map((fact, index) => (
        <div key={`${fact.label}-${index}`}>
          <dt>{fact.label}</dt>
          <dd>{fact.value}</dd>
        </div>
      ))}
    </dl>
  );
}

function ProjectedImpact({ opportunity, mode }: { opportunity: Opportunity; mode: DataMode }) {
  return (
    <div className={styles.impact} aria-label="Projected impact">
      <span className={styles.money}>
        <b>{currency(opportunity.monthlyUsd)}</b>
        <span>projected monthly saving</span>
      </span>
      <span className={styles.carbon}>
        <b>{carbon(opportunity.carbonKg)}</b>
        <span>
          {mode === 'sample' ? 'illustrative carbon opportunity' : 'estimated carbon opportunity'}
        </span>
      </span>
    </div>
  );
}

export function ApprovalPage({ data, onReview }: ReviewProps) {
  const cloud = useCloud();
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('all');
  const shown = filterOpportunities(data.opportunities, query, status);
  const pending = data.opportunities.filter(
    (item) => item.status === 'pending' || item.status === 'revision-requested',
  ).length;
  return (
    <section className={styles.page} aria-label="Human Approvals">
      <Callout title="Human-in-the-loop safety queue" tone="green">
        {data.mode === 'sample'
          ? 'Explore synthetic proposals and simulate a review. Sample decisions stay in this session and never change your recorded runs or infrastructure.'
          : cloud
            ? 'Review evidence, projected impact and risk. Decisions are stored in your account with your signed-in identity. Approving a plan does not deploy or verify a change.'
            : 'Your agents propose the improvements. You review the evidence, projected impact, and risk before making a decision. Approvals record a plan locally; they do not deploy or verify a change.'}
      </Callout>
      <div className={styles.heading}>
        <div>
          <h2>Recommended optimizations</h2>
          <p>
            {pending} awaiting review · {data.opportunities.length} total recommendations
          </p>
        </div>
        <span className={styles.safety}>
          <Icon type="shield" /> Human oversight required
        </span>
      </div>
      <div className={styles.filters}>
        <label className={styles.search}>
          <span className={styles.srOnly}>Search recommendations</span>
          <Icon type="search" />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search by recommendation, resource, or agent"
          />
        </label>
        <label className={styles.select}>
          <span>Decision status</span>
          <select value={status} onChange={(event) => setStatus(event.target.value)}>
            <option value="all">All decisions</option>
            <option value="pending">Awaiting review</option>
            <option value="approved">Plan approved</option>
            <option value="rejected">Rejected</option>
            <option value="revision-requested">Revision requested</option>
            <option value="applied">Applied</option>
            <option value="verified">Verified</option>
          </select>
        </label>
        <span className={styles.resultCount} role="status">
          {shown.length} shown
        </span>
      </div>
      {shown.length === 0 ? (
        <Empty>
          {data.opportunities.length
            ? 'No recommendations match these filters. Try another search or decision status.'
            : 'No reviewable recommendations are available for this selection.'}
        </Empty>
      ) : (
        <div className={styles.cards}>
          {shown.map((item) => (
            <article className={styles.approvalCard} key={item.id}>
              <div className={styles.cardContent}>
                <div className={styles.cardMeta}>
                  <span className={`${styles.risk} ${styles[`risk${item.risk}`]}`}>
                    {item.risk} risk
                  </span>
                  <span className={styles.agentPill}>{TAB_LABELS[item.agentKey]}</span>
                  <span className={styles.target}>
                    Target: <strong>{item.target}</strong>
                  </span>
                </div>
                <h3>{item.title}</h3>
                <p>{item.description}</p>
                <ProjectedImpact opportunity={item} mode={data.mode} />
              </div>
              <div className={styles.cardActions}>
                <StatusBadge status={item.status} />
                <button
                  type="button"
                  className={styles.primaryButton}
                  onClick={() => onReview(item.id)}
                >
                  <Icon type="check" />
                  {item.status === 'pending' ? 'Review & approve' : 'Review details'}
                </button>
                {item.status === 'pending' && (
                  <button
                    type="button"
                    className={styles.rejectButton}
                    onClick={() => onReview(item.id)}
                  >
                    Review rejection
                  </button>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function auditSource(row: AuditRow, mode: DataMode): string {
  if (mode === 'sample' || row.kind === 'sample') return 'Synthetic sample';
  return row.kind === 'local-decision' ? 'Local human decision' : 'Recorded activity';
}

export function LedgerPage({ data, onReview }: ReviewProps) {
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('all');
  const [expanded, setExpanded] = useState<string | null>(null);
  const shown = filterAuditRows(data.ledger, query, status);
  const states = [...new Set(data.ledger.map((row) => row.status))];
  return (
    <section className={styles.page} aria-label="Sustainability Ledger">
      <Callout title="Your sustainability audit trail" tone="blue">
        Status → activity → evidence → recommendation → human decision → verified result. Explore
        the recorded lifecycle and local review history. A plan approval is not an executed change
        or a verified saving.
      </Callout>
      <Panel
        title="Sustainability audit ledger"
        description={
          data.mode === 'sample'
            ? 'Synthetic example records for exploring this workflow.'
            : 'Recorded agent activity and local human decisions, kept distinct.'
        }
      >
        <div className={styles.filters}>
          <label className={styles.search}>
            <span className={styles.srOnly}>Search audit ledger</span>
            <Icon type="search" />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search activity, agent, or audit reference"
            />
          </label>
          <label className={styles.select}>
            <span>Activity status</span>
            <select value={status} onChange={(event) => setStatus(event.target.value)}>
              <option value="all">All activity</option>
              {states.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>
          <span role="status" className={styles.resultCount}>
            {shown.length} records
          </span>
        </div>
        {shown.length === 0 ? (
          <Empty>
            {data.ledger.length
              ? 'No audit records match these filters.'
              : 'No activity has been recorded for this selection.'}
          </Empty>
        ) : (
          <div className={styles.tableScroll}>
            <table className={styles.table}>
              <caption className={styles.srOnly}>
                Sustainability audit activity with reviewable evidence
              </caption>
              <thead>
                <tr>
                  <th scope="col">Activity</th>
                  <th scope="col">Agent</th>
                  <th scope="col">Source</th>
                  <th scope="col">Financial impact</th>
                  <th scope="col">Carbon impact</th>
                  <th scope="col">Status</th>
                  <th scope="col">
                    <span className={styles.srOnly}>Details</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {shown.map((row) => {
                  const opportunity = data.opportunities.find((item) => item.id === row.findingId);
                  const open = expanded === row.id;
                  return (
                    <Fragment key={row.id}>
                      <tr>
                        <td>
                          <strong>{row.action}</strong>
                          <span className={styles.timestamp}>
                            {row.timestamp || 'Time not recorded'}
                          </span>
                        </td>
                        <td>{row.agent}</td>
                        <td>
                          <span className={styles.source}>{auditSource(row, data.mode)}</span>
                        </td>
                        <td className={styles.financial}>{row.costSavings}</td>
                        <td className={styles.carbonValue}>{row.carbonSaved}</td>
                        <td>
                          <StatusBadge status={row.status} />
                        </td>
                        <td>
                          <button
                            type="button"
                            className={styles.textButton}
                            aria-expanded={open}
                            aria-controls={`audit-${row.id}`}
                            onClick={() => setExpanded(open ? null : row.id)}
                          >
                            {open ? 'Hide' : 'Details'}
                          </button>
                        </td>
                      </tr>
                      {open && (
                        <tr id={`audit-${row.id}`} className={styles.expandedRow}>
                          <td colSpan={7}>
                            <div className={styles.recordDetail}>
                              <div>
                                <h3>Activity evidence</h3>
                                <Facts
                                  facts={[
                                    { label: 'Audit reference', value: row.id },
                                    { label: 'Record source', value: auditSource(row, data.mode) },
                                    { label: 'Recorded status', value: row.status },
                                  ]}
                                />
                              </div>
                              <div>
                                <h3>Supporting finding</h3>
                                {opportunity ? (
                                  <>
                                    <p>{opportunity.title}</p>
                                    <Facts facts={opportunity.evidence} />
                                    <button
                                      type="button"
                                      className={styles.textButton}
                                      onClick={() => onReview(opportunity.id)}
                                    >
                                      Review recommendation <Icon type="arrow" />
                                    </button>
                                  </>
                                ) : (
                                  <p className={styles.muted}>
                                    No linked recommendation is available in this selection.
                                  </p>
                                )}
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </section>
  );
}

export function MetaPage({ data }: { data: ControlPlaneData }) {
  return (
    <section className={styles.page} aria-label="Meta Self-Audit">
      <div className={styles.metaHero}>
        <span className={styles.metaIcon}>
          <Icon type="ledger" />
        </span>
        <div>
          <span className={styles.eyebrow}>Meta self-audit</span>
          <h2>Is GreenOps saving more than it consumes?</h2>
          <p>
            Understand the agent&apos;s own footprint alongside the improvements it recommends.
            Missing measurements stay unknown—not zero, and not a claim of net benefit.
          </p>
        </div>
      </div>
      <MetricGrid metrics={data.selfAudit} />
      <div className={styles.metaColumns}>
        <Panel
          title="Model & tool usage"
          description={
            data.mode === 'sample'
              ? 'Illustrative usage for this synthetic scenario.'
              : 'Usage evidence available for the selected analysis.'
          }
        >
          <Facts
            facts={data.usageDetails}
            empty="Model and tool usage measurements have not been recorded for this selection."
          />
        </Panel>
        <Panel
          title="How to establish a net benefit"
          description="Measure both the workload and the agent, with comparable boundaries."
        >
          <ol className={styles.measureSteps}>
            <li>
              <span>1</span>
              <div>
                <strong>Set the baseline</strong>
                <p>Define the workload, observation period, energy source, and functional unit.</p>
              </div>
            </li>
            <li>
              <span>2</span>
              <div>
                <strong>Measure the change</strong>
                <p>
                  Compare before and after results using the same scope, including the agent&apos;s
                  overhead.
                </p>
              </div>
            </li>
            <li>
              <span>3</span>
              <div>
                <strong>Keep the evidence</strong>
                <p>
                  Document carbon intensity, assumptions, uncertainty, and verification before
                  claiming savings.
                </p>
              </div>
            </li>
          </ol>
          {data.mode === 'recorded' ? (
            <a
              className={styles.primaryButton}
              href={withRecordedRun('/dashboard/measurement', data.runId)}
            >
              Open SCI measurement worksheet <Icon type="arrow" />
            </a>
          ) : (
            <p className={styles.sampleNote}>
              Switch to recorded data to create an SCI measurement worksheet for your analysis.
            </p>
          )}
        </Panel>
      </div>
    </section>
  );
}

export interface ReviewDialogProps {
  opportunity: Opportunity | null;
  mode: DataMode;
  onClose: () => void;
  onSave: SaveDecision;
  canSave: boolean;
  storageError?: string | null;
  inline?: boolean;
  fullPage?: boolean;
}

export function ReviewDialog(props: ReviewDialogProps) {
  return props.opportunity ? (
    <ReviewDialogContent
      key={`${props.mode}:${props.opportunity.id}`}
      {...props}
      opportunity={props.opportunity}
    />
  ) : null;
}

function ReviewDialogContent({
  opportunity,
  mode,
  onClose,
  onSave,
  canSave,
  storageError,
  inline = false,
  fullPage = false,
}: ReviewDialogProps & { opportunity: Opportunity }) {
  const cloud = useCloud();
  const dialog = useRef<HTMLDialogElement>(null);
  const signedInEmail = useCloudIdentity();
  const heading = useRef<HTMLHeadingElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  const errorId = useId();
  const pendingRef = useRef(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [decision, setDecision] = useState<LocalDecision | ''>('');
  const [reviewer, setReviewer] = useState('');
  const reviewerName = cloud ? signedInEmail || 'Signed-in account' : reviewer;
  const [reason, setReason] = useState('');
  const [acknowledged, setAcknowledged] = useState(false);
  const [revising, setRevising] = useState(false);
  const completed = opportunity.status === 'applied' || opportunity.status === 'verified';
  const reviewed =
    fullPage && ['approved', 'rejected', 'revision-requested'].includes(opportunity.status);
  const milestones = [
    {
      label: 'Detection',
      recorded: opportunity.history.some((f) => f.label.startsWith('Detection')),
    },
    {
      label: 'Investigation',
      recorded: opportunity.history.some((f) => f.label.startsWith('Analysis')),
    },
    { label: 'Evidence available', recorded: opportunity.evidence.length > 0 },
    { label: 'Recommendation', recorded: Boolean(opportunity.recommendation) },
    {
      label: 'Human decision',
      recorded: opportunity.history.some((f) =>
        ['Local plan decision', 'Simulated decision'].includes(f.label),
      ),
    },
    {
      label: 'Verified result',
      recorded: mode === 'recorded' && opportunity.verification?.status === 'Change check passed',
    },
  ];

  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const element = dialog.current;
    if (!inline && element && !element.open) element.showModal();
    heading.current?.focus();
    if (inline) heading.current?.scrollIntoView({ block: 'start', behavior: 'instant' });
    return () => {
      element?.close();
      if (previous?.isConnected) previous.focus();
    };
  }, [inline]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pendingRef.current || !canSave || completed || (reviewed && !revising)) return;
    const input = { decision, reviewer: reviewerName.trim(), reason: reason.trim(), acknowledged };
    const validation = validateReviewInput(input);
    if (validation) {
      setError(validation);
      return;
    }
    if (mode === 'sample' && input.reason.length < 8) {
      setError('Add a decision reason of at least 8 characters.');
      return;
    }
    pendingRef.current = true;
    setPending(true);
    setError(null);
    try {
      const result = await onSave(opportunity.id, input as ApprovalInput);
      if (result.ok) onClose();
      else
        setError(
          result.message || 'The decision could not be saved. Your change has not been applied.',
        );
    } catch {
      setError(
        'The decision could not be saved. No infrastructure change was made. Please try again.',
      );
    } finally {
      pendingRef.current = false;
      setPending(false);
    }
  }

  const Container = inline ? 'section' : 'dialog';
  return (
    <Container
      ref={inline ? undefined : dialog}
      className={
        fullPage
          ? `${styles.inlineReview} ${styles.fullPage}`
          : inline
            ? styles.inlineReview
            : styles.dialog
      }
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      onCancel={(event) => {
        event.preventDefault();
        if (!pendingRef.current) onClose();
      }}
    >
      <form onSubmit={submit} aria-busy={pending}>
        <header className={styles.dialogHeader}>
          <div>
            <span className={styles.eyebrow}>
              {mode === 'sample' ? 'Simulated human review' : 'Human decision'}
            </span>
            <h2 ref={heading} tabIndex={-1} id={titleId}>
              {fullPage
                ? opportunity.title
                : inline
                  ? 'Recommendation & human fix'
                  : 'Review optimization plan'}
            </h2>
          </div>
          <button
            type="button"
            className={styles.closeButton}
            onClick={onClose}
            disabled={pending}
            aria-label="Close review"
          >
            <Icon type="close" />
          </button>
        </header>
        {fullPage && (
          <ol className={styles.milestones} aria-label="Recorded finding milestones">
            {milestones.map((stage) => (
              <li key={stage.label} data-recorded={stage.recorded}>
                <strong>{stage.label}</strong>
                <span>{stage.recorded ? 'Recorded' : 'Not recorded'}</span>
              </li>
            ))}
          </ol>
        )}
        <div className={styles.dialogBody}>
          <div className={styles.cardMeta}>
            <span className={`${styles.risk} ${styles[`risk${opportunity.risk}`]}`}>
              {opportunity.risk} risk
            </span>
            <span className={styles.agentPill}>{TAB_LABELS[opportunity.agentKey]}</span>
            <StatusBadge status={opportunity.status} />
          </div>
          <div className={styles.problem}>
            {!fullPage && <h3>{opportunity.title}</h3>}
            <p id={descriptionId}>{opportunity.description}</p>
            <span className={styles.target}>
              Target: <strong>{opportunity.target}</strong>
            </span>
          </div>
          <section className={styles.recommendation}>
            <h4>Recommended change</h4>
            <p>{opportunity.recommendation}</p>
          </section>
          {inline && (
            <section className={styles.manualFix}>
              <h4>Manual fix — in your own environment</h4>
              <ol>
                <li>
                  Confirm ownership and the baseline for <strong>{opportunity.target}</strong>.
                  Check the evidence and safeguards below.
                </li>
                <li>
                  Use the recommended change above to prepare a scoped fix in your repository or
                  cloud console. Test it and obtain your normal deployment approval before applying
                  it.
                </li>
                <li>
                  After applying the change, run a follow-up analysis and load its results here. A
                  plan decision alone does not prove a fix or a saving.
                </li>
              </ol>
              <p>
                {mode === 'sample'
                  ? 'This is a synthetic walkthrough. Do not apply these example changes to real resources.'
                  : 'This workspace records your review. It does not deploy patches or delete resources.'}
              </p>
            </section>
          )}
          <ProjectedImpact opportunity={opportunity} mode={mode} />
          <section
            className={`${styles.history} ${styles.verification}`}
            aria-label="Before and after verification"
          >
            <h4>Before & after verification</h4>
            <p>
              <strong>
                {mode === 'sample'
                  ? 'Not verified — synthetic scenario'
                  : (opportunity.verification?.status ?? 'Not verified')}
              </strong>
            </p>
            {mode === 'recorded' && opportunity.verification ? (
              <>
                <Facts facts={opportunity.verification.baseline} />
                <Facts facts={opportunity.verification.change} />
                <Facts facts={opportunity.verification.result} />
                <h4>Quality checks</h4>
                <p>{opportunity.verification.quality}</p>
              </>
            ) : (
              <p>
                No measured before/after result is available. Approving a plan does not verify a
                change.
              </p>
            )}
          </section>
          <p className={styles.estimates}>
            Projected opportunities are estimates, not verified outcomes. Approval does not increase
            recorded savings.
          </p>
          <div className={styles.reviewColumns}>
            <section>
              <h4>Evidence & sources</h4>
              {fullPage && <EvidenceComparison item={opportunity} />}
              <Facts facts={opportunity.evidence} />
              <Facts
                facts={[
                  { label: 'Recommendation source', value: opportunity.source },
                  { label: 'Confidence', value: opportunity.confidence },
                ]}
              />
            </section>
            <section>
              <h4>Risk & safeguards</h4>
              <p>
                {opportunity.riskNote ||
                  'Risk has not been assessed. Validate ownership, constraints, and reversibility before any change.'}
              </p>
              <p className={styles.muted}>
                This decision does not override an agent policy or safety gate.
              </p>
            </section>
          </div>
          <section className={`${styles.history} ${styles.decisionHistory}`}>
            <h4>Decision history</h4>
            <Facts
              facts={opportunity.history}
              empty="No human decisions recorded for this proposal."
            />
          </section>
          {completed ? (
            <Callout title="Recorded outcome" tone="blue">
              This finding already has an applied or verified result. Its evidence can be reviewed
              here; no additional execution is triggered.
            </Callout>
          ) : reviewed && !revising ? (
            <section className={styles.savedDecision}>
              <h4>Decision recorded</h4>
              <StatusBadge status={opportunity.status} />
              <p>Review the decision history below. No execution or verification is implied.</p>
              <button
                type="button"
                className={styles.secondaryButton}
                onClick={() => setRevising(true)}
                disabled={!canSave}
              >
                Revise decision
              </button>
            </section>
          ) : (
            <div className={styles.decisionPanel}>
              <fieldset className={styles.decisionFields} disabled={pending || !canSave}>
                <legend>Your decision</legend>
                <label>
                  Decision
                  <select
                    value={decision}
                    onChange={(event) => setDecision(event.target.value as LocalDecision | '')}
                    required
                    name="decision"
                  >
                    <option value="">Choose a decision</option>
                    <option value="approved">Approve plan only</option>
                    <option value="rejected">Reject plan</option>
                    <option value="revision-requested">Request revision</option>
                  </select>
                </label>
                <label>
                  Reviewer <span>{cloud ? '(signed-in account)' : '(self-declared)'}</span>
                  <input
                    name="reviewer"
                    readOnly={cloud}
                    autoComplete="name"
                    required
                    maxLength={100}
                    value={reviewerName}
                    onChange={(event) => setReviewer(event.target.value)}
                    placeholder="Your name"
                  />
                </label>
                <label className={styles.reasonField}>
                  Decision reason
                  <textarea
                    name="reason"
                    required
                    maxLength={1000}
                    minLength={mode === 'sample' ? 8 : 1}
                    rows={3}
                    value={reason}
                    onChange={(event) => setReason(event.target.value)}
                    placeholder="Record the evidence, constraints, or changes behind your decision."
                  />
                </label>
                <label className={styles.acknowledgment}>
                  <input
                    type="checkbox"
                    name="scope-acknowledgment"
                    checked={acknowledged}
                    onChange={(event) => setAcknowledged(event.target.checked)}
                    required
                  />
                  <span>
                    {mode === 'sample'
                      ? 'I understand this is a synthetic simulation. My decision stays in this session and does not apply a real change.'
                      : cloud
                        ? 'I understand this is an account plan review only. It does not apply a change, override a safety gate, or verify savings.'
                        : 'I understand this is a local plan review only. It does not apply a change, override a safety gate, or verify savings.'}
                  </span>
                </label>
              </fieldset>
              <div className={styles.decisionActions}>
                <span>
                  {mode === 'sample'
                    ? 'Synthetic sample · session only'
                    : 'Plan review only · no deployment'}
                </span>
                <button
                  type="button"
                  className={styles.secondaryButton}
                  onClick={onClose}
                  disabled={pending}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className={styles.primaryButton}
                  disabled={pending || !canSave}
                  aria-describedby={error ? errorId : undefined}
                >
                  <Icon type="check" />
                  {pending
                    ? 'Saving decision…'
                    : mode === 'sample'
                      ? 'Save simulated decision'
                      : 'Record decision'}
                </button>
              </div>
            </div>
          )}
          {!canSave && !completed && (
            <p className={styles.alert} role="alert">
              {storageError ||
                'Review storage is not ready. Decisions are unavailable until the proposal can be saved safely.'}
            </p>
          )}
          {error && (
            <p className={styles.alert} id={errorId} role="alert">
              {error}
            </p>
          )}
          {['ai', 'waste'].includes(opportunity.agentKey) && (
            <section className={styles.prototypeDemo}>
              <h4>Try applying a change in the prototype</h4>
              <p>
                Plan approval is recorded against this finding. To see an applied change and
                before-and-after checks, use the separate synthetic demo. Its results stay separate
                from this saved analysis.
              </p>
              <Link
                className={styles.secondaryButton}
                href={
                  opportunity.agentKey === 'ai'
                    ? '/dashboard/ai-efficiency-demo'
                    : '/dashboard?tab=waste&sandbox=1'
                }
              >
                Open apply &amp; verify demo
              </Link>
            </section>
          )}
        </div>
        {(completed || (reviewed && !revising)) && (
          <footer className={styles.dialogFooter}>
            <span>
              {mode === 'sample'
                ? 'Synthetic sample · session only'
                : cloud
                  ? 'Account plan review · no deployment'
                  : 'Local plan review · no deployment'}
            </span>
            <button
              type="button"
              className={styles.secondaryButton}
              onClick={onClose}
              disabled={pending}
            >
              {completed ? 'Close' : 'Cancel'}
            </button>
          </footer>
        )}
      </form>
    </Container>
  );
}
