import { randomUUID } from 'node:crypto';
import { database } from './cloud-db';
import { check, CloudError, digest, text } from './cloud-security';
import type { Principal } from './cloud-auth';
import { validateLedger, selectLatestRun, type LedgerFile } from '../app/dashboard/ledger-data';
import { buildRecordedData, findingsFromRun } from '../app/dashboard/control-plane/data';
import {
  buildApprovalProposals,
  appendApprovalRecord,
  type ApprovalInput,
} from '../app/dashboard/approval-decisions';
import { selectDashboardRun } from '../app/dashboard/dashboard-run';

export async function storeRun(principal: Principal, payload: Record<string, unknown>) {
  let ledger: LedgerFile;
  try {
    ledger = validateLedger(payload.ledger);
  } catch {
    throw new CloudError(400, 'Invalid GreenOps ledger.');
  }
  const ids = [
    ...new Set([...ledger.entries.map((e) => e.runId), ...ledger.outcomes.map((o) => o.runId)]),
  ];
  check(ids.length === 1, 400, 'Upload one run at a time.');
  const runId = text(ids[0], 300);
  const project = text(payload.project, 100);
  check(
    ledger.entries.every((e) => e.bugId.length <= 300),
    400,
    'Finding identifier too long.',
  );
  // Recompute outcome arithmetic from reported inputs. These remain CLI-reported estimates.
  for (const outcome of ledger.outcomes) {
    const verified = new Map(
      ledger.entries.filter((e) => e.stage === 'verify').map((e) => [e.bugId, e]),
    );
    const improvements = [...verified.values()].filter((e) => e.data.confirmed === true);
    let energy = 0,
      carbon = 0;
    for (const entry of improvements) {
      const e = entry.data.actualEnergyKwh,
        c = entry.data.actualCarbonKgCo2e;
      check(
        typeof e === 'number' &&
          Number.isFinite(e) &&
          e >= 0 &&
          typeof c === 'number' &&
          Number.isFinite(c) &&
          c >= 0,
        400,
        'Verified savings require finite, non-negative estimates.',
      );
      energy += e;
      carbon += c;
    }
    outcome.savings = { energyKwh: energy, carbonKgCo2e: carbon };
    outcome.bugsDetected = new Set(
      ledger.entries.filter((e) => e.stage === 'detect').map((e) => e.bugId),
    ).size;
    outcome.bugsImproved = improvements.length;
    outcome.net = {
      energyKwh:
        outcome.selfCost.energyKwh === null
          ? null
          : outcome.savings.energyKwh - outcome.selfCost.energyKwh,
      carbonKgCo2e:
        outcome.selfCost.carbonKgCo2e === null
          ? null
          : outcome.savings.carbonKgCo2e - outcome.selfCost.carbonKgCo2e,
      netPositive:
        outcome.selfCost.energyKwh === null
          ? null
          : outcome.savings.energyKwh > outcome.selfCost.energyKwh,
    };
  }
  const db = await database();
  const runs = db.collection('runs');
  const filter = { userId: principal.userId, runId };
  const previous = await runs.findOne(filter);
  const hash = digest(JSON.stringify(ledger));
  if (previous?.hash === hash) return { runId, unchanged: true };
  if (previous) {
    const old = previous.ledger as LedgerFile;
    check(
      old.entries.every((entry, i) => JSON.stringify(entry) === JSON.stringify(ledger.entries[i])),
      409,
      'Previously uploaded evidence cannot be rewritten. Create a new run.',
    );
    check(old.outcomes.length === 0, 409, 'A completed run cannot be changed.');
  }
  const update = {
    ...filter,
    project,
    ledger,
    hash,
    updatedAt: new Date(),
    source: 'authenticated-cli',
    sessionId: principal.sessionId,
  };
  try {
    if (previous) {
      const result = await runs.updateOne({ ...filter, hash: previous.hash }, { $set: update });
      check(result.modifiedCount === 1, 409, 'Concurrent update. Retry synchronization.');
    } else await runs.insertOne({ ...update, createdAt: new Date() });
  } catch (error) {
    if (error instanceof CloudError) throw error;
    throw new CloudError(409, 'Concurrent run upload. Retry synchronization.');
  }
  return { runId, unchanged: false };
}
export async function userLedger(userId: string, runId?: string) {
  const db = await database();
  const docs = await db
    .collection('runs')
    .find({ userId, ...(runId ? { runId } : {}) })
    .sort({ updatedAt: -1 })
    .limit(runId ? 1 : 1)
    .toArray();
  return docs[0]
    ? { ledger: docs[0].ledger as LedgerFile, fileName: `${docs[0].project} / ${docs[0].runId}` }
    : {
        ledger: null,
        fileName: '',
        error: 'No synced run yet. Connect your terminal and run greenops review or greenops run.',
      };
}
export async function runMetrics(userId: string, runId: string) {
  const loaded = await userLedger(userId, runId);
  check(loaded.ledger, 404, 'Run not found.');
  const run = selectLatestRun(loaded.ledger);
  return {
    source: 'authenticated-cli-evidence',
    physicalMeasurements:
      'Only values explicitly recorded by the scanner are available; estimates are not metered savings.',
    data: buildRecordedData(run, findingsFromRun(run), 'All', '1y'),
  };
}
export async function saveReview(principal: Principal, payload: Record<string, unknown>) {
  const runId = text(payload.runId),
    findingId = text(payload.findingId),
    fingerprint = text(payload.fingerprint);
  const loaded = await userLedger(principal.userId, runId);
  check(loaded.ledger, 404, 'Run not found.');
  const run = selectDashboardRun(loaded.ledger, runId);
  const proposals = await buildApprovalProposals(run, findingsFromRun(run));
  const proposal = proposals.find((p) => p.id === findingId);
  check(
    proposal && proposal.fingerprint === fingerprint,
    409,
    'The proposal changed. Refresh its evidence before reviewing.',
  );
  const db = await database();
  const sequence = await db
    .collection('counters')
    .findOneAndUpdate(
      { userId: principal.userId, runId },
      { $inc: { value: 1 } },
      { upsert: true, returnDocument: 'after' },
    );
  let record;
  try {
    record = appendApprovalRecord(
      { version: 1, records: [] },
      proposal,
      {
        decision: payload.decision,
        reason: payload.reason,
        acknowledged: payload.acknowledged,
        reviewer: principal.email,
      } as ApprovalInput,
      randomUUID(),
      new Date().toISOString(),
    ).records[0];
  } catch {
    throw new CloudError(400, 'Choose a decision, add a reason and acknowledge plan-only review.');
  }
  const saved = {
    ...record,
    sequence: sequence!.value,
    scope: 'account-plan-only',
    identity: 'authenticated',
    userId: principal.userId,
    sessionId: principal.sessionId,
  };
  await db.collection('reviews').insertOne(saved);
  return saved;
}
