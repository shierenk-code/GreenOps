'use client';

import { useEffect, useRef, useState } from 'react';
import {
  findingStatus,
  proposedWasteChange,
  type WasteAction,
  type WasteWorkflow,
} from './workflow-types';
import styles from './workflow.module.css';

const API = '/dashboard/digital-waste/api';
const amount = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: 2 });
const evidenceLabel = (key: string) =>
  ({
    requestedCpuCores: 'Requested CPU (cores per replica)',
    observedCpuCores: 'Current observed CPU (cores)',
    history: 'Utilization history',
    replicas: 'Replica count',
    phase: 'Storage state',
    capacityGiB: 'Capacity (GiB)',
    referencedByPods: 'Referenced by current pods',
    releaseEvidence: 'Owner, backup and retention evidence',
  })[key] ?? key.replace(/([A-Z])/g, ' $1');
function EvidenceValue({ value }: { value: unknown }) {
  if (value === null || value === undefined) return <>Not recorded</>;
  if (typeof value === 'boolean') return <>{value ? 'Yes' : 'No'}</>;
  if (typeof value !== 'object') return <>{String(value)}</>;
  return (
    <details>
      <summary>View supporting records</summary>
      <dl>
        {Object.entries(value).map(([key, item]) => (
          <div key={key}>
            <dt>{evidenceLabel(key)}</dt>
            <dd>
              <EvidenceValue value={item} />
            </dd>
          </div>
        ))}
      </dl>
    </details>
  );
}

export default function WasteWorkflowClient() {
  const [run, setRun] = useState<WasteWorkflow | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState('');
  const [reviewer, setReviewer] = useState('');
  const [reason, setReason] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [editingReview, setEditingReview] = useState(false);
  const pending = useRef(false);
  const finding = run?.plan.findings.find((f) => f.id === selected);
  const decision = run?.decisions.findLast((d) => d.findingId === selected);
  const result = run?.simulation;

  async function request(action?: WasteAction) {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError('');
    try {
      const response = await fetch(
        API,
        action
          ? {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'X-Greenops-Waste': '1' },
              body: JSON.stringify(action),
              cache: 'no-store',
            }
          : { cache: 'no-store' },
      );
      const data = await response.json();
      if ('run' in data) setRun(data.run);
      if (!response.ok)
        throw new Error(data.error ?? 'Action failed. Refresh before trying again.');
      if (action?.action === 'start') {
        setEditingReview(false);
        setSelected(data.run.plan.findings[0]?.id ?? '');
        setReviewer('');
        setReason('');
        setConfirmed(false);
      }
      if (action?.action === 'review') {
        setEditingReview(false);
        setReason('');
        setConfirmed(false);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to reach the local dashboard.');
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  useEffect(() => {
    const abort = new AbortController();
    fetch(API, { cache: 'no-store', signal: abort.signal })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error ?? 'Could not load the workflow.');
        setRun(data.run);
        setSelected(data.run?.simulation?.findingId ?? data.run?.plan.findings[0]?.id ?? '');
      })
      .catch((e) => {
        if (!abort.signal.aborted) setError(e.message);
      })
      .finally(() => {
        if (!abort.signal.aborted) setBusy(false);
      });
    return () => abort.abort();
  }, []);

  const base = { runId: run?.id ?? null, revision: run?.revision ?? 0 };
  function exportRun() {
    if (!run) return;
    const blob = new Blob(
      [
        JSON.stringify(
          {
            scope:
              'Synthetic Digital Waste workflow; separate from recorded fleet results. No verified cloud savings.',
            ...run,
          },
          null,
          2,
        ),
      ],
      { type: 'application/json' },
    );
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `greenops-digital-waste-${run.id}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  const stage = !run
    ? 0
    : !run.decisions.length
      ? 1
      : !result
        ? 2
        : !run.checks
          ? 3
          : run.checks.every((c) => c.passed)
            ? 5
            : 4;
  const totals = run?.operationalOutcomes.reduce(
    (n, o) => ({
      duration: n.duration + o.durationMs,
      tools: n.tools + o.selfCost.totalToolCalls,
      models: n.models + o.selfCost.llmCalls,
      tokens: n.tokens + o.selfCost.knownTokens,
    }),
    { duration: 0, tools: 0, models: 0, tokens: 0 },
  );

  return (
    <section
      className={styles.workflow}
      aria-label="Digital Waste end-to-end workflow"
      aria-busy={busy}
    >
      <header className={styles.header}>
        <div>
          <span className={styles.badge}>Synthetic sandbox · no cloud changes</span>
          <h2>Find waste. Review the fix. Check the result.</h2>
          <p>
            Try one complete Digital Waste decision using the same planning and safety checks as the
            terminal.
          </p>
        </div>
        <div className={styles.actions}>
          <button disabled={busy} onClick={() => void request({ ...base, action: 'start' })}>
            {run ? 'Start new scenario' : 'Start waste workflow'}
          </button>
          <button disabled={busy} onClick={() => void request()}>
            Refresh workflow
          </button>
          {run && <button onClick={exportRun}>Export evidence</button>}
        </div>
      </header>
      <ol className={styles.steps} aria-label="Workflow progress">
        {['Find waste', 'Review evidence', 'Human decision', 'Simulate change', 'Check result'].map(
          (label, i) => (
            <li key={label} aria-current={stage === i ? 'step' : undefined}>
              {i + 1}. {label}
              {stage > i ? ' ✓' : ''}
            </li>
          ),
        )}
      </ol>
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
      <p role="status">
        {busy
          ? 'Loading workflow…'
          : !run
            ? 'Start with a synthetic AKS inventory: two workloads and three storage claims. No account or API key required.'
            : run.checks
              ? run.checks.every((c) => c.passed)
                ? 'Simulation checked. Real savings are still not verified.'
                : 'Simulation checks failed. Review the evidence; no savings are verified.'
              : result
                ? 'Change simulated. Next: check the before-and-after result.'
                : decision?.decision === 'approve'
                  ? 'Plan approved. Next: simulate the selected change.'
                  : 'Select a finding, inspect its evidence, then record your decision.'}
      </p>
      {run && (
        <>
          <p className={styles.note}>
            This sandbox is independent of the recorded analysis and date filters above. One change
            per run. Plans expire after 15 minutes; simulate within 5 minutes of approval. Saved
            locally; export evidence before starting a new scenario.
          </p>
          <div className={styles.columns}>
            <nav className={styles.findings} aria-label="Waste findings">
              <h3>{run.plan.findings.length} findings</h3>
              {run.plan.findings.map((f) => (
                <button
                  key={f.id}
                  aria-pressed={selected === f.id}
                  onClick={() => {
                    setSelected(f.id);
                    setEditingReview(false);
                    setReason('');
                    setConfirmed(false);
                  }}
                >
                  <strong>{f.resourceName}</strong>
                  <span>
                    {f.action === 'resize-cpu-request'
                      ? 'Right-size CPU requests'
                      : 'Review unused storage'}
                  </span>
                  <span>{findingStatus(run, f.id)}</span>
                </button>
              ))}
            </nav>
            {finding ? (
              <div className={styles.detail}>
                <h3>{finding.resourceName}</h3>
                <span className={styles.badge}>
                  {findingStatus(run, finding.id)} · {finding.risk} risk
                </span>
                <p>{finding.explanation}</p>
                <h4>Proposed change</h4>
                <p>{proposedWasteChange(finding)}</p>
                <dl className={styles.facts}>
                  <div>
                    <dt>Potential capacity</dt>
                    <dd>
                      {finding.impact.cpuReservationCores !== null
                        ? `${amount(finding.impact.cpuReservationCores)} CPU reservation cores`
                        : finding.impact.storageGiB !== null
                          ? `${amount(finding.impact.storageGiB)} GiB`
                          : 'Needs more evidence'}
                    </dd>
                  </div>
                  <div>
                    <dt>Potential monthly cost reduction</dt>
                    <dd>
                      {finding.impact.estimatedMonthlyCostUsd === null
                        ? 'Not estimated'
                        : `$${amount(finding.impact.estimatedMonthlyCostUsd)} · illustrative rate`}
                    </dd>
                  </div>
                  <div>
                    <dt>Carbon savings</dt>
                    <dd>Not measured</dd>
                  </div>
                </dl>
                <h4>Evidence behind this recommendation</h4>
                <dl className={styles.evidence}>
                  {Object.entries(finding.evidence).map(([key, value]) => (
                    <div key={key}>
                      <dt>{evidenceLabel(key)}</dt>
                      <dd>
                        <EvidenceValue value={value} />
                      </dd>
                    </div>
                  ))}
                </dl>
                {finding.blockers.length > 0 && (
                  <div className={styles.warning}>
                    <strong>Approval blocked</strong>
                    <ul>
                      {finding.blockers.map((b) => (
                        <li key={b}>{b}</li>
                      ))}
                    </ul>
                  </div>
                )}
                <details>
                  <summary>Manual implementation steps and assumptions</summary>
                  <ol>
                    {finding.manualSteps.map((s) => (
                      <li key={s}>{s}</li>
                    ))}
                  </ol>
                  <ul>
                    {finding.impact.assumptions.map((s) => (
                      <li key={s}>{s}</li>
                    ))}
                  </ul>
                </details>
                {!result && (!decision || editingReview) && (
                  <fieldset disabled={busy} className={styles.review}>
                    <legend>Human decision</legend>
                    <p>Local plan review only. Use a team alias, not personal or customer data.</p>
                    <label>
                      Reviewer label
                      <input
                        value={reviewer}
                        maxLength={80}
                        onChange={(e) => setReviewer(e.target.value)}
                        placeholder="Demo reviewer"
                      />
                    </label>
                    <label>
                      Reason
                      <textarea
                        value={reason}
                        maxLength={500}
                        onChange={(e) => setReason(e.target.value)}
                        placeholder="What evidence supports your decision?"
                      />
                    </label>
                    <label className={styles.confirm}>
                      <input
                        type="checkbox"
                        checked={confirmed}
                        onChange={(e) => setConfirmed(e.target.checked)}
                      />
                      I understand approval permits only this synthetic simulation.
                    </label>
                    <div className={styles.actions}>
                      <button
                        disabled={
                          !confirmed ||
                          !reviewer.trim() ||
                          !reason.trim() ||
                          finding.status !== 'ready-for-review'
                        }
                        onClick={() =>
                          void request({
                            ...base,
                            action: 'review',
                            findingId: finding.id,
                            decision: 'approve',
                            reviewer,
                            reason,
                          })
                        }
                      >
                        Approve simulation
                      </button>
                      <button
                        disabled={!confirmed || !reviewer.trim() || !reason.trim()}
                        onClick={() =>
                          void request({
                            ...base,
                            action: 'review',
                            findingId: finding.id,
                            decision: 'reject',
                            reviewer,
                            reason,
                          })
                        }
                      >
                        Reject plan
                      </button>
                    </div>
                  </fieldset>
                )}
                {!result && !editingReview && decision?.decision === 'approve' && (
                  <button
                    disabled={busy}
                    onClick={() =>
                      void request({ ...base, action: 'simulate', findingId: finding.id })
                    }
                  >
                    Simulate approved change
                  </button>
                )}
                {decision && (
                  <p>
                    Latest decision: {decision.decision} by {decision.reviewer}. {decision.reason}
                  </p>
                )}
                {decision && !result && (
                  <button
                    disabled={busy}
                    onClick={() => {
                      setEditingReview(!editingReview);
                      setReason('');
                      setConfirmed(false);
                    }}
                  >
                    {editingReview ? 'Keep saved decision' : 'Revise decision'}
                  </button>
                )}
              </div>
            ) : (
              <p>Select a finding to review its evidence.</p>
            )}
          </div>
          {result && (
            <section className={styles.result} aria-label="Simulation result">
              <h3>Before and after · synthetic only</h3>
              <p>
                {run.plan.findings.find((f) => f.id === result.findingId)?.resourceName} · No
                resources were changed in Azure or Kubernetes.
              </p>
              <div className={styles.scroll}>
                <table>
                  <thead>
                    <tr>
                      <th>Resource</th>
                      <th>Before</th>
                      <th>After simulation</th>
                    </tr>
                  </thead>
                  <tbody>
                    {run.plan.inventory.workloads.flatMap((w) =>
                      w.containers.map((c) => (
                        <tr key={`${w.uid}-${c.name}`}>
                          <th>
                            {w.name} / {c.name}
                          </th>
                          <td>{c.requestedCpuCores} CPU cores / replica</td>
                          <td>
                            {
                              result.after.workloads
                                .find((a) => a.uid === w.uid)
                                ?.containers.find((a) => a.name === c.name)?.requestedCpuCores
                            }{' '}
                            CPU cores / replica
                          </td>
                        </tr>
                      )),
                    )}
                    {run.plan.inventory.volumes.map((v) => (
                      <tr key={v.uid}>
                        <th>{v.name}</th>
                        <td>{v.capacityGiB} GiB claim</td>
                        <td>
                          {result.after.volumes.some((a) => a.uid === v.uid)
                            ? 'Unchanged'
                            : 'Removed from synthetic copy'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {!run.checks ? (
                <button disabled={busy} onClick={() => void request({ ...base, action: 'check' })}>
                  Check simulation result
                </button>
              ) : (
                <ul>
                  {run.checks.map((c) => (
                    <li key={c.label}>
                      {c.passed ? 'Passed' : 'Failed'}: {c.label}
                    </li>
                  ))}
                </ul>
              )}
              <strong>Production verification: not verified.</strong>
              <p>
                These checks validate only the inventory transition. Service quality, actual energy
                and billing need separate measurements.
              </p>
            </section>
          )}
          <details>
            <summary>Decision history and agent resources</summary>
            <ol>
              {run.events.map((e, i) => (
                <li key={i}>
                  <time>{new Date(e.at).toLocaleString()}</time> — {e.label}
                </li>
              ))}
            </ol>
            <p>
              {totals?.models} model requests · {totals?.tokens} tokens · {totals?.tools} external
              adapter calls · {totals?.duration} ms processing time. No model or external cloud
              tools are used in this synthetic workflow. Energy and carbon overhead are unmeasured.
            </p>
            <p>
              Export includes the plan, all decisions, before/after evidence, checks and operational
              accounting. Local JSON history is not tamper-proof.
            </p>
          </details>
        </>
      )}
    </section>
  );
}
