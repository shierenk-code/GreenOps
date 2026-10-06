import { describe, it, expect } from 'vitest';
import * as path from 'node:path';
import { RepositoryScanner } from '@codevitals/repository';
import { Logger } from '@codevitals/logger';
import { RepositoryNotFoundError, InvalidRepositoryError } from '@codevitals/errors';

const silentLogger = new Logger({ level: 'silent' });
const fixturesDir = path.resolve(__dirname, '../fixtures');

describe('RepositoryScanner', () => {
  const scanner = new RepositoryScanner({ logger: silentLogger });

  it('finds files in tiny-ts fixture', () => {
    const repoPath = path.join(fixturesDir, 'tiny-ts');
    const result = scanner.scan(repoPath);

    expect(result.files.total).toBeGreaterThan(0);
    expect(result.languages['TypeScript']).toBeGreaterThan(0);
    expect(result.files.tests).toBe(1);
  });

  it('ignores .git directory and respects .gitignore and .codevitalsignore', () => {
    const repoPath = path.join(fixturesDir, 'ignored-project');
    const result = scanner.scan(repoPath);

    const relativePaths = result.fileList.map((f) => f.relativePath);
    expect(relativePaths).toContain('src/index.ts');
    expect(relativePaths).not.toContain('temp.log');
    expect(relativePaths).not.toContain('ignored-dir/file.txt');
  });

  it('detects generated files in generated-project fixture', () => {
    const repoPath = path.join(fixturesDir, 'generated-project');
    const result = scanner.scan(repoPath);

    expect(result.files.generated).toBeGreaterThan(0);
  });

  it('handles empty-project fixture', () => {
    const repoPath = path.join(fixturesDir, 'empty-project');
    const result = scanner.scan(repoPath);

    expect(result.files.total).toBe(1); // README.md
    expect(result.status).toContain('Scan completed');
  });

  it('handles mixed-project fixture with multiple languages', () => {
    const repoPath = path.join(fixturesDir, 'mixed-project');
    const result = scanner.scan(repoPath);

    expect(result.languages['TypeScript']).toBe(1);
    expect(result.languages['Python']).toBe(1);
    expect(result.languages['CSS']).toBe(1);
  });

  it('throws RepositoryNotFoundError for non-existent path', () => {
    expect(() => scanner.scan(path.join(fixturesDir, 'non-existent-dir'))).toThrow(
      RepositoryNotFoundError,
    );
  });

  it('throws InvalidRepositoryError when target path is a file', () => {
    const filePath = path.join(fixturesDir, 'tiny-ts/package.json');
    expect(() => scanner.scan(filePath)).toThrow(InvalidRepositoryError);
  });
});
