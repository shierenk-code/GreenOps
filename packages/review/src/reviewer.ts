import { resolve } from 'node:path';
import { GitEngine } from '@codevitals/git';
import { RepositoryAnalyzer } from '@codevitals/repository';
import { SemanticDiffEngine } from './semantic-diff.js';
import { BlastRadiusEngine } from './blast-radius.js';
import { RiskAnalyzer } from './risk-analyzer.js';
import { PRReviewResult } from './types.js';

export interface PRReviewOptions {
  diffSpec?: string;
  base?: string;
  head?: string;
}

export class PRReviewer {
  private gitEngine: GitEngine;
  private semanticDiffEngine: SemanticDiffEngine;
  private blastRadiusEngine: BlastRadiusEngine;
  private riskAnalyzer: RiskAnalyzer;

  constructor() {
    this.gitEngine = new GitEngine();
    this.semanticDiffEngine = new SemanticDiffEngine();
    this.blastRadiusEngine = new BlastRadiusEngine();
    this.riskAnalyzer = new RiskAnalyzer();
  }

  public review(targetPath: string, options: PRReviewOptions = {}): PRReviewResult {
    const rootPath = resolve(targetPath);
    const diffSpec = options.diffSpec || options.base || 'HEAD~1';
    const base = options.base || diffSpec;
    const head = options.head || 'HEAD';

    const diffFiles = this.gitEngine.getDiff(rootPath, base, head);
    const changedFiles = this.gitEngine.getChangedFiles(rootPath, base, head);

    const analyzer = new RepositoryAnalyzer();
    const { result, graph } = analyzer.analyze(rootPath);

    const semanticDiff = this.semanticDiffEngine.analyzeSemanticDiff(
      diffFiles,
      result.symbols,
      changedFiles
    );

    const blastRadius = this.blastRadiusEngine.computeBlastRadius(
      semanticDiff.changedSymbols,
      graph
    );

    const riskAnalysis = this.riskAnalyzer.analyzeRisk(semanticDiff, blastRadius);

    return {
      repositoryPath: rootPath,
      diffSpec,
      semanticDiff,
      blastRadius,
      riskAnalysis,
      status: '✓ Review completed',
    };
  }
}
