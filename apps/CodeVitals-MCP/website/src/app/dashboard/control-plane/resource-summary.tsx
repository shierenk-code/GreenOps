import type { ControlPlaneData } from './types';
import { resourcesFor } from './run-evidence';
import styles from './resource-summary.module.css';

export function ResourceSummary({ data }: { data: ControlPlaneData }) {
  const usage =
    data.mode === 'sample' ? resourcesFor(null) : (data.resourceUsage ?? resourcesFor(null));
  return (
    <section className={styles.summary} aria-label="Resources used by GreenOps">
      <header>
        <div>
          <h3>Resources used by GreenOps</h3>
          <p>Analysis overhead — separate from workload savings</p>
        </div>
        <span>
          {data.mode === 'sample' ? 'Sample mode · no analysis executed' : usage.completeness}
        </span>
      </header>
      <dl className={styles.metrics}>
        {usage.metrics.map((metric) => (
          <div key={metric.label}>
            <dt>{metric.label}</dt>
            <dd>{metric.value}</dd>
          </div>
        ))}
      </dl>
      <details>
        <summary>Usage details & measurement limits</summary>
        <p>{usage.explanation}</p>
        <dl className={styles.details}>
          {usage.metrics.map((metric) => (
            <div key={metric.label}>
              <dt>{metric.label}</dt>
              <dd>{metric.hint}</dd>
            </div>
          ))}
          {usage.details.map((fact) => (
            <div key={fact.label}>
              <dt>{fact.label}</dt>
              <dd>{fact.value}</dd>
            </div>
          ))}
        </dl>
      </details>
    </section>
  );
}
