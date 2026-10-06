/**
 * DR (Disaster Recovery) Agent.
 *
 * Reads a mock DR/backup configuration and flags:
 *   - over-replication: more replicas than the RPO/criticality warrants,
 *   - idle-standby: hot standby capacity that sits idle where warm/cold would do,
 *   - rto-rpo-mismatch: expensive continuous replication for a lax RPO target.
 *
 * Mock fixture shape (JSON): see fixtures/greenops-mock/dr-config.json.
 */

import type { SustainabilityBug } from '@greenops/detect';
import type { SpecializedAgent, SpecializedFinding } from './contract.js';
import { bugId, readJsonFixture } from './util.js';
import {
  isBaselineFile,
  loadBaselineBundle,
  scanDisasterRecoveryBaseline,
} from './baseline-scan.js';

interface DrService {
  name: string;
  criticality: 'low' | 'medium' | 'high';
  replicas: number;
  standbyMode: 'hot' | 'warm' | 'cold';
  standbyCores: number;
  rpoMinutes: number;
  replicationMode: 'continuous' | 'periodic';
}
interface DrFixture {
  estate: string;
  services: DrService[];
}

/** Replicas justified by criticality. */
const JUSTIFIED_REPLICAS: Record<DrService['criticality'], number> = { low: 1, medium: 2, high: 3 };

export class DisasterRecoveryAgent implements SpecializedAgent {
  readonly id = 'disaster-recovery';
  readonly name = 'DR Agent';
  readonly description = 'Finds DR waste: over-replication, idle hot standby, RTO/RPO mismatch.';

  scan(sourcePath: string): SpecializedFinding {
    if (isBaselineFile(sourcePath)) {
      const result = scanDisasterRecoveryBaseline(loadBaselineBundle(sourcePath));
      return { agentId: this.id, agentName: this.name, ...result };
    }
    const fx = readJsonFixture<DrFixture>(sourcePath);
    const bugs: SustainabilityBug[] = [];

    for (const s of fx.services) {
      // 1) Over-replication vs criticality.
      const justified = JUSTIFIED_REPLICAS[s.criticality];
      if (s.replicas > justified) {
        const excess = s.replicas - justified;
        bugs.push({
          id: bugId('over-replication', `${fx.estate}:${s.name}`),
          category: 'over-replication',
          severity: excess >= 2 ? 'medium' : 'low',
          title: `'${s.name}' has ${s.replicas} replicas for ${s.criticality} criticality`,
          location: { filePath: sourcePath, startLine: 1, endLine: 1, symbol: s.name },
          rationale:
            `'${s.name}' is ${s.criticality}-criticality (justifies ~${justified} replicas) but runs ${s.replicas}. ` +
            `The ${excess} extra replica(s) consume compute and storage continuously for resilience not required.`,
          evidence: {
            replicas: s.replicas,
            justifiedReplicas: justified,
            criticality: s.criticality,
            excessReplicas: excess,
          },
          estimatedWaste: {
            metric: 'cpu.core_hours',
            perRun: excess * s.standbyCores * 24,
            unit: 'replica core-hours/day',
            assumptions: [],
          },
        });
      }

      // 2) Idle hot standby where warm/cold suffices (low/medium criticality).
      if (s.standbyMode === 'hot' && s.criticality !== 'high') {
        bugs.push({
          id: bugId('idle-standby', `${fx.estate}:${s.name}`),
          category: 'idle-standby',
          severity: 'medium',
          title: `'${s.name}' keeps a HOT standby at ${s.criticality} criticality`,
          location: { filePath: sourcePath, startLine: 1, endLine: 1, symbol: s.name },
          rationale:
            `'${s.name}' maintains a hot standby (${s.standbyCores} cores always on) but is only ${s.criticality} ` +
            `criticality. A warm/cold standby meets the recovery need while the cores idle-down between failovers.`,
          evidence: {
            standbyMode: s.standbyMode,
            standbyCores: s.standbyCores,
            criticality: s.criticality,
          },
          estimatedWaste: {
            metric: 'cpu.core_hours',
            perRun: s.standbyCores * 24,
            unit: 'idle standby core-hours/day',
            assumptions: [],
          },
        });
      }

      // 3) RTO/RPO mismatch: continuous replication for a lax RPO.
      if (s.replicationMode === 'continuous' && s.rpoMinutes >= 60) {
        bugs.push({
          id: bugId('rto-rpo-mismatch', `${fx.estate}:${s.name}`),
          category: 'rto-rpo-mismatch',
          severity: 'low',
          title: `'${s.name}' replicates continuously for a ${s.rpoMinutes}-min RPO`,
          location: { filePath: sourcePath, startLine: 1, endLine: 1, symbol: s.name },
          rationale:
            `'${s.name}' uses continuous replication yet its RPO is ${s.rpoMinutes} minutes. Periodic snapshots ` +
            `at the RPO cadence meet the target with far less always-on replication compute and network energy.`,
          evidence: { replicationMode: s.replicationMode, rpoMinutes: s.rpoMinutes },
          estimatedWaste: {
            metric: 'cpu.core_hours',
            perRun: Math.max(1, s.standbyCores) * 6,
            unit: 'replication core-hours/day',
            assumptions: [],
          },
        });
      }
    }

    return {
      agentId: this.id,
      agentName: this.name,
      scanned: { services: fx.services.length },
      bugs,
    };
  }
}
