import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { wasteDemo } from '../../../../../../../packages/agents/dist/waste-demo.js';
import { OrchestratorAgent } from '../../../../../../../packages/agents/dist/orchestrator.js';
import {
  reviewWastePlan,
  simulateWastePlan,
} from '../../../../../../../packages/agents/dist/waste-planner.js';
import { fingerprint } from '../../../../../../../packages/agents/dist/carbon-planner.js';
import { OperationalRun } from '../../../../../../../packages/ledger/dist/operational-run.js';
import type { WasteAction, WasteWorkflow } from './workflow-types';

export class WasteWorkflowError extends Error {
  constructor(
    message: string,
    readonly status = 409,
  ) {
    super(message);
  }
}
export const validWasteSession = (id: string) =>
  /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/.test(id);
const globals = globalThis as typeof globalThis & { wasteWorkflowLocks?: Set<string> };
const locks = (globals.wasteWorkflowLocks ??= new Set<string>());

export function parseWasteAction(value: unknown): WasteAction {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new WasteWorkflowError('Invalid action.', 400);
  const b = value as Record<string, unknown>;
  if (
    !(b.runId === null || (typeof b.runId === 'string' && validWasteSession(b.runId))) ||
    !Number.isSafeInteger(b.revision) ||
    Number(b.revision) < 0
  )
    throw new WasteWorkflowError('Invalid run or revision.', 400);
  const base = { runId: b.runId as string | null, revision: b.revision as number };
  if (b.action === 'start' || b.action === 'check') return { ...base, action: b.action };
  if (typeof b.findingId !== 'string' || !/^waste-[a-f0-9]{24}$/.test(b.findingId))
    throw new WasteWorkflowError('Select a finding.', 400);
  if (b.action === 'simulate') return { ...base, action: b.action, findingId: b.findingId };
  if (
    b.action === 'review' &&
    (b.decision === 'approve' || b.decision === 'reject') &&
    typeof b.reviewer === 'string' &&
    b.reviewer.trim() &&
    b.reviewer.length <= 80 &&
    typeof b.reason === 'string' &&
    b.reason.trim() &&
    b.reason.length <= 500
  )
    return {
      ...base,
      action: b.action,
      findingId: b.findingId,
      decision: b.decision,
      reviewer: b.reviewer.trim(),
      reason: b.reason.trim(),
    };
  throw new WasteWorkflowError('Enter a reviewer label and decision reason.', 400);
}

/** Local, single-process synthetic sandbox. No kubectl, cloud, or model calls. */
export function createWasteWorkflowService(directory: string, clock = () => new Date()) {
  const file = (session: string) => {
    if (!validWasteSession(session)) throw new WasteWorkflowError('Invalid session.', 400);
    return resolve(directory, `${session}.json`);
  };
  async function current(session: string): Promise<WasteWorkflow | null> {
    try {
      return JSON.parse(await readFile(file(session), 'utf8')) as WasteWorkflow;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw new WasteWorkflowError(
        'Saved workflow could not be read. No action was repeated.',
        500,
      );
    }
  }
  async function perform(session: string, action: WasteAction): Promise<WasteWorkflow> {
    const path = file(session);
    if (locks.has(path))
      throw new WasteWorkflowError('An action is running. Refresh before continuing.');
    locks.add(path);
    try {
      let run = await current(session);
      if (action.runId !== (run?.id ?? null) || action.revision !== (run?.revision ?? 0))
        throw new WasteWorkflowError(
          'This workflow changed in another tab. Refresh before continuing.',
        );
      const now = clock();
      const operation = new OperationalRun(
        'digital-waste',
        `dashboard-${action.action}`,
        'synthetic',
      );
      let label: string;
      if (action.action === 'start') {
        const { inventory, usage } = wasteDemo(now);
        const plan = await new OrchestratorAgent().runOperational(
          { kind: 'waste-plan', inventory, usage, now },
          operation,
        );
        run = {
          id: randomUUID(),
          revision: 0,
          plan,
          decisions: [],
          simulation: null,
          checks: null,
          events: [],
          operationalOutcomes: [],
        };
        label = 'Loaded synthetic inventory; Digital Waste produced findings and safety checks.';
      } else {
        if (!run) throw new WasteWorkflowError('Start the workflow first.');
        if (action.action === 'review') {
          if (run.simulation)
            throw new WasteWorkflowError(
              'This run is already simulated. Start a new scenario to review another change.',
            );
          try {
            run.decisions.push(
              reviewWastePlan(
                run.plan,
                action.findingId,
                action.decision,
                action.reviewer,
                action.reason,
                now,
              ),
            );
          } catch (e) {
            throw new WasteWorkflowError((e as Error).message);
          }
          label =
            action.decision === 'approve'
              ? 'Human approved this synthetic plan; no change applied.'
              : 'Human rejected this plan; no change applied.';
        } else if (action.action === 'simulate') {
          if (run.simulation)
            throw new WasteWorkflowError(
              'A simulation is already recorded. It will not be repeated.',
            );
          const decision = run.decisions.findLast((d) => d.findingId === action.findingId);
          if (!decision || decision.decision !== 'approve')
            throw new WasteWorkflowError('Approve this finding before simulation.');
          try {
            run.simulation = simulateWastePlan(run.plan, decision, run.plan.inventory, now);
          } catch (e) {
            throw new WasteWorkflowError((e as Error).message);
          }
          label =
            'Applied the approved change to an isolated inventory copy. Real cloud changes: 0.';
        } else {
          const result = run.simulation;
          if (!result || run.checks)
            throw new WasteWorkflowError('Simulate once before checking the result.');
          const finding = run.plan.findings.find((f) => f.id === result.findingId)!;
          const expected = structuredClone(run.plan.inventory);
          if (finding.action === 'resize-cpu-request')
            expected.workloads
              .find((w) => w.uid === finding.resourceUid)!
              .containers.find((c) => c.name === finding.container)!.requestedCpuCores =
              finding.proposedCpuCores!;
          else expected.volumes = expected.volumes.filter((v) => v.uid !== finding.resourceUid);
          run.checks = [
            {
              label: 'Original inventory remains unchanged',
              passed: fingerprint(run.plan.inventory) === result.beforeHash,
            },
            {
              label: 'Only the approved synthetic change is present',
              passed:
                fingerprint(expected) === fingerprint(result.after) &&
                fingerprint(result.after) === result.afterHash,
            },
            {
              label: 'No cloud changes or verified savings claimed',
              passed: result.realCloudChanges === 0 && result.savingsVerified === false,
            },
          ];
          label = run.checks.every((c) => c.passed)
            ? 'Synthetic state checks passed. Workload quality, energy and billing remain unverified.'
            : 'Synthetic checks failed. No verified result claimed.';
        }
      }
      operation.relatedPlanId = run.plan.id;
      run.operationalOutcomes.push(operation.finish('completed'));
      run.events.push({
        at: now.toISOString(),
        label,
        ...('findingId' in action ? { findingId: action.findingId } : {}),
      });
      run.revision++;
      await mkdir(directory, { recursive: true });
      // Preserve prior versions. These local JSON files are not an immutable ledger.
      const history = resolve(directory, `${session}-${run.id}-${run.revision}.json`);
      await writeFile(history, JSON.stringify(run), { mode: 0o600 });
      const temporary = `${path}.${randomUUID()}.tmp`;
      await writeFile(temporary, JSON.stringify(run), { mode: 0o600, flag: 'wx' });
      await rename(temporary, path);
      return run;
    } finally {
      locks.delete(path);
    }
  }
  return { current, perform };
}
