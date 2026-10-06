import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Readable } from 'node:stream';
import { MAX_LEDGER_BYTES } from '../apps/CodeVitals-MCP/website/src/app/dashboard/ledger-data.js';
import { loadLatestLedger } from '../apps/CodeVitals-MCP/website/src/app/dashboard/ledger-loader.js';
import { GET } from '../apps/CodeVitals-MCP/website/src/app/dashboard/latest-ledger/route.js';

// Next supplies this boundary marker; unit tests execute the server module in Node.
vi.mock('server-only', () => ({}));
vi.mock('node:fs', () => ({ createReadStream: vi.fn() }));
vi.mock('node:fs/promises', () => ({ stat: vi.fn() }));

interface LocalFile {
  body: string | Buffer;
  modifiedAt: number;
  size?: number;
  directory?: boolean;
  statError?: boolean;
  readError?: boolean;
}

const websiteRoot = resolve('dashboard-test-repository', 'apps', 'CodeVitals-MCP', 'website');
const repositoryRoot = resolve(websiteRoot, '..', '..', '..');
const files = new Map<string, LocalFile>();
const ledger = (runId: string) => ({
  version: 1,
  entries: [
    {
      seq: 0,
      runId,
      bugId: 'finding-1',
      stage: 'detect',
      timestamp: '2026-10-03T12:00:00.000Z',
      summary: 'Recorded finding',
      data: {},
    },
  ],
  outcomes: [],
});
const addFile = (
  path: string,
  runId: string,
  modifiedAt: number,
  extra: Partial<LocalFile> = {},
) => {
  files.set(path, { body: JSON.stringify(ledger(runId)), modifiedAt, ...extra });
};

beforeEach(() => {
  files.clear();
  vi.clearAllMocks();
  vi.stubEnv('GREENOPS_LEDGER_PATH', '');
  vi.spyOn(process, 'cwd').mockReturnValue(websiteRoot);
  vi.mocked(stat).mockImplementation(async (path) => {
    const file = files.get(String(path));
    if (!file || file.statError) throw new Error(`Cannot access private path ${String(path)}`);
    return {
      isFile: () => !file.directory,
      size: file.size ?? Buffer.byteLength(file.body),
      mtimeMs: file.modifiedAt,
    } as Awaited<ReturnType<typeof stat>>;
  });
  vi.mocked(createReadStream).mockImplementation((path) => {
    const file = files.get(String(path));
    const stream = Readable.from(
      (async function* () {
        if (!file || file.readError) throw new Error(`Cannot read private path ${String(path)}`);
        yield Buffer.from(file.body);
      })(),
    );
    return stream as ReturnType<typeof createReadStream>;
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe('Dashboard local ledger loader', () => {
  it('treats an explicit configured path as authoritative over newer known files', async () => {
    const configured = resolve(repositoryRoot, 'private-directory', 'selected.json');
    vi.stubEnv('GREENOPS_LEDGER_PATH', configured);
    addFile(configured, 'configured-run', 10);
    addFile(resolve(websiteRoot, 'greenops-ledger.json'), 'newer-unselected-run', 100);

    expect(await loadLatestLedger()).toEqual({
      ledger: ledger('configured-run'),
      fileName: 'selected.json',
    });
    expect(vi.mocked(stat).mock.calls.map(([path]) => path)).toEqual([configured]);
  });

  it('resolves a relative configured path from the website directory', async () => {
    vi.stubEnv('GREENOPS_LEDGER_PATH', '../../../custom-ledger.json');
    addFile(resolve(repositoryRoot, 'custom-ledger.json'), 'relative-run', 10);

    expect(await loadLatestLedger()).toEqual({
      ledger: ledger('relative-run'),
      fileName: 'custom-ledger.json',
    });
  });

  it('chooses the newest known ledger across the website and repository directories', async () => {
    addFile(resolve(websiteRoot, 'greenops-ledger.json'), 'older-run', 10);
    addFile(resolve(repositoryRoot, 'ledger-fleet-safe.json'), 'latest-run', 30);
    addFile(resolve(repositoryRoot, 'greenops-fleet-ledger.json'), 'middle-run', 20);
    addFile(resolve(websiteRoot, 'unrelated.json'), 'must-not-read', 100);

    expect(await loadLatestLedger()).toEqual({
      ledger: ledger('latest-run'),
      fileName: 'ledger-fleet-safe.json',
    });
    expect(stat).toHaveBeenCalledTimes(8);
    expect(vi.mocked(stat).mock.calls.map(([path]) => path)).not.toContain(
      resolve(websiteRoot, 'unrelated.json'),
    );
  });

  it.each(['stat', 'read', 'parse', 'schema', 'directory'] as const)(
    'tolerates a newer candidate with a %s failure and loads the next valid ledger',
    async (failure) => {
      addFile(resolve(websiteRoot, 'greenops-ledger.json'), 'broken-run', 20, {
        statError: failure === 'stat',
        readError: failure === 'read',
        directory: failure === 'directory',
        ...(failure === 'parse' ? { body: '{"entries":' } : {}),
        ...(failure === 'schema' ? { body: '{"entries":[null],"outcomes":[]}' } : {}),
      });
      addFile(resolve(repositoryRoot, 'greenops-fleet-ledger.json'), 'valid-run', 10);

      expect(await loadLatestLedger()).toEqual({
        ledger: ledger('valid-run'),
        fileName: 'greenops-fleet-ledger.json',
      });
    },
  );

  it('does not silently change datasets when the configured ledger is unavailable', async () => {
    const configured = resolve(repositoryRoot, 'private-location', 'missing.json');
    vi.stubEnv('GREENOPS_LEDGER_PATH', configured);
    addFile(resolve(websiteRoot, 'greenops-ledger.json'), 'different-run', 100);

    const result = await loadLatestLedger();
    expect(result).toMatchObject({ ledger: null, fileName: '' });
    expect(result.error).toContain('configured local ledger');
    expect(JSON.stringify(result)).not.toContain(configured);
    expect(JSON.stringify(result)).not.toContain('private-location');
    expect(createReadStream).not.toHaveBeenCalled();
  });

  it('rejects oversized files before reading their contents', async () => {
    const path = resolve(websiteRoot, 'greenops-ledger.json');
    vi.stubEnv('GREENOPS_LEDGER_PATH', path);
    addFile(path, 'oversized-run', 10, { size: MAX_LEDGER_BYTES + 1 });

    expect(await loadLatestLedger()).toMatchObject({ ledger: null, fileName: '' });
    expect(createReadStream).not.toHaveBeenCalled();
  });

  it('bounds reads even when a file grows after its metadata was checked', async () => {
    const path = resolve(websiteRoot, 'greenops-ledger.json');
    vi.stubEnv('GREENOPS_LEDGER_PATH', path);
    addFile(path, 'growing-run', 10, { size: 100, body: Buffer.alloc(MAX_LEDGER_BYTES + 1) });

    expect(await loadLatestLedger()).toMatchObject({ ledger: null, fileName: '' });
    expect(createReadStream).toHaveBeenCalledWith(path, { end: MAX_LEDGER_BYTES });
    expect(vi.mocked(createReadStream).mock.results[0].value.destroyed).toBe(true);
  });

  it('returns a safe empty state when no known ledger exists', async () => {
    const result = await loadLatestLedger();
    expect(result).toMatchObject({ ledger: null, fileName: '' });
    expect(result.error).toContain('No valid local GreenOps ledger');
    expect(JSON.stringify(result)).not.toContain(websiteRoot);
  });
});

describe('Latest ledger GET response', () => {
  it('returns fresh local data and disables caching without exposing server configuration', async () => {
    const path = resolve(websiteRoot, 'greenops-ledger.json');
    addFile(path, 'first-run', 10);
    const response = await GET();
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('private, no-store, max-age=0');
    expect(await response.json()).toEqual({
      ledger: ledger('first-run'),
      fileName: 'greenops-ledger.json',
    });

    addFile(path, 'next-run', 20);
    const refreshed = await GET();
    expect(await refreshed.json()).toEqual({
      ledger: ledger('next-run'),
      fileName: 'greenops-ledger.json',
    });
  });

  it('returns a usable empty-state response when there is no local ledger', async () => {
    const response = await GET();
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toContain('no-store');
    expect(await response.json()).toMatchObject({
      ledger: null,
      fileName: '',
      error: expect.any(String),
    });
  });
});
