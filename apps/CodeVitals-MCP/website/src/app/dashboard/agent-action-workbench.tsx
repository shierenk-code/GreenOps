'use client';

import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import type { Finding } from './ledger-dashboard';
import type { SelectedRun } from './ledger-data';
import { withRecordedRun } from './dashboard-run';
import {
  actionCandidates,
  actionWorkbenchIdentity,
  formatActionNumber,
  previewArchitecturePlan,
  previewCarbonScenario,
  previewRecoveryTabletop,
  previewRetentionPlan,
  type CarbonScenario,
  type LocalActionPlan,
  type RecoveryTabletop,
} from './agent-action-plans';
import styles from './agent-action-workbench.module.css';

interface Props {
  agentId: string;
  findings: Finding[];
  run: SelectedRun | null;
}
const TITLES: Record<string, string> = {
  'ai-efficiency': 'Test a cache policy',
  'digital-waste': 'Plan storage and retention changes',
  collaboration: 'Plan a recording retention review',
  architecture: 'Prepare a patch review',
  'carbon-incident': 'Compare a carbon scenario',
  'disaster-recovery': 'Run a recovery tabletop',
};
const number = formatActionNumber;

export function AgentActionWorkbench(props: Props) {
  return (
    <WorkbenchForm
      key={actionWorkbenchIdentity(props.agentId, props.findings, props.run)}
      {...props}
    />
  );
}
export default AgentActionWorkbench;

function WorkbenchForm({ agentId, findings, run }: Props) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [fields, setFields] = useState<Record<string, string>>({ action: 'review' });
  const [errors, setErrors] = useState<string[]>([]);
  const [plan, setPlan] = useState<LocalActionPlan | null>(null);
  const [carbon, setCarbon] = useState<CarbonScenario | null>(null);
  const [recovery, setRecovery] = useState<RecoveryTabletop | null>(null);
  const title = Object.hasOwn(TITLES, agentId) ? TITLES[agentId] : undefined;
  if (!title) return null;
  const retention = agentId === 'digital-waste' || agentId === 'collaboration';
  const architecture = agentId === 'architecture';
  const candidates = actionCandidates(agentId, findings, run);
  const href = (path: string) => withRecordedRun(path, run?.runId);
  function clearPreview() {
    setErrors([]);
    setPlan(null);
    setCarbon(null);
    setRecovery(null);
  }
  function change(name: string, value: string) {
    clearPreview();
    setFields((current) => ({ ...current, [name]: value }));
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    clearPreview();
    if (retention) {
      const result = previewRetentionPlan({
        agentId,
        findings,
        run,
        selectedIds,
        retentionDays: fields.retentionDays,
        action: fields.action,
      });
      if (result.ok) setPlan(result.value);
      else setErrors(result.errors);
    } else if (architecture) {
      const result = previewArchitecturePlan({ findings, run, selectedIds });
      if (result.ok) setPlan(result.value);
      else setErrors(result.errors);
    } else if (agentId === 'carbon-incident') {
      const result = previewCarbonScenario({
        energyKwh: fields.energyKwh,
        baselineGramsPerKwh: fields.baselineGramsPerKwh,
        targetGramsPerKwh: fields.targetGramsPerKwh,
      });
      if (result.ok) setCarbon(result.value);
      else setErrors(result.errors);
    } else if (agentId === 'disaster-recovery') {
      const result = previewRecoveryTabletop({
        rtoMinutes: fields.rtoMinutes,
        rpoMinutes: fields.rpoMinutes,
        recoveryMinutes: fields.recoveryMinutes,
        dataGapMinutes: fields.dataGapMinutes,
      });
      if (result.ok) setRecovery(result.value);
      else setErrors(result.errors);
    }
  }
  function numericField(
    name: string,
    label: string,
    max: number,
    min = 0,
    step: string | number = 'any',
  ) {
    return (
      <label className={styles.field} key={name}>
        <span>{label}</span>
        <input
          type="number"
          name={name}
          min={min}
          max={max}
          step={step}
          required
          value={fields[name] ?? ''}
          onChange={(event) => change(name, event.target.value)}
        />
      </label>
    );
  }
  return (
    <section className={styles.workbench} aria-labelledby={`action-title-${agentId}`}>
      <header>
        <div>
          <h2 id={`action-title-${agentId}`}>{title}</h2>
          <p>Local planning tools. Nothing is saved or applied to your infrastructure.</p>
        </div>
        <span className={styles.badge}>Preview only</span>
      </header>
      {agentId === 'ai-efficiency' ? (
        <div className={styles.intro}>
          <p>
            Compare repeated synthetic requests with an exact-match response cache. Review the
            proposal, explicitly approve the isolated change, and check answer quality and request
            usage.
          </p>
          <Link href="/dashboard/ai-efficiency-demo" className={styles.primary}>
            Open cache-policy test
          </Link>
          <p className={styles.note}>
            This is a separate sandbox experiment, not prompt compression. It does not change these
            findings or your live application.
          </p>
        </div>
      ) : (
        <>
          <form onSubmit={submit} className={styles.form}>
            {(retention || architecture) && (
              <fieldset className={styles.selection}>
                <legend>Select recorded findings</legend>
                {candidates.length ? (
                  <ul>
                    {candidates.map((candidate) => (
                      <li key={candidate.findingId}>
                        <label>
                          <input
                            type="checkbox"
                            checked={selectedIds.includes(candidate.findingId)}
                            onChange={(event) => {
                              clearPreview();
                              setSelectedIds((ids) =>
                                event.target.checked
                                  ? [...ids, candidate.findingId]
                                  : ids.filter((id) => id !== candidate.findingId),
                              );
                            }}
                          />
                          <span>
                            {candidate.title}
                            <small>
                              {candidate.resourceId
                                ? `Resource: ${candidate.resourceId}`
                                : 'Resource identifier unavailable in this preview; resolve it during review.'}
                            </small>
                          </span>
                        </label>
                        <Link
                          href={href(
                            `/dashboard/review?finding=${encodeURIComponent(candidate.findingId)}`,
                          )}
                          aria-label={`Review recorded proposal: ${candidate.title}`}
                        >
                          View proposal
                        </Link>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p>
                    No eligible recorded findings in this analysis. Import an analysis with{' '}
                    {architecture ? 'architecture' : 'storage or media retention'} findings to
                    create a draft.
                  </p>
                )}
                {agentId === 'digital-waste' && (
                  <p className={styles.note}>
                    This planner covers storage, images and logs. Compute changes need their own
                    capacity review.
                  </p>
                )}
              </fieldset>
            )}
            {retention && (
              <div className={styles.fields}>
                {numericField(
                  'retentionDays',
                  'Proposed retention review threshold (days)',
                  3650,
                  1,
                  1,
                )}
                <label className={styles.field}>
                  <span>Draft action</span>
                  <select
                    value={fields.action}
                    onChange={(event) => change('action', event.target.value)}
                  >
                    <option value="review">Review retention policy</option>
                    <option value="archive">Propose archive assessment</option>
                  </select>
                </label>
              </div>
            )}
            {architecture && (
              <p className={styles.note}>
                Create a human-review checklist for the selected recorded proposals. No patch or
                deployment is generated.
              </p>
            )}
            {agentId === 'carbon-incident' && (
              <>
                <p>
                  Enter your own scenario assumptions. Both cases use the same energy consumption;
                  this is an operational-emissions comparison, not an SCI score or carbon offset.
                </p>
                <div className={styles.fields}>
                  {numericField('energyKwh', 'Energy for the scenario (kWh)', 1_000_000_000)}
                  {numericField(
                    'baselineGramsPerKwh',
                    'Baseline grid intensity (g CO₂e/kWh)',
                    1_000_000,
                  )}
                  {numericField(
                    'targetGramsPerKwh',
                    'Target grid intensity (g CO₂e/kWh)',
                    1_000_000,
                  )}
                </div>
              </>
            )}
            {agentId === 'disaster-recovery' && (
              <>
                <p>
                  Compare planned estimates with targets. RTO is the time allowed to restore
                  service; RPO is the acceptable data-loss window. No failure is injected and no
                  failover is executed.
                </p>
                <div className={styles.fields}>
                  {numericField('rtoMinutes', 'Recovery-time target / RTO (minutes)', 525_600)}
                  {numericField('rpoMinutes', 'Data-loss target / RPO (minutes)', 525_600)}
                  {numericField('recoveryMinutes', 'Estimated recovery time (minutes)', 525_600)}
                  {numericField('dataGapMinutes', 'Estimated data gap (minutes)', 525_600)}
                </div>
              </>
            )}
            {errors.length > 0 && (
              <ul role="alert" className={styles.errors}>
                {errors.map((error) => (
                  <li key={error}>{error}</li>
                ))}
              </ul>
            )}
            <button
              type="submit"
              disabled={
                (retention || architecture) && (candidates.length === 0 || selectedIds.length === 0)
              }
              className={styles.primary}
            >
              {agentId === 'disaster-recovery'
                ? 'Preview tabletop result'
                : agentId === 'carbon-incident'
                  ? 'Preview scenario'
                  : 'Preview plan'}
            </button>
          </form>
          <p className={styles.liveStatus} role="status">
            {plan || carbon || recovery ? 'Preview ready. No changes were applied.' : ''}
          </p>
          {plan && (
            <section className={styles.result} aria-label="Draft plan preview">
              <h3>{plan.title}</h3>
              <span className={styles.badge}>Draft · not approved</span>
              <h4>Selected resources ({plan.resources.length})</h4>
              <ul>
                {plan.resources.map((resource) => (
                  <li key={resource.findingId}>
                    {resource.resourceId ?? 'Resource identifier unavailable'} —{' '}
                    <Link
                      href={href(
                        `/dashboard/review?finding=${encodeURIComponent(resource.findingId)}`,
                      )}
                    >
                      {resource.title}
                    </Link>
                  </li>
                ))}
              </ul>
              {plan.settings.map((setting) => (
                <p key={setting}>{setting}</p>
              ))}
              <h4>Proposed next steps</h4>
              <ol>
                {plan.steps.map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ol>
              <h4>Checks required before implementation</h4>
              <ul>
                {plan.requiredChecks.map((check) => (
                  <li key={check}>{check}</li>
                ))}
              </ul>
              <p className={styles.note}>{plan.disclaimer}</p>
            </section>
          )}
          {carbon && (
            <section className={styles.result} aria-label="Hypothetical carbon scenario">
              <h3>Hypothetical operational emissions</h3>
              <dl className={styles.resultsGrid}>
                <div>
                  <dt>Baseline estimate</dt>
                  <dd>{number(carbon.baselineKg)} kg CO₂e</dd>
                </div>
                <div>
                  <dt>Target estimate</dt>
                  <dd>{number(carbon.targetKg)} kg CO₂e</dd>
                </div>
                <div>
                  <dt>
                    {carbon.reductionKg < 0
                      ? 'Estimated increase'
                      : carbon.reductionKg > 0
                        ? 'Estimated reduction'
                        : 'Estimated change'}
                  </dt>
                  <dd>{number(Math.abs(carbon.reductionKg))} kg CO₂e</dd>
                </div>
              </dl>
              <p>
                Calculation: {number(carbon.energyKwh)} kWh × grid intensity ÷ 1,000. Energy is
                unchanged in this scenario. Hardware emissions, transfer overhead and agent overhead
                are excluded; this is not a verified net saving.
              </p>
              <h4>Human constraints to check</h4>
              <ul>
                <li>Confirm location-based factor sources and time period for equivalent work.</li>
                <li>
                  Obtain owner approval; check data residency, latency, availability and contractual
                  constraints.
                </li>
                <li>
                  Include transfer energy, temporary duplicate capacity and rollback in a real
                  migration assessment.
                </li>
              </ul>
              <p className={styles.note}>
                User-entered hypothetical scenario only. No workload was routed or rescheduled, and
                the result is not saved to the ledger.
              </p>
            </section>
          )}
          {recovery && (
            <section className={styles.result} aria-label="Hypothetical recovery tabletop result">
              <h3>Tabletop comparison — not a live drill</h3>
              <dl className={styles.resultsGrid}>
                <div>
                  <dt>Recovery-time target</dt>
                  <dd>
                    {recovery.meetsRecoveryTarget
                      ? 'Meets hypothetical target'
                      : 'Misses hypothetical target'}
                  </dd>
                  <small>
                    {number(recovery.recoveryMinutes)} min estimate / {number(recovery.rtoMinutes)}{' '}
                    min target
                  </small>
                </div>
                <div>
                  <dt>Data-loss target</dt>
                  <dd>
                    {recovery.meetsDataTarget
                      ? 'Meets hypothetical target'
                      : 'Misses hypothetical target'}
                  </dd>
                  <small>
                    {number(recovery.dataGapMinutes)} min estimate / {number(recovery.rpoMinutes)}{' '}
                    min target
                  </small>
                </div>
              </dl>
              <h4>Before an actual drill</h4>
              <ul>
                <li>
                  Get the service owner&apos;s approval and agree on a safe test scope and rollback.
                </li>
                <li>
                  Verify backups, restore access, dependency order, consistency and communication
                  responsibilities.
                </li>
                <li>
                  Measure recovery and data loss in an isolated drill; compare the evidence with
                  agreed RTO/RPO.
                </li>
              </ul>
              <p className={styles.note}>
                This checks entered estimates only. It does not prove an SLA, successful restoration
                or disaster-recovery readiness.
              </p>
            </section>
          )}
        </>
      )}
    </section>
  );
}
