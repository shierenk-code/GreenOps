import { WasteWorkflowError } from './workflow-service';

export function allowWasteRequest(request: Request): boolean {
  const url = new URL(request.url);
  const loopback = (host: string) => ['localhost', '127.0.0.1', '[::1]'].includes(host);
  if (!loopback(url.hostname)) return false;
  const host = request.headers.get('host') ?? url.host;
  let browser: URL;
  try {
    browser = new URL(`${url.protocol}//${host}`);
  } catch {
    return false;
  }
  if (
    !loopback(browser.hostname) ||
    browser.host !== host.toLowerCase() ||
    request.headers.get('sec-fetch-site') === 'cross-site'
  )
    return false;
  return (
    request.method === 'GET' ||
    (request.method === 'POST' &&
      request.headers.get('origin') === browser.origin &&
      request.headers.get('x-greenops-waste') === '1' &&
      request.headers.get('content-type')?.split(';')[0].trim() === 'application/json')
  );
}

export async function readWasteAction(request: Request): Promise<unknown> {
  const reader = request.body?.getReader();
  if (!reader) throw new WasteWorkflowError('An action is required.', 400);
  const parts: Uint8Array[] = [];
  let bytes = 0;
  while (true) {
    const part = await reader.read();
    if (part.done) break;
    bytes += part.value.byteLength;
    if (bytes > 4096) {
      await reader.cancel();
      throw new WasteWorkflowError('Action is too large.', 413);
    }
    parts.push(part.value);
  }
  try {
    return JSON.parse(Buffer.concat(parts).toString('utf8'));
  } catch {
    throw new WasteWorkflowError('Invalid JSON action.', 400);
  }
}
