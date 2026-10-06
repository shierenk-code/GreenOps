import type { Opportunity } from './types';
import styles from './workspace-pages.module.css';

/** Only compare compatible, explicitly recorded numeric facts on a shared scale. */
export function evidenceComparison(item: Opportunity) {
  const definitions = [
    {
      labels: ['Requested CPU cores', 'Observed CPU cores'],
      title: 'CPU request vs observed use',
      unit: 'cores',
    },
    {
      labels: ['Recorded energy (kWh)', 'Baseline energy (kWh)'],
      title: 'Recorded energy vs baseline',
      unit: 'kWh',
    },
  ];
  for (const definition of definitions) {
    const values = definition.labels.map(
      (label) => item.evidence.find((fact) => fact.label === label)?.value,
    );
    if (!values.every((value) => value !== undefined && /^\d+(\.\d+)?$/.test(value.trim())))
      continue;
    const numbers = values.map((value) => Number(value));
    if (!numbers.every((value) => Number.isFinite(value) && value >= 0)) continue;
    return { ...definition, values: numbers };
  }
  return null;
}
export function EvidenceComparison({ item }: { item: Opportunity }) {
  const comparison = evidenceComparison(item);
  if (!comparison) return null;
  const max = Math.max(...comparison.values, 1);
  return (
    <figure className={styles.comparison} aria-label={comparison.title}>
      <figcaption>{comparison.title}</figcaption>
      {comparison.labels.map((label, index) => (
        <div key={label}>
          <span>{label}</span>
          <div className={styles.barTrack} aria-hidden="true">
            <i style={{ width: `${(comparison.values[index] / max) * 100}%` }} />
          </div>
          <strong>
            {comparison.values[index]} {comparison.unit}
          </strong>
        </div>
      ))}
      <p>Selected finding evidence · not a savings measurement</p>
    </figure>
  );
}
