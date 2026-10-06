import { handleCodeHealth } from "../../src/tools/code_health.js";
import { handleCodeSecurity } from "../../src/tools/code_security.js";
import { handleCodeDependencies } from "../../src/tools/code_dependencies.js";
import { handleCodeBugs } from "../../src/tools/code_bugs.js";
import { handleCodeArchitecture } from "../../src/tools/code_architecture.js";
import { handleCodeDeprecations } from "../../src/tools/code_deprecations.js";
import { handleCodeFixPlan } from "../../src/tools/code_fix_plan.js";

describe("Integration: CodeVitals MCP Tools", () => {
  const targetPath = "./";

  it("executes handleCodeHealth end-to-end", async () => {
    const res = await handleCodeHealth({
      path: targetPath,
      depth: "medium",
      output_format: "summary",
    });

    expect(res.report).toBeDefined();
    expect(res.report.healthScore).toBeGreaterThanOrEqual(0);
    expect(res.report.healthScore).toBeLessThanOrEqual(100);
    expect(res.formattedOutput).toContain("CODEVITALS HEALTH REPORT");
  });

  it("executes handleCodeSecurity tool", async () => {
    const findings = await handleCodeSecurity({ path: targetPath });
    expect(Array.isArray(findings)).toBe(true);
  });

  it("executes handleCodeDependencies tool", async () => {
    const findings = await handleCodeDependencies({ path: targetPath });
    expect(Array.isArray(findings)).toBe(true);
  });

  it("executes handleCodeBugs tool", async () => {
    const findings = await handleCodeBugs({ path: targetPath });
    expect(Array.isArray(findings)).toBe(true);
  });

  it("executes handleCodeArchitecture tool", async () => {
    const findings = await handleCodeArchitecture({ path: targetPath });
    expect(Array.isArray(findings)).toBe(true);
  });

  it("executes handleCodeDeprecations tool", async () => {
    const findings = await handleCodeDeprecations({ path: targetPath });
    expect(Array.isArray(findings)).toBe(true);
  });

  it("executes handleCodeFixPlan tool", async () => {
    const plan = await handleCodeFixPlan({ path: targetPath });
    expect(Array.isArray(plan)).toBe(true);
  });
});
