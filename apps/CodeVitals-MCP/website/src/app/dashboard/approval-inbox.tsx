'use client';

import Link from 'next/link';
import { useCloud, cloudFetch } from '../cloud-client';
import { useEffect, useId, useMemo, useRef, useState, type FormEvent } from 'react';
import type { Finding } from './ledger-dashboard';
import type { SelectedRun } from './ledger-data';
import { withRecordedRun } from './dashboard-run';
import {
  APPROVAL_STORAGE_KEY,
  DECISION_LABELS,
  buildApprovalProposals,
  latestProposalDecision,
  parseApprovalHistory,
  saveApprovalRecordLocked,
  summarizeApprovals,
  type ApprovalInput,
  type ApprovalProposal,
  type ApprovalRecord,
  type LocalDecision,
} from './approval-decisions';
import styles from './approval-inbox.module.css';

const HISTORY_CHANGED = 'greenops-local-review-history-changed';
export interface ApprovalStore {
  proposals: ApprovalProposal[];
  /** Selected run only. Source ledger decisions are deliberately not included. */
  records: ApprovalRecord[];
  ready: boolean;
  error: string | null;
  counts: ReturnType<typeof summarizeApprovals>;
  save(proposalId: string, input: ApprovalInput): Promise<{ ok: boolean; message: string }>;
  exportHistory(): void;
}

export function useApprovalDecisions(run: SelectedRun | null, findings: Finding[]): ApprovalStore {
  const cloud = useCloud();
  const currentProposals = useRef<ApprovalProposal[]>([]);
  const [stored, setStored] = useState<{
    loaded: boolean;
    records: ApprovalRecord[];
    error: string | null;
  }>({ loaded: false, records: [], error: null });
  const [binding, setBinding] = useState<{
    run: SelectedRun | null;
    findings: Finding[];
    proposals: ApprovalProposal[];
    error: string | null;
  } | null>(null);
  useEffect(() => {
    let active = true;
    if (cloud) {
      const loadRemote = async () => {
        if (!run) { if (active) setStored({ loaded: true, records: [], error: null }); return; }
        try {
          const response = await cloudFetch(`reviews?run=${encodeURIComponent(run.runId)}`);
          if (!response.ok) throw new Error();
          const result = await response.json();
          if (active) setStored({ loaded: true, records: result.records, error: null });
        } catch { if (active) setStored({ loaded: true, records: [], error: 'Account review history could not be loaded.' }); }
      };
      void loadRemote(); const timer = setInterval(loadRemote, 10_000);
      return () => { active = false; clearInterval(timer); };
    }
    const load = () => {
      if (!active) return;
      if (!window.navigator.locks) {
        setStored({
          loaded: true,
          records: [],
          error:
            'Safe cross-tab review storage is unavailable. Use a browser with Web Locks on localhost or HTTPS; local decisions are disabled.',
        });
        return;
      }
      try {
        const history = parseApprovalHistory(window.localStorage.getItem(APPROVAL_STORAGE_KEY));
        setStored({ loaded: true, records: history.records, error: null });
      } catch (error) {
        setStored({
          loaded: true,
          records: [],
          error:
            error instanceof Error && error.message.startsWith('Local review history')
              ? error.message
              : 'Browser storage is unavailable. No local decisions can be saved in this session.',
        });
      }
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key === APPROVAL_STORAGE_KEY || event.key === null) load();
    };
    queueMicrotask(load);
    window.addEventListener('storage', onStorage);
    window.addEventListener(HISTORY_CHANGED, load);
    return () => {
      active = false;
      window.removeEventListener('storage', onStorage);
      window.removeEventListener(HISTORY_CHANGED, load);
    };
  }, [cloud, run]);
  useEffect(() => {
    let active = true;
    buildApprovalProposals(run, findings).then(
      (proposals) => {
        if (active) setBinding({ run, findings, proposals, error: null });
      },
      () => {
        if (active)
          setBinding({
            run,
            findings,
            proposals: [],
            error:
              'Recommendations could not be safely linked to their evidence. Local decisions are disabled; use localhost or HTTPS and check the selected ledger.',
          });
      },
    );
    return () => {
      active = false;
    };
  }, [run, findings]);
  const bound = binding?.run === run && binding?.findings === findings;
  const proposals = useMemo(() => (bound && binding ? binding.proposals : []), [bound, binding]);
  const records = useMemo(
    () => stored.records.filter((record) => record.runId === run?.runId),
    [stored.records, run?.runId],
  );
  const error = stored.error ?? (bound ? (binding?.error ?? null) : null);
  const ready = stored.loaded && bound && !error;
  useEffect(() => {
    currentProposals.current = ready ? proposals : [];
    return () => {
      currentProposals.current = [];
    };
  }, [ready, proposals]);
  const counts = summarizeApprovals(proposals, records, run?.runId ?? null);
  return {
    proposals,
    records,
    ready,
    error,
    counts,
    async save(proposalId, input) {
      const proposal = proposals.find((candidate) => candidate.id === proposalId);
      if (!ready || !proposal)
        return {
          ok: false,
          message: 'The proposal is no longer available for review. Reload its current evidence.',
        };
      try {
        if (cloud) {
          const response = await cloudFetch('reviews', { method: 'POST', body: JSON.stringify({ ...input, runId: proposal.runId, findingId: proposal.id, fingerprint: proposal.fingerprint }) });
          const result = await response.json();
          if (!response.ok) return { ok: false, message: result.error || 'Review was not saved.' };
          setStored(current => ({ loaded: true, records: [...current.records, result], error: null }));
          return { ok: true, message: 'Account plan review saved. No change was executed.' };
        }
        const history = await saveApprovalRecordLocked(
          window.navigator.locks,
          window.localStorage,
          proposal,
          input,
          window.crypto.randomUUID(),
          new Date().toISOString(),
          () =>
            currentProposals.current.some(
              (candidate) =>
                candidate.id === proposal.id &&
                candidate.runId === proposal.runId &&
                candidate.fingerprint === proposal.fingerprint,
            ),
        );
        setStored({ loaded: true, records: history.records, error: null });
        window.dispatchEvent(new Event(HISTORY_CHANGED));
        return { ok: true, message: `${DECISION_LABELS[input.decision]}. No change was executed.` };
      } catch (failure) {
        return {
          ok: false,
          message:
            failure instanceof Error &&
            /^(Local review history|Enter your|Add a|Confirm that|Choose a|Safe cross-tab|The proposal changed)/.test(
              failure.message,
            )
              ? failure.message
              : cloud
                ? 'The account decision could not be saved. Check the connection and try again.'
                : 'The decision could not be saved to browser storage. Nothing was approved or executed.',
        };
      }
    },
    exportHistory() {
      const payload = {
        version: 1,
        scope: cloud ? 'account-plan-review-history' : 'local-plan-review-history',
        identity: cloud ? 'authenticated' : 'self-declared',
        execution: 'none',
        runId: run?.runId ?? null,
        records,
      };
      const url = URL.createObjectURL(
        new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }),
      );
      const link = document.createElement('a');
      link.href = url;
      link.download = 'greenops-local-review-history.json';
      link.click();
      URL.revokeObjectURL(url);
    },
  };
}

const date = (value: string) =>
  `${new Date(value).toISOString().replace('T', ' ').slice(0, 16)} UTC`;
const proposalLink = (proposal: ApprovalProposal) =>
  withRecordedRun(`/dashboard/review?finding=${encodeURIComponent(proposal.id)}`, proposal.runId);
const status = (proposal: ApprovalProposal, records: ApprovalRecord[]) => {
  const record = latestProposalDecision(proposal, records);
  return record ? DECISION_LABELS[record.decision] : 'Needs review';
};

export function filterApprovalProposals(
  proposals: ApprovalProposal[],
  records: ApprovalRecord[],
  filter: string,
  search: string,
) {
  return proposals.filter((proposal) => {
    const decision = latestProposalDecision(proposal, records);
    return (
      (filter === 'all' || (filter === 'pending' ? !decision : decision?.decision === filter)) &&
      `${proposal.title} ${proposal.agentName} ${proposal.recommendationTitle}`
        .toLowerCase()
        .includes(search.trim().toLowerCase())
    );
  });
}

export function selectedApprovalProposal(
  visible: ApprovalProposal[],
  records: ApprovalRecord[],
  selected: string,
) {
  return (
    visible.find((proposal) => proposal.id === selected) ??
    visible.find((proposal) => !latestProposalDecision(proposal, records)) ??
    visible[0]
  );
}

export function ApprovalInbox({
  store,
  run,
  initialFindingId,
}: {
  store: ApprovalStore;
  run: SelectedRun | null;
  initialFindingId?: string;
}) {
  const [selected, setSelected] = useState(initialFindingId ?? '');
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const visible = filterApprovalProposals(store.proposals, store.records, filter, search);
  const current = selectedApprovalProposal(visible, store.records, selected);
  const lastPage = Math.max(0, Math.ceil(visible.length / 8) - 1);
  const shownPage = Math.min(page, lastPage);
  return (
    <section className={styles.inbox} aria-label="Human review inbox">
      <header className={styles.header}>
        <div>
          <h2>Review proposed improvements</h2>
          <p>Choose a recommendation, inspect the evidence, and record your decision.</p>
        </div>
        <span className={styles.badge}>Local plan review</span>
      </header>
      <div className={styles.notice}>
        These decisions stay in this browser. Reviewer names are self-declared. Approving a plan
        does not apply it, change the source ledger, or override safety policies.
      </div>
      <div className={styles.counts} aria-label="Local review status">
        <span>
          <strong>{store.ready ? store.counts.pending : '—'}</strong> need review
        </span>
        <span>
          <strong>{store.ready ? store.counts.approved : '—'}</strong> plans approved
        </span>
        <span>
          <strong>{store.ready ? store.counts.revisionRequested : '—'}</strong> need revision
        </span>
        <span>
          <strong>{store.ready ? store.counts.rejected : '—'}</strong> rejected
        </span>
      </div>
      {store.error ? (
        <p role="alert" className={styles.error}>
          {store.error}
        </p>
      ) : !store.ready ? (
        <p role="status" className={styles.empty}>
          Preparing recommendations for review…
        </p>
      ) : (
        <>
          <div className={styles.filters}>
            <label>
              Find a recommendation
              <input
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                  setPage(0);
                }}
                placeholder="Search findings or agents"
              />
            </label>
            <label>
              Review status
              <select
                value={filter}
                onChange={(event) => {
                  setFilter(event.target.value);
                  setPage(0);
                }}
              >
                <option value="all">All proposals</option>
                <option value="pending">Needs review</option>
                <option value="approved">Plan approved locally</option>
                <option value="revision-requested">Revision requested</option>
                <option value="rejected">Rejected</option>
              </select>
            </label>
          </div>
          {store.counts.stale > 0 && (
            <p className={styles.notice}>
              {store.counts.stale} earlier decision(s) no longer match an available proposal.
              Changed recommendations need a new review; the previous decision remains in history.
            </p>
          )}
          <div className={styles.layout}>
            <div>
              <ul className={styles.proposals}>
                {visible.slice(shownPage * 8, shownPage * 8 + 8).map((proposal) => (
                  <li key={proposal.id}>
                    <button
                      type="button"
                      aria-pressed={current?.id === proposal.id}
                      onClick={() => setSelected(proposal.id)}
                    >
                      <span>{proposal.title}</span>
                      <small>
                        {proposal.agentName} · {status(proposal, store.records)}
                      </small>
                    </button>
                  </li>
                ))}
              </ul>
              {!visible.length && (
                <p className={styles.empty}>
                  {store.proposals.length
                    ? 'No recommendations match these filters.'
                    : run
                      ? 'No unapplied recommendations with reviewable details are recorded for this run.'
                      : 'Load an analysis to review its recommendations.'}
                </p>
              )}
              {visible.length > 8 && (
                <div className={styles.pagination}>
                  <button
                    type="button"
                    disabled={!shownPage}
                    onClick={() => setPage(shownPage - 1)}
                  >
                    Previous
                  </button>
                  <span>
                    {shownPage + 1} of {lastPage + 1}
                  </span>
                  <button
                    type="button"
                    disabled={shownPage === lastPage}
                    onClick={() => setPage(shownPage + 1)}
                  >
                    Next
                  </button>
                </div>
              )}
            </div>
            {current && (
              <ProposalReview
                key={`${current.runId}:${current.id}:${current.fingerprint}`}
                proposal={current}
                store={store}
              />
            )}
          </div>
        </>
      )}
      <ApprovalDecisionHistory store={store} />
    </section>
  );
}
export default ApprovalInbox;

export function FindingApprovalPanel({
  store,
  findingId,
}: {
  store: ApprovalStore;
  findingId: string;
}) {
  const proposal = store.proposals.find((candidate) => candidate.id === findingId);
  return (
    <section className={styles.inbox} aria-label="Local human decision">
      <header className={styles.header}>
        <div>
          <h2>Your review decision</h2>
          <p>Review the plan without executing a change.</p>
        </div>
        <span className={styles.badge}>Local only</span>
      </header>
      {store.error ? (
        <p role="alert" className={styles.error}>
          {store.error}
        </p>
      ) : !store.ready ? (
        <p role="status" className={styles.empty}>
          Preparing this recommendation…
        </p>
      ) : proposal ? (
        <ProposalReview
          key={`${proposal.runId}:${proposal.id}:${proposal.fingerprint}`}
          proposal={proposal}
          store={store}
          compact
        />
      ) : (
        <p className={styles.empty}>
          This finding has no unapplied recommendation with reviewable details. Existing local
          decisions, if any, remain in review history.
        </p>
      )}
      <ApprovalDecisionHistory store={store} findingId={findingId} />
    </section>
  );
}

function ProposalReview({
  proposal,
  store,
  compact = false,
}: {
  proposal: ApprovalProposal;
  store: ApprovalStore;
  compact?: boolean;
}) {
  const id = useId();
  const [reviewer, setReviewer] = useState('');
  const [reason, setReason] = useState('');
  const [decision, setDecision] = useState<LocalDecision | ''>('');
  const [acknowledged, setAcknowledged] = useState(false);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const existing = latestProposalDecision(proposal, store.records);
  const previous = store.records.filter((record) => record.findingId === proposal.id).at(-1);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (savingRef.current) return;
    if (!decision) {
      setResult({ ok: false, message: 'Choose a review decision.' });
      return;
    }
    savingRef.current = true;
    setSaving(true);
    setResult(null);
    try {
      const saved = await store.save(proposal.id, { decision, reviewer, reason, acknowledged });
      setResult(saved);
      if (saved.ok) {
        setAcknowledged(false);
        setDecision('');
        setReason('');
      }
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }
  return (
    <div className={styles.review}>
      {!compact && (
        <>
          <h3>{proposal.recommendationTitle}</h3>
          <p>{proposal.recommendation}</p>
          <Link href={proposalLink(proposal)}>Open finding evidence and projected impact →</Link>
          <dl className={styles.facts}>
            <div>
              <dt>Recommendation source</dt>
              <dd>{proposal.source}</dd>
            </div>
            <div>
              <dt>Recorded confidence</dt>
              <dd>{proposal.confidence}</dd>
            </div>
            <div>
              <dt>Reversible</dt>
              <dd>
                {proposal.reversible === null
                  ? 'Not established'
                  : proposal.reversible
                    ? 'Recorded as reversible'
                    : 'Not recorded as reversible'}
              </dd>
            </div>
          </dl>
          <details>
            <summary>Supporting evidence</summary>
            {proposal.evidence.length ? (
              <dl className={styles.evidence}>
                {proposal.evidence.map((fact, index) => (
                  <div key={`${fact.label}:${index}`}>
                    <dt>{fact.label}</dt>
                    <dd>{fact.value}</dd>
                  </div>
                ))}
              </dl>
            ) : (
              <p>No supported evidence fields were recorded. Review the source before approving.</p>
            )}
          </details>
        </>
      )}
      <div className={styles.notice}>
        <strong>Before deciding</strong>
        <p>
          Confirm ownership, retention or residency requirements, service quality, and a rollback
          plan. Projected savings are estimates, not verified outcomes.
        </p>
        <p>{proposal.policy}. Local review does not override this policy decision.</p>
      </div>
      {existing && (
        <p className={styles.current}>
          <strong>{DECISION_LABELS[existing.decision]}</strong> · {existing.reviewer} ·{' '}
          {date(existing.recordedAt)}. A new decision adds to history; it does not erase the earlier
          one.
        </p>
      )}
      {!existing && previous && (
        <p className={styles.notice}>
          The evidence or recommendation changed. Your earlier decision does not approve this
          version. Review it again.
        </p>
      )}
      <form className={styles.form} onSubmit={submit}>
        <label htmlFor={`${id}-reviewer`}>
          Reviewer name <span>(self-declared)</span>
          <input
            id={`${id}-reviewer`}
            value={reviewer}
            maxLength={100}
            required
            disabled={saving}
            onChange={(event) => {
              setReviewer(event.target.value);
              setResult(null);
            }}
            autoComplete="off"
          />
        </label>
        <fieldset disabled={saving}>
          <legend>Decision</legend>
          {(
            [
              ['approved', 'Approve plan only'],
              ['rejected', 'Reject plan'],
              ['revision-requested', 'Request revision'],
            ] as const
          ).map(([value, label]) => (
            <label className={styles.choice} key={value}>
              <input
                type="radio"
                name={`${id}-decision`}
                value={value}
                required
                checked={decision === value}
                onChange={() => {
                  setDecision(value);
                  setResult(null);
                }}
              />
              {label}
            </label>
          ))}
        </fieldset>
        <label htmlFor={`${id}-reason`}>
          Decision reason
          <textarea
            id={`${id}-reason`}
            value={reason}
            required
            disabled={saving}
            maxLength={1000}
            rows={3}
            onChange={(event) => {
              setReason(event.target.value);
              setResult(null);
            }}
            placeholder="What did you check, or what needs to change? Do not enter secrets or personal data."
          />
        </label>
        <label className={styles.choice}>
          <input
            type="checkbox"
            required
            disabled={saving}
            checked={acknowledged}
            onChange={(event) => setAcknowledged(event.target.checked)}
          />
          I understand this records a local, self-declared plan decision only. No infrastructure,
          files, or workloads will be changed.
        </label>
        <button className={styles.primary} type="submit" disabled={!store.ready || saving}>
          {saving ? 'Saving decision…' : 'Record decision'}
        </button>
        <p
          role={result?.ok === false ? 'alert' : 'status'}
          className={result?.ok === false ? styles.error : styles.success}
        >
          {saving
            ? 'Waiting for exclusive access to local review history…'
            : (result?.message ?? '')}
        </p>
      </form>
    </div>
  );
}

export function ApprovalDecisionHistory({
  store,
  findingId,
}: {
  store: ApprovalStore;
  findingId?: string;
}) {
  const [page, setPage] = useState(0);
  const records = [...store.records]
    .filter((record) => !findingId || record.findingId === findingId)
    .reverse();
  const lastPage = Math.max(0, Math.ceil(records.length / 5) - 1);
  const shownPage = Math.min(page, lastPage);
  return (
    <section className={styles.history} aria-label="Local review history">
      <div className={styles.historyHeader}>
        <h3>Local decision history</h3>
        <button
          type="button"
          disabled={!store.ready || !store.records.length}
          onClick={store.exportHistory}
        >
          Export this run’s reviews
        </button>
      </div>
      <p>
        Separate from the imported run trace. Browser-local records are editable by someone with
        browser access; this is not authenticated or tamper-proof approval storage.
      </p>
      {!store.ready ? (
        <p role={store.error ? 'alert' : 'status'}>
          {store.error ?? 'Loading local review history and checking proposal versions…'}
        </p>
      ) : (
        <>
          {!records.length && (
            <p>No local human decisions are recorded for this {findingId ? 'finding' : 'run'}.</p>
          )}
          <ol>
            {records.slice(shownPage * 5, shownPage * 5 + 5).map((record) => {
              const current = store.proposals.find(
                (proposal) =>
                  proposal.id === record.findingId && proposal.fingerprint === record.fingerprint,
              );
              const latest = current
                ? latestProposalDecision(current, store.records)?.id === record.id
                : false;
              return (
                <li key={record.id}>
                  <div>
                    <strong>{DECISION_LABELS[record.decision]}</strong>
                    <span className={styles.badge}>
                      {!current
                        ? 'Older or unavailable proposal'
                        : latest
                          ? 'Current decision'
                          : 'Superseded decision'}
                    </span>
                  </div>
                  <p>{record.title}</p>
                  <p>{record.reason}</p>
                  <small>
                    {record.reviewer} (self-declared) · {date(record.recordedAt)} · No execution
                  </small>
                </li>
              );
            })}
          </ol>
          {records.length > 5 && (
            <div className={styles.pagination}>
              <button type="button" disabled={!shownPage} onClick={() => setPage(shownPage - 1)}>
                Newer
              </button>
              <span>
                {shownPage + 1} of {lastPage + 1}
              </span>
              <button
                type="button"
                disabled={shownPage === lastPage}
                onClick={() => setPage(shownPage + 1)}
              >
                Older
              </button>
            </div>
          )}
        </>
      )}
    </section>
  );
}
