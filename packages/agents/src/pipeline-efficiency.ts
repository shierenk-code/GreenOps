/**
 * Pipeline Efficiency Agent (CI/CD).
 *
 * Reads pipeline run summaries from an Azure subscription baseline and flags:
 *   - low dependency/Docker layer cache hit rates,
 *   - duplicate runs for already-built commits,
 *   - oversized build artifacts.
 *
 * Each pipeline is tied to the compute that runs it (a hosted runner SKU in a region,
 * or a self-hosted scale set in the subscription), so its carbon per run and per merged
 * PR comes from the same translation engine as the infrastructure findings.
 *
 * There is no legacy fixture for this agent: a non-baseline source yields no findings.
 */

import { existsSync } from 'node:fs';
import type { SpecializedAgent, SpecializedFinding } from './contract.js';
import {
  isBaselineFile,
  loadBaselineBundle,
  scanPipelineEfficiencyBaseline,
} from './baseline-scan.js';

export class PipelineEfficiencyAgent implements SpecializedAgent {
  readonly id = 'pipeline-efficiency';
  readonly name = 'Pipeline Efficiency Agent';
  readonly description =
    'Finds CI/CD waste: low cache hit rates, duplicate builds and oversized artifacts.';

  scan(sourcePath: string): SpecializedFinding {
    if (existsSync(sourcePath) && isBaselineFile(sourcePath)) {
      const result = scanPipelineEfficiencyBaseline(loadBaselineBundle(sourcePath));
      return { agentId: this.id, agentName: this.name, ...result };
    }
    return { agentId: this.id, agentName: this.name, scanned: { pipelines: 0 }, bugs: [] };
  }
}
