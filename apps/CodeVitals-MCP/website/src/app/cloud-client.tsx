'use client';
/* eslint-disable @next/next/no-location-assign-relative-destination -- Authentication changes require a full reload to clear account-scoped client state. */
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import styles from './cloud.module.css';
const CloudContext = createContext(false);
export const useCloud = () => useContext(CloudContext);
const CloudIdentityContext = createContext<string | null>(null);
export const useCloudIdentity = () => useContext(CloudIdentityContext);
let refreshing: Promise<Response> | undefined;
export async function cloudFetch(path: string, options: RequestInit = {}) {
  const send = () =>
    fetch(`/api/cloud/${path}`, {
      ...options,
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json', ...options.headers },
    });
  let response = await send();
  if (response.status === 401 && !path.startsWith('auth/')) {
    refreshing ??= fetch('/api/cloud/auth/refresh', { method: 'POST' }).finally(() => {
      refreshing = undefined;
    });
    if ((await refreshing).ok) response = await send();
    else window.location.assign('/login');
  }
  return response;
}
export function CloudWorkspace({ email, children }: { email: string; children: ReactNode }) {
  const router = useRouter();
  const search = useSearchParams();
  const [link, setLink] = useState('');
  const [message, setMessage] = useState('');
  const [runs, setRuns] = useState<Array<{ runId: string; project: string; updatedAt: string }>>(
    [],
  );
  const [sessions, setSessions] = useState<
    Array<{
      id: string;
      label: string;
      current: boolean;
      lastSeenAt: string;
      scan?: { status: string; project: string };
    }>
  >([]);
  const [updated, setUpdated] = useState('');
  const [now, setNow] = useState(0);
  useEffect(() => {
    let active = true,
      busy = false;
    async function poll() {
      if (busy || document.hidden) return;
      busy = true;
      try {
        const [runResponse, sessionResponse] = await Promise.all([
          cloudFetch('runs'),
          cloudFetch('sessions'),
        ]);
        if (!runResponse.ok || !sessionResponse.ok) throw new Error();
        const runData = await runResponse.json(),
          sessionData = await sessionResponse.json();
        if (active) {
          setRuns(runData.runs);
          setSessions(sessionData.sessions);
          setUpdated(new Date().toLocaleTimeString());
          setNow(Date.now());
          router.refresh();
        }
      } catch {
        if (active)
          setMessage('Connection interrupted. Your last received data is still displayed.');
      } finally {
        busy = false;
      }
    }
    void poll();
    const timer = setInterval(poll, 10_000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [router]);
  async function connect() {
    try {
      const response = await cloudFetch('connect', { method: 'POST' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setLink(data.link);
      setMessage('One-time link, valid for 10 minutes. Treat it like a password.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not create link.');
    }
  }
  return (
    <CloudContext.Provider value={true}>
      <CloudIdentityContext.Provider value={email}>
      <section className={styles.account} aria-label="Connected account">
        <div className={styles.bar}>
          <strong>{email}</strong>
          <span>Synced {updated || '—'} · refreshes every 10 seconds</span>
          <button onClick={connect}>Connect terminal</button>
          <button
            onClick={async () => {
              await cloudFetch('auth/logout', { method: 'POST' });
              window.location.assign('/login');
            }}
          >
            Sign out
          </button>
        </div>
        <div className={styles.bar}>
          <label>
            Run history{' '}
            <select
              value={search.get('run') || ''}
              onChange={(event) => {
                const next = new URLSearchParams(search);
                next.set('data', 'recorded');
                next.delete('finding');
                if (event.target.value) next.set('run', event.target.value);
                else next.delete('run');
                router.push(`/dashboard?${next}`, { scroll: false });
              }}
            >
              <option value="">Latest synced run</option>
              {runs.map((run) => (
                <option key={run.runId} value={run.runId}>
                  {run.project} · {run.runId}
                </option>
              ))}
            </select>
          </label>
          <span>{runs.length} recent runs</span>
          <Link scroll={false} href={`/dashboard?tab=results${search.get('run') ? `&run=${encodeURIComponent(search.get('run')!)}` : ''}`}>Recorded evidence</Link>
        </div>
        {link && (
          <div className={styles.connection}>
            <p>In the codebase you want to review, run:</p>
            <code>greenops connect &apos;{link}&apos;</code>
            <button
              onClick={() => {
                void navigator.clipboard.writeText(`greenops connect '${link}'`).then(
                  () => setMessage('Command copied.'),
                  () => setMessage('Select and copy the command above.'),
                );
              }}
            >
              Copy command
            </button>
            <p>
              Then run <code>greenops review .</code> or <code>greenops run .</code>. Linking
              enables upload of ledger findings, file paths and evidence from future runs. Source
              files are not uploaded wholesale. Check your ledger for sensitive content before
              connecting.
            </p>
          </div>
        )}
        {message && <p role="status">{message}</p>}
        <details>
          <summary>Connected sessions ({sessions.length})</summary>
          <ul>
            {sessions.map((session) => (
              <li key={session.id}>
                {session.label} ·{' '}
                {session.current
                  ? 'active in this browser'
                  : now - Date.parse(session.lastSeenAt) > 60_000
                    ? 'offline / last seen'
                    : session.scan?.status || 'connected'}{' '}
                {session.scan?.project} · {new Date(session.lastSeenAt).toLocaleString()}{' '}
                {!session.current && (
                  <button
                    onClick={async () => {
                      const response = await cloudFetch('sessions/revoke', {
                        method: 'POST',
                        body: JSON.stringify({ id: session.id }),
                      });
                      setMessage(response.ok ? 'Session revoked.' : 'Could not revoke session.');
                      if (response.ok)
                        setSessions((items) => items.filter((item) => item.id !== session.id));
                    }}
                  >
                    Revoke
                  </button>
                )}
              </li>
            ))}
          </ul>
        </details>
      </section>
      {children}
      </CloudIdentityContext.Provider>
    </CloudContext.Provider>
  );
}
