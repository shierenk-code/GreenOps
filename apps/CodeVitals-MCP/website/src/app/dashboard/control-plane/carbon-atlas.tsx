'use client';

import { useId, useState, type MouseEvent } from 'react';
import Link from 'next/link';
import { ArrowRight, Globe2, Minus, Plus, RotateCcw, MapPin, Layers3 } from 'lucide-react';
import type { ControlPlaneData, ControlTab } from './types';
import { carbonObservations, mapPosition } from './carbon-map-data';
import styles from './carbon-atlas.module.css';

export function CarbonAtlas({
  data,
  href,
  onNavigate,
}: {
  data: ControlPlaneData;
  href: (tab: ControlTab, patch?: Record<string, string | null>) => string;
  onNavigate: (event: MouseEvent<HTMLAnchorElement>) => void;
}) {
  const id = useId();
  const { observations, unmapped } = carbonObservations(data);
  const regions = [...new Map(observations.map((o) => [o.region.id, o.region])).values()];
  const [selection, setSelection] = useState('');
  const [layer, setLayer] = useState<'intensity' | 'findings'>('intensity');
  const [zoom, setZoom] = useState(1);
  const [showRoutes, setShowRoutes] = useState(true);
  const routes = observations
    .filter((o) => o.kind === 'Current')
    .flatMap((current) => {
      const candidate = observations.find(
        (o) =>
          o.findingId === current.findingId &&
          o.kind === 'Candidate' &&
          o.region.id !== current.region.id,
      );
      return candidate ? [{ current, candidate }] : [];
    });
  const active = regions.find((region) => region.id === selection) ?? regions[0];
  const selected = observations.filter((o) => o.region.id === active?.id);
  const values = selected.flatMap((o) => (o.intensity === null ? [] : [o.intensity]));
  const findingCount = new Set(selected.map((o) => o.findingId)).size;
  const position = active ? mapPosition(active) : { x: 50, y: 50 };
  const range = values.length
    ? `${Math.min(...values).toLocaleString()}${Math.max(...values) !== Math.min(...values) ? `–${Math.max(...values).toLocaleString()}` : ''}`
    : 'Unknown';
  return (
    <section className={styles.atlas} aria-labelledby={`${id}-title`}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>
            <Globe2 size={14} aria-hidden="true" /> THE BIGGER PICTURE
          </p>
          <h3 id={`${id}-title`}>A world of better choices.</h3>
          <p>Explore the geography behind your carbon decisions.</p>
        </div>
        <span className={styles.sourceBadge}>
          {data.mode === 'sample' ? 'Synthetic scenarios' : 'Recorded observations'} · not live
        </span>
      </header>
      <div className={styles.layout}>
        <div className={styles.mapColumn}>
          <div className={styles.mapToolbar}>
            <div className={styles.segmented} aria-label="Map layer" role="group">
              <button
                type="button"
                aria-pressed={layer === 'intensity'}
                onClick={() => setLayer('intensity')}
              >
                Grid intensity
              </button>
              <button
                type="button"
                aria-pressed={layer === 'findings'}
                onClick={() => setLayer('findings')}
              >
                Findings
              </button>
            </div>
            <div className={styles.mapOptions}>
              {routes.length > 0 && (
                <button
                  type="button"
                  aria-pressed={showRoutes}
                  onClick={() => setShowRoutes(!showRoutes)}
                >
                  Proposed routes {showRoutes ? 'on' : 'off'}
                </button>
              )}
              <span>{regions.length} regions in scope</span>
            </div>
          </div>
          <div className={styles.map} aria-label="World map of regional observations">
            <div
              className={styles.mapScene}
              style={{
                transform: `scale(${zoom})`,
                transformOrigin: `${position.x}% ${position.y}%`,
              }}
            >
              <div className={styles.graticule} aria-hidden="true" />
              <div className={styles.land} aria-hidden="true" />
              {showRoutes && (
                <svg
                  className={styles.routes}
                  viewBox="0 0 1000 450"
                  preserveAspectRatio="none"
                  aria-hidden="true"
                >
                  {routes.map(({ current, candidate }) => {
                    const from = mapPosition(current.region),
                      to = mapPosition(candidate.region);
                    return (
                      <path
                        key={current.id}
                        d={`M${from.x * 10},${from.y * 4.5} Q${(from.x + to.x) * 5},${Math.min(from.y, to.y) * 4.5 - 60} ${to.x * 10},${to.y * 4.5}`}
                      />
                    );
                  })}
                </svg>
              )}
              {regions.map((region) => {
                const point = mapPosition(region);
                const items = observations.filter((o) => o.region.id === region.id);
                const intensities = items.flatMap((o) =>
                  o.intensity === null ? [] : [o.intensity],
                );
                const max = intensities.length ? Math.max(...intensities) : null;
                const count = new Set(items.map((o) => o.findingId)).size;
                return (
                  <button
                    key={region.id}
                    type="button"
                    className={styles.pin}
                    data-active={active?.id === region.id}
                    data-band={
                      max === null ? 'unknown' : max > 400 ? 'high' : max > 150 ? 'medium' : 'low'
                    }
                    style={{ left: `${point.x}%`, top: `${point.y}%`, scale: 1 / zoom }}
                    aria-label={`${region.name}: ${count} findings${max === null ? ', intensity unknown' : `, maximum ${max} grams CO2e per kWh`}`}
                    aria-pressed={active?.id === region.id}
                    onClick={() => setSelection(region.id)}
                  >
                    <span>{layer === 'findings' ? count : <span className={styles.pinDot} />}</span>
                  </button>
                );
              })}
            </div>
            {!regions.length && (
              <div className={styles.mapEmpty}>
                <MapPin size={24} aria-hidden="true" />
                <strong>No mapped observations</strong>
                <p>
                  Location and grid-intensity evidence appear here when available. Unknown locations
                  are never guessed.
                </p>
                <Link href={href('overview', { data: 'sample' })} onClick={onNavigate}>
                  Explore sample geography <ArrowRight size={15} aria-hidden="true" />
                </Link>
              </div>
            )}
            <div className={styles.zoom} role="group" aria-label="Map zoom">
              <button
                type="button"
                aria-label="Zoom out"
                disabled={zoom === 1}
                onClick={() => setZoom(Math.max(1, zoom - 0.5))}
              >
                <Minus size={16} />
              </button>
              <span>{zoom}×</span>
              <button
                type="button"
                aria-label="Zoom in"
                disabled={zoom === 2.5}
                onClick={() => setZoom(Math.min(2.5, zoom + 0.5))}
              >
                <Plus size={16} />
              </button>
              <button type="button" aria-label="Reset map view" onClick={() => setZoom(1)}>
                <RotateCcw size={14} />
              </button>
            </div>
          </div>
          <div className={styles.legend}>
            {layer === 'intensity' ? (
              <>
                <span>
                  <i data-band="low" /> ≤150
                </span>
                <span>
                  <i data-band="medium" /> 151–400
                </span>
                <span>
                  <i data-band="high" /> &gt;400
                </span>
                <span>
                  <i data-band="unknown" /> Unknown
                </span>
                <small>g CO₂e/kWh · highest observation per region</small>
              </>
            ) : (
              <span>
                <Layers3 size={13} aria-hidden="true" /> Distinct findings per region; one finding
                may span regions.
              </span>
            )}
          </div>
        </div>
        <aside className={styles.detail}>
          <label htmlFor={`${id}-region`}>REGIONAL EXPLORER</label>
          <select
            id={`${id}-region`}
            disabled={!regions.length}
            value={active?.id ?? ''}
            onChange={(e) => setSelection(e.target.value)}
          >
            {!regions.length && <option value="">No region data</option>}
            {regions.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
          <div className={styles.readout} aria-live="polite">
            <span>
              {layer === 'intensity' ? 'Observed intensity range' : 'Findings in this region'}
            </span>
            <strong>{layer === 'intensity' ? range : findingCount}</strong>
            <small>{layer === 'intensity' ? 'g CO₂e / kWh' : 'distinct findings'}</small>
          </div>
          <p className={styles.context}>
            {data.mode === 'sample'
              ? 'Current and candidate values from synthetic workload scenarios. These are not regional averages or forecasts.'
              : 'Values from the selected analysis. Missing measurements remain unknown; these are not live regional averages.'}
          </p>
          <div className={styles.observations}>
            {selected.map((item) => (
              <Link
                key={item.id}
                href={href(item.agentKey, { finding: item.findingId })}
                onClick={onNavigate}
              >
                <div>
                  <strong>{item.resource}</strong>
                  <span>
                    {item.kind} ·{' '}
                    {item.intensity === null ? 'Intensity unknown' : `${item.intensity} g CO₂e/kWh`}
                  </span>
                </div>
                <ArrowRight size={15} aria-hidden="true" />
              </Link>
            ))}
            {!selected.length && (
              <p>Select sample scenarios or import evidence with a supported region.</p>
            )}
          </div>
        </aside>
      </div>
      <footer className={styles.footer}>
        <span>Approximate regional centroids · {unmapped} unsupported location observations</span>
        <a
          href="https://www.naturalearthdata.com/about/terms-of-use/"
          target="_blank"
          rel="noreferrer"
        >
          Map: Natural Earth ↗
        </a>
      </footer>
    </section>
  );
}
