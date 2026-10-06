import { describe, expect, it } from 'vitest';
import {
  carbonObservations,
  parseGridIntensity,
  resolveMapRegion,
} from '../apps/CodeVitals-MCP/website/src/app/dashboard/control-plane/carbon-map-data';
import { buildSampleData } from '../apps/CodeVitals-MCP/website/src/app/dashboard/control-plane/data';
import type { ResourceRow } from '../apps/CodeVitals-MCP/website/src/app/dashboard/control-plane/types';

function recorded(rows: ResourceRow[]) {
  const data = buildSampleData('All', '30d');
  return {
    ...data,
    mode: 'recorded' as const,
    agents: [
      {
        ...data.agents[0],
        key: 'arch' as const,
        columns: ['Deployment region', 'Grid intensity'],
        rows,
      },
    ],
  };
}
describe('carbon atlas evidence boundary', () => {
  it('converts explicit intensity units and preserves genuine zero', () => {
    expect(parseGridIntensity('0.48 kg CO₂e/kWh')).toBe(480);
    expect(parseGridIntensity('45 g CO2e/kWh')).toBe(45);
    expect(parseGridIntensity('0 g CO₂e/kWh')).toBe(0);
    for (const value of [
      'Unknown',
      '480',
      '-10 g CO₂e/kWh',
      'NaN kg CO₂e/kWh',
      '10 kg',
      '1,000 kg CO₂e/kWh',
    ])
      expect(parseGridIntensity(value)).toBeNull();
  });
  it('maps current and candidate sample values from the selected inventory', () => {
    const data = buildSampleData('All', '30d');
    const carbon = data.agents.find((a) => a.key === 'carbon')!;
    const result = carbonObservations(data);
    expect(result.observations).toHaveLength(carbon.rows.length * 2);
    expect(result.unmapped).toBe(0);
    expect(result.observations.find((o) => o.kind === 'Current')?.intensity).toBe(480);
    expect(result.observations.find((o) => o.kind === 'Candidate')?.intensity).toBe(45);
    expect(carbonObservations(buildSampleData('All', '24h')).observations.length).toBeLessThan(
      result.observations.length,
    );
  });
  it('does not substitute sample observations into an empty recorded run', () => {
    expect(carbonObservations(recorded([]))).toEqual({ observations: [], unmapped: 0 });
  });
  it('uses explicit recorded region and units without guessing from names', () => {
    const result = carbonObservations(
      recorded([
        { id: 'known', name: 'service-a', cells: ['westeurope', '0.3 kg CO₂e/kWh'] },
        { id: 'missing', name: 'US East service', cells: ['Not recorded', '400 g CO₂e/kWh'] },
        { id: 'unknown', name: 'service-b', cells: ['unsupported-region', '50 g CO₂e/kWh'] },
        { id: 'no-intensity', name: 'service-c', cells: ['eastus', 'Not recorded'] },
      ]),
    );
    expect(result.unmapped).toBe(1);
    expect(result.observations.map((o) => [o.findingId, o.intensity])).toEqual([
      ['known', 300],
      ['no-intensity', null],
    ]);
  });
  it('reads units from the structured audit fact label', () => {
    const result = carbonObservations(
      recorded([
        {
          id: 'fact',
          name: 'service',
          cells: [],
          facts: [
            { label: 'Deployment region', value: 'northeurope' },
            { label: 'Grid intensity (kg CO₂e/kWh)', value: '0.12' },
          ],
        },
      ]),
    );
    expect(result.observations[0].intensity).toBe(120);
    expect(result.observations[0].region.id).toBe('ireland');
  });
  it('does not conflate cloud provider aliases with the generic northern-Europe scenario', () => {
    expect(resolveMapRegion('Europe North')?.id).toBe('europe-north');
    expect(resolveMapRegion('northeurope')?.id).toBe('ireland');
    expect(resolveMapRegion('eu-west-3')?.id).toBe('france');
    expect(resolveMapRegion('unknown')).toBeUndefined();
  });
});
