import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import type { BugCategory } from '@greenops/detect';

/** Deterministic short bug id, matching the detect package's scheme. */
export function bugId(category: BugCategory, key: string): string {
  return `bug_${category}_${createHash('sha256').update(key).digest('hex').slice(0, 10)}`;
}

/** Read and parse a JSON mock fixture. Throws a clear error if malformed/missing. */
export function readJsonFixture<T>(path: string): T {
  let raw: string;
  try {
    raw = readFileSync(path, 'utf-8');
  } catch (err) {
    throw new Error(`GreenOps agent: cannot read mock fixture '${path}': ${String(err)}`);
  }
  try {
    return JSON.parse(raw) as T;
  } catch (err) {
    throw new Error(`GreenOps agent: mock fixture '${path}' is not valid JSON: ${String(err)}`);
  }
}
