import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ConfigLoader } from '@codevitals/config';

const directories: string[] = [];
function fixture(files: Record<string, string>): string {
  const directory = mkdtempSync(join(tmpdir(), 'greenops-config-naming-'));
  directories.push(directory);
  for (const [name, content] of Object.entries(files))
    writeFileSync(join(directory, name), content);
  return directory;
}
afterEach(() => {
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

describe('GreenOps configuration names', () => {
  it.each(['.greenopsrc', '.greenopsrc.json', '.codevitalsrc', '.codevitalsrc.json'])(
    'loads %s',
    (name) => {
      expect(
        ConfigLoader.load(fixture({ [name]: '{"maxFileSizeBytes":123}' })).maxFileSizeBytes,
      ).toBe(123);
    },
  );
  it('prefers GreenOps configuration over the legacy name', () => {
    const directory = fixture({
      '.greenopsrc.json': '{"maxFileSizeBytes":123}',
      '.codevitalsrc': '{"maxFileSizeBytes":456}',
    });
    expect(ConfigLoader.load(directory).maxFileSizeBytes).toBe(123);
  });
  it('does not silently fall back when GreenOps configuration is malformed', () => {
    const directory = fixture({
      '.greenopsrc': '{invalid',
      '.codevitalsrc': '{"maxFileSizeBytes":456}',
    });
    expect(() => ConfigLoader.load(directory)).toThrow('Failed to parse configuration');
  });
});
