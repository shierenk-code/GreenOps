'use client';

import { Fragment, useId, useState, type ReactNode } from 'react';
import {
  AlertTriangle,
  BadgeCheck,
  BookOpen,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  History,
  Info,
  ShieldCheck,
} from 'lucide-react';
import type { Finding } from './ledger-dashboard';
import { asRecord, entryFor, formatCarbon, formatMeasuredEnergy, text } from './dashboard-format';
import { summarizeRecommendationSources } from './recommendation-source';
import { buildManualGuide } from './dashboard-workflow';
import { buildFindingAudit, safeAuditText } from './dashboard-audit';
import styles from './dashboard.module.css';

export function FindingDetail({
  finding,
  decisionPanel,
}: {
  finding: Finding;
  decisionPanel?: ReactNode;
}) {
  const headingId = useId();
  const manualGuideId = useId();
  const [manualFinding, setManualFinding] = useState<string | null>(null);
  const manualOpen = manualFinding === finding.bugId;
  const investigation = entryFor(finding.entries, 'investigate');
  const comparison = entryFor(finding.entries, 'compare');
  const simulation = entryFor(finding.entries, 'simulate');
  const sources = summarizeRecommendationSources([finding]);
  const guide = buildManualGuide(finding);
  const audit = buildFindingAudit(finding);
  const savings = asRecord(simulation?.data.savings);
  const energyEstimate =
    typeof savings.energyKwh === 'number'
      ? formatMeasuredEnergy(savings.energyKwh)
      : 'Not recorded';
  const carbonEstimate =
    typeof savings.carbonKgCo2e === 'number' ? formatCarbon(savings.carbonKgCo2e) : 'Not recorded';
  const recordedStrategies = Array.isArray(comparison?.data.strategies)
    ? comparison.data.strategies.map(asRecord)
    : [];
  const recordedRecommendationId = text(comparison?.data.recommended, finding.recommendationId);
  const recommended = recordedStrategies.find(
    (strategy) => strategy.id === recordedRecommendationId,
  );
  const alternatives = recordedStrategies.filter(
    (strategy) =>
      strategy.id !== recordedRecommendationId &&
      typeof strategy.title === 'string' &&
      strategy.title.length > 0,
  );
  const recordedBlastRadius = investigation?.data.blastRadius;
  const blastRadius =
    typeof recordedBlastRadius === 'string' &&
    ['low', 'medium', 'high'].includes(recordedBlastRadius)
      ? recordedBlastRadius
      : 'Not recorded';
  const reversibility =
    typeof recommended?.reversible === 'boolean'
      ? recommended.reversible
        ? 'Reported reversible'
        : 'Reported irreversible'
      : 'Not recorded';

  return (
    <article className={styles.detailPanel} aria-labelledby={headingId}>
      <div className={styles.detailHeading}>
        <p className={styles.small}>Finding review</p>
        <h3 id={headingId}>{safeAuditText(finding.title, 'Sustainability finding')}</h3>
        <div className={styles.inline}>
          <SeverityBadge severity={finding.severity} />
          <StateBadge state={finding.state} />
          <RecommendationSourceBadge sources={sources} />
        </div>
        <p className={styles.muted}>
          {safeAuditText(finding.agentName, 'Agent not recorded')} ·{' '}
          {safeAuditText(finding.category.replaceAll('-', ' '), 'Category not recorded')}
        </p>
      </div>

      <section className={styles.detailSection} aria-label="Evidence">
        <div className={styles.detailSectionHeader}>
          <BookOpen size={18} aria-hidden="true" />
          <h4>Evidence</h4>
        </div>
        <p className={styles.muted}>
          Recorded observations behind this finding. Confirm the workload still matches these
          conditions before choosing a change.
        </p>
        {audit.evidence.length > 0 ? (
          <dl className={styles.evidenceList}>
            {audit.evidence.map((fact, index) => (
              <Fragment key={`${fact.label}-${index}`}>
                <dt>{fact.label}</dt>
                <dd>{fact.value}</dd>
              </Fragment>
            ))}
          </dl>
        ) : (
          <p className={styles.muted}>
            No structured resource observations were recorded. Ask the owner for supporting
            measurements before acting on this recommendation.
          </p>
        )}
      </section>

      <section className={styles.detailSection} aria-label="Recommended option">
        <div className={styles.detailSectionHeader}>
          <ClipboardCheck size={18} aria-hidden="true" />
          <h4>Recommended option</h4>
        </div>
        <div className={styles.recommendationOption}>
          <strong>{audit.recommendation.title}</strong>
          <p>{audit.recommendation.description}</p>
          <div className={styles.detailMeta}>
            {['trivial', 'small', 'moderate', 'large'].includes(finding.effort) && (
              <span className={styles.capitalize}>{finding.effort} effort</span>
            )}
            <span>Source: {audit.recommendation.source}</span>
          </div>
        </div>
        <h4>Other options considered</h4>
        {alternatives.length > 0 ? (
          <ul className={styles.alternativeList}>
            {alternatives.map((strategy, index) => (
              <li
                key={`${text(strategy.id, 'option')}-${index}`}
                className={styles.alternativeOption}
              >
                <strong>{safeAuditText(strategy.title, 'Recorded option')}</strong>
                <p>
                  {safeAuditText(
                    strategy.description,
                    'No description was recorded for this option.',
                  )}
                </p>
                <div className={styles.detailMeta}>
                  {typeof strategy.effort === 'string' &&
                    ['trivial', 'small', 'moderate', 'large'].includes(strategy.effort) && (
                      <span className={styles.capitalize}>{strategy.effort} effort</span>
                    )}
                  {strategy.reversible === true && <span>Reversible</span>}
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className={styles.muted}>
            No alternative options were recorded for this finding. Compare the trade-offs with your
            team before choosing a change.
          </p>
        )}
      </section>

      <section
        className={styles.detailSection}
        aria-label="Confidence, risks, and projected impact"
      >
        <div className={styles.detailSectionHeader}>
          <AlertTriangle size={18} aria-hidden="true" />
          <h4>Confidence and change risk</h4>
        </div>
        <div className={styles.detailFacts}>
          <SmallStat
            label="Evidence confidence"
            value={finding.confidence === 'unknown' ? 'Not recorded' : finding.confidence}
          />
          <SmallStat label="Recorded blast radius" value={blastRadius} />
          <SmallStat label="Reversibility" value={reversibility} />
        </div>
        <ul className={styles.checklist}>
          {guide.risks.map((risk) => (
            <li key={risk}>{risk}</li>
          ))}
        </ul>
        <div className={styles.projectedImpact}>
          <h4>Projected impact · unvalidated estimate</h4>
          <div className={styles.detailFacts}>
            <SmallStat label="Estimated energy opportunity" value={energyEstimate} />
            <SmallStat label="Estimated carbon opportunity" value={carbonEstimate} />
          </div>
          <p>
            These are the saved analysis estimates, not achieved savings. The calculation may
            include assumed workload repetitions or unused token allowance, and may overlap with
            other findings. Confirm the baseline, reporting period, and conversion assumptions
            before relying on this projection.
          </p>
        </div>
      </section>

      <section
        id="human-decision"
        className={styles.detailSection}
        aria-label="Decision and recorded result"
      >
        <div className={styles.detailSectionHeader}>
          <ShieldCheck size={18} aria-hidden="true" />
          <h4>Decision and recorded result</h4>
        </div>
        <div className={styles.auditStatusGrid}>
          <div>
            <p className={styles.small}>Approval gate</p>
            <strong>{audit.decision.label}</strong>
            <p>{audit.decision.detail}</p>
          </div>
          <div>
            <p className={styles.small}>Change application</p>
            <strong>{audit.application.label}</strong>
            <p>{audit.application.detail}</p>
          </div>
          <div id="verified-result">
            <p className={styles.small}>Verification</p>
            <strong>{audit.verification.label}</strong>
            <p>{audit.verification.detail}</p>
          </div>
        </div>
        <p className={styles.muted}>
          A policy decision is not human approval. The imported ledger does not establish an
          authenticated human decision. Obtain required approval through your team’s change process.
          An approval alone does not mean the change was applied or verified.
        </p>
        {decisionPanel}
      </section>

      <section className={styles.detailSection} aria-label="Implementation and verification steps">
        <div className={styles.detailSectionHeader}>
          <BadgeCheck size={18} aria-hidden="true" />
          <h4>Implementation and verification</h4>
        </div>
        <div className={styles.actionFooter}>
          <button
            type="button"
            className={styles.primaryButton}
            aria-expanded={manualOpen}
            aria-controls={manualGuideId}
            onClick={() => setManualFinding(manualOpen ? null : finding.bugId)}
          >
            {manualOpen ? 'Hide manual steps' : 'View manual steps'}
            <ChevronDown size={16} aria-hidden="true" />
          </button>
          <p className={styles.muted}>{guide.automaticApplyReason}</p>
        </div>
        <div id={manualGuideId} className={styles.manualGuide} hidden={!manualOpen}>
          <h4>How to make the change safely</h4>
          <ol className={styles.checklist}>
            {guide.implementationSteps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
          <h4>How to verify the result</h4>
          <ol className={styles.checklist}>
            {guide.verificationSteps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        </div>
      </section>

      <section className={styles.detailSection} aria-label="Activity history">
        <div className={styles.detailSectionHeader}>
          <History size={18} aria-hidden="true" />
          <h4>Activity history</h4>
        </div>
        <p className={styles.muted}>
          A structured record of what happened, not the model’s internal reasoning.
        </p>
        <ol className={styles.auditActivity}>
          {audit.activity.map((activity, index) => (
            <li key={`${activity.stage}-${index}`}>
              <strong>{activity.label}</strong>
              <p>{activity.detail}</p>
              <span className={styles.auditActivityMeta}>
                {activity.timestamp ? (
                  <time dateTime={activity.timestamp}>
                    {new Date(activity.timestamp).toLocaleString('en-GB', {
                      dateStyle: 'medium',
                      timeStyle: 'medium',
                      timeZone: 'UTC',
                    })}{' '}
                    UTC
                  </time>
                ) : (
                  'Time not recorded'
                )}
              </span>
            </li>
          ))}
        </ol>
        {audit.activity.length === 0 && <p>No activity was recorded for this finding.</p>}
      </section>
    </article>
  );
}

function RecommendationSourceBadge({
  sources,
}: {
  sources: ReturnType<typeof summarizeRecommendationSources>;
}) {
  const label =
    sources.generated > 0
      ? sources.fallback > 0 || sources.offline > 0
        ? 'AI-assisted + rule-based'
        : 'AI-assisted'
      : sources.fallback > 0 || sources.offline > 0
        ? 'Rule-based'
        : sources.unconfirmed > 0
          ? 'Source not confirmed'
          : 'Not analyzed';
  return <span className={`${styles.badge} ${styles.badgeNeutral}`}>{label}</span>;
}

export function ModelRunStatus({
  sources,
  findingCount,
}: {
  sources: ReturnType<typeof summarizeRecommendationSources>;
  findingCount: number;
}) {
  const providerLabels: Record<string, string> = {
    gemini: 'Gemini',
    openai: 'OpenAI',
    ollama: 'Ollama (local)',
    offline: 'Offline rules',
  };
  const attempted = sources.providers
    .filter((provider) => provider !== 'offline')
    .map((provider) => providerLabels[provider]);
  const modelLabel =
    sources.models.length > 0
      ? sources.models.join('; ')
      : attempted.length > 0
        ? `${attempted.join(', ')} · model not recorded`
        : sources.engine;

  return (
    <details className={styles.modelStatus} aria-label="Last recorded model result">
      <summary className={styles.modelSummary}>
        <strong>Technical evidence</strong>
        <RecommendationSourceBadge sources={sources} />
        <ChevronDown size={16} aria-hidden="true" />
      </summary>
      <div className={styles.modelDetails}>
        <p>{modelLabel}</p>
        <div className={styles.modelGrid}>
          <SmallStat
            label="Model-generated recommendations"
            value={`${sources.generated} of ${findingCount}`}
          />
          <SmallStat label="Rule-based fallbacks" value={sources.fallback.toLocaleString()} />
          <SmallStat label="Rule-based recommendations" value={sources.offline.toLocaleString()} />
          <SmallStat
            label="Reported analysis tokens"
            value={
              sources.missingTokenCounts > 0
                ? `Unknown total · ${sources.tokens.toLocaleString()} reported`
                : sources.tokens.toLocaleString()
            }
          />
          <SmallStat label="Unconfirmed source" value={sources.unconfirmed.toLocaleString()} />
          <SmallStat label="Not investigated" value={sources.notRun.toLocaleString()} />
        </div>
        <p>
          These are GreenOps analysis tokens, not workload savings.
          {sources.missingTokenCounts > 0
            ? ` Usage is missing for ${sources.missingTokenCounts} finding(s).`
            : ''}
          {sources.fallback > 0
            ? ' Failed requests may consume compute without reporting usage.'
            : ''}
        </p>
        {(sources.reasons.length > 0 || sources.unconfirmed > 0) && (
          <div className={styles.callout}>
            <strong>Why model recommendations may be missing</strong>
            {sources.reasons.length > 0 && (
              <ul>
                {sources.reasons.map(({ message, count }) => (
                  <li key={message}>
                    {count} finding(s): {message}
                  </li>
                ))}
              </ul>
            )}
            {sources.unconfirmed > 0 && (
              <p>
                Older entries do not confirm whether a model produced the recommendation. Run a new
                analysis to record complete provenance.
              </p>
            )}
            <p>
              Check provider configuration and service availability, then run a new CLI analysis and
              select <strong>Refresh results</strong>.
            </p>
          </div>
        )}
        <p className={styles.small}>
          Saved ledger evidence, not a live connection check. Loading a ledger does not retry
          inference, and changing an API key does not change an existing run.
        </p>
      </div>
    </details>
  );
}

export function Panel({
  id,
  title,
  subtitle,
  info,
  action,
  children,
}: {
  id?: string;
  title: string;
  subtitle: string;
  info?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  const headingId = useId();
  return (
    <section id={id} className={styles.panel} aria-labelledby={headingId}>
      <header className={styles.panelHeader}>
        <div>
          <div className={styles.inline}>
            <h2 id={headingId} className={styles.sectionTitle}>
              {title}
            </h2>
            {info && <InfoTip label={`About ${title}`} text={info} />}
          </div>
          <p className={styles.sectionSubtitle}>{subtitle}</p>
        </div>
        {action && <div className={styles.sectionAction}>{action}</div>}
      </header>
      <div className={styles.panelBody}>{children}</div>
    </section>
  );
}

export function InfoTip({ label, text: helpText }: { label: string; text: string }) {
  const id = useId();
  const [dismissed, setDismissed] = useState(false);
  return (
    <span className={styles.tooltip} onPointerEnter={() => setDismissed(false)}>
      <button
        type="button"
        className={styles.tooltipButton}
        aria-label={label}
        aria-describedby={dismissed ? undefined : id}
        onFocus={() => setDismissed(false)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') setDismissed(true);
        }}
      >
        <Info size={14} aria-hidden="true" />
      </button>
      {!dismissed && (
        <span id={id} role="tooltip" className={styles.tooltipContent}>
          {helpText}
        </span>
      )}
    </span>
  );
}

export function Metric({
  icon,
  label,
  value,
  detail,
  tone = 'neutral',
}: {
  icon: ReactNode;
  label: string;
  value: string;
  detail: string;
  tone?: 'neutral' | 'emerald' | 'amber';
}) {
  return (
    <div className={styles.metric} data-tone={tone}>
      <div className={styles.metricLabel}>
        <span aria-hidden="true">{icon}</span>
        {label}
      </div>
      <p className={styles.metricValue}>{value}</p>
      <p className={styles.metricDetail}>{detail}</p>
    </div>
  );
}

export function SmallStat({ label, value }: { label: string; value: string }) {
  return (
    <div className={styles.smallStat}>
      <p className={styles.smallStatLabel}>{label}</p>
      <p className={styles.smallStatValue}>{value}</p>
    </div>
  );
}

export function SeverityBadge({ severity }: { severity: string }) {
  const color =
    severity === 'critical' || severity === 'high'
      ? styles.badgeDanger
      : severity === 'medium'
        ? styles.badgeWarning
        : severity === 'low'
          ? styles.badgeInfo
          : styles.badgeNeutral;
  return <span className={`${styles.badge} ${styles.capitalize} ${color}`}>{severity}</span>;
}

export function StateBadge({ state }: { state: Finding['state'] }) {
  const labels: Record<Finding['state'], string> = {
    verified: 'Verified',
    unverified: 'Needs verification',
    withheld: 'Needs review',
    'not-applied': 'Manual action needed',
    'in-progress': 'Analysis incomplete',
    'review-only': 'Ready to review',
  };
  const color =
    state === 'verified'
      ? styles.badgeGood
      : state === 'unverified'
        ? styles.badgeWarning
        : styles.badgeNeutral;
  return <span className={`${styles.badge} ${color}`}>{labels[state]}</span>;
}

export function FindingTable({
  findings,
  selectedId,
  onSelect,
  compact = false,
}: {
  findings: Finding[];
  selectedId?: string;
  onSelect: (id: string) => void;
  compact?: boolean;
}) {
  const pageSize = 20;
  const [requestedPage, setPage] = useState(() => {
    const selectedIndex = findings.findIndex((finding) => finding.bugId === selectedId);
    return selectedIndex < 0 ? 0 : Math.floor(selectedIndex / pageSize);
  });
  const pageCount = Math.max(1, Math.ceil(findings.length / pageSize));
  const page = Math.min(requestedPage, pageCount - 1);
  const start = page * pageSize;
  const visibleFindings = findings.slice(start, start + pageSize);

  if (findings.length === 0) {
    return (
      <div className={styles.emptyState}>
        <h3>No matching findings</h3>
        <p>Change your search or clear the filters to see more results.</p>
      </div>
    );
  }

  return (
    <div>
      <div className={styles.tableWrap} tabIndex={0} role="region" aria-label="Findings table">
        <table className={styles.table} data-compact={compact}>
          <caption>Sustainability findings</caption>
          <thead>
            <tr>
              <th scope="col">Problem</th>
              <th scope="col">Recommended next step</th>
              <th scope="col">Priority</th>
              <th scope="col">Status</th>
              <th scope="col">Action</th>
            </tr>
          </thead>
          <tbody>
            {visibleFindings.map((finding) => (
              <tr
                key={finding.bugId}
                className={selectedId === finding.bugId ? styles.rowSelected : undefined}
              >
                <th scope="row" className={styles.tableTitle}>
                  {finding.title}
                  {!compact && <p className={styles.tableSecondary}>{finding.agentName}</p>}
                </th>
                <td className={styles.findingRecommendation}>
                  <strong>
                    {finding.recommendationTitle === 'Recommended code improvement'
                      ? finding.recommendation
                      : finding.recommendationTitle}
                  </strong>
                  <p className={styles.tableSecondary}>
                    {finding.confidence === 'unknown'
                      ? 'Confidence not recorded'
                      : `${finding.confidence} confidence`}
                    {finding.effort !== 'unknown' ? ` · ${finding.effort} effort` : ''}
                  </p>
                </td>
                <td>
                  <SeverityBadge severity={finding.severity} />
                </td>
                <td>
                  <StateBadge state={finding.state} />
                </td>
                <td>
                  <button
                    type="button"
                    className={styles.button}
                    aria-label={`Review ${finding.title}`}
                    aria-current={selectedId === finding.bugId ? 'true' : undefined}
                    onClick={() => onSelect(finding.bugId)}
                  >
                    Review
                    <ChevronRight size={15} aria-hidden="true" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {findings.length > pageSize && (
        <div className={styles.pagination}>
          <p aria-live="polite">
            {start + 1}–{Math.min(start + pageSize, findings.length)} of {findings.length} findings
          </p>
          <div className={styles.inline}>
            <button
              type="button"
              className={styles.button}
              aria-label="Previous page"
              disabled={page === 0}
              onClick={() => setPage(page - 1)}
            >
              <ChevronLeft size={16} aria-hidden="true" /> Previous
            </button>
            <span className={styles.small}>
              Page {page + 1} of {pageCount}
            </span>
            <button
              type="button"
              className={styles.button}
              aria-label="Next page"
              disabled={page === pageCount - 1}
              onClick={() => setPage(page + 1)}
            >
              Next <ChevronRight size={16} aria-hidden="true" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
