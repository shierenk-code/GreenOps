import { cookies } from 'next/headers';
import { ObjectId } from 'mongodb';
import { database } from './cloud-db';
import {
  ACCESS_SECONDS,
  REFRESH_SECONDS,
  token,
  digest,
  check,
  CloudError,
} from './cloud-security';
export const ACCESS_COOKIE = 'greenops_access';
export const REFRESH_COOKIE = 'greenops_refresh';
export interface Principal {
  userId: string;
  email: string;
  sessionId: string;
  kind: 'browser' | 'cli';
}
export async function issueSession(userId: string, kind: 'browser' | 'cli', label: string) {
  const db = await database();
  const accessToken = token(),
    refreshToken = token();
  const now = new Date();
  await db
    .collection('sessions')
    .insertOne({
      userId,
      kind,
      label,
      accessHash: digest(accessToken),
      refreshHash: digest(refreshToken),
      accessExpiresAt: new Date(+now + ACCESS_SECONDS * 1000),
      expiresAt: new Date(+now + REFRESH_SECONDS * 1000),
      createdAt: now,
      lastSeenAt: now,
    });
  return { accessToken, refreshToken, expiresIn: ACCESS_SECONDS };
}
export async function authenticate(request?: Request): Promise<Principal> {
  const value = request?.headers.get('authorization');
  const bearer = value?.startsWith('Bearer ') ? value.slice(7) : undefined;
  check(!value || bearer, 401, 'Invalid authorization header.');
  const credential =
    bearer ??
    (request
      ? request.headers.get('cookie')?.match(/(?:^|;\s*)greenops_access=([^;]+)/)?.[1]
      : (await cookies()).get(ACCESS_COOKIE)?.value);
  check(credential && credential.length <= 100, 401, 'Sign in to continue.');
  const db = await database();
  const session = await db
    .collection('sessions')
    .findOne({
      accessHash: digest(credential),
      accessExpiresAt: { $gt: new Date() },
      expiresAt: { $gt: new Date() },
      revokedAt: { $exists: false },
    });
  check(session, 401, 'Your session expired. Sign in again.');
  check(
    bearer ? session.kind === 'cli' : session.kind === 'browser',
    401,
    'Invalid session transport.',
  );
  const user = await db.collection('users').findOne({ _id: new ObjectId(session.userId) });
  check(user, 401, 'Account unavailable.');
  return {
    userId: session.userId,
    email: user.email,
    sessionId: session._id.toString(),
    kind: session.kind,
  };
}
export async function rotateSession(refreshToken: string, kind: 'browser' | 'cli') {
  const db = await database();
  const accessToken = token(),
    nextRefresh = token();
  const now = new Date();
  // Atomic consume-and-replace. A refresh token can only succeed once.
  const session = await db
    .collection('sessions')
    .findOneAndUpdate(
      {
        refreshHash: digest(refreshToken),
        kind,
        expiresAt: { $gt: now },
        revokedAt: { $exists: false },
      },
      {
        $set: {
          accessHash: digest(accessToken),
          refreshHash: digest(nextRefresh),
          accessExpiresAt: new Date(+now + ACCESS_SECONDS * 1000),
          lastSeenAt: now,
        },
      },
      { returnDocument: 'after' },
    );
  check(session, 401, 'Refresh token expired, revoked or already used.');
  return { accessToken, refreshToken: nextRefresh, expiresIn: ACCESS_SECONDS };
}
export async function rateLimit(key: string, maximum = 10, seconds = 900) {
  const db = await database();
  const bucket = Math.floor(Date.now() / (seconds * 1000));
  let record;
  try {
    record = await db
      .collection('limits')
      .findOneAndUpdate(
        { key: digest(`${key}:${bucket}`) },
        {
          $inc: { count: 1 },
          $setOnInsert: { expiresAt: new Date((bucket + 2) * seconds * 1000) },
        },
        { upsert: true, returnDocument: 'after' },
      );
  } catch {
    throw new CloudError(429, 'Try again later.');
  }
  check(record && record.count <= maximum, 429, 'Too many requests. Try again later.');
}
