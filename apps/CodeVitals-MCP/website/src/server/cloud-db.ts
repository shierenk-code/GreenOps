import { MongoClient, type Db } from 'mongodb';
import { check } from './cloud-security';
let connection: Promise<Db> | undefined;
export function cloudEnabled() {
  return Boolean(
    process.env.MONGODB_URI ||
    process.env.WEBSITE_HOSTNAME ||
    process.env.GREENOPS_PUBLIC_URL?.startsWith('https:'),
  );
}
export async function database() {
  check(process.env.MONGODB_URI, 503, 'Cloud storage is not configured.');
  if (!connection)
    connection = (async () => {
      const client = new MongoClient(process.env.MONGODB_URI!, {
        maxPoolSize: 10,
        serverSelectionTimeoutMS: 5000,
      });
      await client.connect();
      const db = client.db(process.env.MONGODB_DB || 'greenops');
      await Promise.all([
        db.collection('telemetry').createIndex({ userId: 1, receivedAt: -1 }),
        db.collection('telemetry').createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
        db.collection('users').createIndex({ email: 1 }, { unique: true }),
        db.collection('sessions').createIndex({ accessHash: 1 }, { unique: true }),
        db.collection('sessions').createIndex({ refreshHash: 1 }, { unique: true }),
        db.collection('sessions').createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
        db.collection('links').createIndex({ codeHash: 1 }, { unique: true }),
        db.collection('links').createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
        db.collection('runs').createIndex({ userId: 1, runId: 1 }, { unique: true }),
        db.collection('runs').createIndex({ userId: 1, updatedAt: -1 }),
        db.collection('counters').createIndex({ userId: 1, runId: 1 }, { unique: true }),
        db
          .collection('reviews')
          .createIndex({ userId: 1, runId: 1, sequence: 1 }, { unique: true }),
        db.collection('limits').createIndex({ key: 1 }, { unique: true }),
        db.collection('limits').createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
      ]);
      return db;
    })().catch((error) => {
      connection = undefined;
      throw error;
    });
  return connection;
}
