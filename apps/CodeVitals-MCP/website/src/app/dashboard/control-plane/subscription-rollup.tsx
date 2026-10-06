import { Activity, ArrowRight, CircleCheck, Gauge, Users } from 'lucide-react';
import type { BaselineRollup, RollupAmount } from '../baseline-rollup';
import styles from './subscription-rollup.module.css';

const number = (value: number, digits = 2) =>
  value.toLocaleString('en-US', { maximumFractionDigits: digits });

const amount = (value: number | null, unit: string) =>
  value === null ? 'Not recorded' : `${number(value)} ${unit}`;

const percentage = (value: number | null) =>
  value === null ? 'Not established' : `${number(value, 1)}%`;

const scoreWidth = (points: number, maximum: number) => {
  if (!Number.isFinite(points) || !Number.isFinite(maximum) || maximum <= 0) return '0%';
  return `${Math.max(0, Math.min(100, (points / maximum) * 100))}%`;
};

const period = (value: BaselineRollup['period']) => {
  const start = new Date(value.start);
  const end = new Date(value.end);
  if (!Number.isFinite(start.valueOf()) || !Number.isFinite(end.valueOf())) return 'Recorded period';
  return `${start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${end.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
};

function evidenceLabel(rollup: BaselineRollup) {
  const source = rollup.provenance === 'synthetic' ? 'Synthetic baseline' : `${rollup.provenance} baseline`;
  return `${source} · ${rollup.evidenceKind} evidence`;
}

function result(rollup: BaselineRollup) {
  const opportunity = rollup.identifiedSaving.energyKwh;
  const footprint = rollup.agentFootprint.energyKwh;
  if (!rollup.agentFootprint.usageComplete || opportunity === null || footprint === null)
    return {
      heading: 'Not established',
      detail: 'A complete analysis-footprint record is needed before this comparison can be made.',
      tone: 'unknown' as const,
    };
  if (opportunity > footprint)
    return {
      heading: 'Potential benefit exceeds analysis energy',
      detail: 'This compares modeled opportunity with GreenOps’ estimated analysis footprint; it is not a verified saving.',
      tone: 'positive' as const,
    };
  return {
    heading: 'Potential benefit does not exceed analysis energy',
    detail: 'This run needs a stronger modeled opportunity or lower analysis energy; it is not a verified saving.',
    tone: 'unknown' as const,
  };
}

function CarbonAmount({ value }: { value: RollupAmount }) {
  return (
    <>
      <strong>{amount(value.kgCo2e, 'kg CO₂e')}</strong>
      <span>{amount(value.energyKwh, 'kWh')}</span>
    </>
  );
}

export function SubscriptionRollup({ rollup }: { rollup: BaselineRollup | null | undefined }) {
  if (!rollup) {
    return (
      <section className={styles.unavailable} aria-label="Subscription baseline rollup">
        <Activity size={19} aria-hidden="true" />
        <div>
          <strong>Subscription baseline not available</strong>
          <p>
            Load a recorded Azure baseline run to compare modeled opportunity with GreenOps’ own
            analysis footprint.
          </p>
        </div>
      </section>
    );
  }

  const comparison = result(rollup);
  return (
    <section className={styles.rollup} aria-labelledby="subscription-rollup-title">
      <header className={styles.header}>
        <div>
          <span>SUBSCRIPTION BASELINE / {evidenceLabel(rollup).toUpperCase()}</span>
          <h2 id="subscription-rollup-title">Is GreenOps saving more than it consumes?</h2>
          <p>
            {rollup.organization} · {rollup.subscriptionId} · {period(rollup.period)}
          </p>
        </div>
        <span className={styles.modeled}>Modeled opportunity · not verified</span>
      </header>

      <div className={styles.heroGrid}>
        <section className={`${styles.answer} ${comparison.tone === 'positive' ? styles.positive : ''}`}>
          <span className={styles.answerIcon}>
            <CircleCheck size={22} aria-hidden="true" />
          </span>
          <div>
            <p>ANSWER FOR THIS RUN</p>
            <h3>{comparison.heading}</h3>
            <span>{comparison.detail}</span>
          </div>
        </section>
        <dl className={styles.comparison}>
          <div>
            <dt>Modeled opportunity</dt>
            <dd>
              <CarbonAmount value={rollup.identifiedSaving} />
            </dd>
          </div>
          <ArrowRight size={18} aria-hidden="true" />
          <div>
            <dt>GreenOps analysis footprint</dt>
            <dd>
              <CarbonAmount
                value={{
                  energyKwh: rollup.agentFootprint.energyKwh,
                  kgCo2e: rollup.agentFootprint.kgCo2e,
                  operationalKgCo2e: null,
                }}
              />
            </dd>
          </div>
        </dl>
        <dl className={styles.stats}>
          <div>
            <dt>Modeled reduction share</dt>
            <dd>{percentage(rollup.savingSharePct)}</dd>
          </div>
          <div>
            <dt>Break-even</dt>
            <dd>{rollup.breakEven.minutes === null ? 'Not established' : `${number(rollup.breakEven.minutes, 1)} min`}</dd>
          </div>
        </dl>
      </div>

      <div className={styles.detailsGrid}>
        <section className={styles.maturity} aria-labelledby="maturity-title">
          <header>
            <Gauge size={19} aria-hidden="true" />
            <div>
              <h3 id="maturity-title">Sustainability maturity</h3>
              <p>Evidence and control readiness, scored from the recorded baseline.</p>
            </div>
          </header>
          <div className={styles.grades}>
            <div>
              <span>Current</span>
              <strong>{rollup.maturity.current.grade}</strong>
              <small>{number(rollup.maturity.current.score, 1)} / 100</small>
            </div>
            <ArrowRight size={18} aria-hidden="true" />
            <div>
              <span>Potential after all findings</span>
              <strong>{rollup.maturity.projected.grade}</strong>
              <small>{number(rollup.maturity.projected.score, 1)} / 100</small>
            </div>
          </div>
          <ul>
            {rollup.maturity.current.criteria.map((criterion) => {
              const projected = rollup.maturity.projected.criteria.find(
                (candidate) => candidate.id === criterion.id,
              );
              return (
                <li key={criterion.id}>
                  <div>
                    <strong>{criterion.label}</strong>
                    <span>
                      {number(criterion.points, 1)} / {number(criterion.max, 1)} now
                      {projected ? ` · ${number(projected.points, 1)} potential` : ''}
                    </span>
                  </div>
                  <div className={styles.bar} aria-label={`${criterion.label}: ${criterion.detail}`}>
                    <i style={{ width: scoreWidth(criterion.points, criterion.max) }} />
                    {projected && (
                      <b style={{ width: scoreWidth(projected.points, projected.max) }} />
                    )}
                  </div>
                  <p>{criterion.detail}</p>
                </li>
              );
            })}
          </ul>
        </section>

        <section className={styles.team} aria-labelledby="team-scorecard-title">
          <header>
            <Users size={19} aria-hidden="true" />
            <div>
              <h3 id="team-scorecard-title">Team scorecard</h3>
              <p>Modeled baseline and opportunity by responsible team.</p>
            </div>
          </header>
          <div className={styles.tableWrap}>
            <table>
              <thead>
                <tr>
                  <th>Team</th>
                  <th>Baseline</th>
                  <th>Opportunity</th>
                  <th>Findings</th>
                </tr>
              </thead>
              <tbody>
                {rollup.byTeam.map((team) => (
                  <tr key={team.team}>
                    <th>{team.team}</th>
                    <td>{amount(team.current.kgCo2e, 'kg CO₂e')}</td>
                    <td>{amount(team.saving.kgCo2e, 'kg CO₂e')}</td>
                    <td>{team.findings}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      <footer>
        <p>{rollup.method}</p>
        {rollup.gaps.length > 0 && <p>Gaps: {rollup.gaps.slice(0, 2).join(' ')}</p>}
      </footer>
    </section>
  );
}
