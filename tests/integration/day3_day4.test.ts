import { afterAll, beforeAll, describe, it, expect } from 'vitest';
import { GitEngine } from '../../packages/git/src/index.js';
import { PRReviewer } from '../../packages/review/src/index.js';
import { createTempGitRepo, type TempGitRepo } from '../helpers/temp-git-repo.js';

describe('Phase 3 & Phase 4: Git Intelligence & PR Review Engine Integration', () => {
  let repo: TempGitRepo;
  beforeAll(() => {
    repo = createTempGitRepo();
  });
  afterAll(() => repo.cleanup());

  it('fetches git repository status and commits correctly', () => {
    const engine = new GitEngine();

    const status = engine.getStatus(repo.path);
    expect(status.branch).toBeDefined();

    const commits = engine.getCommits(repo.path, 5);
    expect(commits.length).toBe(2);
    expect(commits[0].hash).toBeDefined();
  });

  it('runs PR review pipeline and outputs blast radius risk score', () => {
    const reviewer = new PRReviewer();

    const result = reviewer.review(repo.path, { diffSpec: 'HEAD~1' });
    expect(result.repositoryPath).toBe(repo.path);
    expect(result.semanticDiff).toBeDefined();
    expect(result.blastRadius).toBeDefined();
    expect(result.riskAnalysis.score).toBeGreaterThanOrEqual(0);
    expect(result.riskAnalysis.score).toBeLessThanOrEqual(100);
    expect(['low', 'medium', 'high', 'critical']).toContain(result.riskAnalysis.level);
    expect(result.riskAnalysis.recommendations.length).toBeGreaterThan(0);
  });
});
