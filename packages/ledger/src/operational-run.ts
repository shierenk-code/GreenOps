import { randomUUID } from 'node:crypto';
import { GreenOpsMeasure } from '@greenops/measure';
import { SelfAccountant, type SelfCostSummary } from './self-accountant.js';

export interface OperationalOutcome {
  runId: string;
  relatedPlanId: string | null;
  agentId: string;
  operation: string;
  mode: 'local' | 'synthetic' | 'live-read' | 'live-execution';
  status: 'completed' | 'failed';
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  selfCost: SelfCostSummary;
  toolFailures: number;
  trace: Array<{ tool: string; status: 'completed' | 'failed'; at: string }>;
  workloadSavings: { energyKwh: null; carbonKgCo2e: null };
  measurementNote: string;
}

/** Shared accounting for deterministic operational paths. Adapter calls include failures and cache lookups. */
export class OperationalRun {
  readonly runId = `operation-${randomUUID()}`;
  private readonly started = Date.now();
  private readonly self = new SelfAccountant(new GreenOpsMeasure());
  private readonly trace: OperationalOutcome['trace'] = [];
  private finished = false;
  relatedPlanId: string | null = null;
  constructor(
    readonly agentId: string,
    readonly operation: string,
    readonly mode: OperationalOutcome['mode'],
  ) {}

  async tool<T>(name: string, call: () => Promise<T>): Promise<T> {
    if (this.finished) throw new Error('Operational run is already complete.');
    const start = Date.now();
    let status: 'completed' | 'failed' = 'failed';
    try {
      const result = await call();
      status = 'completed';
      return result;
    } finally {
      this.self.recordTool(this.operation, Math.max(0, Date.now() - start), name);
      this.trace.push({ tool: name, status, at: new Date().toISOString() });
    }
  }

  finish(status: OperationalOutcome['status']): OperationalOutcome {
    if (this.finished) throw new Error('Operational run is already complete.');
    this.finished = true;
    return {
      runId: this.runId,
      relatedPlanId: this.relatedPlanId,
      agentId: this.agentId,
      operation: this.operation,
      mode: this.mode,
      status,
      startedAt: new Date(this.started).toISOString(),
      finishedAt: new Date().toISOString(),
      durationMs: Math.max(0, Date.now() - this.started),
      selfCost: this.self.summary({ estimateFootprint: false }),
      toolFailures: this.trace.filter((t) => t.status === 'failed').length,
      trace: [...this.trace],
      workloadSavings: { energyKwh: null, carbonKgCo2e: null },
      measurementNote:
        'Adapter invocations (including failed calls and cache lookups), not HTTP request counts. Tool durations may overlap; elapsed time includes human/scheduler waits. No LLM is used here. No physical energy, net savings or verified outcome is inferred from these counters.',
    };
  }
}
