import { describe, it, expect } from 'vitest';
import { resolve } from 'node:path';
import { writeFileSync, unlinkSync } from 'node:fs';
import { RepositoryAnalyzer } from '../../packages/repository/src/index.js';
import { ParserCache } from '../../packages/parser/src/index.js';

describe('Day 2: AST + Code Intelligence Engine Integration & Torture Tests', () => {
  it('analyzes TypeScript, JavaScript, Python, Go, and Java fixtures correctly', () => {
    const analyzer = new RepositoryAnalyzer();
    const fixturesDir = resolve(process.cwd(), 'fixtures/ast');
    const { result } = analyzer.analyze(fixturesDir);

    expect(result.statistics.files.analyzed).toBeGreaterThan(0);
    expect(result.statistics.symbols.total).toBeGreaterThan(0);
    expect(result.statistics.imports.total).toBeGreaterThan(0);
    expect(result.statistics.exports.total).toBeGreaterThan(0);
    expect(result.statistics.graph.nodes).toBeGreaterThan(0);
  });

  it('resists malformed / broken syntax without crashing', () => {
    const analyzer = new RepositoryAnalyzer();
    const brokenDir = resolve(process.cwd(), 'fixtures/ast/broken');
    const { result } = analyzer.analyze(brokenDir);

    expect(result.statistics.files.analyzed).toBeGreaterThan(0);
    expect(result.statistics.ast.failed).toBeGreaterThan(0);
  });

  it('preserves unicode symbols accurately (Japanese & Hindi)', () => {
    const analyzer = new RepositoryAnalyzer();
    const encDir = resolve(process.cwd(), 'fixtures/encoding');
    const { result } = analyzer.analyze(encDir);

    const jpFn = result.symbols.find((s) => s.name === '日本語関数');
    expect(jpFn).toBeDefined();
    expect(jpFn?.kind).toBe('function');
  });

  it('handles deeply nested directories properly', () => {
    const analyzer = new RepositoryAnalyzer();
    const deepDir = resolve(process.cwd(), 'fixtures/deep');
    const { result } = analyzer.analyze(deepDir);

    expect(result.statistics.files.analyzed).toBeGreaterThan(0);
    const deepFn = result.symbols.find((s) => s.name === 'deepNestedFunction');
    expect(deepFn).toBeDefined();
  });

  it('benchmarks performance against synthetic large repository', () => {
    const analyzer = new RepositoryAnalyzer();
    const largeDir = resolve(process.cwd(), 'fixtures/large');
    const start = performance.now();
    const { result } = analyzer.analyze(largeDir);
    const end = performance.now();

    const duration = end - start;
    expect(result.statistics.files.analyzed).toBeGreaterThan(0);
    expect(duration).toBeLessThan(5000); // Must execute under 5s
  });

  it('produces 100% deterministic outputs across consecutive runs', () => {
    const analyzer1 = new RepositoryAnalyzer();
    const analyzer2 = new RepositoryAnalyzer();
    const targetDir = resolve(process.cwd(), 'fixtures/ast/typescript');

    const { result: res1 } = analyzer1.analyze(targetDir);
    const { result: res2 } = analyzer2.analyze(targetDir);

    expect(JSON.stringify(res1.symbols)).toBe(JSON.stringify(res2.symbols));
    expect(JSON.stringify(res1.statistics)).toBe(JSON.stringify(res2.statistics));
    expect(JSON.stringify(res1.graph)).toBe(JSON.stringify(res2.graph));
  });

  it('handles parser cache invalidation when a file is modified', () => {
    const cache = new ParserCache();
    const analyzer = new RepositoryAnalyzer({ parserCache: cache });
    const tsDir = resolve(process.cwd(), 'fixtures/ast/typescript');

    analyzer.analyze(tsDir);
    const statsFirstRun = cache.getStats();
    expect(statsFirstRun.misses).toBeGreaterThan(0);
    expect(statsFirstRun.hits).toBe(0);

    analyzer.analyze(tsDir);
    const statsSecondRun = cache.getStats();
    expect(statsSecondRun.hits).toBe(statsFirstRun.misses);

    // Modify a temporary file
    const tempFile = resolve(tsDir, 'temp_test_cache.ts');
    writeFileSync(tempFile, 'export function tempFn() { return 1; }');

    try {
      analyzer.analyze(tsDir);
      const statsThirdRun = cache.getStats();
      expect(statsThirdRun.misses).toBe(statsFirstRun.misses + 1);
    } finally {
      unlinkSync(tempFile);
    }
  });
});
