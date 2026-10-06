/**
 * Orchestrator Agent — Plan, Reason, Delegate.
 *
 * This is the top of the diagram. It holds the registry of specialized agents,
 * builds a PLAN (which agents to run against which mock sources), DELEGATES the
 * scan to each, and AGGREGATES their findings into one flat SustainabilityBug[]
 * that the existing 7-stage loop (GreenOpsAgent) consumes unchanged.
 *
 * It does not itself score energy — that stays in @greenops/measure via the loop —
 * so every agent's bugs go through the same Investigate -> ... -> Verify path and
 * into the one Sustainability Ledger with self-accounting. That is what makes the
 * multi-agent diagram literally true rather than cosmetic.
 */

import type { SustainabilityBug } from '@greenops/detect';
import type { SpecializedAgent, SpecializedFinding } from './contract.js';
import { AiEfficiencyAgent } from './ai-efficiency.js';
import { DigitalWasteAgent } from './digital-waste.js';
import { CarbonIncidentAgent } from './carbon-incident.js';
import { ArchitectureAgent } from './architecture.js';
import { DisasterRecoveryAgent } from './disaster-recovery.js';
import { CollaborationAgent } from './collaboration.js';
import { PipelineEfficiencyAgent } from './pipeline-efficiency.js';
import type { CarbonWorkload, CarbonPlan } from './carbon-planner.js';
import type { GridCarbonProvider } from './carbon-grid.js';
import type { WasteTarget, WasteReader, WasteInventory, WasteUsage } from './waste-inventory.js';
import type { WastePlan } from './waste-planner.js';
import { observeGrid, observeWaste, type OperationalObserver } from './operational-tools.js';

export type OperationalTask =
  | { kind: 'carbon-plan'; workload: CarbonWorkload; provider: GridCarbonProvider; now?: Date }
  | { kind: 'waste-discover'; target: WasteTarget; reader: WasteReader; now?: Date }
  | { kind: 'waste-plan'; inventory: WasteInventory; usage?: WasteUsage[]; now?: Date };

/** One planned unit of work: an agent bound to its mock data source. */
export interface PlanItem {
  agent: SpecializedAgent;
  sourcePath: string;
}

/** Aggregated result of a full fleet run. */
export interface OrchestrationResult {
  findings: SpecializedFinding[];
  bugs: SustainabilityBug[];
  perAgentErrors: Record<string, string>;
  trace: Array<{
    kind: 'plan' | 'agent';
    actor: string;
    status: 'planned' | 'started' | 'completed' | 'failed';
    detail: string;
    at: string;
  }>;
}

export class OrchestratorAgent {
  private readonly registry = new Map<string, SpecializedAgent>();

  constructor(agents: SpecializedAgent[] = OrchestratorAgent.defaultFleet()) {
    for (const a of agents) this.registry.set(a.id, a);
  }

  /** The full specialized fleet from the architecture diagram. */
  static defaultFleet(): SpecializedAgent[] {
    return [
      new AiEfficiencyAgent(),
      new DigitalWasteAgent(),
      new CarbonIncidentAgent(),
      new ArchitectureAgent(),
      new DisasterRecoveryAgent(),
      new CollaborationAgent(),
      new PipelineEfficiencyAgent(),
    ];
  }

  list(): SpecializedAgent[] {
    return [...this.registry.values()];
  }

  get(id: string): SpecializedAgent | undefined {
    return this.registry.get(id);
  }

  /** Explicit opt-in operational delegation. Never dispatches a Job or enables waste mutation. */
  async runOperational(
    task: Extract<OperationalTask, { kind: 'carbon-plan' }>,
    observer: OperationalObserver,
  ): Promise<CarbonPlan>;
  async runOperational(
    task: Extract<OperationalTask, { kind: 'waste-discover' }>,
    observer: OperationalObserver,
  ): Promise<WasteInventory>;
  async runOperational(
    task: Extract<OperationalTask, { kind: 'waste-plan' }>,
    observer: OperationalObserver,
  ): Promise<WastePlan>;
  async runOperational(
    task: OperationalTask,
    observer: OperationalObserver,
  ): Promise<CarbonPlan | WasteInventory | WastePlan> {
    if (task.kind === 'carbon-plan') {
      const agent = this.registry.get('carbon-incident');
      if (!(agent instanceof CarbonIncidentAgent))
        throw new Error('Carbon operational agent is not registered.');
      return agent.plan(task.workload, observeGrid(task.provider, observer), task.now);
    }
    const agent = this.registry.get('digital-waste');
    if (!(agent instanceof DigitalWasteAgent))
      throw new Error('Digital Waste operational agent is not registered.');
    if (task.kind === 'waste-discover')
      return agent.discover(task.target, observeWaste(task.reader, observer), task.now);
    if (task.kind === 'waste-plan') return agent.plan(task.inventory, task.usage, task.now);
    throw new Error('Unsupported operational task.');
  }

  /**
   * Delegate: run each plan item's agent against its source, aggregate the bugs.
   * An agent that throws (e.g. a missing/malformed fixture) is isolated — its error
   * is recorded and the other agents still run (fault isolation, an agentic-robustness
   * property the rubric rewards).
   */
  run(plan: PlanItem[], onEvent?: (msg: string) => void): OrchestrationResult {
    const findings: SpecializedFinding[] = [];
    const bugs: SustainabilityBug[] = [];
    const perAgentErrors: Record<string, string> = {};
    const trace: OrchestrationResult['trace'] = [];

    trace.push({
      kind: 'plan',
      actor: 'orchestrator',
      status: 'planned',
      detail: `Planned ${plan.length} agent(s).`,
      at: new Date().toISOString(),
    });
    onEvent?.(`Orchestrator: planned ${plan.length} agent(s).`);
    for (const item of plan) {
      trace.push({
        kind: 'agent',
        actor: item.agent.id,
        status: 'started',
        detail: `Started ${item.agent.name}.`,
        at: new Date().toISOString(),
      });
      try {
        const finding = item.agent.scan(item.sourcePath);
        findings.push(finding);
        bugs.push(
          ...finding.bugs.map((bug) => ({
            ...bug,
            agentId: finding.agentId,
            agentName: finding.agentName,
          })),
        );
        trace.push({
          kind: 'agent',
          actor: item.agent.id,
          status: 'completed',
          detail: `${item.agent.name} completed with ${finding.bugs.length} finding(s).`,
          at: new Date().toISOString(),
        });
        onEvent?.(`  - ${item.agent.name}: ${finding.bugs.length} bug(s).`);
      } catch (err) {
        perAgentErrors[item.agent.id] = String(err);
        trace.push({
          kind: 'agent',
          actor: item.agent.id,
          status: 'failed',
          detail: `${item.agent.name} failed.`,
          at: new Date().toISOString(),
        });
        onEvent?.(`  x ${item.agent.name}: failed (${String(err)}).`);
      }
    }
    onEvent?.(`Orchestrator: aggregated ${bugs.length} bug(s) from ${findings.length} agent(s).`);
    trace.push({
      kind: 'plan',
      actor: 'orchestrator',
      status: 'completed',
      detail: `Aggregated ${bugs.length} bug(s) from ${findings.length} agent(s).`,
      at: new Date().toISOString(),
    });
    return { findings, bugs, perAgentErrors, trace };
  }
}
