import { validateTelemetry, gridData, explainTelemetry } from '../../../../server/live-data';
import { NextResponse } from 'next/server';
import { ObjectId } from 'mongodb';
import { database, cloudEnabled } from '../../../../server/cloud-db';
import {
  authenticate,
  issueSession,
  rotateSession,
  rateLimit,
  ACCESS_COOKIE,
  REFRESH_COOKIE,
} from '../../../../server/cloud-auth';
import {
  body,
  check,
  CloudError,
  digest,
  email,
  hashPassword,
  verifyPassword,
  publicOrigin,
  guardOrigin,
  text,
  token,
  ACCESS_SECONDS,
  REFRESH_SECONDS,
} from '../../../../server/cloud-security';
import { storeRun, userLedger, runMetrics, saveReview } from '../../../../server/cloud-runs';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'private, no-store', Vary: 'Cookie, Authorization' };
function result(data: unknown, status = 200) {
  return NextResponse.json(data, { status, headers });
}
function sessionResponse(
  tokens: { accessToken: string; refreshToken: string; expiresIn: number },
  browser: boolean,
) {
  const response = result(browser ? { ok: true, expiresIn: tokens.expiresIn } : tokens);
  if (browser)
    for (const [name, value, maxAge] of [
      [ACCESS_COOKIE, tokens.accessToken, ACCESS_SECONDS],
      [REFRESH_COOKIE, tokens.refreshToken, REFRESH_SECONDS],
    ] as const)
      response.cookies.set(name, value, {
        httpOnly: true,
        secure: publicOrigin().startsWith('https:'),
        sameSite: 'strict',
        path: '/',
        maxAge,
      });
  return response;
}
async function handler(request: Request, context: { params: Promise<{ path: string[] }> }) {
  try {
    check(cloudEnabled(), 503, 'Cloud storage is not configured.');
    const path = (await context.params).path.join('/');
    const get = request.method === 'GET';
    if (!get) guardOrigin(request);
    const db = await database();
    if (path === 'health' && get) {
      await db.command({ ping: 1 });
      return result({ status: 'ok' });
    }
    if (path === 'auth/register' || path === 'auth/login') {
      check(!get, 405, 'Use POST.');
      const input = await body(request);
      const address = email(input.email);
      // Global and account buckets avoid trusting spoofable forwarded IP headers.
      await rateLimit('auth-global', 300);
      await rateLimit(`auth:${address}`);
      if (path === 'auth/register') {
        check(process.env.GREENOPS_REGISTRATION !== 'closed', 403, 'Registration is closed.');
        const passwordHash = await hashPassword(input.password);
        try {
          await db
            .collection('users')
            .insertOne({ email: address, passwordHash, createdAt: new Date() });
        } catch {
          throw new CloudError(409, 'Unable to register. Try signing in.');
        }
      }
      const user = await db.collection('users').findOne({ email: address });
      // Same expensive KDF for unknown accounts.
      const valid = await verifyPassword(
        input.password,
        user?.passwordHash ?? `${'0'.repeat(32)}:${'0'.repeat(128)}`,
      );
      check(user && valid, 401, 'Email or password is incorrect.');
      return sessionResponse(
        await issueSession(user._id.toString(), 'browser', 'Web browser'),
        true,
      );
    }
    if (path === 'auth/refresh') {
      check(!get, 405, 'Use POST.');
      await rateLimit('refresh-global', 3000);
      const browser = !request.headers.has('authorization');
      const input = browser ? {} : await body(request);
      const refresh = browser
        ? request.headers.get('cookie')?.match(/(?:^|;\s*)greenops_refresh=([^;]+)/)?.[1]
        : input.refreshToken;
      return sessionResponse(
        await rotateSession(text(refresh, 100), browser ? 'browser' : 'cli'),
        browser,
      );
    }
    if (path === 'connect/exchange') {
      check(
        !get && request.headers.get('authorization') === 'Device',
        405,
        'Use the terminal connection command.',
      );
      await rateLimit('exchange-global', 300);
      const input = await body(request);
      const link = await db.collection('links').findOneAndDelete({
        codeHash: digest(text(input.code, 100)),
        expiresAt: { $gt: new Date() },
      });
      check(link, 401, 'Connection link expired or already used. Generate a new link.');
      return sessionResponse(await issueSession(link.userId, 'cli', text(input.label, 100)), false);
    }
    if (path === 'auth/logout' && !get && !request.headers.has('authorization')) {
      // Logout must also revoke an expired access session using its refresh cookie.
      const refresh = request.headers
        .get('cookie')
        ?.match(/(?:^|;\s*)greenops_refresh=([^;]+)/)?.[1];
      if (refresh && refresh.length <= 100)
        await db
          .collection('sessions')
          .updateOne(
            { refreshHash: digest(refresh), kind: 'browser' },
            { $set: { revokedAt: new Date() } },
          );
      const response = result({ ok: true });
      response.cookies.delete(ACCESS_COOKIE);
      response.cookies.delete(REFRESH_COOKIE);
      return response;
    }
    const principal = await authenticate(request);
    await rateLimit(`api:${principal.sessionId}`, 600, 60);
    if (path === 'grid' && get) return result({ points: await gridData() });
    if (path === 'telemetry' && get) {
      const samples = await db
        .collection('telemetry')
        .find(
          { userId: principal.userId, receivedAt: { $gt: new Date(Date.now() - 3600_000) } },
          { projection: { _id: 0, userId: 0, expiresAt: 0 } },
        )
        .sort({ receivedAt: -1 })
        .limit(720)
        .toArray();
      return result({ samples: samples.reverse() });
    }
    if (path === 'telemetry/explain' && !get) {
      check(principal.kind === 'browser', 403, 'Request assessments from the dashboard.');
      await rateLimit(`telemetry-ai:${principal.userId}`, 3, 300);
      const input = await body(request);
      const sessionId = text(input.sessionId, 100);
      const samples = await db
        .collection('telemetry')
        .find(
          {
            userId: principal.userId,
            sessionId,
            receivedAt: { $gt: new Date(Date.now() - 120_000) },
          },
          { projection: { _id: 0, userId: 0, sessionId: 0, expiresAt: 0, project: 0 } },
        )
        .sort({ receivedAt: -1 })
        .limit(24)
        .toArray();
      return result(await explainTelemetry(samples, await gridData()));
    }
    if (path === 'me' && get) return result({ id: principal.userId, email: principal.email });
    if (path === 'auth/logout' && !get) {
      await db
        .collection('sessions')
        .updateOne(
          { _id: new ObjectId(principal.sessionId), userId: principal.userId },
          { $set: { revokedAt: new Date() } },
        );
      const response = result({ ok: true });
      response.cookies.delete(ACCESS_COOKIE);
      response.cookies.delete(REFRESH_COOKIE);
      return response;
    }
    if (path === 'connect' && !get) {
      check(principal.kind === 'browser', 403, 'Create connection links from your dashboard.');
      const code = token();
      await db.collection('links').deleteMany({ userId: principal.userId });
      await db.collection('links').insertOne({
        userId: principal.userId,
        codeHash: digest(code),
        expiresAt: new Date(Date.now() + 10 * 60_000),
      });
      return result({ link: `${publicOrigin()}/connect#${code}`, expiresIn: 600 });
    }
    if (path === 'sessions' && get) {
      const sessions = await db
        .collection('sessions')
        .find(
          {
            userId: principal.userId,
            revokedAt: { $exists: false },
            expiresAt: { $gt: new Date() },
          },
          { projection: { label: 1, kind: 1, lastSeenAt: 1, createdAt: 1, scan: 1 } },
        )
        .sort({ createdAt: -1 })
        .limit(100)
        .toArray();
      return result({
        sessions: sessions.map((s) => ({
          ...s,
          id: s._id.toString(),
          current: s._id.toString() === principal.sessionId,
        })),
      });
    }
    if (path === 'sessions/revoke' && !get) {
      const input = await body(request);
      const id = text(input.id);
      check(ObjectId.isValid(id), 400, 'Invalid session.');
      await db
        .collection('sessions')
        .updateOne(
          { _id: new ObjectId(id), userId: principal.userId },
          { $set: { revokedAt: new Date() } },
        );
      return result({ ok: true });
    }
    if (path === 'heartbeat' && !get) {
      check(principal.kind === 'cli', 403, 'Terminal only.');
      const input = await body(request);
      check(
        ['running', 'idle', 'failed'].includes(String(input.status)),
        400,
        'Invalid activity status.',
      );
      if (input.telemetry !== undefined) {
        const telemetry = validateTelemetry(input.telemetry);
        await rateLimit(`telemetry:${principal.sessionId}`, 20, 60);
        await db
          .collection('telemetry')
          .insertOne({
            ...telemetry,
            userId: principal.userId,
            sessionId: principal.sessionId,
            project: text(input.project, 100),
            receivedAt: new Date(),
            expiresAt: new Date(Date.now() + 24 * 3600_000),
          });
      }
      await db.collection('sessions').updateOne(
        { _id: new ObjectId(principal.sessionId), userId: principal.userId },
        {
          $set: {
            lastSeenAt: new Date(),
            scan: {
              project: text(input.project, 100),
              command: text(input.command, 100),
              status: input.status,
            },
          },
        },
      );
      return result({ ok: true });
    }
    if (path === 'runs' && !get) {
      check(principal.kind === 'cli', 403, 'Sync evidence using your linked terminal.');
      return result(await storeRun(principal, await body(request, 4 * 1024 * 1024)));
    }
    if (path === 'runs' && get) {
      const runs = await db
        .collection('runs')
        .find({ userId: principal.userId }, { projection: { ledger: 0, sessionId: 0, userId: 0 } })
        .sort({ updatedAt: -1 })
        .limit(100)
        .toArray();
      return result({ runs });
    }
    const runId = new URL(request.url).searchParams.get('run') || undefined;
    if (path === 'ledger' && get) return result(await userLedger(principal.userId, runId));
    if (path === 'metrics' && get) return result(await runMetrics(principal.userId, text(runId)));
    if (path === 'reviews' && get) {
      const records = await db
        .collection('reviews')
        .find(
          { userId: principal.userId, runId: text(runId) },
          { projection: { _id: 0, userId: 0, sessionId: 0 } },
        )
        .sort({ sequence: 1 })
        .limit(500)
        .toArray();
      return result({ records });
    }
    if (path === 'reviews' && !get) {
      check(principal.kind === 'browser', 403, 'Review plans in the dashboard.');
      return result(await saveReview(principal, await body(request)));
    }
    throw new CloudError(404, 'Endpoint not found.');
  } catch (error) {
    if (error instanceof CloudError) return result({ error: error.message }, error.status);
    // Never return driver errors: they may include credentials or server topology.
    return result(
      { error: 'Storage is unavailable. Try again or contact the administrator.' },
      503,
    );
  }
}
export const GET = handler;
export const POST = handler;
