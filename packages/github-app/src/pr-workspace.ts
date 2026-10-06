import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, isAbsolute, relative, resolve, win32 } from 'node:path';

export const MAX_PR_FILE_BYTES = 1024 * 1024;
export const MAX_PR_TOTAL_BYTES = 8 * 1024 * 1024;

/** Bounded input staging, not a process/CPU/memory isolation boundary. */
export function createPrWorkspace(files: Array<{ filename: string; content?: string }>): string {
  if (files.length > 100) throw new Error('PR file limit exceeded.');
  let bytes = 0;
  const names = new Set<string>();
  // Validate the complete list before writing anything, including platform-specific paths.
  for (const file of files) {
    const name = file.filename;
    if (
      typeof name !== 'string' ||
      !name ||
      isAbsolute(name) ||
      win32.isAbsolute(name) ||
      /[\\:]/.test(name) ||
      [...name].some((character) => character.charCodeAt(0) < 32) ||
      name
        .split('/')
        .some(
          (part) =>
            !part ||
            part === '.' ||
            part === '..' ||
            /[. ]$/.test(part) ||
            /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part),
        )
    ) {
      throw new Error('Unsafe PR file path.');
    }
    if (names.has(name.toLowerCase())) throw new Error('Duplicate PR file path.');
    names.add(name.toLowerCase());
    if (file.content !== undefined) {
      if (typeof file.content !== 'string') throw new Error('Invalid PR file content.');
      const size = Buffer.byteLength(file.content, 'utf8');
      bytes += size;
      if (size > MAX_PR_FILE_BYTES || bytes > MAX_PR_TOTAL_BYTES)
        throw new Error('PR content limit exceeded.');
    }
  }
  const workspace = mkdtempSync(join(tmpdir(), 'greenops-pr-'));
  try {
    for (const file of files) {
      if (file.content === undefined) continue;
      const target = resolve(workspace, file.filename);
      const scoped = relative(workspace, target);
      if (scoped.startsWith('..') || isAbsolute(scoped)) throw new Error('Unsafe PR file path.');
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, file.content, { encoding: 'utf8', flag: 'wx' });
    }
    return workspace;
  } catch (error) {
    rmSync(workspace, { recursive: true, force: true });
    throw error;
  }
}
