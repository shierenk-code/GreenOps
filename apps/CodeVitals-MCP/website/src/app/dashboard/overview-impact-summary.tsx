import Link from 'next/link';
import { ArrowRight, CheckCircle2, Gauge, Leaf, ClipboardCheck } from 'lucide-react';
import type { Finding } from './ledger-dashboard';
import type { SelectedRun } from './ledger-data';
import { withRecordedRun } from './dashboard-run';
import { buildImpactSummary } from './impact-summary-data';
import styles from './overview-impact-summary.module.css';

export interface OverviewImpactSummaryProps {
  run: SelectedRun | null;
  findings: Finding[];
  /** Omit until the local approval inbox has loaded for this recorded run. */
  pendingReviews?: number;
}

function displayNumber(value: number): string {
  return value > 0 && value < 0.001
    ? value.toExponential(2)
    : value.toLocaleString('en-US', { maximumFractionDigits: 3 });
}

export function OverviewImpactSummary({
  run,
  findings,
  pendingReviews,
}: OverviewImpactSummaryProps) {
  const model = buildImpactSummary(findings, run, pendingReviews);
  const usage = model.agentUsage;
  const href = (path: string) => withRecordedRun(path, run?.runId);
  const tokenHeadline =
    usage.totalTokens !== null
      ? displayNumber(usage.totalTokens)
      : usage.knownTokens !== null && usage.knownTokens > 0
        ? `${displayNumber(usage.knownTokens)} reported`
        : 'Not established';
  const tokenState =
    usage.completeness === 'complete'
      ? 'Complete recorded usage'
      : usage.completeness === 'partial'
        ? 'Partial usage'
        : usage.completeness === 'legacy-unconfirmed'
          ? 'Completeness unknown'
          : 'No usage record';
  return (
    <section className={styles.summary} aria-labelledby="overview-impact-title">
      <div className={styles.hero}>
        <header className={styles.header}>
          <span className={styles.eyebrow}>
            <Leaf size={13} aria-hidden="true" /> Impact overview
          </span>
          <h2 id="overview-impact-title">From findings to verified impact</h2>
          <p>Review what your agents found, choose the next change, and track the result.</p>
          <Link className={styles.primaryAction} href={href('/dashboard/approvals')}>
            {model.pendingReviews !== null && model.pendingReviews > 0
              ? 'Review recommendations'
              : 'Open approval inbox'}
            <ArrowRight size={16} aria-hidden="true" />
          </Link>
        </header>
        <div className={styles.cards}>
          <article className={`${styles.card} ${styles.reviewCard}`}>
            <div className={styles.cardLabel}>
              <h3>Pending reviews</h3>
              <span className={styles.icon}>
                <ClipboardCheck size={17} aria-hidden="true" />
              </span>
            </div>
            <strong className={model.pendingReviews === null ? styles.textValue : styles.value}>
              {model.pendingReviews === null ? 'Unavailable' : displayNumber(model.pendingReviews)}
            </strong>
            <p>
              {model.pendingReviews === null
                ? 'Open the inbox to check review status.'
                : model.pendingReviews === 0
                  ? 'No pending local reviews'
                  : `${model.pendingReviews} pending local review${model.pendingReviews === 1 ? '' : 's'}`}
            </p>
          </article>
          <article className={`${styles.card} ${styles.verifiedCard}`}>
            <div className={styles.cardLabel}>
              <h3>Verified changes</h3>
              <span className={styles.icon}>
                <CheckCircle2 size={17} aria-hidden="true" />
              </span>
            </div>
            <strong className={styles.value}>{model.verifiedChanges}</strong>
            <p>{model.appliedChanges} applied · follow-up checks confirmed</p>
            <Link href={href('/dashboard/improvements')}>
              Review evidence <ArrowRight size={13} aria-hidden="true" />
            </Link>
          </article>
          <article className={`${styles.card} ${styles.usageCard}`}>
            <div className={styles.cardLabel}>
              <h3>Agent analysis tokens</h3>
              <span className={styles.icon}>
                <Gauge size={17} aria-hidden="true" />
              </span>
            </div>
            <strong
              className={tokenHeadline === 'Not established' ? styles.textValue : styles.value}
            >
              {tokenHeadline}
            </strong>
            <span className={styles.badge}>{tokenState}</span>
            <p>Analysis usage, not tokens saved.</p>
          </article>
          <article className={`${styles.card} ${styles.netCard}`}>
            <div className={styles.cardLabel}>
              <h3>Net carbon benefit</h3>
              <span className={styles.icon}>
                <Leaf size={17} aria-hidden="true" />
              </span>
            </div>
            <strong className={styles.textValue}>Not established</strong>
            <p>Comparable before-and-after measurements needed.</p>
            <Link href={href('/dashboard/measurement')}>
              Complete measurement <ArrowRight size={13} aria-hidden="true" />
            </Link>
          </article>
        </div>
      </div>
      <details className={styles.details}>
        <summary>Measurement basis and gaps</summary>
        <div className={styles.detailBody}>
          <div>
            <h3>Recorded agent activity</h3>
            <p>GreenOps usage, separate from the workload’s token savings.</p>
            <p>{usage.explanation}</p>
            <dl className={styles.activity}>
              <div>
                <dt>Model requests</dt>
                <dd>{usage.llmCalls === null ? 'Not recorded' : displayNumber(usage.llmCalls)}</dd>
              </div>
              <div>
                <dt>Requests with unknown token usage</dt>
                <dd>
                  {usage.unknownLlmCalls === null
                    ? 'Not recorded'
                    : displayNumber(usage.unknownLlmCalls)}
                </dd>
              </div>
              <div>
                <dt>Tool calls</dt>
                <dd>
                  {usage.toolCalls === null ? 'Not recorded' : displayNumber(usage.toolCalls)}
                </dd>
              </div>
              <div>
                <dt>Retries</dt>
                <dd>{usage.retries === null ? 'Not recorded' : displayNumber(usage.retries)}</dd>
              </div>
            </dl>
            {model.recordedEstimates.length > 0 && (
              <>
                <h3>Recorded estimates · not metered</h3>
                <dl className={styles.activity}>
                  {model.recordedEstimates.map((estimate) => (
                    <div key={estimate.id}>
                      <dt>{estimate.label}</dt>
                      <dd>
                        {displayNumber(estimate.value)} {estimate.unit}
                      </dd>
                    </div>
                  ))}
                </dl>
                <p>
                  These are recorded model-based estimates, not a complete measured footprint. The
                  calculation inputs are not included in this outcome summary. They do not establish
                  net savings or an SCI score.
                </p>
              </>
            )}
          </div>
          <div>
            <h3>Needed to establish a carbon benefit</h3>
            <p>{model.netCarbonBenefit.explanation}</p>
            <ul>
              {model.measurementGaps.map((gap) => (
                <li key={gap}>{gap}</li>
              ))}
            </ul>
          </div>
        </div>
      </details>
      <footer className={styles.footer}>
        <Link href={href('/dashboard/reports')}>
          View impact report
          <ArrowRight size={14} aria-hidden="true" />
        </Link>
        <Link href="/dashboard/ai-efficiency-demo">
          Try the improvement demo <ArrowRight size={14} aria-hidden="true" />
        </Link>
      </footer>
    </section>
  );
}

export default OverviewImpactSummary;
