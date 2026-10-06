import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  analyzeDemo,
  applyDemo,
  createDemoRun,
  decideDemo,
  rollbackDemo,
  verifyDemo,
} from './demo-engine';
import type { DemoAction, DemoProvider, DemoRun } from './demo-types';

export const validSession = (value: string): boolean =>
  /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/.test(value);
export class DemoServiceError extends Error {
  constructor(
    message: string,
    public readonly status = 409,
  ) {
    super(message);
  }
}
interface StoredSession {
  run: DemoRun | null;
  pending: boolean;
}
// Single-process localhost demo. Keep locks across development hot reloads.
const processState = globalThis as typeof globalThis & { greenopsDemoLocks?: Set<string> };
const locks = (processState.greenopsDemoLocks ??= new Set<string>());

export function createDemoService(options: {
  directory: string;
  providerFor: (mode: 'fixture' | 'gemini', pinnedModel?: string) => DemoProvider;
}) {
  const directory = resolve(options.directory);
  const key = (session: string) => {
    if (!validSession(session)) throw new DemoServiceError('Invalid demo session.', 400);
    return resolve(directory, `${session}.json`);
  };
  async function read(session: string): Promise<StoredSession> {
    try {
      return JSON.parse(await readFile(key(session), 'utf8')) as StoredSession;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { run: null, pending: false };
      throw new DemoServiceError(
        'The saved demo could not be read. Start in a new browser session.',
        500,
      );
    }
  }
  async function atomic(path: string, value: unknown) {
    await mkdir(directory, { recursive: true });
    const temp = `${path}.${randomUUID()}.tmp`;
    await writeFile(temp, JSON.stringify(value, null, 2), { encoding: 'utf8', mode: 0o600 });
    await rename(temp, path);
  }
  async function save(session: string, state: StoredSession) {
    // Historical runs are retained when a user starts a new run. No fleet ledger is touched.
    if (state.run)
      await atomic(resolve(directory, `run-${state.run.id}-v${state.run.version}.json`), state.run);
    await atomic(key(session), state);
  }
  async function recover(run: DemoRun): Promise<DemoRun> {
    // A completed version can reach disk before the session pointer. Prefer it;
    // never overwrite that completed evidence with an interruption marker.
    try {
      const next = JSON.parse(
        await readFile(resolve(directory, `run-${run.id}-v${run.version + 1}.json`), 'utf8'),
      ) as DemoRun;
      if (
        next.id === run.id &&
        next.version === run.version + 1 &&
        next.datasetHash === run.datasetHash
      )
        return next;
    } catch {
      /* No completed next version: fail closed without repeating calls. */
    }
    return {
      ...run,
      version: run.version + 1,
      status: run.application?.cacheEnabled ? 'verification-failed' : 'failed',
      failure:
        'The server stopped during this operation. Usage may be incomplete. No automatic retry was made; roll back an applied change or start a new demo.',
      updatedAt: new Date().toISOString(),
    };
  }
  async function current(session: string): Promise<DemoRun | null> {
    const state = await read(session);
    if (state.pending && !locks.has(key(session))) {
      // Never silently retry a potentially billed request after a process interruption.
      if (state.run) {
        state.run = await recover(state.run);
      }
      state.pending = false;
      await save(session, state);
    }
    return state.run;
  }
  async function perform(session: string, action: DemoAction): Promise<DemoRun> {
    const lock = key(session);
    if (locks.has(lock))
      throw new DemoServiceError('A demo action is already running. Wait, then refresh.');
    locks.add(lock);
    let started: DemoRun | null = null;
    try {
      const saved = await read(session);
      if (saved.pending)
        throw new DemoServiceError('An earlier action was interrupted. Refresh before continuing.');
      let run = saved.run;
      if (action.action === 'start') {
        if (action.mode === 'gemini' && action.liveConsent !== true)
          throw new DemoServiceError('Confirm the live API usage before starting.', 400);
        if (run && Date.now() - Date.parse(run.createdAt) < 1500)
          throw new DemoServiceError('Please wait before starting another demo.');
        const provider = options.providerFor(action.mode);
        run = createDemoRun(action.mode, provider.model);
        started = run;
        await save(session, { run, pending: true });
        run = await analyzeDemo(run, provider);
      } else {
        if (!run || run.id !== action.runId || run.version !== action.version)
          throw new DemoServiceError('These results have changed. Refresh before acting.');
        if (action.action === 'verify') {
          if (run.status !== 'applied')
            throw new DemoServiceError('Apply the approved demo change before verifying.');
          // Construct provider before marking pending; missing credentials should not consume the approval.
          const provider = options.providerFor(run.mode, run.model);
          started = run;
          await save(session, { run, pending: true });
          run = await verifyDemo(run, provider);
        } else if (action.action === 'decide') run = decideDemo(run, action);
        else if (action.action === 'apply') run = applyDemo(run);
        else run = rollbackDemo(run);
      }
      await save(session, { run, pending: false });
      return run;
    } catch (error) {
      if (started) {
        // Preserve last evidence, fail closed, and clear pending. Do not replay model calls.
        await save(session, { pending: false, run: await recover(started) });
      }
      if (error instanceof DemoServiceError) throw error;
      // Engine errors describe validation/state problems; never expose arbitrary provider or IO errors.
      throw new DemoServiceError(
        'This action is not available for the current demo state. Refresh and review the next step.',
      );
    } finally {
      locks.delete(lock);
    }
  }
  return { current, perform, busy: (session: string) => locks.has(key(session)) };
}

export function parseDemoAction(value: unknown): DemoAction {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new DemoServiceError('Invalid demo action.', 400);
  const body = value as Record<string, unknown>;
  if (body.action === 'start' && (body.mode === 'fixture' || body.mode === 'gemini')) {
    return { action: 'start', mode: body.mode, liveConsent: body.liveConsent === true };
  }
  if (
    typeof body.runId !== 'string' ||
    body.runId.length > 100 ||
    !Number.isSafeInteger(body.version) ||
    (body.version as number) < 0
  )
    throw new DemoServiceError('Invalid run or version.', 400);
  const base = { runId: body.runId, version: body.version as number };
  if (
    body.action === 'decide' &&
    typeof body.approved === 'boolean' &&
    typeof body.actor === 'string' &&
    body.actor.trim().length >= 2 &&
    body.actor.length <= 80 &&
    typeof body.note === 'string' &&
    body.note.length <= 500 &&
    !/[\x00-\x1f]/.test(body.actor)
  ) {
    return {
      ...base,
      action: 'decide',
      approved: body.approved,
      actor: body.actor.trim(),
      note: body.note.trim(),
      acknowledged: body.acknowledged === true,
    };
  }
  if (body.action === 'apply' || body.action === 'verify' || body.action === 'rollback')
    return { ...base, action: body.action };
  throw new DemoServiceError('Invalid demo action or reviewer details.', 400);
}
