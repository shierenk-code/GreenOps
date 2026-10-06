import { mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  createDemoService,
  parseDemoAction,
  validSession,
} from '../apps/CodeVitals-MCP/website/src/app/dashboard/ai-efficiency-demo/demo-service';
import { createFixtureProvider } from '../apps/CodeVitals-MCP/website/src/app/dashboard/ai-efficiency-demo/demo-engine';

async function setup() {
  const directory = await mkdtemp(join(tmpdir(), 'greenops-demo-service-'));
  return {
    directory,
    service: createDemoService({ directory, providerFor: () => createFixtureProvider() }),
    session: randomUUID(),
  };
}
describe('Isolated demo persistence and state validation', () => {
  it('persists approval, application, verification and rollback across service instances', async () => {
    const { service, session, directory } = await setup();
    let run = await service.perform(session, { action: 'start', mode: 'fixture' });
    run = await service.perform(session, {
      action: 'decide',
      runId: run.id,
      version: run.version,
      approved: true,
      actor: 'Demo reviewer',
      note: 'Synthetic only',
      acknowledged: true,
    });
    run = await service.perform(session, { action: 'apply', runId: run.id, version: run.version });
    run = await service.perform(session, { action: 'verify', runId: run.id, version: run.version });
    expect(run.status).toBe('verified');
    const restored = createDemoService({ directory, providerFor: () => createFixtureProvider() });
    expect(await restored.current(session)).toEqual(run);
    run = await restored.perform(session, {
      action: 'rollback',
      runId: run.id,
      version: run.version,
    });
    expect(run.application?.cacheEnabled).toBe(false);
    expect(run.verification?.passed).toBe(true);
    expect(
      JSON.parse(await readFile(join(directory, `run-${run.id}-v${run.version}.json`), 'utf8'))
        .decision.actor,
    ).toBe('Demo reviewer');
    expect((await readdir(directory)).every((name) => name.endsWith('.json'))).toBe(true);
  });
  it('rejects stale actions, foreign sessions, premature verification and unapproved application', async () => {
    const { service, session } = await setup();
    const run = await service.perform(session, { action: 'start', mode: 'fixture' });
    for (const action of ['apply', 'verify'] as const) {
      await expect(
        service.perform(session, { action, runId: run.id, version: run.version }),
      ).rejects.toThrow();
      expect((await service.current(session))?.status).toBe('awaiting-approval');
    }
    await expect(
      service.perform(randomUUID(), { action: 'apply', runId: run.id, version: run.version }),
    ).rejects.toThrow('changed');
    await expect(
      service.perform(session, { action: 'apply', runId: run.id, version: run.version - 1 }),
    ).rejects.toThrow('changed');
  });
  it('does not apply a rejection, repeat a decision, or infer approval', async () => {
    const { service, session } = await setup();
    let run = await service.perform(session, { action: 'start', mode: 'fixture' });
    await expect(
      service.perform(session, {
        action: 'decide',
        runId: run.id,
        version: run.version,
        approved: true,
        actor: 'Reviewer',
        note: '',
        acknowledged: false,
      }),
    ).rejects.toThrow();
    run = await service.perform(session, {
      action: 'decide',
      runId: run.id,
      version: run.version,
      approved: false,
      actor: 'Reviewer',
      note: 'Declined',
      acknowledged: false,
    });
    await expect(
      service.perform(session, { action: 'apply', runId: run.id, version: run.version }),
    ).rejects.toThrow();
    expect((await service.current(session))?.application).toBeUndefined();
  });
  it('requires consent before constructing a live provider', async () => {
    const { service, session } = await setup();
    await expect(service.perform(session, { action: 'start', mode: 'gemini' })).rejects.toThrow(
      'Confirm',
    );
    expect(await service.current(session)).toBeNull();
  });
  it('recovers a completed version after the session pointer write was interrupted', async () => {
    const { service, session, directory } = await setup();
    const completed = await service.perform(session, { action: 'start', mode: 'fixture' });
    const previous = JSON.parse(
      await readFile(join(directory, `run-${completed.id}-v1.json`), 'utf8'),
    );
    await writeFile(
      join(directory, `${session}.json`),
      JSON.stringify({ run: previous, pending: true }),
    );
    expect(await service.current(session)).toEqual(completed);
  });
  it('permits rollback after an interrupted verification and does not replay calls', async () => {
    const { service, session, directory } = await setup();
    let run = await service.perform(session, { action: 'start', mode: 'fixture' });
    run = await service.perform(session, {
      action: 'decide',
      runId: run.id,
      version: run.version,
      approved: true,
      actor: 'Reviewer',
      note: '',
      acknowledged: true,
    });
    run = await service.perform(session, { action: 'apply', runId: run.id, version: run.version });
    await writeFile(join(directory, `${session}.json`), JSON.stringify({ run, pending: true }));
    const interrupted = (await service.current(session))!;
    expect(interrupted.status).toBe('verification-failed');
    expect(interrupted.failure).toContain('Usage may be incomplete');
    expect(
      (
        await service.perform(session, {
          action: 'rollback',
          runId: interrupted.id,
          version: interrupted.version,
        })
      ).status,
    ).toBe('rolled-back');
  });
  it('serializes concurrent actions and blocks repeated model spending', async () => {
    const { directory, session } = await setup();
    let release!: () => void;
    const barrier = new Promise<void>((resolve) => {
      release = resolve;
    });
    const provider = createFixtureProvider();
    const complete = provider.complete;
    provider.complete = async (input) => {
      await barrier;
      return complete(input);
    };
    const service = createDemoService({ directory, providerFor: () => provider });
    const first = service.perform(session, { action: 'start', mode: 'fixture' });
    await expect(service.perform(session, { action: 'start', mode: 'fixture' })).rejects.toThrow(
      'already running',
    );
    release();
    await first;
    expect(service.busy(session)).toBe(false);
  });
  it('rejects traversal/session IDs and malformed commands', async () => {
    const { service } = await setup();
    expect(validSession('../../.env')).toBe(false);
    await expect(
      service.perform('../../.env', { action: 'start', mode: 'fixture' }),
    ).rejects.toThrow();
    for (const value of [
      null,
      [],
      { action: 'start', mode: 'arbitrary' },
      { action: 'apply', runId: 'x', version: -1 },
      { action: 'decide', runId: 'x', version: 1, approved: 'true' },
    ]) {
      expect(() => parseDemoAction(value)).toThrow();
    }
    expect(
      parseDemoAction({
        action: 'start',
        mode: 'fixture',
        endpoint: 'https://evil.invalid',
        dataset: '/.env',
      }),
    ).toEqual({ action: 'start', mode: 'fixture', liveConsent: false });
  });
});
