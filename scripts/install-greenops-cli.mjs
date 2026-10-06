#!/usr/bin/env node
import { mkdir, readFile, writeFile, chmod, rename } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
if (args.length && (args.length !== 2 || args[0] !== '--bin-dir')) {
  console.error('Usage: node scripts/install-greenops-cli.mjs [--bin-dir DIRECTORY]');
  process.exit(1);
}
if (process.platform === 'win32') {
  console.error(
    'Use this installer inside WSL, or invoke the CLI with node apps/cli/dist/greenops-cli.js.',
  );
  process.exit(1);
}
const bin = resolve(args[1] || join(homedir(), '.local/bin'));
const target = join(bin, 'greenops');
const marker = '# GreenOps local checkout launcher';
let existing;
try {
  existing = await readFile(target, 'utf8');
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}
if (existing && !existing.includes(marker)) {
  console.error(`Refusing to replace an unrelated command at ${target}. Choose --bin-dir instead.`);
  process.exit(1);
}
const build = spawnSync(
  process.execPath,
  [join(root, 'node_modules/typescript/bin/tsc'), '-b', join(root, 'apps/cli')],
  { cwd: root, stdio: 'inherit' },
);
if (build.status !== 0) process.exit(build.status || 1);
const quote = (value) => "'" + value.replaceAll("'", "'\\''") + "'";
// Preserve the caller's directory even when invoked through another project's npm scripts.
const launcher = `#!/bin/sh\n${marker}\nexport INIT_CWD="$PWD"\nexec ${quote(process.execPath)} ${quote(join(root, 'apps/cli/dist/greenops-cli.js'))} "$@"\n`;
await mkdir(bin, { recursive: true });
const temporary = `${target}.${process.pid}.tmp`;
await writeFile(temporary, launcher, { mode: 0o755, flag: 'wx' });
await chmod(temporary, 0o755);
// Atomic replacement also repairs a dangling shortcut without following its target.
await rename(temporary, target);
console.log(
  `Installed ${target}\nRun greenops --help from any codebase. Keep this GreenOps checkout in place; rerun this installer after updating it.`,
);
if (!(process.env.PATH || '').split(':').includes(bin)) {
  console.log(
    `Add this to your shell profile, then open a new terminal:\nexport PATH=${quote(bin)}:"$PATH"`,
  );
}
