import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { NextRequest, NextResponse } from 'next/server';
import { DEMO_REQUESTS, createFixtureProvider } from '../demo-engine';
import { demoCredentials, publicDemoConfig } from '../demo-config';
import { createGeminiDemoProvider } from '../demo-gemini';
import {
  createDemoService,
  DemoServiceError,
  parseDemoAction,
  validSession,
} from '../demo-service';
import type { DemoResponse } from '../demo-types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 180;
const COOKIE = 'greenops-demo-session';

function guard(request: Request): boolean {
  const url = new URL(request.url);
  if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) return false;
  // Next normalizes loopback URLs to localhost. The browser's Origin still
  // uses its original address, so compare against the validated Host header.
  // Never trust forwarded-host headers or allow a non-loopback authority.
  const host = request.headers.get('host') ?? url.host;
  let browserUrl: URL;
  try {
    browserUrl = new URL(`${url.protocol}//${host}`);
  } catch {
    return false;
  }
  if (
    !['localhost', '127.0.0.1', '[::1]'].includes(browserUrl.hostname) ||
    browserUrl.host !== host.toLowerCase()
  )
    return false;
  if (request.headers.get('sec-fetch-site') === 'cross-site') return false;
  if (request.method === 'GET') return true;
  return (
    request.headers.get('origin') === browserUrl.origin &&
    request.headers.get('x-greenops-demo') === '1' &&
    request.headers.get('content-type')?.split(';')[0].trim() === 'application/json'
  );
}
async function respond(request: NextRequest) {
  if (!guard(request))
    return NextResponse.json(
      { error: 'This demo accepts same-origin localhost requests only.' },
      { status: 403 },
    );
  const credentials = await demoCredentials();
  const config = publicDemoConfig(credentials);
  const cookie = request.cookies.get(COOKIE)?.value ?? '';
  const session = validSession(cookie) ? cookie : randomUUID();
  const service = createDemoService({
    directory: resolve(process.cwd(), '.tmp/ai-efficiency-demo'),
    providerFor(mode, pinnedModel) {
      if (mode === 'fixture') return createFixtureProvider();
      if (!credentials.apiKey)
        throw new DemoServiceError(
          'Configure GEMINI_API_KEY on the server before using live mode.',
          400,
        );
      return createGeminiDemoProvider({
        apiKey: credentials.apiKey,
        model: pinnedModel ?? credentials.model,
      });
    },
  });
  let status = 200;
  const payload: DemoResponse = {
    run: null,
    config,
    dataset: DEMO_REQUESTS.map(({ id, prompt, cacheable, bypassReason }) => ({
      id,
      prompt,
      cacheable,
      bypassReason,
    })),
  };
  try {
    if (request.method === 'POST') {
      if (Number(request.headers.get('content-length') ?? 0) > 4096)
        throw new DemoServiceError('Demo request is too large.', 413);
      // Bound streamed bodies too; Content-Length alone is not a limit.
      const reader = request.body?.getReader();
      const decoder = new TextDecoder();
      let body = '';
      let bytes = 0;
      if (!reader) throw new DemoServiceError('A demo action is required.', 400);
      while (true) {
        const part = await reader.read();
        if (part.done) break;
        bytes += part.value.byteLength;
        if (bytes > 4096) {
          await reader.cancel();
          throw new DemoServiceError('Demo request is too large.', 413);
        }
        body += decoder.decode(part.value, { stream: true });
      }
      body += decoder.decode();
      let parsed: unknown;
      try {
        parsed = JSON.parse(body);
      } catch {
        throw new DemoServiceError('Invalid JSON action.', 400);
      }
      payload.run = await service.perform(session, parseDemoAction(parsed));
    } else {
      payload.run = await service.current(session);
      if (service.busy(session))
        payload.error = 'A demo action is still running. Wait, then refresh.';
    }
  } catch (error) {
    status = error instanceof DemoServiceError ? error.status : 500;
    payload.error =
      error instanceof DemoServiceError
        ? error.message
        : 'The demo could not complete this action. Your fleet results were not changed.';
    try {
      payload.run = await service.current(session);
    } catch {
      /* Preserve the safe error. */
    }
  }
  const response = NextResponse.json(payload, {
    status,
    headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' },
  });
  response.cookies.set(COOKIE, session, {
    httpOnly: true,
    sameSite: 'strict',
    secure: new URL(request.url).protocol === 'https:',
    path: '/dashboard/ai-efficiency-demo',
    maxAge: 86400,
  });
  return response;
}
export const GET = respond;
export const POST = respond;
