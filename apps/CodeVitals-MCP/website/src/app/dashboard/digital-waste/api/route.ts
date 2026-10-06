import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { NextRequest, NextResponse } from 'next/server';
import {
  createWasteWorkflowService,
  parseWasteAction,
  validWasteSession,
  WasteWorkflowError,
} from '../workflow-service';
import { allowWasteRequest, readWasteAction } from '../workflow-http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const COOKIE = 'greenops-waste-session';
async function respond(request: NextRequest) {
  const headers = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };
  if (!allowWasteRequest(request))
    return NextResponse.json(
      { error: 'This local sandbox accepts same-origin localhost requests only.' },
      { status: 403, headers },
    );
  const cookie = request.cookies.get(COOKIE)?.value ?? '';
  const session = validWasteSession(cookie) ? cookie : randomUUID();
  const service = createWasteWorkflowService(resolve(process.cwd(), '.tmp/digital-waste-workflow'));
  let status = 200;
  let run = null;
  let error: string | undefined;
  try {
    run =
      request.method === 'POST'
        ? await service.perform(session, parseWasteAction(await readWasteAction(request)))
        : await service.current(session);
  } catch (e) {
    status = e instanceof WasteWorkflowError ? e.status : 500;
    error =
      e instanceof WasteWorkflowError
        ? e.message
        : 'Could not save the workflow. Refresh to check its state before trying again.';
    try {
      run = await service.current(session);
    } catch {
      /* Preserve the safe error. */
    }
  }
  const response = NextResponse.json({ run, error }, { status, headers });
  response.cookies.set(COOKIE, session, {
    httpOnly: true,
    sameSite: 'strict',
    secure: new URL(request.url).protocol === 'https:',
    path: '/dashboard/digital-waste',
    maxAge: 86400,
  });
  return response;
}
export const GET = respond;
export const POST = respond;
