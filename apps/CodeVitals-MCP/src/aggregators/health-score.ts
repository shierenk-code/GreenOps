import { DimensionScores, Finding, Severity } from "../types/findings.js";

export class HealthScoreAggregator {
  static calculateScores(findings: Finding[]): { healthScore: number; scoresByDimension: DimensionScores } {
    const scoresByDimension: DimensionScores = {
      bugs: 100,
      dependencies: 100,
      security: 100,
      deprecations: 100,
      versions: 100,
      architecture: 100,
      quality: 100,
      tests: 100,
      performance: 100,
    };

    const severityDeduction: Record<Severity, number> = {
      critical: 20,
      high: 10,
      medium: 5,
      low: 2,
    };

    for (const finding of findings) {
      const deduction = severityDeduction[finding.severity] || 2;
      const dim = finding.dimension;
      if (scoresByDimension[dim] !== undefined) {
        scoresByDimension[dim] = Math.max(0, scoresByDimension[dim] - deduction);
      }
    }

    const dims = Object.keys(scoresByDimension) as (keyof DimensionScores)[];
    const totalDimScore = dims.reduce((acc, k) => acc + scoresByDimension[k], 0);
    const healthScore = Math.round(totalDimScore / dims.length);

    return { healthScore, scoresByDimension };
  }
}
