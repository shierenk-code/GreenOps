import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadProviderDefaults } from '../apps/cli/src/provider-env';

describe('shared CLI provider defaults', () => {
  it('loads model configuration without importing database secrets or overriding project settings', () => {
    const directory = mkdtempSync(join(tmpdir(), 'greenops-provider-'));
    try {
      writeFileSync(
        join(directory, '.env'),
        'GREENOPS_LLM_PROVIDER=gemini\nGEMINI_API_KEY=test-secret\nGEMINI_MODEL=default-model\nMONGODB_URI=must-not-load\n',
      );
      writeFileSync(join(directory, '.env.local'), 'GEMINI_MODEL=local-model\n');
      const env: NodeJS.ProcessEnv = {};
      loadProviderDefaults(directory, env);
      expect(env.GREENOPS_LLM_PROVIDER).toBe('gemini');
      expect(env.GEMINI_MODEL).toBe('local-model');
      expect(env.MONGODB_URI).toBeUndefined();
      env.GREENOPS_LLM_PROVIDER = 'offline';
      loadProviderDefaults(directory, env);
      expect(env.GREENOPS_LLM_PROVIDER).toBe('offline');
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
