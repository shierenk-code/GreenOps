import { readFile, writeFile, mkdir, chmod, rename, unlink, open, stat } from 'node:fs/promises';
import { homedir, hostname } from 'node:os';
import { join, resolve, basename } from 'node:path';
import { createHash } from 'node:crypto';
import { createSystemSampler } from './system-telemetry.js';
import type { Command } from 'commander';
interface Credentials {
  origin: string;
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}
const directory = () =>
  process.env.GREENOPS_CREDENTIAL_DIR || join(homedir(), '.config', 'greenops');
const path = () => join(directory(), 'credentials.json');
const root = () => process.env.INIT_CWD || process.cwd();
async function credentials(): Promise<Credentials | null> {
  try {
    const value = JSON.parse(await readFile(path(), 'utf8')) as Credentials;
    trustedOrigin(value.origin);
    return value;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw new Error('Cannot read GreenOps credentials. Reconnect your terminal.');
  }
}
export function trustedOrigin(raw: string) {
  const url = new URL(raw);
  if (
    url.username ||
    url.password ||
    !(
      url.protocol === 'https:' ||
      (url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))
    )
  )
    throw new Error('Connection requires HTTPS (HTTP is allowed only on loopback).');
  return url.origin;
}
async function save(value: Credentials) {
  await mkdir(directory(), { recursive: true, mode: 0o700 });
  await chmod(directory(), 0o700);
  const temp = `${path()}.${process.pid}.tmp`;
  await writeFile(temp, JSON.stringify(value), { mode: 0o600 });
  await chmod(temp, 0o600);
  await rename(temp, path());
}
async function request(origin: string, route: string, data: unknown, authorization: string) {
  const response = await fetch(`${origin}/api/cloud/${route}`, {
    method: 'POST',
    redirect: 'error',
    headers: { 'Content-Type': 'application/json', Authorization: authorization },
    body: JSON.stringify(data),
    signal: AbortSignal.timeout(15_000),
  });
  const result = (await response.json()) as Record<string, unknown>;
  if (!response.ok)
    throw new Error(
      `Cloud sync ${response.status}: ${typeof result.error === 'string' ? result.error : 'request failed'}`,
    );
  return result;
}
let lock: Promise<unknown> = Promise.resolve();
function serial<T>(operation: () => Promise<T>): Promise<T> {
  const next = lock.then(operation, operation);
  lock = next.catch(() => {});
  return next;
}
async function credentialLock<T>(operation: () => Promise<T>): Promise<T> {
  await mkdir(directory(), { recursive: true, mode: 0o700 });
  const lockPath = join(directory(), 'credentials.lock');
  const deadline = Date.now() + 35_000;
  for (;;) {
    let handle;
    try {
      handle = await open(lockPath, 'wx', 0o600);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      // Requests time out in 15s; only reclaim locks abandoned for two minutes.
      const info = await stat(lockPath).catch(() => null);
      if (info && Date.now() - info.mtimeMs > 120_000) await unlink(lockPath).catch(() => {});
      if (Date.now() > deadline)
        throw new Error('Another GreenOps command is updating credentials. Retry shortly.');
      await new Promise((resolve) => setTimeout(resolve, 100));
      continue;
    }
    try {
      return await operation();
    } finally {
      await handle.close();
      await unlink(lockPath).catch(() => {});
    }
  }
}
async function authorized(route: string, data: unknown) {
  return serial(() =>
    credentialLock(async () => {
      let value = await credentials();
      if (!value) throw new Error('Run greenops connect first.');
      if (value.expiresAt < Date.now() + 60_000) {
        const refreshed = await request(
          value.origin,
          'auth/refresh',
          { refreshToken: value.refreshToken },
          'Refresh',
        );
        value = {
          ...value,
          accessToken: String(refreshed.accessToken),
          refreshToken: String(refreshed.refreshToken),
          expiresAt: Date.now() + Number(refreshed.expiresIn) * 1000,
        };
        await save(value);
      }
      return request(value.origin, route, data, `Bearer ${value.accessToken}`);
    }),
  );
}
export async function connectCloud(link: string) {
  const url = new URL(link);
  const origin = trustedOrigin(link);
  const code = url.hash.slice(1);
  if (url.pathname !== '/connect' || !/^[A-Za-z0-9_-]{43}$/.test(code))
    throw new Error('Use the complete one-time link generated in your dashboard.');
  const result = await request(
    origin,
    'connect/exchange',
    { code, label: hostname().slice(0, 100) },
    'Device',
  );
  await save({
    origin,
    accessToken: String(result.accessToken),
    refreshToken: String(result.refreshToken),
    expiresAt: Date.now() + Number(result.expiresIn) * 1000,
  });
  console.error(
    `Connected to ${origin}. Future greenops run/review ledgers will sync to your account. Credentials are stored privately at ${path()}.`,
  );
}
const hashes = new Map<string, string>();
export async function syncLedger(ledgerPath: string, project: string) {
  const raw = await readFile(ledgerPath, 'utf8');
  if (Buffer.byteLength(raw) > 20 * 1024 * 1024)
    throw new Error('Ledger exceeds 20 MiB. Archive older runs before syncing.');
  const ledger = JSON.parse(raw) as {
    version: number;
    entries: Array<{ runId: string }>;
    outcomes: Array<{ runId: string }>;
  };
  if (!Array.isArray(ledger.entries) || !Array.isArray(ledger.outcomes))
    throw new Error('Not a GreenOps ledger.');
  const ids = new Set([
    ...ledger.entries.map((e) => e.runId),
    ...ledger.outcomes.map((e) => e.runId),
  ]);
  let count = 0;
  for (const runId of ids) {
    const payload = {
      project: project.slice(0, 100),
      ledger: {
        version: ledger.version,
        entries: ledger.entries.filter((e) => e.runId === runId),
        outcomes: ledger.outcomes.filter((e) => e.runId === runId),
      },
    };
    const encoded = JSON.stringify(payload);
    const hash = createHash('sha256').update(encoded).digest('hex');
    if (hashes.get(`${ledgerPath}:${runId}`) === hash) continue;
    if (Buffer.byteLength(encoded) > 4 * 1024 * 1024)
      throw new Error(
        'A run exceeds the 4 MiB sync limit. Reduce scan scope and create a new run.',
      );
    await authorized('runs', payload);
    hashes.set(`${ledgerPath}:${runId}`, hash);
    count++;
  }
  return count;
}
export async function monitorCloud(
  ledgerPath: string,
  project: string,
  command: string,
  keepAlive = false,
) {
  if (!(await credentials())) return async () => {};
  const sample = createSystemSampler();
  let busy = false;
  const poll = async () => {
    if (busy) return;
    busy = true;
    try {
      await authorized('heartbeat', { project, command, status: 'running', telemetry: sample() });
      if (command !== 'monitor') await syncLedger(ledgerPath, project);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT')
        console.error(
          'Cloud sync pending; local evidence is retained. Use greenops sync to retry.',
        );
    } finally {
      busy = false;
    }
  };
  await authorized('heartbeat', { project, command, status: 'running', telemetry: sample() }).catch(
    () => console.error('Cloud unavailable; continuing locally.'),
  );
  const timer = setInterval(() => void poll(), 5000);
  if (!keepAlive) timer.unref();
  return async () => {
    clearInterval(timer);
    while (busy) await new Promise((resolve) => setTimeout(resolve, 50));
    try {
      if (command !== 'monitor')
        await syncLedger(ledgerPath, project).catch((error) => {
          if (error.code !== 'ENOENT') throw error;
        });
      await authorized('heartbeat', { project, command, status: 'idle' });
    } catch {
      console.error('Cloud sync failed. Your scan is saved locally. Run greenops sync to retry.');
    }
  };
}
export function registerCloudCommands(program: Command) {
  program
    .command('monitor')
    .description('Stream local CPU and memory counters until Ctrl+C')
    .action(async () => {
      if (!(await credentials())) throw new Error('Run greenops connect first.');
      const stop = await monitorCloud(
        resolve(root(), 'greenops-ledger.json'),
        basename(root()),
        'monitor',
        true,
      );
      console.error(
        'Streaming OS CPU/memory counters every 5 seconds. No power measurement is inferred. Ctrl+C to stop.',
      );
      await new Promise<void>((done) => {
        let stopping = false;
        const finish = () => {
          if (!stopping) {
            stopping = true;
            void stop().finally(done);
          }
        };
        process.once('SIGINT', finish);
        process.once('SIGTERM', finish);
      });
    });
  program
    .command('connect <link>')
    .description('Connect this terminal using your dashboard one-time link; enables ledger uploads')
    .action(connectCloud);
  program
    .command('disconnect')
    .description('Revoke this terminal session and remove local credentials')
    .action(async () => {
      if (await credentials()) {
        await authorized('auth/logout', {});
        await unlink(path());
      }
      console.error('Terminal disconnected.');
    });
  program
    .command('sync')
    .description('Upload local ledger evidence to your linked account')
    .option('-l, --ledger <path>', 'Ledger file', './greenops-ledger.json')
    .option('--project <name>', 'Project display name', basename(root()))
    .option('--watch', 'Watch for new scan and review evidence', false)
    .action(async (options: { ledger: string; project: string; watch: boolean }) => {
      const ledger = resolve(root(), options.ledger);
      await syncLedger(ledger, options.project);
      console.error('Recorded evidence synchronized.');
      if (options.watch) {
        const stop = await monitorCloud(ledger, options.project, 'sync --watch', true);
        await new Promise<void>((resolve) => {
          const finish = () => {
            void stop().finally(resolve);
          };
          process.once('SIGINT', finish);
          process.once('SIGTERM', finish);
        });
      }
    });
}
