import 'server-only';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { parseEnv } from 'node:util';
import type { DemoConfig } from './demo-types';

/** Read only the two relevant values; credentials never enter the public response. */
export async function demoCredentials(): Promise<{ apiKey: string; model: string }> {
  const settings: Record<string, string | undefined> = {
    GEMINI_API_KEY: process.env.GEMINI_API_KEY,
    GEMINI_MODEL: process.env.GEMINI_MODEL,
  };
  const roots = [process.cwd(), resolve(/* turbopackIgnore: true */ process.cwd(), '../../..')];
  for (const root of roots) {
    for (const name of ['.env.local', '.env']) {
      try {
        // Local configuration is runtime-only; never trace .env files into build artifacts.
        const file = await readFile(
          /* turbopackIgnore: true */ resolve(/* turbopackIgnore: true */ root, name),
          'utf8',
        );
        if (file.length > 128_000) continue;
        const parsed = parseEnv(file);
        for (const key of ['GEMINI_API_KEY', 'GEMINI_MODEL']) settings[key] ??= parsed[key];
      } catch {
        /* Missing local env files are normal; never log their contents. */
      }
    }
  }
  const apiKey = settings.GEMINI_API_KEY?.trim() ?? '';
  const configuredModel = settings.GEMINI_MODEL?.trim() ?? 'gemini-3.8-flash';
  return {
    apiKey: /^(your_|replace|example)/i.test(apiKey) ? '' : apiKey,
    model: /^[a-zA-Z0-9._-]{1,100}$/.test(configuredModel) ? configuredModel : 'gemini-3.8-flash',
  };
}
export function publicDemoConfig(credentials: { apiKey: string; model: string }): DemoConfig {
  return {
    geminiAvailable: Boolean(credentials.apiKey),
    model: credentials.apiKey ? credentials.model : null,
    liveRequestLimit: 13,
  };
}
