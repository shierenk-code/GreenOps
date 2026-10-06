'use client';

import { useState } from 'react';
import styles from './workspace-pages.module.css';

type Resource = {
  name: string;
  region: string;
  cores: string;
  needed: string;
  intensity: string;
  autoscale: string;
};
const empty = (): Resource => ({
  name: '',
  region: '',
  cores: '',
  needed: '',
  intensity: '',
  autoscale: 'unknown',
});
export function assessResource(resource: Resource): string[] {
  const messages: string[] = [];
  const number = (value: string) => (value.trim() === '' ? null : Number(value));
  const cores = number(resource.cores),
    needed = number(resource.needed),
    intensity = number(resource.intensity);
  if (
    [cores, needed, intensity].some(
      (value) => value !== null && (!Number.isFinite(value) || value < 0),
    )
  )
    throw new Error('Use non-negative numbers or leave unknown values blank.');
  if (cores !== null && cores > 0 && resource.autoscale === 'false')
    messages.push(
      'Review autoscaling: fixed capacity may remain allocated during quiet periods. Check workload constraints and external scaling controllers before changing it.',
    );
  if (cores !== null && needed !== null && needed > 0 && cores >= needed * 2)
    messages.push(
      `Review sizing: ${cores} allocated cores versus ${needed} required cores. Validate peak demand and performance before downsizing.`,
    );
  if (intensity !== null && intensity >= 0.4)
    messages.push(
      'Review region choice: supplied grid intensity is at least 0.4 kg CO₂e/kWh. Compare permitted destinations, residency, latency and transfer costs before moving.',
    );
  if (cores === null || needed === null || intensity === null || resource.autoscale === 'unknown')
    messages.push(
      'Evidence incomplete: unknown fields were not treated as zero. Supply measurements to assess the remaining checks.',
    );
  if (!messages.length)
    messages.push(
      'No supported issue detected from these inputs. This is not a comprehensive architecture or security assessment.',
    );
  return messages;
}

export function ArchitectureReview() {
  const [resources, setResources] = useState<Resource[]>([empty()]);
  const [results, setResults] = useState<{ name: string; messages: string[] }[] | null>(null);
  const [error, setError] = useState('');
  function update(index: number, field: keyof Resource, value: string) {
    setResources((rows) => rows.map((row, i) => (i === index ? { ...row, [field]: value } : row)));
    setResults(null);
    setError('');
  }
  return (
    <section aria-label="Review resource configuration">
      <h3>Review your resource configuration</h3>
      <p>
        Add your resources below—no terminal or JSON download needed. Only use public, synthetic or
        permitted non-sensitive data. These three rule-based checks run in your browser; nothing is
        sent to Gemini or saved to your account.
      </p>
      <p>
        Unknown values can stay blank. Images, PDFs and whole-system architecture interpretation are
        not supported by this form.
      </p>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          try {
            setResults(
              resources.map((row) => ({ name: row.name.trim(), messages: assessResource(row) })),
            );
            setError('');
          } catch (error) {
            setResults(null);
            setError(error instanceof Error ? error.message : 'Check your inputs.');
          }
        }}
      >
        {resources.map((row, index) => (
          <fieldset key={index} className={styles.card}>
            <legend>Resource {index + 1}</legend>
            <div className={styles.filters}>
              <label>
                Resource name{' '}
                <input
                  required
                  maxLength={200}
                  value={row.name}
                  onChange={(event) => update(index, 'name', event.target.value)}
                />
              </label>
              <label>
                Region{' '}
                <input
                  maxLength={200}
                  value={row.region}
                  placeholder="Unknown"
                  onChange={(event) => update(index, 'region', event.target.value)}
                />
              </label>
              <label>
                Allocated CPU cores{' '}
                <input
                  type="number"
                  min="0"
                  max="100000"
                  step="any"
                  value={row.cores}
                  onChange={(event) => update(index, 'cores', event.target.value)}
                />
              </label>
              <label>
                Required CPU cores{' '}
                <input
                  type="number"
                  min="0"
                  max="100000"
                  step="any"
                  value={row.needed}
                  onChange={(event) => update(index, 'needed', event.target.value)}
                />
              </label>
              <label>
                Grid intensity (kg CO₂e/kWh){' '}
                <input
                  type="number"
                  min="0"
                  max="10"
                  step="any"
                  value={row.intensity}
                  onChange={(event) => update(index, 'intensity', event.target.value)}
                />
              </label>
              <label>
                Autoscaling{' '}
                <select
                  value={row.autoscale}
                  onChange={(event) => update(index, 'autoscale', event.target.value)}
                >
                  <option value="unknown">Unknown</option>
                  <option value="true">Enabled</option>
                  <option value="false">Disabled</option>
                </select>
              </label>
            </div>
            {resources.length > 1 && (
              <button
                type="button"
                onClick={() => {
                  setResources((rows) => rows.filter((_, i) => i !== index));
                  setResults(null);
                }}
              >
                Remove resource {index + 1}
              </button>
            )}
          </fieldset>
        ))}
        <button
          type="button"
          className={styles.textButton}
          disabled={resources.length >= 50}
          onClick={() => {
            setResources((rows) => [...rows, empty()]);
            setResults(null);
          }}
        >
          Add resource
        </button>{' '}
        <button type="submit" className={styles.button}>
          Review configuration
        </button>
      </form>
      {error && <p role="alert">{error}</p>}
      {results && (
        <section aria-label="Configuration review results" aria-live="polite">
          <h3>Your review results</h3>
          <p>
            Based only on the inputs above. No changes applied and no carbon savings verified.
            Results are temporary and separate from the selected dashboard run.
          </p>
          {results.map((result, index) => (
            <article className={styles.card} key={index}>
              <h4>{result.name}</h4>
              <ul>
                {result.messages.map((message) => (
                  <li key={message}>{message}</li>
                ))}
              </ul>
            </article>
          ))}
        </section>
      )}
    </section>
  );
}
