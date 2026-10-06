/**
 * Carbon Incident Agent.
 *
 * Reads a mock energy/carbon time-series and flags anomaly spikes: intervals where
 * energy draw is far above the rolling baseline (a runaway job, a hot loop, a
 * misconfigured autoscaler). Each spike's excess energy over baseline is the waste.
 *
 * Mock fixture shape (JSON): see fixtures/greenops-mock/carbon-timeseries.json.
 */

import type { SustainabilityBug } from '@greenops/detect';
import type { SpecializedAgent, SpecializedFinding } from './contract.js';
import { bugId, readJsonFixture } from './util.js';
import { isBaselineFile, loadBaselineBundle, scanCarbonIncidentBaseline } from './baseline-scan.js';
import { planCarbonWorkload, type CarbonWorkload, type CarbonPlan } from './carbon-planner.js';
import type { GridCarbonProvider } from './carbon-grid.js';

interface Sample {
  timestamp: string;
  energyKwh: number;
}
interface CarbonFixture {
  workload: string;
  intervalMinutes: number;
  samples: Sample[];
}

export class CarbonIncidentAgent implements SpecializedAgent {
  readonly id = 'carbon-incident';
  readonly name = 'Carbon Incident Agent';
  readonly description = 'Detects energy/carbon anomaly spikes against a rolling baseline.';

  /** Opt-in live/synthetic scheduling; legacy fixture scanning remains unchanged. */
  plan(
    workload: CarbonWorkload,
    provider: GridCarbonProvider,
    now = new Date(),
  ): Promise<CarbonPlan> {
    return planCarbonWorkload(workload, provider, now);
  }

  scan(sourcePath: string): SpecializedFinding {
    if (isBaselineFile(sourcePath)) {
      const result = scanCarbonIncidentBaseline(loadBaselineBundle(sourcePath));
      return { agentId: this.id, agentName: this.name, ...result };
    }
    const fx = readJsonFixture<CarbonFixture>(sourcePath);
    const bugs: SustainabilityBug[] = [];
    const values = fx.samples.map((s) => s.energyKwh);

    // Baseline = median of the series (robust to spikes).
    const sorted = [...values].sort((a, b) => a - b);
    const median = sorted.length ? (sorted[Math.floor(sorted.length / 2)] ?? 0) : 0;
    const SPIKE_FACTOR = 2.5;

    for (let i = 0; i < fx.samples.length; i++) {
      const s = fx.samples[i];
      if (!s || median <= 0) continue;
      const ratio = s.energyKwh / median;
      if (ratio >= SPIKE_FACTOR) {
        const excessKwh = s.energyKwh - median;
        bugs.push({
          id: bugId('carbon-anomaly', `${fx.workload}:${s.timestamp}`),
          category: 'carbon-anomaly',
          severity: ratio >= 5 ? 'high' : 'medium',
          title: `Energy spike ${ratio.toFixed(1)}x baseline at ${s.timestamp}`,
          location: { filePath: sourcePath, startLine: i + 1, endLine: i + 1, symbol: fx.workload },
          rationale:
            `At ${s.timestamp} the workload drew ${s.energyKwh.toFixed(4)} kWh vs a baseline of ` +
            `${median.toFixed(4)} kWh (${ratio.toFixed(1)}x). A sustained spike this size is an incident — ` +
            `a runaway job or misconfiguration burning energy with no proportional output.`,
          evidence: {
            energyKwh: s.energyKwh,
            baselineKwh: median,
            ratio: Number(ratio.toFixed(2)),
            excessKwh: Number(excessKwh.toFixed(4)),
          },
          estimatedWaste: {
            metric: 'energy.kwh_direct',
            perRun: excessKwh,
            unit: 'kWh excess per interval',
            assumptions: [],
          },
        });
      }
    }

    return {
      agentId: this.id,
      agentName: this.name,
      scanned: { samples: fx.samples.length },
      bugs,
    };
  }
}
