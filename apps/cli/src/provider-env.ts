import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseEnv } from 'node:util';

const PROVIDER_KEYS = [
  'GREENOPS_LLM_PROVIDER',
  'GEMINI_API_KEY',
  'GOOGLE_API_KEY',
  'GEMINI_MODEL',
  'GEMINI_ENDPOINT',
  'OPENAI_API_KEY',
  'OPENAI_MODEL',
  'OLLAMA_BASE_URL',
  'OLLAMA_MODEL',
  'OLLAMA_TIMEOUT_MS',
] as const;

/** Shared checkout defaults for the installed CLI. Never import database/GitHub credentials. */
export function loadProviderDefaults(directory: string, env: NodeJS.ProcessEnv = process.env) {
  for (const name of ['.env.local', 'apps/CodeVitals-MCP/website/.env.local', '.env']) {
    let values: Record<string, string | undefined>;
    try {
      values = parseEnv(readFileSync(resolve(directory, name), 'utf8'));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue;
      throw new Error('Cannot read the shared GreenOps provider configuration.');
    }
    for (const key of PROVIDER_KEYS) {
      if (env[key] === undefined && values[key]?.trim()) env[key] = values[key];
    }
  }
}
