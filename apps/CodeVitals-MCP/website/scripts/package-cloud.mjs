import { cp, mkdir, readdir, rm, access } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, join } from 'node:path';

const website = fileURLToPath(new URL('..', import.meta.url));
const target = resolve(website, 'dist/cloud');
const relative = 'apps/CodeVitals-MCP/website';
await access(join(website, '.next/standalone', relative, 'server.js'));
await rm(target, { recursive: true, force: true });
await mkdir(target, { recursive: true });
await cp(join(website, '.next/standalone'), target, { recursive: true });
await cp(join(website, 'public'), join(target, relative, 'public'), { recursive: true });
await cp(join(website, '.next/static'), join(target, relative, '.next/static'), { recursive: true });
// Next may copy dotenv files into standalone output. Runtime secrets belong in Azure.
async function removeSecrets(directory) {
  for (const item of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, item.name);
    if (item.name === '.env' || item.name.startsWith('.env.') || item.name.endsWith('.pem') || item.name.endsWith('.key')) await rm(path, { force: true, recursive: true });
    else if (item.isDirectory()) await removeSecrets(path);
  }
}
await removeSecrets(target);
console.log('Standalone deployment files prepared in website/dist/cloud. Build on Linux for Azure.');
