import { loadLatestLedger } from '../ledger-loader';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  let loaded;
  try { loaded = await loadLatestLedger(request ? new URL(request.url).searchParams.get('run') || undefined : undefined); }
  catch { return Response.json({ error: 'Sign in to load your recorded results.' }, { status: 401, headers: { 'Cache-Control': 'no-store' } }); }
  return Response.json(loaded, {
    headers: { 'Cache-Control': 'private, no-store, max-age=0' },
  });
}
