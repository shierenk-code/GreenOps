/**
 * @greenops/agents — the specialized agent fleet.
 *
 * The diagram's vision: an ORCHESTRATOR that plans and delegates to specialized
 * agents, each of which finds a distinct class of technology waste and reports it
 * as evidenced SustainabilityBug[] — the SAME type the 7-stage loop already
 * consumes. So every agent's findings flow through Investigate -> ... -> Verify
 * and into the one Sustainability Ledger, with self-accounting, unchanged.
 *
 * The scan() fleet path runs on SYNTHETIC FIXTURES (mock data shaped like the real
 * systems, with planted waste). No live cloud creds, telemetry, or transcripts —
 * the advantage is the detection knowledge, not access to client data. This is the
 * professional clean-room default for a public hackathon demo. Separate opt-in
 * Carbon Efficiency and Digital Waste APIs support public grid forecasts and
 * scoped Kubernetes reads; invoking scan() does not enable those integrations.
 */

import type { SustainabilityBug } from '@greenops/detect';

/** A specialized agent: given its mock data source, it returns evidenced bugs. */
export interface SpecializedAgent {
  /** Stable id, e.g. 'ai-efficiency'. */
  readonly id: string;
  /** Human name shown in the orchestrator plan, e.g. 'AI Efficiency Agent'. */
  readonly name: string;
  /** One-line description of what waste it hunts. */
  readonly description: string;
  /**
   * Run the agent against its data source (a path to a mock fixture).
   * Returns the sustainability bugs it found, each fully evidenced.
   */
  scan(sourcePath: string): SpecializedFinding;
}

/** Result of one specialized agent's scan. */
export interface SpecializedFinding {
  agentId: string;
  agentName: string;
  /** What the agent looked at (files/records scanned). */
  scanned: Record<string, number>;
  bugs: SustainabilityBug[];
}
