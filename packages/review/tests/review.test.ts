import { afterAll, beforeAll, describe, it, expect } from 'vitest';
import { PRReviewer } from '../src/index.js';
import { createTempGitRepo, type TempGitRepo } from '../../../tests/helpers/temp-git-repo.js';

describe('PR Review & Blast Radius Intelligence', () => {
  let repo: TempGitRepo;
  beforeAll(() => {
    repo = createTempGitRepo();
  });
  afterAll(() => repo.cleanup());

  it('executes review pipeline and calculates risk metrics', () => {
    const reviewer = new PRReviewer();
    const result = reviewer.review(repo.path, { diffSpec: 'HEAD~1' });

    expect(result.repositoryPath).toBe(repo.path);
    expect(result.semanticDiff).toBeDefined();
    expect(result.blastRadius).toBeDefined();
    expect(result.riskAnalysis.score).toBeGreaterThanOrEqual(0);
    expect(result.riskAnalysis.score).toBeLessThanOrEqual(100);
    expect(['low', 'medium', 'high', 'critical']).toContain(result.riskAnalysis.level);
  });
});
