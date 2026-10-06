import 'server-only';
import { cloudEnabled } from '../../server/cloud-db';

import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { basename, resolve } from 'node:path';
import { MAX_LEDGER_BYTES, validateLedger, type LedgerFile } from './ledger-data';

export interface LoadedLedger {
  ledger: LedgerFile | null;
  fileName: string;
  error?: string;
}

const LEDGER_NAMES = [
  'greenops-ledger.json',
  'greenops-fleet-ledger.json',
  'ledger-auto.json',
  'ledger-fleet-safe.json',
];

async function readLedger(path: string): Promise<LedgerFile> {
  // Read at most the limit plus one sentinel byte, even if a CLI write grows
  // the file after its size was checked. The stream closes on early exit.
  const stream = createReadStream(/* turbopackIgnore: true */ path, { end: MAX_LEDGER_BYTES });
  const chunks: Buffer[] = [];
  let size = 0;

  for await (const chunk of stream) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > MAX_LEDGER_BYTES) throw new Error('Ledger is too large.');
    chunks.push(buffer);
  }

  return validateLedger(JSON.parse(Buffer.concat(chunks, size).toString('utf8')));
}

/** Reads only the server-configured file or the established local ledger names. */
export async function loadLatestLedger(runId?: string): Promise<LoadedLedger> {
  if (cloudEnabled()) {
    const { authenticate } = await import('../../server/cloud-auth');
    const { userLedger } = await import('../../server/cloud-runs');
    const principal = await authenticate();
    return userLedger(principal.userId, runId);
  }
  const configured = process.env.GREENOPS_LEDGER_PATH?.trim();
  const websiteRoot = process.cwd();
  const repositoryRoot = resolve(/* turbopackIgnore: true */ websiteRoot, '..', '..', '..');
  // A configured path identifies the intended dataset, including when it is
  // temporarily missing or being written. Do not silently switch datasets.
  const candidates = configured
    ? [resolve(/* turbopackIgnore: true */ websiteRoot, configured)]
    : LEDGER_NAMES.flatMap((name) => [
        resolve(/* turbopackIgnore: true */ websiteRoot, name),
        resolve(/* turbopackIgnore: true */ repositoryRoot, name),
      ]);

  const checked = await Promise.all(
    [...new Set(candidates)].map(async (path) => {
      try {
        const metadata = await stat(/* turbopackIgnore: true */ path);
        if (!metadata.isFile() || metadata.size > MAX_LEDGER_BYTES) return null;
        return { path, modifiedAt: metadata.mtimeMs };
      } catch {
        // Missing, inaccessible, or concurrently replaced files are unavailable.
        return null;
      }
    }),
  );
  const existing = checked
    .filter((candidate) => candidate !== null)
    .sort((left, right) => right.modifiedAt - left.modifiedAt);

  for (const { path } of existing) {
    try {
      return { ledger: await readLedger(path), fileName: basename(path) };
    } catch {
      // Invalid or partially written fallback files must not crash the page.
    }
  }

  return {
    ledger: null,
    fileName: '',
    error: configured
      ? `The configured local ledger could not be loaded. Check that GREENOPS_LEDGER_PATH points to a valid GreenOps ledger of ${MAX_LEDGER_BYTES / (1024 * 1024)} MiB or less, or choose a ledger JSON.`
      : `No valid local GreenOps ledger was found. Run the CLI once or choose a ledger JSON of ${MAX_LEDGER_BYTES / (1024 * 1024)} MiB or less.`,
  };
}
