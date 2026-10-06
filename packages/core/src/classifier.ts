import { pathMatchesPattern } from './utils.js';

const TEST_PATTERNS = [
  '**/*.test.*',
  '**/*.spec.*',
  '**/*_test.*',
  '**/test_*.*',
  '**/*Test.*',
  '**/tests/**',
  '**/test/**',
  '**/__tests__/**',
  '**/spec/**',
  '**/specs/**',
];

const GENERATED_PATTERNS = [
  '**/*.min.*',
  '**/*.map',
  '**/*.d.ts',
  '**/*.bundle.js',
  '**/dist/**',
  '**/build/**',
  '**/out/**',
  '**/*.generated.*',
  '**/generated/**',
  '**/gen/**',
];

export class FileClassifier {
  public static isTestFile(relativePath: string): boolean {
    const normalized = relativePath.replace(/\\/g, '/');
    return pathMatchesPattern(normalized, TEST_PATTERNS);
  }

  public static isGeneratedFile(relativePath: string): boolean {
    const normalized = relativePath.replace(/\\/g, '/');
    return pathMatchesPattern(normalized, GENERATED_PATTERNS);
  }
}
