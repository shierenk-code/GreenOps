import { openSync, closeSync, writeSync, ftruncateSync, fsyncSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

/** Reserve a new output before dispatch. Never truncate or replace someone else's receipt. */
export async function withCarbonReceipt<T>(
  path: string,
  initial: Record<string, unknown>,
  operation: (persist: (value: unknown) => void) => Promise<T>,
): Promise<T> {
  mkdirSync(dirname(path), { recursive: true });
  const fd = openSync(path, 'wx', 0o600);
  const persist = (value: unknown) => {
    const data = Buffer.from(JSON.stringify(value, null, 2), 'utf8');
    let written = 0;
    while (written < data.length) {
      const count = writeSync(fd, data, written, data.length - written, written);
      if (count <= 0)
        throw new Error('Receipt write failed; inspect dispatch audit before retrying.');
      written += count;
    }
    ftruncateSync(fd, data.length);
    fsyncSync(fd);
  };
  try {
    persist({
      ...initial,
      state: 'dispatch-not-confirmed',
      savingsVerified: false,
      note: "Reserved before dispatch. On interruption, inspect this plan's audit and target job; do not blindly retry.",
    });
    return await operation(persist);
  } finally {
    closeSync(fd);
  }
}
