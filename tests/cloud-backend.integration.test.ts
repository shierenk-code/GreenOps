import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MongoMemoryServer } from '../apps/CodeVitals-MCP/website/node_modules/mongodb-memory-server';
import { GET, POST } from '../apps/CodeVitals-MCP/website/src/app/api/cloud/[...path]/route';
import { database } from '../apps/CodeVitals-MCP/website/src/server/cloud-db';
import { createServer } from 'node:http';
import { mkdtemp, readFile, writeFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { connectCloud, syncLedger, monitorCloud } from '../apps/cli/src/cloud-client';
import { digest } from '../apps/CodeVitals-MCP/website/src/server/cloud-security';
import { buildApprovalProposals } from '../apps/CodeVitals-MCP/website/src/app/dashboard/approval-decisions';
import { selectLatestRun } from '../apps/CodeVitals-MCP/website/src/app/dashboard/ledger-data';
import { findingsFromRun } from '../apps/CodeVitals-MCP/website/src/app/dashboard/control-plane/data';

// Opt in: requires a disposable local MongoDB binary and a loopback listener.
const suite = process.env.GREENOPS_RUN_DB_TESTS === '1' ? describe : describe.skip;
suite('authenticated cloud backend against MongoDB', () => {
  let mongo: MongoMemoryServer;
  let alice = '',
    bob = '',
    terminal = '',
    refresh = '';
  const origin = 'http://localhost:3000';
  const request = async (
    path: string,
    payload?: unknown,
    credential = '',
    bearer = false,
    requestOrigin = origin,
  ) => {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Origin: requestOrigin,
    };
    if (credential) headers[bearer ? 'Authorization' : 'Cookie'] = bearer ? credential : credential;
    const req = new Request(`${origin}/api/cloud/${path}`, {
      method: payload === undefined ? 'GET' : 'POST',
      headers,
      ...(payload === undefined ? {} : { body: JSON.stringify(payload) }),
    });
    return (payload === undefined ? GET : POST)(req, {
      params: Promise.resolve({ path: path.split('?')[0].split('/') }),
    });
  };
  const cookie = (response: Response) =>
    response.headers
      .getSetCookie()
      .map((item) => item.split(';')[0])
      .join('; ');
  const runId = 'run-isolation-test';
  const entry = {
    seq: 1,
    runId,
    bugId: 'finding-a',
    stage: 'detect',
    timestamp: new Date().toISOString(),
    summary: 'Repeated model request',
    data: {
      title: 'Cache repeated requests',
      agentId: 'ai-efficiency',
      category: 'uncached-completion',
      severity: 'high',
      confidence: 'high',
      evidence: { wastedTokens: 300 },
      location: { filePath: 'src/model.ts' },
    },
  };
  const ledger = {
    version: 1,
    entries: [
      entry,
      {
        ...entry,
        seq: 2,
        stage: 'compare',
        data: {
          recommendation: 'Cache duplicate calls',
          fix: {
            title: 'Add a cache',
            description: 'Reuse identical request outputs',
            reversible: true,
          },
        },
      },
    ],
    outcomes: [],
  };
  beforeAll(async () => {
    mongo = await MongoMemoryServer.create();
    process.env.MONGODB_URI = mongo.getUri();
    process.env.MONGODB_DB = 'greenops_test';
    process.env.GREENOPS_PUBLIC_URL = origin;
  }, 180_000);
  afterAll(async () => {
    await mongo?.stop();
    delete process.env.MONGODB_URI;
  });
  it('creates isolated accounts, hashes passwords and sets secure session transport', async () => {
    const a = await request('auth/register', {
      email: 'alice@example.test',
      password: 'unique-test-password-123',
    });
    expect(a.status).toBe(200);
    alice = cookie(a);
    expect(alice).toContain('greenops_access=');
    expect(a.headers.get('set-cookie')).toContain('HttpOnly');
    const b = await request('auth/register', {
      email: 'bob@example.test',
      password: 'other-test-password-456',
    });
    expect(b.status).toBe(200);
    bob = cookie(b);
    const user = await (
      await database()
    )
      .collection('users')
      .findOne({ email: 'alice@example.test' });
    expect(user?.passwordHash).not.toContain('unique-test-password');
    expect((await request('runs')).status).toBe(401);
    expect((await request('connect', {}, alice, false, 'https://evil.test')).status).toBe(403);
  });
  it('consumes a link once and does not expose raw token hashes in sessions', async () => {
    const linkResponse = await request('connect', {}, alice);
    expect(linkResponse.status).toBe(200);
    const code = new URL((await linkResponse.json()).link).hash.slice(1);
    const exchange = await request(
      'connect/exchange',
      { code, label: 'test terminal' },
      'Device',
      true,
    );
    expect(exchange.status).toBe(200);
    const result = await exchange.json();
    terminal = result.accessToken;
    refresh = result.refreshToken;
    expect(
      (await request('connect/exchange', { code, label: 'replay' }, 'Device', true)).status,
    ).toBe(401);
    const sessions = await (await request('sessions', undefined, alice)).text();
    expect(sessions).not.toMatch(/accessHash|refreshHash/);
    expect(sessions).not.toContain(terminal);
  });
  it('isolates device telemetry and rejects malformed/browser submissions', async () => {
    const payload = {
      project: 'test',
      command: 'monitor',
      status: 'running',
      telemetry: {
        cpuPercent: 12,
        memoryUsedBytes: 100,
        memoryTotalBytes: 200,
        cpuCores: 4,
        platform: 'test',
        load1: 1,
        processRssBytes: 10,
      },
    };
    expect((await request('heartbeat', payload, `Bearer ${terminal}`, true)).status).toBe(200);
    expect((await request('heartbeat', payload, alice)).status).toBe(403);
    expect(
      (
        await request(
          'heartbeat',
          { ...payload, telemetry: { ...payload.telemetry, cpuPercent: -1 } },
          `Bearer ${terminal}`,
          true,
        )
      ).status,
    ).toBe(400);
    const own = await (await request('telemetry', undefined, alice)).json();
    expect(own.samples).toHaveLength(1);
    expect(own.samples[0].cpuPercent).toBe(12);
    expect(own.samples[0].userId).toBeUndefined();
    expect((await (await request('telemetry', undefined, bob)).json()).samples).toHaveLength(0);
  });
  it('stores one owner-scoped run idempotently and rejects altered evidence', async () => {
    const upload = await request('runs', { ledger, project: 'my-app' }, `Bearer ${terminal}`, true);
    expect(upload.status).toBe(200);
    expect(
      (
        await (
          await request('runs', { ledger, project: 'my-app' }, `Bearer ${terminal}`, true)
        ).json()
      ).unchanged,
    ).toBe(true);
    const changed = structuredClone(ledger);
    changed.entries[0].summary = 'Rewritten';
    expect(
      (await request('runs', { ledger: changed, project: 'my-app' }, `Bearer ${terminal}`, true))
        .status,
    ).toBe(409);
    expect((await (await request('runs', undefined, bob)).json()).runs).toHaveLength(0);
    expect((await (await request(`ledger?run=${runId}`, undefined, bob)).json()).ledger).toBeNull();
    expect((await request(`metrics?run=${runId}`, undefined, bob)).status).toBe(404);
    expect((await request('runs', { ledger, project: 'web-upload' }, alice)).status).toBe(403);
    expect((await (await request(`metrics?run=${runId}`, undefined, alice)).json()).data.mode).toBe(
      'recorded',
    );
  });
  it('binds reviews to evidence and derives reviewer identity from the authenticated account', async () => {
    const run = selectLatestRun(ledger as never);
    const proposals = await buildApprovalProposals(run, findingsFromRun(run));
    expect(proposals.length).toBeGreaterThan(0);
    const payload = {
      runId,
      findingId: proposals[0].id,
      fingerprint: proposals[0].fingerprint,
      reviewer: 'forged@example.test',
      decision: 'approved',
      reason: 'Reviewed the evidence',
      acknowledged: true,
    };
    expect((await request('reviews', payload, bob)).status).toBe(404);
    expect((await request('reviews', { ...payload, fingerprint: 'stale' }, alice)).status).toBe(
      409,
    );
    const review = await request('reviews', payload, alice);
    expect(review.status).toBe(200);
    const saved = await review.json();
    expect(saved.reviewer).toBe('alice@example.test');
    expect(saved.identity).toBe('authenticated');
    expect(saved.scope).toBe('account-plan-only');
    expect(
      (await (await request(`reviews?run=${runId}`, undefined, bob)).json()).records,
    ).toHaveLength(0);
  });
  it('recalculates savings from confirmed evidence and subtracts scan cost', async () => {
    const id = 'arithmetic-run';
    const entries = [
      { ...entry, runId: id },
      {
        ...entry,
        runId: id,
        seq: 2,
        stage: 'verify',
        data: { confirmed: true, actualEnergyKwh: 3, actualCarbonKgCo2e: 0.6 },
      },
    ];
    const outcomes = [
      {
        runId: id,
        bugsDetected: 999,
        bugsImproved: 999,
        savings: { energyKwh: 999, carbonKgCo2e: 999 },
        selfCost: { energyKwh: 1, carbonKgCo2e: 0.2, tokens: 20, toolCalls: 1, retries: 0 },
        net: { energyKwh: 999, carbonKgCo2e: 999, netPositive: true },
      },
    ];
    expect(
      (
        await request(
          'runs',
          { project: 'metrics', ledger: { version: 1, entries, outcomes } },
          `Bearer ${terminal}`,
          true,
        )
      ).status,
    ).toBe(200);
    const stored = (await (await request(`ledger?run=${id}`, undefined, alice)).json()).ledger
      .outcomes[0];
    expect(stored.bugsDetected).toBe(1);
    expect(stored.bugsImproved).toBe(1);
    expect(stored.savings.energyKwh).toBe(3);
    expect(stored.net.energyKwh).toBe(2);
    expect(stored.net.carbonKgCo2e).toBeCloseTo(0.4);
  });
  it('rotates refresh tokens, rejects replay and honors session revocation', async () => {
    const response = await request('auth/refresh', { refreshToken: refresh }, 'Refresh', true);
    expect(response.status).toBe(200);
    const next = await response.json();
    expect((await request('auth/refresh', { refreshToken: refresh }, 'Refresh', true)).status).toBe(
      401,
    );
    expect(
      (
        await request(
          'heartbeat',
          { project: 'my-app', command: 'review', status: 'running' },
          `Bearer ${terminal}`,
          true,
        )
      ).status,
    ).toBe(401);
    terminal = next.accessToken;
    const session = await (
      await database()
    )
      .collection('sessions')
      .findOne({ accessHash: digest(terminal) });
    expect((await request('sessions/revoke', { id: session!._id.toString() }, bob)).status).toBe(
      200,
    );
    expect(
      (
        await request(
          'heartbeat',
          { project: 'my-app', command: 'review', status: 'running' },
          `Bearer ${terminal}`,
          true,
        )
      ).status,
    ).toBe(200);
    await request('sessions/revoke', { id: session!._id.toString() }, alice);
    expect(
      (
        await request(
          'heartbeat',
          { project: 'my-app', command: 'review', status: 'running' },
          `Bearer ${terminal}`,
          true,
        )
      ).status,
    ).toBe(401);
    expect(
      (await request('auth/refresh', { refreshToken: next.refreshToken }, 'Refresh', true)).status,
    ).toBe(401);
  });
  it('connects the real CLI over HTTP, uploads evidence and refreshes expired credentials', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'greenops-cloud-test-'));
    const server = createServer(async (incoming, outgoing) => {
      const chunks: Buffer[] = [];
      for await (const chunk of incoming) chunks.push(Buffer.from(chunk));
      const req = new Request(`http://127.0.0.1${incoming.url}`, {
        method: incoming.method,
        headers: incoming.headers as Record<string, string>,
        body: Buffer.concat(chunks).toString(),
      });
      const response = await POST(req, {
        params: Promise.resolve({ path: incoming.url!.split('/api/cloud/')[1].split('/') }),
      });
      outgoing.writeHead(response.status, Object.fromEntries(response.headers));
      outgoing.end(await response.text());
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address() as { port: number };
    const local = `http://127.0.0.1:${address.port}`;
    process.env.GREENOPS_PUBLIC_URL = local;
    process.env.GREENOPS_CREDENTIAL_DIR = directory;
    try {
      const response = await request('connect', {}, alice, false, local);
      const link = (await response.json()).link;
      await connectCloud(link);
      const file = join(directory, 'ledger.json');
      const cliLedger = {
        ...ledger,
        entries: ledger.entries.map((item) => ({ ...item, runId: 'cli-http-run' })),
      };
      await writeFile(file, JSON.stringify(cliLedger));
      const credentialsPath = join(directory, 'credentials.json');
      const credentials = JSON.parse(await readFile(credentialsPath, 'utf8'));
      const credentialFile = await stat(credentialsPath);
      expect(credentialFile.isFile()).toBe(true);
      // Windows exposes synthesized POSIX mode bits; this is not an ACL check.
      // Enforce POSIX permissions where supported, while keeping sync/rotation
      // coverage runnable on Windows. Windows ACL privacy needs a separate audit.
      if (process.platform !== 'win32') expect(credentialFile.mode & 0o777).toBe(0o600);
      await writeFile(credentialsPath, JSON.stringify({ ...credentials, expiresAt: 0 }));
      expect(await syncLedger(file, 'cli-fixture')).toBe(1);
      const rotated = JSON.parse(await readFile(credentialsPath, 'utf8'));
      expect(rotated.refreshToken).not.toBe(credentials.refreshToken);
      expect(await syncLedger(file, 'cli-fixture')).toBe(0);
      const monitorFile = join(directory, 'monitor-ledger.json');
      await writeFile(
        monitorFile,
        JSON.stringify({
          ...ledger,
          entries: ledger.entries.map((item) => ({
            ...item,
            runId: 'must-not-upload-during-monitor',
          })),
        }),
      );
      const stop = await monitorCloud(monitorFile, 'cli-fixture', 'monitor');
      await stop();
      expect(
        await (
          await database()
        )
          .collection('runs')
          .countDocuments({ runId: 'must-not-upload-during-monitor' }),
      ).toBe(0);
      const telemetry = await (await request('telemetry', undefined, alice)).json();
      expect(
        telemetry.samples.some((sample: { project: string }) => sample.project === 'cli-fixture'),
      ).toBe(true);
      const own = await (await request('ledger?run=cli-http-run', undefined, alice)).json();
      expect(own.ledger.entries).toHaveLength(2);
      expect(
        (await (await request('ledger?run=cli-http-run', undefined, bob)).json()).ledger,
      ).toBeNull();
    } finally {
      process.env.GREENOPS_PUBLIC_URL = origin;
      delete process.env.GREENOPS_CREDENTIAL_DIR;
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
      await rm(directory, { recursive: true, force: true });
    }
  });
  it('logs out even after access expiry and prevents the refresh cookie from signing back in', async () => {
    const db = await database();
    const user = await db.collection('users').findOne({ email: 'bob@example.test' });
    await db
      .collection('sessions')
      .updateMany(
        { userId: user!._id.toString(), kind: 'browser' },
        { $set: { accessExpiresAt: new Date(0) } },
      );
    expect((await request('me', undefined, bob)).status).toBe(401);
    expect((await request('auth/logout', {}, bob)).status).toBe(200);
    expect((await request('auth/refresh', {}, bob)).status).toBe(401);
  });
});
