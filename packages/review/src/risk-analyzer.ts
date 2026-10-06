import { SemanticDiffResult, BlastRadiusResult, RiskAnalysisResult, RiskLevel } from './types.js';

export class RiskAnalyzer {
  public analyzeRisk(
    semanticDiff: SemanticDiffResult,
    blastRadius: BlastRadiusResult
  ): RiskAnalysisResult {
    let score = 10; // Base score for any change
    const factors: string[] = [];
    const recommendations: string[] = [];

    // Factor 1: Exported symbols modified/removed
    const exportedChanges = semanticDiff.changedSymbols.filter((s) => s.exported);
    if (exportedChanges.length > 0) {
      const removedExports = exportedChanges.filter((s) => s.changeType === 'removed');
      if (removedExports.length > 0) {
        score += 35;
        factors.push(`Breaking change: ${removedExports.length} exported symbol(s) removed.`);
        recommendations.push('Ensure deprecation notice or major version bump for removed exports.');
      } else {
        score += 15;
        factors.push(`${exportedChanges.length} public/exported symbol(s) modified.`);
      }
    }

    // Factor 2: Blast radius caller impact
    const callerCount = blastRadius.affectedCallers.length;
    if (callerCount > 20) {
      score += 30;
      factors.push(`High blast radius: ${callerCount} downstream caller(s) affected.`);
      recommendations.push('Run comprehensive end-to-end integration tests for all caller modules.');
    } else if (callerCount > 5) {
      score += 15;
      factors.push(`Medium blast radius: ${callerCount} downstream caller(s) affected.`);
    }

    // Factor 3: Test coverage ratio
    const testCount = blastRadius.affectedTests.length;
    if (testCount === 0 && semanticDiff.changedSymbols.length > 0) {
      score += 25;
      factors.push('Zero test coverage detected for modified symbols.');
      recommendations.push('Add unit tests covering the modified functions/methods before merging.');
    } else if (testCount > 0) {
      factors.push(`${testCount} test suite(s) cover the affected code paths.`);
    }

    // Factor 4: Volume of line changes
    let totalLinesChanged = 0;
    for (const f of semanticDiff.changedFiles) {
      totalLinesChanged += f.additions + f.deletions;
    }
    if (totalLinesChanged > 500) {
      score += 20;
      factors.push(`Large PR volume: ${totalLinesChanged} lines changed across ${semanticDiff.changedFiles.length} files.`);
      recommendations.push('Consider splitting large PR into smaller, independent pull requests.');
    }

    // Cap score at 100
    score = Math.min(100, Math.max(0, score));

    let level: RiskLevel = 'low';
    if (score >= 80) level = 'critical';
    else if (score >= 50) level = 'high';
    else if (score >= 30) level = 'medium';

    if (recommendations.length === 0) {
      recommendations.push('Code changes are isolated with minimal blast radius.');
    }

    return {
      score,
      level,
      factors,
      recommendations,
    };
  }
}
