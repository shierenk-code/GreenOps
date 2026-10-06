import { RemediationPlanner } from "../../../src/aggregators/remediation-planner.js";
import { Finding } from "../../../src/types/findings.js";

describe("RemediationPlanner", () => {
  it("groups findings by category and prioritizes fixes", () => {
    const findings: Finding[] = [
      {
        id: "1",
        severity: "critical",
        category: "secret_leak",
        dimension: "security",
        file: "config.ts",
        line: 10,
        column: 1,
        message: "AWS Key leaked",
        autofixAvailable: false,
        confidence: 0.95,
      },
      {
        id: "2",
        severity: "high",
        category: "null_risk",
        dimension: "bugs",
        file: "user.ts",
        line: 5,
        column: 1,
        message: "Null dereference",
        autofixAvailable: true,
        confidence: 0.85,
      },
    ];

    const plan = RemediationPlanner.generatePlan(findings);

    expect(plan.length).toBe(2);
    expect(plan[0].priority).toBe(1);
    expect(plan[0].affectedFiles).toBeDefined();
    expect(plan[0].estimatedEffort).toBeDefined();
  });
});
