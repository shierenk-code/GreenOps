'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Activity, Globe2, Bot } from 'lucide-react';
import { cloudFetch, useCloud } from '../../cloud-client';
import type { GridPoint } from '../../../server/live-data';
import styles from './live-workspace.module.css';

type Sample = {
  sessionId: string;
  project: string;
  receivedAt: string;
  cpuPercent: number | null;
  memoryUsedBytes: number;
  memoryTotalBytes: number;
  cpuCores: number;
  platform: string;
  processRssBytes: number;
};
const percent = (n: number | null) => (n === null ? 'Warming up' : `${n.toFixed(1)}%`);
function Trend({ samples, memory = false }: { samples: Sample[]; memory?: boolean }) {
  const values = samples.map((s) =>
    memory ? (100 * s.memoryUsedBytes) / Math.max(1, s.memoryTotalBytes) : s.cpuPercent,
  );
  return (
    <svg
      viewBox="0 0 600 110"
      role="img"
      aria-label={`${memory ? 'Memory' : 'CPU'} utilization, zero to one hundred percent`}
    >
      {[0, 50, 100].map((n) => (
        <g key={n}>
          <line x1="28" x2="598" y1={102 - n * 0.9} y2={102 - n * 0.9} stroke="#ddd" />
          <text x="0" y={106 - n * 0.9} fontSize="10" fill="currentColor">
            {n}
          </text>
        </g>
      ))}
      {values.map((n, i) =>
        n === null ? null : (
          <circle
            key={i}
            cx={30 + (i * 560) / Math.max(1, values.length - 1)}
            cy={102 - n * 0.9}
            r="2.5"
            fill={memory ? '#53744d' : '#ff531f'}
          />
        ),
      )}
      {values
        .slice(1)
        .map((n, i) =>
          n === null || values[i] === null ? null : (
            <line
              key={i}
              x1={30 + (i * 560) / Math.max(1, values.length - 1)}
              y1={102 - values[i]! * 0.9}
              x2={30 + ((i + 1) * 560) / Math.max(1, values.length - 1)}
              y2={102 - n * 0.9}
              stroke={memory ? '#53744d' : '#ff531f'}
              strokeWidth="2"
            />
          ),
        )}
    </svg>
  );
}
export function LiveWorkspace() {
  const cloud = useCloud();
  const [samples, setSamples] = useState<Sample[]>([]);
  const [points, setPoints] = useState<GridPoint[]>([]);
  const [device, setDevice] = useState('');
  const [region, setRegion] = useState('local');
  const [error, setError] = useState('');
  const [assessment, setAssessment] = useState('');
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(0);
  useEffect(() => {
    if (!cloud) return;
    let active = true,
      pending = false;
    async function refresh() {
      if (pending || document.hidden) return;
      pending = true;
      try {
        const responses = await Promise.all([cloudFetch('telemetry'), cloudFetch('grid')]);
        const [t, g] = await Promise.all(responses.map((r) => r.json()));
        if (!responses[0].ok || !responses[1].ok)
          throw new Error(t.error || g.error || 'Live sources unavailable');
        if (active) {
          setSamples(t.samples);
          setPoints(g.points);
          setNow(Date.now());
          setError('');
        }
      } catch (e) {
        if (active) {
          setError(e instanceof Error ? e.message : 'Live sources unavailable');
          setNow(Date.now());
        }
      } finally {
        pending = false;
      }
    }
    void refresh();
    const timer = setInterval(() => void refresh(), 10000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [cloud]);
  if (!cloud) return null;
  const devices = [...new Set(samples.map((s) => s.sessionId))];
  const selectedDevice = devices.includes(device) ? device : samples.at(-1)?.sessionId;
  const history = samples.filter((s) => s.sessionId === selectedDevice).slice(-120);
  const last = history.at(-1);
  const live = last && now - Date.parse(last.receivedAt) < 30000 && !error;
  const selected = points.find((p) => p.id === region) || points[0];
  async function explain() {
    if (busy) return;
    if (!last || Date.now() - Date.parse(last.receivedAt) >= 120000 || error) {
      setAssessment(
        'No recent computer readings are available. Run pnpm.cmd greenops monitor from your linked GreenOps repository and leave that terminal running. To test Gemini with synthetic data instead, open the AI Efficiency demo below.',
      );
      return;
    }
    setBusy(true);
    setAssessment('');
    try {
      const response = await cloudFetch('telemetry/explain', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: selectedDevice }),
      });
      const result = await response.json();
      setAssessment(
        response.ok
          ? `${result.model} · ${new Date(result.generatedAt).toLocaleTimeString()}\n${result.explanation}`
          : result.error || 'Gemini could not complete the assessment. Please try again.',
      );
    } catch {
      setAssessment('Assessment unavailable. Retry shortly.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className={styles.panel} aria-label="Live connected sources">
      <header>
        <div>
          <p>
            <Activity size={16} /> CONNECTED SOURCES
          </p>
          <h2>Your system, in the picture.</h2>
        </div>
        <span className={live ? styles.live : ''}>
          {live ? '● Receiving local telemetry' : '○ Awaiting local telemetry'}
        </span>
      </header>
      {error && <p role="alert">{error}</p>}
      <div className={styles.columns}>
        <div className={styles.metrics}>
          <label>
            Connected computer{' '}
            <select value={selectedDevice || ''} onChange={(e) => setDevice(e.target.value)}>
              {!devices.length && <option value="">No samples yet</option>}
              {devices.map((id, i) => (
                <option key={id} value={id}>
                  Terminal {i + 1} · {samples.find((s) => s.sessionId === id)?.platform}
                </option>
              ))}
            </select>
          </label>
          {last ? (
            <>
              <p>
                {last.project} · {last.cpuCores} cores · last received{' '}
                {new Date(last.receivedAt).toLocaleTimeString()}
              </p>
              <div className={styles.stats}>
                <div>
                  CPU utilization<strong>{percent(last.cpuPercent)}</strong>
                </div>
                <div>
                  Memory in use
                  <strong>
                    {(last.memoryUsedBytes / 2 ** 30).toFixed(1)} /{' '}
                    {(last.memoryTotalBytes / 2 ** 30).toFixed(1)} GiB
                  </strong>
                </div>
              </div>
              <h3>CPU · % of all cores</h3>
              <Trend samples={history} />
              <h3>Memory · % used</h3>
              <Trend samples={history} memory />
              <small>
                {new Date(history[0].receivedAt).toLocaleTimeString()} —{' '}
                {new Date(last.receivedAt).toLocaleTimeString()} · OS counters; memory includes
                caches. GreenOps process RSS: {(last.processRssBytes / 2 ** 20).toFixed(0)} MiB.
              </small>
            </>
          ) : (
            <p>
              Run <code>greenops monitor</code> from a linked repository to stream system counters.
              Reviews also collect counters while running.
            </p>
          )}
          <p>
            CPU and memory do not measure electricity or emissions. A power meter or supported
            hardware sensor is needed for measured energy.
          </p>
          <button disabled={busy} aria-describedby="gemini-live-help" onClick={() => void explain()}>
            <Bot size={16} />
            {busy ? 'Gemini is assessing…' : 'Assess live readings with Gemini'}
          </button>
          <small id="gemini-live-help">
            {!live
              ? 'Waiting for fresh computer readings. Saved Azure mock findings do not provide live computer readings. Run pnpm.cmd greenops monitor in your linked repository and keep the terminal open.'
              : 'Sends recent utilization counters and public grid values to your configured Gemini model.'}
          </small>
          <p>
            <Link href="/dashboard/ai-efficiency-demo">Test Gemini with synthetic data →</Link>
          </p>
          {assessment && (
            <div className={styles.assessment} role="status">
              {assessment}
            </div>
          )}
        </div>
        <div>
          <p>
            <Globe2 size={16} /> PUBLIC GRID & CONFIGURED LOCATION
          </p>
          <div className={styles.map} role="group" aria-label="Public grid map">
            <div className={styles.land} />
            {points.map((p) => (
              <button
                className={styles.marker}
                key={p.id}
                style={{
                  left: `${((p.lon + 180) / 360) * 100}%`,
                  top: `${((90 - p.lat) / 180) * 100}%`,
                }}
                aria-label={p.name}
                aria-pressed={p.id === selected?.id}
                onClick={() => setRegion(p.id)}
              >
                ●
              </button>
            ))}
          </div>
          <label>
            Region{' '}
            <select value={selected?.id || ''} onChange={(e) => setRegion(e.target.value)}>
              {points.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          {selected && (
            <>
              <h3>{selected.name}</h3>
              <strong className={styles.intensity}>
                {selected.intensity === null ? 'Unavailable' : selected.intensity.toFixed(0)}
              </strong>
              <p>g CO₂e / kWh · {selected.status}</p>
              <p>
                {selected.source}
                {selected.from && ` · ${new Date(selected.from).toLocaleString()}`}
              </p>
            </>
          )}
          <small>
            Public grid context is separate from saved code findings and machine emissions.
            Refreshes every minute. Location is configured by the server operator.
          </small>
          <p>
            <a href="https://api.carbonintensity.org.uk/" target="_blank" rel="noreferrer">
              NESO data · CC BY 4.0 ↗
            </a>
          </p>
        </div>
      </div>
      <footer>
        <strong>Specialist coverage</strong>
        <p>
          Architecture uses saved repository findings. AI usage comes from recorded model requests.
          Carbon uses available grid evidence. Cloud waste, disaster recovery and collaboration need
          their own inventory, recovery-test and workflow evidence; a code review alone cannot
          validate them.
        </p>
      </footer>
    </section>
  );
}
