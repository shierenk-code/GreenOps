import { createHash, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
export const ACCESS_SECONDS = 15 * 60;
export const REFRESH_SECONDS = 30 * 86400;
export const token = () => randomBytes(32).toString('base64url');
export const digest = (value: string) => createHash('sha256').update(value).digest('hex');
export class CloudError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export function check(value: unknown, status: number, message: string): asserts value {
  if (!value) throw new CloudError(status, message);
}
export function text(value: unknown, max = 300): string {
  check(
    typeof value === 'string' && value.trim().length > 0 && value.length <= max,
    400,
    'Invalid or missing field.',
  );
  return value.trim();
}
export function email(value: unknown) {
  const normalized = text(value, 254).toLowerCase();
  check(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized), 400, 'Enter a valid email address.');
  return normalized;
}
const derive = (password: string, salt: string) =>
  new Promise<Buffer>((resolve, reject) =>
    scrypt(password, salt, 64, { N: 32768, maxmem: 64 * 1024 * 1024 }, (error, key) =>
      error ? reject(error) : resolve(key),
    ),
  );
export async function hashPassword(password: unknown) {
  check(
    typeof password === 'string' && password.length >= 12 && password.length <= 128,
    400,
    'Use a password between 12 and 128 characters.',
  );
  const salt = randomBytes(16).toString('hex');
  return `${salt}:${(await derive(password, salt)).toString('hex')}`;
}
export async function verifyPassword(password: unknown, encoded: string) {
  if (typeof password !== 'string' || password.length > 128) return false;
  const [salt, hash] = encoded.split(':');
  const actual = await derive(password, salt);
  const expected = Buffer.from(hash, 'hex');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
export function publicOrigin() {
  const url = new URL(process.env.GREENOPS_PUBLIC_URL || 'http://localhost:3000');
  check(
    url.protocol === 'https:' ||
      (url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)),
    503,
    'Configure a public HTTPS URL.',
  );
  return url.origin;
}
export function guardOrigin(request: Request) {
  if (request.headers.has('authorization')) return;
  check(
    request.headers.get('origin') === publicOrigin() &&
      request.headers.get('sec-fetch-site') !== 'cross-site',
    403,
    'Request origin is not allowed.',
  );
}
export async function body(request: Request, limit = 32_000): Promise<Record<string, unknown>> {
  check(
    request.headers.get('content-type')?.split(';')[0] === 'application/json',
    415,
    'Send application/json.',
  );
  check(Number(request.headers.get('content-length') || 0) <= limit, 413, 'Payload is too large.');
  const reader = request.body?.getReader();
  check(reader, 400, 'Missing request body.');
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.length;
      check(size <= limit, 413, 'Payload is too large.');
      chunks.push(value);
    }
  } finally {
    await reader.cancel();
  }
  let result;
  try {
    result = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new CloudError(400, 'Invalid JSON.');
  }
  check(result && typeof result === 'object' && !Array.isArray(result), 400, 'Expected an object.');
  return result;
}
