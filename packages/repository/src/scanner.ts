import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  FileModel,
  LanguageDetector,
  FileClassifier,
  ScanResult,
  LanguageSummary,
} from '@codevitals/core';
import { IgnoreEngine, FileUtils } from '@codevitals/filesystem';
import { ConfigLoader } from '@codevitals/config';
import { Logger, defaultLogger } from '@codevitals/logger';
import {
  RepositoryNotFoundError,
  PermissionDeniedError,
  InvalidRepositoryError,
} from '@codevitals/errors';

export interface ScanOptions {
  logger?: Logger;
  includeIgnored?: boolean;
}

export class RepositoryScanner {
  private logger: Logger;

  constructor(options: ScanOptions = {}) {
    this.logger = options.logger ?? defaultLogger;
  }

  public scan(targetDirectory: string, options: ScanOptions = {}): ScanResult {
    const startTime = performance.now();
    const resolvedPath = path.resolve(targetDirectory);

    this.logger.info(`Repository scan started for ${resolvedPath}`);

    if (!fs.existsSync(resolvedPath)) {
      throw new RepositoryNotFoundError(resolvedPath);
    }

    try {
      const stats = fs.statSync(resolvedPath);
      if (!stats.isDirectory()) {
        throw new InvalidRepositoryError(resolvedPath, 'Path is a file, not a directory.');
      }
    } catch (err: unknown) {
      if (err instanceof RepositoryNotFoundError || err instanceof InvalidRepositoryError) {
        throw err;
      }
      const code = (err as { code?: string }).code;
      if (code === 'EACCES' || code === 'EPERM') {
        throw new PermissionDeniedError(resolvedPath);
      }
      throw new InvalidRepositoryError(resolvedPath, String(err));
    }

    const config = ConfigLoader.load(resolvedPath);
    const ignoreEngine = IgnoreEngine.loadFromDirectory(resolvedPath, {
      customPatterns: config.ignorePatterns,
    });

    const fileList: FileModel[] = [];
    this.walkDirectory(resolvedPath, resolvedPath, ignoreEngine, fileList, options.includeIgnored ?? false);

    this.logger.info(`Discovered ${fileList.length} files`);

    // Aggregations
    let sourceCount = 0;
    let testCount = 0;
    let generatedCount = 0;
    let binaryCount = 0;
    let ignoredCount = 0;

    const languageCounts: Record<string, number> = {};
    const languageLines: Record<string, number> = {};

    for (const file of fileList) {
      if (file.ignored) {
        ignoredCount++;
      } else if (file.binary) {
        binaryCount++;
      } else if (file.generated) {
        generatedCount++;
      } else if (file.testFile) {
        testCount++;
        if (file.language) {
          languageCounts[file.language] = (languageCounts[file.language] ?? 0) + 1;
          languageLines[file.language] = (languageLines[file.language] ?? 0) + (file.lines ?? 0);
        }
      } else {
        sourceCount++;
        if (file.language) {
          languageCounts[file.language] = (languageCounts[file.language] ?? 0) + 1;
          languageLines[file.language] = (languageLines[file.language] ?? 0) + (file.lines ?? 0);
        }
      }
    }

    const languageBreakdown: LanguageSummary[] = Object.keys(languageCounts)
      .map((lang) => {
        const count = languageCounts[lang]!;
        const lines = languageLines[lang] ?? 0;
        const totalNonBinary = fileList.filter((f) => !f.binary && f.language).length;
        const percentage = totalNonBinary > 0 ? Math.round((count / totalNonBinary) * 100) : 0;
        return {
          name: lang,
          filesCount: count,
          linesCount: lines,
          percentage,
        };
      })
      .sort((a, b) => b.filesCount - a.filesCount);

    this.logger.info(`Detected ${Object.keys(languageCounts).length} languages`);

    const endTime = performance.now();
    const durationMs = Math.round(endTime - startTime);
    const durationSeconds = (durationMs / 1000).toFixed(2) + 's';

    this.logger.info(`Repository scan completed in ${durationSeconds}`);

    return {
      repository: {
        path: resolvedPath,
      },
      files: {
        total: fileList.length,
        source: sourceCount,
        tests: testCount,
        generated: generatedCount,
        binary: binaryCount,
        ignored: ignoredCount,
      },
      languages: languageCounts,
      languageBreakdown,
      fileList,
      scanner: {
        durationMs,
        durationSeconds,
        cache: 'disabled',
      },
      status: '✓ Scan completed',
    };
  }

  private walkDirectory(
    rootPath: string,
    currentPath: string,
    ignoreEngine: IgnoreEngine,
    results: FileModel[],
    includeIgnored: boolean,
    maxFiles = 50000,
  ): void {
    if (results.length >= maxFiles) return;

    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(currentPath, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (results.length >= maxFiles) break;

      const fullPath = path.join(currentPath, entry.name);
      const relativePath = path.relative(rootPath, fullPath).replace(/\\/g, '/');

      const isIgnored = ignoreEngine.isIgnored(relativePath);

      if (entry.isDirectory()) {
        if (!isIgnored) {
          this.walkDirectory(rootPath, fullPath, ignoreEngine, results, includeIgnored, maxFiles);
        } else if (includeIgnored) {
          // If including ignored, still record files inside if needed, or skip directory traversal
        }
      } else if (entry.isFile()) {
        if (!isIgnored || includeIgnored) {
          const extension = entry.name.includes('.') ? entry.name.split('.').pop() : undefined;
          const language = LanguageDetector.detect(entry.name);
          const isTest = FileClassifier.isTestFile(relativePath);
          const isGenerated = FileClassifier.isGeneratedFile(relativePath);
          const isBinary = FileUtils.isBinaryFile(fullPath);

          let size = 0;
          try {
            size = fs.statSync(fullPath).size;
          } catch {
            // size default 0
          }

          const lines = FileUtils.countLines(fullPath, isBinary);
          const hash = FileUtils.computeHash(fullPath);

          const id = Buffer.from(relativePath).toString('hex').substring(0, 16);

          results.push({
            id,
            path: fullPath,
            relativePath,
            extension,
            language,
            size,
            lines,
            hash,
            generated: isGenerated,
            binary: isBinary,
            ignored: isIgnored,
            testFile: isTest,
          });
        }
      }
    }
  }
}
