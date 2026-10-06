import { HealthScoreAggregator } from "../../../src/aggregators/health-score.js";
import { Finding } from "../../../src/types/findings.js";

describe("HealthScoreAggregator", () => {
  it("computes overall health score and dimension deductions", () => {
    const mockFindings: Finding[] = [
      {
        id: "1",
        severity: "critical",
        category: "secret_leak",
        dimension: "security",
        file: "a.ts",
        line: 1,
        column: 1,
        message: "Secret leak",
        autofixAvailable: false,
        confidence: 0.9,
      },
      {
        id: "2",
        severity: "high",
        category: "null_risk",
        dimension: "bugs",
        file: "b.ts",
        line: 2,
        column: 1,
        message: "Null risk",
        autofixAvailable: false,
        confidence: 0.8,
      },
    ];

    const { healthScore, scoresByDimension } = HealthScoreAggregator.calculateScores(mockFindings);

    expect(scoresByDimension.security).toBe(80); // 100 - 20 (critical)
    expect(scoresByDimension.bugs).toBe(90); // 100 - 10 (high)
    expect(scoresByDimension.dependencies).toBe(100);
    expect(healthScore).toBeLessThan(100);
  });
});
