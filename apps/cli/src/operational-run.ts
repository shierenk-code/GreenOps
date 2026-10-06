import { OperationalRun, SustainabilityLedger, type OperationalOutcome } from '@greenops/ledger';

/** Call only after checking that the ledger path is distinct from command inputs/outputs. */
export async function withOperationalRun<T>(
  ledgerPath: string,
  agentId: string,
  operation: string,
  mode: OperationalOutcome['mode'],
  call: (run: OperationalRun) => Promise<T>,
): Promise<T> {
  const run = new OperationalRun(agentId, operation, mode);
  let result: { ok: true; value: T } | { ok: false; error: unknown };
  try {
    result = { ok: true, value: await call(run) };
  } catch (error) {
    result = { ok: false, error };
  }
  const status = result.ok ? 'completed' : 'failed';
  const outcome = run.finish(status);
  try {
    // Reload after stage events so sequential audit writes are not overwritten with an old snapshot.
    new SustainabilityLedger(ledgerPath).recordOperationalOutcome(outcome);
  } catch {
    if (status === 'completed')
      throw new Error(
        'Operation completed but run accounting could not be saved. Inspect receipts/audit before retrying.',
      );
    console.warn('Failed operation accounting could not be saved; inspect local audit storage.');
  }
  // eslint-disable-next-line no-console
  console.log(
    JSON.stringify(
      {
        operationRun: {
          runId: outcome.runId,
          relatedPlanId: outcome.relatedPlanId,
          status,
          mode,
          reportedTokens: outcome.selfCost.totalTokens,
          modelRequests: outcome.selfCost.llmCalls,
          toolCalls: outcome.selfCost.totalToolCalls,
          toolFailures: outcome.toolFailures,
          retries: outcome.selfCost.totalRetries,
          durationMs: outcome.durationMs,
          energyKwh: null,
          carbonKgCo2e: null,
        },
      },
      null,
      2,
    ),
  );
  if (!result.ok) throw result.error;
  return result.value;
}
