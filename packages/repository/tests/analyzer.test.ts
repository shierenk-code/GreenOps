import { afterAll, beforeAll, describe, it, expect } from 'vitest';
import { RepositoryAnalyzer } from '../src/index.js';
import { createTempGitRepo, type TempGitRepo } from '../../../tests/helpers/temp-git-repo.js';

describe('Repository Analyzer', () => {
  // A small generated repository keeps this test fast; scanning the whole monorepo timed out.
  let repo: TempGitRepo;
  beforeAll(() => {
    repo = createTempGitRepo();
  });
  afterAll(() => repo.cleanup());

  it('analyzes repository files, extracts symbols, imports, exports, and constructs graph', () => {
    const analyzer = new RepositoryAnalyzer();
    const { result, graph } = analyzer.analyze(repo.path);

    expect(result.repository.path).toBe(repo.path);
    expect(result.statistics.files.analyzed).toBeGreaterThan(0);
    expect(result.statistics.symbols.total).toBeGreaterThan(0);
    expect(graph.getNodeCount()).toBeGreaterThan(0);
  });
});
