'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import {
  ArrowRight,
  Beaker,
  Check,
  CheckCircle2,
  ClipboardList,
  Download,
  LoaderCircle,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  XCircle,
} from 'lucide-react';
import { WorkspaceSidebar } from '../workspace-sidebar';
import type { DemoAction, DemoMode, DemoResponse, DemoRun } from './demo-types';
import { assessDemoCarbon } from './demo-sci';
import styles from './demo.module.css';

const endpoint = '/dashboard/ai-efficiency-demo/api';
const emptyResponse: DemoResponse = {
  run: null,
  config: { geminiAvailable: false, model: null, liveRequestLimit: 13 },
};
const statusLabels: Record<DemoRun['status'], string> = {
  created: 'Analysis started',
  'awaiting-approval': 'Needs your review',
  approved: 'Approved for sandbox',
  rejected: 'Change rejected',
  applied: 'Ready to verify',
  verified: 'Verified request reduction',
  'verification-failed': 'Verification did not pass',
  failed: 'Analysis could not finish',
  'rolled-back': 'Change rolled back',
};

function number(value: number | null | undefined) {
  return value === null || value === undefined ? 'Not reported' : value.toLocaleString('en-US');
}

function timestamp(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? 'Time unavailable'
    : `${date.toISOString().slice(0, 19).replace('T', ' ')} UTC`;
}

function downloadEvidence(run: DemoRun) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify({ ...run, carbonAssessment: assessDemoCarbon(run) }, null, 2)], {
      type: 'application/json',
    }),
  );
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `greenops-ai-efficiency-${run.id}.json`;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function DemoRunSummary({ run }: { run: DemoRun }) {
  const after = run.verification?.after;
  const fixture = run.mode === 'fixture';
  const hasUsage = run.baseline?.tokens !== null && after?.tokens !== null;
  const awaitingReplay = ['failed', 'rejected'].includes(run.status)
    ? 'Not available for this run'
    : 'Awaiting replay';
  return (
    <section className={styles.card} id="results" aria-labelledby="results-heading">
      <div className={styles.cardHeading}>
        <div>
          <h2 id="results-heading">Before and after</h2>
          <p>The same synthetic requests, with output checks on every response.</p>
        </div>
        <span className={styles.badge}>
          {fixture ? 'Fixture measurements' : 'Provider-reported usage'}
        </span>
      </div>
      <div className={styles.tableScroll}>
        <table className={styles.table}>
          <caption className={styles.srOnly}>
            Baseline and replay comparison for the selected demo run
          </caption>
          <thead>
            <tr>
              <th scope="col">Measure</th>
              <th scope="col">Before caching</th>
              <th scope="col">After caching</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <th scope="row">Planned workload requests</th>
              <td>{run.baseline ? number(run.baseline.requests) : 'Not completed'}</td>
              <td>{after ? number(after.requests) : awaitingReplay}</td>
            </tr>
            <tr>
              <th scope="row">Requests with completed responses</th>
              <td>{run.baseline ? number(run.baseline.results.length) : 'Not completed'}</td>
              <td>{after ? number(after.results.length) : awaitingReplay}</td>
            </tr>
            <tr>
              <th scope="row">
                {fixture ? 'Fixture provider calls attempted' : 'Model API calls attempted'}
              </th>
              <td>{run.baseline ? number(run.baseline.modelCalls) : 'Not completed'}</td>
              <td>{after ? number(after.modelCalls) : awaitingReplay}</td>
            </tr>
            <tr>
              <th scope="row">Responses served from cache</th>
              <td>{run.baseline ? number(run.baseline.cacheHits) : 'Not completed'}</td>
              <td>{after ? number(after.cacheHits) : awaitingReplay}</td>
            </tr>
            <tr>
              <th scope="row">
                {fixture
                  ? 'Fixture token units (not API tokens)'
                  : 'Consumed tokens reported by provider'}
              </th>
              <td>{run.baseline ? number(run.baseline.tokens) : 'Not completed'}</td>
              <td>{after ? number(after.tokens) : awaitingReplay}</td>
            </tr>
            <tr>
              <th scope="row">Expected-answer checks</th>
              <td>
                {run.baseline
                  ? run.baseline.qualityPassed
                    ? 'Passed'
                    : 'Did not pass'
                  : 'Not completed'}
              </td>
              <td>{after ? (after.qualityPassed ? 'Passed' : 'Did not pass') : awaitingReplay}</td>
            </tr>
            <tr>
              <th scope="row">Equivalent outputs before / after</th>
              <td>Reference responses</td>
              <td>
                {run.verification
                  ? run.verification.outputsEquivalent
                    ? 'Passed'
                    : 'Did not pass'
                  : awaitingReplay}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <div className={styles.cardBody}>
        {run.verification && (
          <div className={run.verification.passed ? styles.success : styles.warning}>
            <strong>
              {run.verification.passed
                ? 'This workload passed verification.'
                : 'Do not treat this result as a verified improvement.'}
            </strong>
            <p>
              {number(run.verification.requestsSaved)} fewer{' '}
              {fixture ? 'fixture provider calls' : 'model API calls'} in the replay
              {hasUsage && run.verification.tokensSaved !== null
                ? `; ${number(Math.abs(run.verification.tokensSaved))} ${run.verification.tokensSaved < 0 ? 'more' : 'fewer'} ${fixture ? 'fixture token units' : 'reported tokens'}`
                : '. Token reduction is unavailable where usage was not reported'}
              .
            </p>
            <p>
              {fixture
                ? 'This validates cache behavior using deterministic fixture responses, not live LLM quality or real token savings.'
                : 'This result applies to this small synthetic workload, not all production traffic.'}
            </p>
          </div>
        )}
        <div className={styles.warning}>
          <strong>Carbon intensity: more evidence needed</strong>
          <p>
            Request reduction is not yet a carbon saving. This run has no complete energy, regional
            electricity, or hardware-footprint evidence for an SCI score.
          </p>
          <Link href="/dashboard/measurement" className={styles.secondaryButton}>
            Open carbon measurement worksheet
          </Link>
        </div>
        <details className={styles.details}>
          <summary>Request-by-request output evidence</summary>
          {run.baseline && run.baseline.results.length > 0 ? (
            <div className={styles.tableScroll}>
              <table className={styles.table}>
                <caption className={styles.srOnly}>
                  Recorded outputs and quality checks for each synthetic request
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Request</th>
                    <th scope="col">Baseline answer</th>
                    <th scope="col">Replay answer</th>
                    <th scope="col">Replay source</th>
                    <th scope="col">Checks</th>
                  </tr>
                </thead>
                <tbody>
                  {run.baseline.results.map((before) => {
                    const replay = after?.results.find((result) => result.id === before.id);
                    return (
                      <tr key={before.id}>
                        <th scope="row">{before.id}</th>
                        <td>{before.answer}</td>
                        <td>{replay?.answer ?? awaitingReplay}</td>
                        <td>
                          {replay
                            ? replay.cached
                              ? 'Cache'
                              : replay.bypassReason
                                ? `Provider · ${replay.bypassReason}`
                                : 'Provider'
                            : '—'}
                        </td>
                        <td>
                          Before: {before.correct ? 'passed' : 'failed'}
                          {replay ? ` / After: ${replay.correct ? 'passed' : 'failed'}` : ''}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <p>No completed baseline responses were recorded.</p>
          )}
        </details>
        {run.verification && (
          <details className={styles.details}>
            <summary>Verification checks and impact assumptions</summary>
            <ul className={styles.checkList}>
              {run.verification.checks.map((check, index) => (
                <li key={index}>
                  {check.passed ? (
                    <CheckCircle2 size={17} aria-hidden="true" />
                  ) : (
                    <XCircle size={17} aria-hidden="true" />
                  )}
                  <span>
                    {check.label}: {check.passed ? 'passed' : 'failed'}
                  </span>
                </li>
              ))}
            </ul>
            <p>
              Legacy illustrative model energy change (not SCI):{' '}
              {run.verification.estimatedEnergyWh === null
                ? 'Not calculated'
                : `${Math.abs(run.verification.estimatedEnergyWh).toPrecision(3)} Wh ${run.verification.estimatedEnergyWh < 0 ? 'increase' : 'reduction'}`}
              . Estimated carbon change:{' '}
              {run.verification.estimatedCarbonGrams === null
                ? 'Not calculated'
                : `${Math.abs(run.verification.estimatedCarbonGrams).toPrecision(3)} g CO₂e ${run.verification.estimatedCarbonGrams < 0 ? 'increase' : 'reduction'}`}
              .
            </p>
            <ul>
              {run.verification.assumptions.map((assumption, index) => (
                <li key={index}>{assumption}</li>
              ))}
            </ul>
            <p>
              Older saved runs may contain illustrative conversions, not metered electricity or net
              system savings, and not an SCI result. New runs leave these figures uncalculated until
              the required evidence is available. Benchmarking itself consumes resources.
            </p>
          </details>
        )}
      </div>
    </section>
  );
}

export default function DemoClient({
  initialResponse,
  embedded = false,
}: {
  initialResponse?: DemoResponse;
  embedded?: boolean;
}) {
  const Content = embedded ? 'section' : 'main';
  const Heading = embedded ? 'h2' : 'h1';
  const [data, setData] = useState<DemoResponse>(initialResponse ?? emptyResponse);
  const [pending, setPending] = useState<string | null>(
    initialResponse ? null : 'Restoring your demo',
  );
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<DemoMode>('fixture');
  const [liveConsent, setLiveConsent] = useState(false);
  const [actor, setActor] = useState('');
  const [note, setNote] = useState('');
  const [acknowledged, setAcknowledged] = useState(false);
  const [showSetup, setShowSetup] = useState(false);
  const locked = useRef(false);
  const outcomeHeading = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (initialResponse) return;
    let active = true;
    fetch(endpoint, { cache: 'no-store', credentials: 'same-origin' })
      .then(async (response) => {
        const body = (await response.json()) as DemoResponse;
        if (!response.ok) throw new Error(body.error ?? 'Unable to restore the demo.');
        if (active) setData(body);
      })
      .catch(() => {
        if (active)
          setError(
            'We could not load your saved demo. Refresh the status before starting a new run.',
          );
      })
      .finally(() => {
        if (active) setPending(null);
      });
    return () => {
      active = false;
    };
  }, [initialResponse]);

  async function refresh() {
    if (locked.current || pending) return;
    locked.current = true;
    setPending('Refreshing recorded status');
    setError(null);
    try {
      const response = await fetch(endpoint, { cache: 'no-store', credentials: 'same-origin' });
      const body = (await response.json()) as DemoResponse;
      if (!response.ok) throw new Error(body.error ?? 'Unable to refresh status.');
      setData(body);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Unable to refresh status.');
    } finally {
      locked.current = false;
      setPending(null);
    }
  }

  async function submit(action: DemoAction, label: string) {
    if (locked.current || pending) return;
    locked.current = true;
    setPending(label);
    setError(null);
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        credentials: 'same-origin',
        cache: 'no-store',
        headers: { 'Content-Type': 'application/json', 'X-GreenOps-Demo': '1' },
        body: JSON.stringify(action),
      });
      const body = (await response.json()) as DemoResponse;
      if (body.config) setData(body);
      if (!response.ok)
        throw new Error(
          body.error ?? 'The operation could not finish. Refresh the status before trying again.',
        );
      if (action.action === 'start') {
        setShowSetup(false);
        setActor('');
        setNote('');
        setAcknowledged(false);
        setLiveConsent(false);
      }
      requestAnimationFrame(() => outcomeHeading.current?.focus());
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : 'Connection interrupted. Refresh status to check whether the operation completed.',
      );
    } finally {
      locked.current = false;
      setPending(null);
    }
  }

  const { run, config } = data;
  const fixture = run?.mode !== 'gemini';
  const canDecide = run?.status === 'awaiting-approval';
  const canRollback = run && ['applied', 'verified', 'verification-failed'].includes(run.status);
  const terminalFailure =
    run && ['rejected', 'failed', 'verification-failed', 'rolled-back'].includes(run.status);
  const baselineComplete =
    !!run?.baseline?.qualityPassed && run.baseline.results.length === run.baseline.requests;
  const stepComplete = [
    baselineComplete,
    !!run?.recommendation,
    !!run?.decision?.approved,
    !!run?.application,
    !!run?.verification?.passed,
  ];
  const currentStep = terminalFailure
    ? -1
    : !baselineComplete
      ? 0
      : !run?.recommendation
        ? 1
        : !run.decision
          ? 2
          : run.status === 'approved'
            ? 3
            : run.status === 'applied'
              ? 4
              : -1;

  return (
    <div
      className={`${styles.root} ${embedded ? styles.embedded : ''}`}
      data-embedded={embedded || undefined}
    >
      {!embedded && (
        <a className={styles.skipLink} href="#demo-main">
          Skip to demo
        </a>
      )}
      {!embedded && (
        <WorkspaceSidebar
          activeView="ai-efficiency-demo"
          actions={
            <button
              className={styles.textButton}
              disabled={!!pending}
              onClick={() => void refresh()}
            >
              <RefreshCw size={16} aria-hidden="true" />
              Refresh status
            </button>
          }
        />
      )}
      <div className={styles.workspace}>
        <Content
          className={styles.main}
          id="demo-main"
          aria-label="AI efficiency verification demo"
        >
          <div className={styles.pageHeading}>
            <div>
              <div className={styles.eyebrow}>
                <Beaker size={15} aria-hidden="true" />
                Synthetic workload · isolated demo
              </div>
              <Heading>Turn repeated AI calls into a verified improvement</Heading>
              <p>
                Measure the waste, review the recommendation, and decide whether to test a safe
                cache change.
              </p>
            </div>
            <div className={styles.actions}>
              {embedded && (
                <button
                  className={styles.secondaryButton}
                  disabled={!!pending}
                  onClick={() => void refresh()}
                >
                  <RefreshCw size={16} aria-hidden="true" />
                  Refresh status
                </button>
              )}
              {run && (
                <button
                  className={styles.secondaryButton}
                  disabled={!!pending}
                  onClick={() => downloadEvidence(run)}
                >
                  <Download size={17} aria-hidden="true" />
                  Download evidence
                </button>
              )}
            </div>
          </div>

          <ol className={styles.steps} aria-label="Demo progress">
            {['Baseline', 'Review', 'Approve', 'Apply', 'Verify'].map((label, index) => (
              <li
                key={label}
                className={
                  stepComplete[index]
                    ? styles.completeStep
                    : currentStep === index
                      ? styles.currentStep
                      : undefined
                }
                aria-current={currentStep === index ? 'step' : undefined}
              >
                <span className={styles.stepNumber}>
                  {stepComplete[index] ? <Check size={15} aria-hidden="true" /> : index + 1}
                </span>
                <span>
                  {label}
                  <small>
                    {stepComplete[index]
                      ? 'Recorded'
                      : currentStep === index
                        ? 'Next step'
                        : terminalFailure
                          ? index === 0 && !baselineComplete
                            ? 'Stopped'
                            : 'Not reached'
                          : 'Pending'}
                  </small>
                </span>
              </li>
            ))}
          </ol>

          {pending && (
            <div className={styles.notice} role="status" aria-live="polite">
              <LoaderCircle className={styles.spinner} size={19} aria-hidden="true" />
              <span>{pending}… Keep this page open. Actions are temporarily disabled.</span>
            </div>
          )}
          {!pending && !error && data.error && (
            <div className={styles.notice} role="status" aria-live="polite">
              <div>
                <strong>Run status</strong>
                <p>{data.error}</p>
                <p>Refresh status to retrieve the latest recorded stage.</p>
              </div>
            </div>
          )}
          {error && (
            <div className={styles.error} role="alert">
              <strong>We could not complete that action.</strong>
              <p>{error}</p>
              <button
                className={styles.secondaryButton}
                disabled={!!pending}
                onClick={() => void refresh()}
              >
                Refresh recorded status
              </button>
            </div>
          )}

          {(!run || showSetup) && (
            <section className={styles.card} aria-labelledby="setup-heading">
              <div className={styles.cardHeading}>
                <div>
                  <h2 id="setup-heading">
                    {run ? 'Start a separate demonstration' : 'Start with a controlled baseline'}
                  </h2>
                  <p>
                    Only built-in synthetic requests are used. No repository content or personal
                    data is sent.
                  </p>
                </div>
              </div>
              <div className={styles.cardBody}>
                <fieldset className={styles.modeSelector} disabled={!!pending}>
                  <legend>Choose how to run the workload</legend>
                  <label className={mode === 'fixture' ? styles.selectedMode : styles.mode}>
                    <input
                      type="radio"
                      name="mode"
                      value="fixture"
                      checked={mode === 'fixture'}
                      onChange={() => {
                        setMode('fixture');
                        setLiveConsent(false);
                      }}
                    />
                    <span>
                      <strong>Fixture replay</strong>
                      <span>
                        Works offline. Tests real cache behavior with deterministic responses and
                        illustrative token units. No LLM calls or API spend.
                      </span>
                    </span>
                  </label>
                  <label className={mode === 'gemini' ? styles.selectedMode : styles.mode}>
                    <input
                      type="radio"
                      name="mode"
                      value="gemini"
                      checked={mode === 'gemini'}
                      disabled={!config.geminiAvailable}
                      onChange={() => setMode('gemini')}
                    />
                    <span>
                      <strong>Live Gemini</strong>
                      <span>
                        {config.geminiAvailable
                          ? `Use ${config.model ?? 'the configured Gemini model'} for live responses and a model-assisted recommendation.`
                          : 'Not configured on this server. Fixture replay is available without a key.'}
                      </span>
                    </span>
                  </label>
                </fieldset>
                {mode === 'gemini' && (
                  <div className={styles.warning}>
                    <p>
                      The full baseline, recommendation, and replay use at most{' '}
                      {config.liveRequestLimit} provider calls. Your provider may charge for these
                      requests. Starting another run creates a new call budget.
                    </p>
                    <label className={styles.checkbox}>
                      <input
                        type="checkbox"
                        checked={liveConsent}
                        disabled={!!pending}
                        onChange={(event) => setLiveConsent(event.target.checked)}
                      />
                      <span>
                        I authorize this bounded live test using synthetic data and understand that
                        API usage may incur charges.
                      </span>
                    </label>
                  </div>
                )}
                <div className={styles.actions}>
                  <button
                    className={styles.primaryButton}
                    disabled={
                      !!pending || (mode === 'gemini' && (!liveConsent || !config.geminiAvailable))
                    }
                    onClick={() =>
                      void submit(
                        { action: 'start', mode, liveConsent },
                        mode === 'fixture'
                          ? 'Running the fixture baseline'
                          : 'Measuring baseline and requesting a recommendation',
                      )
                    }
                  >
                    Run baseline and find waste
                    <ArrowRight size={17} aria-hidden="true" />
                  </button>
                  {run && (
                    <button
                      className={styles.secondaryButton}
                      disabled={!!pending}
                      onClick={() => setShowSetup(false)}
                    >
                      Keep current run
                    </button>
                  )}
                </div>
                {run && (
                  <p className={styles.muted}>
                    Starting a new run keeps the previous evidence on the server. Download it first
                    if you want a portable copy.
                  </p>
                )}
              </div>
            </section>
          )}

          {run && (
            <>
              <section
                className={`${styles.outcome} ${terminalFailure ? styles.outcomeWarning : ''}`}
                aria-labelledby="outcome-heading"
              >
                <div>
                  <div className={styles.eyebrow}>
                    {fixture ? 'Fixture replay · no live LLM' : `Live Gemini · ${run.model}`}
                  </div>
                  <h2 id="outcome-heading" ref={outcomeHeading} tabIndex={-1}>
                    {statusLabels[run.status]}
                  </h2>
                  <p>
                    {run.status === 'awaiting-approval'
                      ? 'The baseline is ready. Review the recommendation below; nothing changes until you approve and apply it.'
                      : run.status === 'approved'
                        ? 'Your decision is recorded. Apply this exact recommendation to the isolated demo configuration.'
                        : run.status === 'applied'
                          ? 'The sandbox cache is enabled. Replay the same requests to check the improvement and answer quality.'
                          : run.status === 'verified'
                            ? 'The same workload used fewer provider calls and passed the recorded quality checks. Review the evidence below.'
                            : run.status === 'rejected'
                              ? 'Your rejection is recorded. No cache change was applied.'
                              : run.status === 'rolled-back'
                                ? 'The sandbox cache is disabled again. The original decision and verification evidence are preserved.'
                                : run.status === 'verification-failed'
                                  ? 'At least one required check did not pass. Inspect the result and roll back the sandbox cache.'
                                  : (run.failure ??
                                    'The run is recorded. Refresh the status to retrieve the latest saved stage.')}
                  </p>
                </div>
                {canDecide && (
                  <a className={styles.primaryButton} href="#recommendation">
                    Review recommendation
                    <ArrowRight size={17} aria-hidden="true" />
                  </a>
                )}
                {run.status === 'approved' && (
                  <button
                    className={styles.primaryButton}
                    disabled={!!pending}
                    onClick={() =>
                      void submit(
                        { action: 'apply', runId: run.id, version: run.version },
                        'Applying the approved sandbox cache',
                      )
                    }
                  >
                    Apply to sandbox
                    <ArrowRight size={17} aria-hidden="true" />
                  </button>
                )}
                {run.status === 'applied' && (
                  <button
                    className={styles.primaryButton}
                    disabled={!!pending}
                    onClick={() =>
                      void submit(
                        { action: 'verify', runId: run.id, version: run.version },
                        'Replaying requests and checking outputs',
                      )
                    }
                  >
                    Replay and verify
                    <ArrowRight size={17} aria-hidden="true" />
                  </button>
                )}
              </section>

              {run.baseline && (
                <div className={styles.metrics}>
                  <div>
                    <span>Baseline workload</span>
                    <strong>{run.baseline.requests} planned synthetic requests</strong>
                    <small>
                      {run.baseline.results.length} of {run.baseline.requests} responses completed
                      {' · '}
                      {run.baseline.modelCalls}{' '}
                      {fixture ? 'fixture calls attempted' : 'Gemini calls attempted'}
                    </small>
                  </div>
                  <div>
                    <span>Replay call reduction</span>
                    <strong>
                      {run.verification
                        ? `${run.verification.requestsSaved} calls`
                        : 'Not verified yet'}
                    </strong>
                    <small>
                      {run.verification?.passed
                        ? 'Passed the recorded verification checks'
                        : 'No verified benefit claimed'}
                    </small>
                  </div>
                  <div>
                    <span>Human decision</span>
                    <strong>
                      {run.decision
                        ? run.decision.approved
                          ? 'Approved'
                          : 'Rejected'
                        : run.status === 'failed' && !run.recommendation
                          ? 'Not available'
                          : 'Awaiting review'}
                    </strong>
                    <small>
                      {run.decision
                        ? `By ${run.decision.actor} · demo identity`
                        : run.status === 'failed' && !run.recommendation
                          ? 'A complete, passing baseline is required before review'
                          : 'You remain in control of the change'}
                    </small>
                  </div>
                </div>
              )}

              {data.dataset && (
                <section className={styles.card} aria-labelledby="workload-heading">
                  <div className={styles.cardBody}>
                    <h2 id="workload-heading">What the agent is checking</h2>
                    <p>
                      {data.dataset.length} built-in synthetic requests. The cache must reuse only
                      eligible exact matches and bypass requests marked personal, even when the
                      words match.
                    </p>
                    <details className={styles.details}>
                      <summary>Inspect the synthetic workload</summary>
                      <div className={styles.tableScroll}>
                        <table className={styles.table}>
                          <caption className={styles.srOnly}>
                            Synthetic request prompts and cache eligibility
                          </caption>
                          <thead>
                            <tr>
                              <th scope="col">Request</th>
                              <th scope="col">Synthetic prompt</th>
                              <th scope="col">Cache policy</th>
                            </tr>
                          </thead>
                          <tbody>
                            {data.dataset.map((request) => (
                              <tr key={request.id}>
                                <th scope="row">{request.id}</th>
                                <td>{request.prompt}</td>
                                <td>
                                  {request.cacheable
                                    ? 'Exact-match caching allowed'
                                    : `Always bypass · ${request.bypassReason ?? 'not cacheable'}`}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </details>
                  </div>
                </section>
              )}

              {run.recommendation && (
                <section
                  className={styles.card}
                  id="recommendation"
                  aria-labelledby="recommendation-heading"
                >
                  <div className={styles.cardHeading}>
                    <div>
                      <h2 id="recommendation-heading">{run.recommendation.title}</h2>
                      <p>{run.recommendation.explanation}</p>
                    </div>
                    <span
                      className={
                        run.recommendation.source === 'fallback'
                          ? styles.warningBadge
                          : styles.badge
                      }
                    >
                      {run.recommendation.source === 'model'
                        ? 'Model-assisted recommendation'
                        : run.recommendation.source === 'fallback'
                          ? 'Rule fallback · model unavailable'
                          : 'Deterministic fixture rule'}
                    </span>
                  </div>
                  <div className={styles.cardBody}>
                    {run.recommendation.fallbackReason && (
                      <div className={styles.warning}>
                        <strong>The model did not supply this recommendation.</strong>
                        <p>
                          {run.recommendation.fallbackReason} The safe, fixed cache strategy remains
                          available for your review.
                        </p>
                      </div>
                    )}
                    <div className={styles.comparison}>
                      <div>
                        <h3>Current behavior</h3>
                        <p>
                          Each request calls the provider, even when an eligible prompt is identical
                          to an earlier request.
                        </p>
                      </div>
                      <div>
                        <h3>Proposed change</h3>
                        <p>
                          Reuse responses for exact matching, cacheable requests within this
                          isolated replay. Requests marked non-cacheable still call the provider.
                        </p>
                      </div>
                    </div>
                    <dl className={styles.facts}>
                      <div>
                        <dt>Risk and safeguards</dt>
                        <dd>{run.recommendation.risk}</dd>
                      </div>
                      <div>
                        <dt>Confidence</dt>
                        <dd>{run.recommendation.confidence}</dd>
                      </div>
                      <div>
                        <dt>Scope</dt>
                        <dd>
                          Demo configuration only. No production files or services are changed.
                        </dd>
                      </div>
                    </dl>
                    {canDecide ? (
                      <div className={styles.approval}>
                        <h3>Your decision</h3>
                        <p>
                          Approval permits only this recorded recommendation. Applying and verifying
                          remain separate actions.
                        </p>
                        <label className={styles.field}>
                          Reviewer name <span>(self-declared demo identity)</span>
                          <input
                            value={actor}
                            maxLength={80}
                            disabled={!!pending}
                            onChange={(event) => setActor(event.target.value)}
                            placeholder="Enter your name"
                            autoComplete="off"
                          />
                        </label>
                        <label className={styles.field}>
                          Decision note <span>(optional)</span>
                          <textarea
                            value={note}
                            maxLength={500}
                            disabled={!!pending}
                            onChange={(event) => setNote(event.target.value)}
                            rows={2}
                            placeholder="Why is this change suitable, or why should it be rejected?"
                          />
                        </label>
                        <label className={styles.checkbox}>
                          <input
                            type="checkbox"
                            checked={acknowledged}
                            disabled={!!pending}
                            onChange={(event) => setAcknowledged(event.target.checked)}
                          />
                          <span>
                            I have reviewed the evidence, recommendation, and risks. My decision
                            applies only to this sandbox change.
                          </span>
                        </label>
                        <div className={styles.actions}>
                          <button
                            className={styles.primaryButton}
                            disabled={!!pending || actor.trim().length < 2 || !acknowledged}
                            onClick={() =>
                              void submit(
                                {
                                  action: 'decide',
                                  runId: run.id,
                                  version: run.version,
                                  approved: true,
                                  actor: actor.trim(),
                                  note,
                                  acknowledged,
                                },
                                'Recording your approval',
                              )
                            }
                          >
                            <ShieldCheck size={17} aria-hidden="true" />
                            Approve sandbox change
                          </button>
                          <button
                            className={styles.secondaryButton}
                            disabled={!!pending || actor.trim().length < 2 || !acknowledged}
                            onClick={() =>
                              void submit(
                                {
                                  action: 'decide',
                                  runId: run.id,
                                  version: run.version,
                                  approved: false,
                                  actor: actor.trim(),
                                  note,
                                  acknowledged,
                                },
                                'Recording your rejection',
                              )
                            }
                          >
                            Reject change
                          </button>
                        </div>
                        <p className={styles.muted}>
                          This demonstration records a reviewer label, not an authenticated
                          enterprise identity.
                        </p>
                      </div>
                    ) : (
                      run.decision && (
                        <div className={styles.decision}>
                          <ShieldCheck size={20} aria-hidden="true" />
                          <div>
                            <strong>
                              {run.decision.approved ? 'Approved' : 'Rejected'} by{' '}
                              {run.decision.actor}
                            </strong>
                            <p>{timestamp(run.decision.at)} · Self-declared demo identity</p>
                            {run.decision.note && <p>{run.decision.note}</p>}
                          </div>
                        </div>
                      )
                    )}
                  </div>
                </section>
              )}

              <DemoRunSummary run={run} />

              <section className={styles.card} aria-labelledby="accounting-heading">
                <div className={styles.cardHeading}>
                  <div>
                    <h2 id="accounting-heading">What this demonstration costs</h2>
                    <p>Recommendation overhead is separate from the workload comparison.</p>
                  </div>
                </div>
                <div className={styles.cardBody}>
                  <dl className={styles.facts}>
                    <div>
                      <dt>Recommendation tokens</dt>
                      <dd>
                        {run.recommendation ? number(run.recommendation.tokens) : 'Not recorded'}
                        {fixture ? ' · fixture units, not API usage' : ' · reported by provider'}
                      </dd>
                    </div>
                    <div>
                      <dt>Benchmark provider calls</dt>
                      <dd>
                        {number(
                          (run.baseline?.modelCalls ?? 0) +
                            (run.verification?.after.modelCalls ?? 0),
                        )}{' '}
                        attempted workload calls across baseline and replay
                        {fixture ? ' · local fixture only' : ''}
                      </dd>
                    </div>
                    <div>
                      <dt>Model use</dt>
                      <dd>
                        {fixture
                          ? 'None. No model or API billing is involved.'
                          : `${run.model}. Baseline and replay calls are intentional measurement overhead.`}
                      </dd>
                    </div>
                  </dl>
                  <p className={styles.muted}>
                    A recommendation request is separate from those workload calls. Failed calls can
                    consume resources without reporting usage. This demo does not claim a net
                    environmental benefit from running the benchmark itself.
                  </p>
                </div>
              </section>

              <section className={styles.card} aria-labelledby="history-heading">
                <div className={styles.cardHeading}>
                  <div>
                    <h2 id="history-heading">Decision and activity history</h2>
                    <p>Recorded actions and evidence—not hidden model reasoning.</p>
                  </div>
                  <ClipboardList size={21} aria-hidden="true" />
                </div>
                <div className={styles.cardBody}>
                  <details className={styles.details}>
                    <summary>View {run.activity.length} recorded events</summary>
                    <ol className={styles.timeline}>
                      {run.activity.map((event) => (
                        <li key={event.sequence}>
                          <div>
                            <strong>{event.stage}</strong>
                            <span>{timestamp(event.at)}</span>
                          </div>
                          <p>{event.summary}</p>
                          <small>{event.actor}</small>
                        </li>
                      ))}
                    </ol>
                  </details>
                  <details className={styles.details}>
                    <summary>Evidence identifiers</summary>
                    <dl className={styles.identifiers}>
                      <dt>Run</dt>
                      <dd>{run.id}</dd>
                      <dt>Dataset hash</dt>
                      <dd>{run.datasetHash}</dd>
                      <dt>Recommendation digest</dt>
                      <dd>{run.recommendation?.digest ?? 'Not recorded'}</dd>
                      <dt>Configuration before</dt>
                      <dd>{run.application?.beforeHash ?? 'Not applied'}</dd>
                      <dt>Configuration after</dt>
                      <dd>{run.application?.afterHash ?? 'Not applied'}</dd>
                    </dl>
                  </details>
                  {run.application && (
                    <p>
                      Sandbox cache:{' '}
                      <strong>{run.application.cacheEnabled ? 'enabled' : 'disabled'}</strong>.{' '}
                      {run.application.scope}
                    </p>
                  )}
                </div>
              </section>

              <div className={styles.bottomActions}>
                {canRollback && (
                  <button
                    className={styles.secondaryButton}
                    disabled={!!pending}
                    onClick={() =>
                      void submit(
                        { action: 'rollback', runId: run.id, version: run.version },
                        'Disabling the sandbox cache',
                      )
                    }
                  >
                    <RotateCcw size={17} aria-hidden="true" />
                    Roll back sandbox change
                  </button>
                )}
                <button
                  className={styles.secondaryButton}
                  disabled={!!pending}
                  onClick={() => {
                    setShowSetup(true);
                    window.scrollTo({ top: 0 });
                  }}
                >
                  Start a new run
                </button>
                <span>
                  Existing evidence is retained. This demo does not modify the fleet ledger.
                </span>
              </div>
            </>
          )}
        </Content>
      </div>
    </div>
  );
}
