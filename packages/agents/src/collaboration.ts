/**
 * Collaboration Agent.
 *
 * Reads a mock meeting/recording metadata catalog and flags:
 *   - redundant-recording: duplicate recordings of the same meeting kept in full,
 *   - excessive-retention: recordings/transcripts kept far longer than useful.
 *
 * Mock fixture shape (JSON): see fixtures/greenops-mock/collab-catalog.json.
 */

import type { SustainabilityBug } from '@greenops/detect';
import type { SpecializedAgent, SpecializedFinding } from './contract.js';
import { bugId, readJsonFixture } from './util.js';
import { isBaselineFile, loadBaselineBundle, scanCollaborationBaseline } from './baseline-scan.js';

interface Recording {
  id: string;
  meeting: string;
  sizeGb: number;
  retentionDays: number;
  duplicateOf?: string;
  hasTranscript: boolean;
}
interface CollabFixture {
  tenant: string;
  recordings: Recording[];
}

export class CollaborationAgent implements SpecializedAgent {
  readonly id = 'collaboration';
  readonly name = 'Collaboration Agent';
  readonly description =
    'Finds collaboration-data waste: duplicate recordings, excessive retention.';

  scan(sourcePath: string): SpecializedFinding {
    if (isBaselineFile(sourcePath)) {
      const result = scanCollaborationBaseline(loadBaselineBundle(sourcePath));
      return { agentId: this.id, agentName: this.name, ...result };
    }
    const fx = readJsonFixture<CollabFixture>(sourcePath);
    const bugs: SustainabilityBug[] = [];
    const RETENTION_TARGET_DAYS = 90;

    for (const r of fx.recordings) {
      // 1) Redundant recording: a full-size duplicate of another recording.
      if (r.duplicateOf) {
        bugs.push({
          id: bugId('redundant-recording', `${fx.tenant}:${r.id}`),
          category: 'redundant-recording',
          severity: r.sizeGb >= 2 ? 'medium' : 'low',
          title: `Recording '${r.id}' is a full duplicate of '${r.duplicateOf}' (${r.sizeGb} GB)`,
          location: { filePath: sourcePath, startLine: 1, endLine: 1, symbol: r.meeting },
          rationale:
            `'${r.id}' duplicates '${r.duplicateOf}' at full size (${r.sizeGb} GB). Keeping a second copy ` +
            `${r.hasTranscript ? '(a transcript already captures the content) ' : ''}stores energy for no added value.`,
          evidence: {
            sizeGb: r.sizeGb,
            duplicateOf: r.duplicateOf,
            hasTranscript: String(r.hasTranscript),
          },
          estimatedWaste: {
            metric: 'storage.gb_months',
            perRun: r.sizeGb,
            unit: 'GB-months',
            assumptions: [],
          },
        });
      }

      // 2) Excessive retention beyond target.
      if (r.retentionDays > RETENTION_TARGET_DAYS && !r.duplicateOf) {
        const excessDays = r.retentionDays - RETENTION_TARGET_DAYS;
        const gbMonths = r.sizeGb * (excessDays / 30);
        bugs.push({
          id: bugId('excessive-retention', `${fx.tenant}:${r.id}`),
          category: 'excessive-retention',
          severity: excessDays >= 275 ? 'medium' : 'low',
          title: `Recording '${r.id}' retained ${r.retentionDays}d (target ${RETENTION_TARGET_DAYS}d)`,
          location: { filePath: sourcePath, startLine: 1, endLine: 1, symbol: r.meeting },
          rationale:
            `'${r.id}' (${r.sizeGb} GB) is retained for ${r.retentionDays} days versus a ${RETENTION_TARGET_DAYS}-day ` +
            `target. The extra ${excessDays} days store rarely-accessed media, drawing storage energy for its whole life.`,
          evidence: { sizeGb: r.sizeGb, retentionDays: r.retentionDays, excessDays },
          estimatedWaste: {
            metric: 'storage.gb_months',
            perRun: gbMonths,
            unit: 'GB-months',
            assumptions: [],
          },
        });
      }
    }

    return {
      agentId: this.id,
      agentName: this.name,
      scanned: { recordings: fx.recordings.length },
      bugs,
    };
  }
}
