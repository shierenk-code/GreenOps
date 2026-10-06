import type { AgentKey, ControlPlaneData } from './types';

/** Approximate regional centroids, not data-center locations or national averages. */
export const MAP_REGIONS = [
  {
    id: 'us-east',
    name: 'US East',
    lat: 37,
    lon: -79,
    aliases: ['us east', 'eastus', 'east us', 'us-east-1', 'us-east-2'],
  },
  {
    id: 'us-west',
    name: 'US West',
    lat: 44,
    lon: -121,
    aliases: ['us west', 'westus', 'west us', 'us-west-1', 'us-west-2'],
  },
  {
    id: 'us-central',
    name: 'US Central',
    lat: 41,
    lon: -96,
    aliases: ['us central', 'centralus', 'central us'],
  },
  {
    id: 'europe-north',
    name: 'Europe North',
    lat: 60,
    lon: 18,
    aliases: ['europe north', 'eu-north-1'],
  },
  {
    id: 'europe-west',
    name: 'Europe West',
    lat: 50,
    lon: 4,
    aliases: ['europe west', 'westeurope', 'west europe'],
  },
  {
    id: 'uk-south',
    name: 'UK South',
    lat: 51,
    lon: -1,
    aliases: ['uksouth', 'uk south', 'south england', 'eu-west-2'],
  },
  {
    id: 'ireland',
    name: 'Ireland',
    lat: 53,
    lon: -8,
    aliases: ['northeurope', 'north europe', 'eu-west-1', 'ireland'],
  },
  {
    id: 'france',
    name: 'France Central',
    lat: 49,
    lon: 2,
    aliases: ['francecentral', 'france central', 'eu-west-3'],
  },
  {
    id: 'india',
    name: 'Central India',
    lat: 19,
    lon: 74,
    aliases: ['centralindia', 'central india', 'ap-south-1'],
  },
  {
    id: 'singapore',
    name: 'Singapore',
    lat: 1,
    lon: 104,
    aliases: ['southeastasia', 'southeast asia', 'ap-southeast-1', 'singapore'],
  },
  {
    id: 'japan',
    name: 'Japan East',
    lat: 36,
    lon: 140,
    aliases: ['japaneast', 'japan east', 'ap-northeast-1'],
  },
  {
    id: 'australia',
    name: 'Australia East',
    lat: -34,
    lon: 151,
    aliases: ['australiaeast', 'australia east', 'ap-southeast-2'],
  },
  {
    id: 'brazil',
    name: 'Brazil South',
    lat: -23,
    lon: -46,
    aliases: ['brazilsouth', 'brazil south', 'sa-east-1'],
  },
] as const;
export type MapRegion = (typeof MAP_REGIONS)[number];
export interface CarbonObservation {
  id: string;
  findingId: string;
  agentKey: AgentKey;
  resource: string;
  region: MapRegion;
  intensity: number | null;
  kind: 'Current' | 'Candidate' | 'Recorded';
}
export function resolveMapRegion(value: string) {
  const normalized = value.trim().toLowerCase();
  return MAP_REGIONS.find((region) => region.aliases.some((alias) => alias === normalized));
}
/** Require an explicit unit; unknown, negative and malformed quantities never become zero. */
export function parseGridIntensity(value: string): number | null {
  const match = value.trim().match(/^(\d+(?:\.\d+)?)\s*(kg|g)\s*CO[₂2]e\s*\/\s*kWh$/i);
  if (!match) return null;
  const result = Number(match[1]) * (match[2].toLowerCase() === 'kg' ? 1000 : 1);
  return Number.isFinite(result) ? result : null;
}
export function carbonObservations(data: ControlPlaneData) {
  const observations: CarbonObservation[] = [];
  let unmapped = 0;
  for (const agent of data.agents) {
    for (const row of agent.rows) {
      const add = (location: string, intensity: string, kind: CarbonObservation['kind']) => {
        const region = resolveMapRegion(location);
        if (!region) {
          unmapped++;
          return;
        }
        observations.push({
          id: `${agent.key}-${row.id}-${kind}`,
          findingId: row.opportunityId ?? row.id,
          agentKey: agent.key,
          resource: row.name,
          region,
          intensity: parseGridIntensity(intensity),
          kind,
        });
      };
      if (data.mode === 'sample' && agent.key === 'carbon') {
        // Use the existing scenario's explicit route, never infer a place from the resource name.
        const route = row.cells[0].split(' · ')[0].split(' → ');
        add(
          route[0],
          row.facts?.find((f) => f.label === 'Current grid intensity')?.value ?? '',
          'Current',
        );
        add(
          route[1] ?? route[0],
          row.facts?.find((f) => f.label === 'Candidate grid intensity')?.value ?? '',
          'Candidate',
        );
      } else if (data.mode === 'recorded') {
        const regionColumn = agent.columns.indexOf('Deployment region');
        const gridColumn = agent.columns.indexOf('Grid intensity');
        const location =
          row.facts?.find((f) => ['Deployment region', 'Region'].includes(f.label))?.value ??
          (regionColumn < 0 ? undefined : row.cells[regionColumn]);
        const fact = row.facts?.find(
          (f) =>
            f.label === 'Grid intensity (kg CO₂e/kWh)' || f.label === 'Grid intensity (g CO₂e/kWh)',
        );
        const intensity = fact
          ? `${fact.value} ${fact.label.includes('(kg') ? 'kg' : 'g'} CO₂e/kWh`
          : gridColumn < 0
            ? ''
            : row.cells[gridColumn];
        if (location && location !== 'Not recorded') add(location, intensity, 'Recorded');
      }
    }
  }
  return { observations, unmapped };
}
export const mapPosition = (region: MapRegion) => ({
  x: ((region.lon + 180) / 360) * 100,
  y: ((85 - region.lat) / 145) * 100,
});
