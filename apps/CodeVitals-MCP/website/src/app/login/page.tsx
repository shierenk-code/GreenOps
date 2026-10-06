'use client';
/* eslint-disable @next/next/no-location-assign-relative-destination -- Authentication changes require a full reload to clear account-scoped client state. */
import { useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import styles from '../cloud.module.css';
export default function Login() {
  const [register, setRegister] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    fetch('/api/cloud/auth/refresh', { method: 'POST' })
      .then((response) => {
        if (response.ok && active) window.location.assign('/dashboard');
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');
    const data = new FormData(event.currentTarget);
    try {
      const response = await fetch(`/api/cloud/auth/${register ? 'register' : 'login'}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: data.get('email'), password: data.get('password') }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      window.location.assign('/dashboard');
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Unable to sign in.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className={styles.login}>
      <form className={styles.form} onSubmit={submit}>
        <Link href="/">GreenOps ↗</Link>
        <h1>{register ? 'Create your workspace.' : 'Welcome back.'}</h1>
        <p>Your codebase. Your runs. Your decisions.</p>
        <label>
          Email
          <input name="email" type="email" autoComplete="username" required maxLength={254} />
        </label>
        <label>
          Password
          <input
            name="password"
            type="password"
            minLength={register ? 12 : 1}
            maxLength={128}
            autoComplete={register ? 'new-password' : 'current-password'}
            required
          />
        </label>
        {error && <p role="alert">{error}</p>}
        <button disabled={busy}>
          {busy ? 'Please wait…' : register ? 'Create account' : 'Sign in'}
        </button>
        <button
          type="button"
          onClick={() => {
            setRegister(!register);
            setError('');
          }}
        >
          {register ? 'Already have an account? Sign in' : 'Create an account'}
        </button>
        <p>
          Use a unique password of at least 12 characters. Terminal access is connected separately
          after sign-in.
        </p>
      </form>
    </main>
  );
}
