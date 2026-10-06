/**
 * Self-accounting: GreenOps measuring its OWN footprint.
 *
 * The whole premise of the project is answering "is GreenOps saving more energy
 * and carbon than it consumes?". That is only credible if the agent honestly
 * records everything IT burns while doing its work: LLM tokens, tool calls, and
 * retries. This meter is threaded through the agent loop and every stage reports
 * into it.
 *
 * Serves judging criterion "Sustainability of the Agent Itself".
 */

import { GreenOpsMeasure, EnergyCarbon } from '@greenops/measure';

export interface SelfCostEvent {
  stage: string;
  kind: 'llm' | 'tool' | 'retry';
  /** Provider-reported tokens (llm events); null means usage is unavailable. */
  tokens?: number | null;
  /** Wall-clock ms the operation took (used for CPU attribution). */
  durationMs?: number;
  note?: string;
  at: string;
}

export interface SelfCostSummary {
  totalTokens: number | null;
  /** Sum of valid reported usage only; not an estimate of missing usage. */
  knownTokens: number;
  usageComplete: boolean;
  llmCalls: number;
  unknownLlmCalls: number;
  totalToolCalls: number;
  totalRetries: number;
  totalDurationMs: number;
  energyKwh: number | null;
  carbonKgCo2e: number | null;
  events: SelfCostEvent[];
}

/**
 * Tracks reported usage. Energy/carbon are coefficient-based estimates, not
 * hardware measurements. CPU attribution assumes single-core-equivalent
 * wall-clock execution. Missing model usage prevents a complete footprint claim.
 */
export class SelfAccountant {
  private readonly events: SelfCostEvent[] = [];
  private knownTokenSubtotal = 0;
  private readonly measure: GreenOpsMeasure;

  constructor(measure: GreenOpsMeasure) {
    this.measure = measure;
  }

  public recordLlm(stage: string, tokens: number | null, durationMs = 0, note?: string): void {
    // If the aggregate cannot be represented safely, do not fabricate a rounded count.
    const reported =
      typeof tokens === 'number' &&
      Number.isSafeInteger(tokens) &&
      tokens >= 0 &&
      Number.isSafeInteger(this.knownTokenSubtotal + tokens)
        ? tokens
        : null;
    this.knownTokenSubtotal += reported ?? 0;
    this.events.push({
      stage,
      kind: 'llm',
      tokens: reported,
      durationMs,
      note,
      at: new Date().toISOString(),
    });
  }

  public recordTool(stage: string, durationMs = 0, note?: string): void {
    this.events.push({ stage, kind: 'tool', durationMs, note, at: new Date().toISOString() });
  }

  public recordRetry(stage: string, note?: string): void {
    this.events.push({ stage, kind: 'retry', note, at: new Date().toISOString() });
  }

  public summary(options: { estimateFootprint?: boolean } = {}): SelfCostSummary {
    let knownTokens = 0;
    let llmCalls = 0;
    let unknownLlmCalls = 0;
    let totalToolCalls = 0;
    let totalRetries = 0;
    let totalDurationMs = 0;

    for (const e of this.events) {
      if (e.kind === 'llm') {
        llmCalls += 1;
        if (e.tokens === null || e.tokens === undefined) unknownLlmCalls += 1;
        else knownTokens += e.tokens;
      }
      if (e.kind === 'tool') totalToolCalls += 1;
      if (e.kind === 'retry') totalRetries += 1;
      totalDurationMs += e.durationMs ?? 0;
    }

    // Token energy from the measure model.
    const usageComplete = unknownLlmCalls === 0 && Number.isSafeInteger(knownTokens);
    const tokenEnergy: EnergyCarbon = this.measure.fromTokens(knownTokens);
    // CPU energy attributed from total wall-clock (single-core-equivalent).
    const coreHours = totalDurationMs / 1000 / 3600;
    const cpuEnergy: EnergyCarbon = this.measure.fromCpuCoreHours(coreHours);

    return {
      totalTokens: usageComplete ? knownTokens : null,
      knownTokens,
      usageComplete,
      llmCalls,
      unknownLlmCalls,
      totalToolCalls,
      totalRetries,
      totalDurationMs,
      energyKwh:
        usageComplete && options.estimateFootprint !== false
          ? tokenEnergy.energyKwh + cpuEnergy.energyKwh
          : null,
      carbonKgCo2e:
        usageComplete && options.estimateFootprint !== false
          ? tokenEnergy.carbonKgCo2e + cpuEnergy.carbonKgCo2e
          : null,
      events: [...this.events],
    };
  }
}
