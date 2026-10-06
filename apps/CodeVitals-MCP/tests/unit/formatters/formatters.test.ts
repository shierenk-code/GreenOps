import { SummaryFormatter } from "../../../src/formatters/summary-formatter.js";
import { DetailedFormatter } from "../../../src/formatters/detailed-formatter.js";
import { JSONFormatter } from "../../../src/formatters/json-formatter.js";
import { GitHubAnnotationsFormatter } from "../../../src/formatters/github-formatter.js";
import { CodeHealthReport } from "../../../src/types/findings.js";

describe("Formatters", () => {
  const mockReport: CodeHealthReport = {
    healthScore: 85,
    scoresByDimension: {
      bugs: 90,
      dependencies: 100,
      security: 70,
      deprecations: 90,
      versions: 100,
      architecture: 100,
      quality: 100,
      tests: 100,
      performance: 100,
    },
    summary: {
      criticalCount: 1,
      highCount: 1,
      mediumCount: 0,
      lowCount: 0,
      totalFindings: 2,
    },
    findings: [
      {
        id: "1",
        severity: "critical",
        category: "secret_leak",
        dimension: "security",
        file: "config.ts",
        line: 10,
        column: 5,
        message: "Secret leak",
        autofixAvailable: false,
        confidence: 0.95,
      },
    ],
    remediationPlan: [
      {
        priority: 1,
        description: "Address 1 secret leak issue",
        category: "secret_leak",
        affectedFiles: ["config.ts"],
        autofixCount: 0,
        manualCount: 1,
        estimatedEffort: "medium",
      },
    ],
    metadata: {
      analyzedFiles: 10,
      totalLoc: 1500,
      analysisTimeMs: 45,
      timestamp: "2026-08-25T00:00:00Z",
    },
  };

  it("formats summary output cleanly", () => {
    const summary = SummaryFormatter.format(mockReport);
    expect(summary).toContain("CODEVITALS HEALTH REPORT — Overall Score: 85/100");
    expect(summary).toContain("Critical Issues : 1");
  });

  it("formats detailed output with snippets", () => {
    const detailed = DetailedFormatter.format(mockReport);
    expect(detailed).toContain("DETAILED FINDINGS");
    expect(detailed).toContain("[CRITICAL]");
  });

  it("formats JSON output accurately", () => {
    const jsonStr = JSONFormatter.format(mockReport);
    const parsed = JSON.parse(jsonStr);
    expect(parsed.healthScore).toBe(85);
  });

  it("formats GitHub annotations", () => {
    const gh = GitHubAnnotationsFormatter.format(mockReport);
    expect(gh).toContain("::error file=config.ts,line=10,col=5::Secret leak");
  });
});
