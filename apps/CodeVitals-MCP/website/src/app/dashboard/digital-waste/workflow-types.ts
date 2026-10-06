import type {
  WasteDecision,
  WastePlan,
  WasteFinding,
  simulateWastePlan,
} from '../../../../../../../packages/agents/src/waste-planner';
import type { OperationalOutcome } from '../../../../../../../packages/ledger/src/operational-run';

export interface WasteWorkflow {
  id: string;
  revision: number;
  plan: WastePlan;
  decisions: WasteDecision[];
  simulation: ReturnType<typeof simulateWastePlan> | null;
  checks: Array<{ label: string; passed: boolean }> | null;
  events: Array<{ at: string; label: string; findingId?: string }>;
  operationalOutcomes: OperationalOutcome[];
}

export type WasteAction = {
  runId: string | null;
  revision: number;
} & (
  | { action: 'start' }
  | {
      action: 'review';
      findingId: string;
      decision: 'approve' | 'reject';
      reviewer: string;
      reason: string;
    }
  | { action: 'simulate'; findingId: string }
  | { action: 'check' }
);

export function findingStatus(run: WasteWorkflow, findingId: string): string {
  if (run.simulation?.findingId === findingId)
    return run.checks
      ? run.checks.every((c) => c.passed)
        ? 'Simulation checked'
        : 'Check failed'
      : 'Simulated · check result';
  const decision = run.decisions.findLast((d) => d.findingId === findingId);
  if (decision) return decision.decision === 'approve' ? 'Approved for simulation' : 'Rejected';
  return run.plan.findings.find((f) => f.id === findingId)?.status === 'needs-evidence'
    ? 'Blocked · missing evidence'
    : 'Needs review';
}

export function proposedWasteChange(finding: WasteFinding): string {
  if (finding.status === 'needs-evidence')
    return 'No executable proposal yet. Resolve the evidence gaps below before approval.';
  if (finding.action === 'resize-cpu-request')
    return finding.proposedCpuCores === undefined
      ? 'No CPU target recorded. Regenerate the plan before approval.'
      : `Set ${finding.container} CPU request to ${finding.proposedCpuCores} cores per replica.`;
  return `Remove the ${finding.resourceName} claim from the synthetic inventory only.`;
}
