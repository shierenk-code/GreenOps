import * as fs from 'node:fs';
import * as path from 'node:path';
import ignore, { Ignore } from 'ignore';

export interface IgnoreEngineOptions {
  customPatterns?: string[];
  includeDefaults?: boolean;
}

export const DEFAULT_IGNORE_PATTERNS = [
  '.git',
  '.git/**',
  'node_modules',
  'node_modules/**',
  '.pnpm-store',
  '.pnpm-store/**',
  '.pnpm',
  '.pnpm/**',
  'dist',
  'dist/**',
  'build',
  'build/**',
  'coverage',
  'coverage/**',
  '.cache',
  '.cache/**',
  '.next',
  '.next/**',
  '.turbo',
  '.turbo/**',
  '.tmp',
  '.tmp/**',
  'vendor',
  'vendor/**',
  '*.log',
  '.DS_Store',
];

export class IgnoreEngine {
  private ig: Ignore;

  constructor(options: IgnoreEngineOptions = {}) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ignoreFactory = (ignore as any).default || ignore;
    this.ig = ignoreFactory();

    if (options.includeDefaults !== false) {
      this.ig.add(DEFAULT_IGNORE_PATTERNS);
    }

    if (options.customPatterns && options.customPatterns.length > 0) {
      this.ig.add(options.customPatterns);
    }
  }

  public static loadFromDirectory(
    dirPath: string,
    options: IgnoreEngineOptions = {},
  ): IgnoreEngine {
    const engine = new IgnoreEngine(options);

    const gitignorePath = path.join(dirPath, '.gitignore');
    if (fs.existsSync(gitignorePath)) {
      try {
        const content = fs.readFileSync(gitignorePath, 'utf-8');
        engine.addPatterns(content);
      } catch {
        // ignore read error
      }
    }

    const codevitalsIgnorePath = path.join(dirPath, '.codevitalsignore');
    if (fs.existsSync(codevitalsIgnorePath)) {
      try {
        const content = fs.readFileSync(codevitalsIgnorePath, 'utf-8');
        engine.addPatterns(content);
      } catch {
        // ignore read error
      }
    }

    return engine;
  }

  public addPatterns(patterns: string | string[]): void {
    if (typeof patterns === 'string') {
      const lines = patterns
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter((l) => l.length > 0 && !l.startsWith('#'));
      if (lines.length > 0) {
        this.ig.add(lines);
      }
    } else if (patterns.length > 0) {
      this.ig.add(patterns);
    }
  }

  public isIgnored(relativePath: string): boolean {
    if (!relativePath || relativePath === '.' || relativePath === './') {
      return false;
    }
    const cleanPath = relativePath.replace(/^(\.\/|\/)/, '');
    if (!cleanPath) {
      return false;
    }
    return this.ig.ignores(cleanPath);
  }
}
