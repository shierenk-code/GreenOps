import ts from "typescript";
import { SecurityEngine } from "../../../src/engines/security-engine.js";
import { ParsedFile } from "../../../src/analyzers/ast-analyzer.js";

function createMockParsedFile(filename: string, code: string): ParsedFile {
  const sourceFile = ts.createSourceFile(filename, code, ts.ScriptTarget.Latest, true);
  return {
    filePath: filename,
    relativePath: filename,
    sourceFile,
    language: "typescript",
    content: code,
    loc: code.split("\n").length,
    functionsCount: 1,
    classesCount: 0,
    importsCount: 0,
  };
}

describe("SecurityEngine", () => {
  it("detects hardcoded AWS secret key and innerHTML assignment", async () => {
    const code = `
      const awsKey = "AKIAIOSFODNN7EXAMPLE";
      element.innerHTML = userInput;
    `;
    const parsed = createMockParsedFile("test-sec.ts", code);

    const engine = new SecurityEngine();
    const findings = await engine.analyze([parsed], "./");

    expect(findings.some((f) => f.category === "secret_leak")).toBe(true);
    expect(findings.some((f) => f.category === "xss_injection")).toBe(true);
  });
});
