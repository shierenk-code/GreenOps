import Link from 'next/link';
export default function Connect() {
  return (
    <main style={{ padding: '10%', maxWidth: 850 }}>
      <h1>Connect your local GreenOps terminal</h1>
      <p>
        This is a short-lived connection link. Copy the full link from your dashboard and pass it to{' '}
        <code>pnpm greenops connect &apos;LINK&apos;</code> in your GreenOps checkout. The link can
        be used once and expires after 10 minutes.
      </p>
      <p>
        Only share it with your own terminal. Use your dashboard to revoke a connected terminal.
      </p>
      <Link href="/dashboard">Return to workspace →</Link>
    </main>
  );
}
