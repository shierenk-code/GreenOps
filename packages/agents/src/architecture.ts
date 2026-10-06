/**
 * Architecture Agent (IaC).
 *
 * Reads a mock parsed-IaC (Terraform-like) resource list and flags design-level
 * sustainability issues:
 *   - no-autoscale: fixed-capacity compute that cannot scale down when idle,
 *   - high-carbon-region: workload pinned to a high grid-intensity region,
 *   - inefficient-sizing: instance size far above the declared workload need.
 *
 * Mock fixture shape (JSON): see fixtures/greenops-mock/iac-resources.json.
 */

import type { SustainabilityBug } from '@greenops/detect';
import type { SpecializedAgent, SpecializedFinding } from './contract.js';
import { bugId, readJsonFixture } from './util.js';
import { isBaselineFile, loadBaselineBundle, scanArchitectureBaseline } from './baseline-scan.js';

interface IacResource {
  name: string;
  type: string;
  region: string;
  gridIntensityKgPerKwh: number;
  instanceCores: number;
  neededCores: number;
  autoscale: boolean;
}
interface IacFixture {
  stack: string;
  resources: IacResource[];
}

export class ArchitectureAgent implements SpecializedAgent {
  readonly id = 'architecture';
  readonly name = 'Architecture Agent';
  readonly description =
    'Finds IaC design waste: no autoscaling, high-carbon regions, inefficient sizing.';

  scan(sourcePath: string): SpecializedFinding {
    if (isBaselineFile(sourcePath)) {
      const result = scanArchitectureBaseline(loadBaselineBundle(sourcePath));
      return { agentId: this.id, agentName: this.name, ...result };
    }
    const fx = readJsonFixture<IacFixture>(sourcePath);
    const bugs: SustainabilityBug[] = [];
    const CLEAN_REGION_INTENSITY = 0.1; // kgCO2e/kWh — a low-carbon region target

    for (const r of fx.resources) {
      // 1) No autoscale on compute.
      if (!r.autoscale && r.instanceCores > 0) {
        const idleCores = Math.max(0, r.instanceCores - r.neededCores);
        bugs.push({
          id: bugId('no-autoscale', `${fx.stack}:${r.name}`),
          category: 'no-autoscale',
          severity: idleCores >= 4 ? 'medium' : 'low',
          title: `Resource '${r.name}' has no autoscaling`,
          location: { filePath: sourcePath, startLine: 1, endLine: 1, symbol: r.name },
          rationale:
            `'${r.name}' (${r.type}) runs at a fixed ${r.instanceCores} cores with no autoscaling, so it draws ` +
            `full power even when idle. Autoscaling releases ~${idleCores} idle cores off-peak.`,
          evidence: {
            instanceCores: r.instanceCores,
            neededCores: r.neededCores,
            autoscale: String(r.autoscale),
            idleCores,
          },
          estimatedWaste: {
            metric: 'cpu.core_hours',
            perRun: idleCores * 12,
            unit: 'idle core-hours/day (off-peak)',
            assumptions: [],
          },
        });
      }

      // 2) High-carbon region.
      if (r.gridIntensityKgPerKwh >= 0.4) {
        const coreHoursDay = r.instanceCores * 24;
        bugs.push({
          id: bugId('high-carbon-region', `${fx.stack}:${r.name}`),
          category: 'high-carbon-region',
          severity: r.gridIntensityKgPerKwh >= 0.6 ? 'medium' : 'low',
          title: `'${r.name}' in high-carbon region '${r.region}' (${r.gridIntensityKgPerKwh} kg/kWh)`,
          location: { filePath: sourcePath, startLine: 1, endLine: 1, symbol: r.name },
          rationale:
            `'${r.name}' runs in '${r.region}' at ${r.gridIntensityKgPerKwh} kgCO2e/kWh. The same compute in a ` +
            `low-carbon region (~${CLEAN_REGION_INTENSITY}) emits far less for identical work. Same energy, less carbon.`,
          evidence: {
            region: r.region,
            gridIntensityKgPerKwh: r.gridIntensityKgPerKwh,
            targetGridIntensityKgPerKwh: CLEAN_REGION_INTENSITY,
            instanceCores: r.instanceCores,
          },
          // Carbon-only saving: expressed as core-hours whose CARBON drops when relocated.
          estimatedWaste: {
            metric: 'carbon.region_shift',
            perRun: coreHoursDay,
            unit: 'unchanged workload core-hours/day',
            assumptions: [],
          },
        });
      }

      // 3) Inefficient sizing (instance >= 2x needed).
      if (r.neededCores > 0 && r.instanceCores >= r.neededCores * 2) {
        const excess = r.instanceCores - r.neededCores;
        bugs.push({
          id: bugId('inefficient-sizing', `${fx.stack}:${r.name}`),
          category: 'inefficient-sizing',
          severity: r.instanceCores >= r.neededCores * 4 ? 'high' : 'medium',
          title: `'${r.name}' sized ${r.instanceCores} cores for ${r.neededCores}-core workload`,
          location: { filePath: sourcePath, startLine: 1, endLine: 1, symbol: r.name },
          rationale:
            `'${r.name}' is provisioned with ${r.instanceCores} cores but the workload needs ~${r.neededCores}. ` +
            `The ${excess} excess cores are paid for and powered continuously. Downsizing removes that draw.`,
          evidence: {
            instanceCores: r.instanceCores,
            neededCores: r.neededCores,
            excessCores: excess,
          },
          estimatedWaste: {
            metric: 'cpu.core_hours',
            perRun: excess * 24,
            unit: 'idle core-hours/day',
            assumptions: [],
          },
        });
      }
    }

    return {
      agentId: this.id,
      agentName: this.name,
      scanned: { resources: fx.resources.length },
      bugs,
    };
  }
}
