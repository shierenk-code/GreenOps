import ts from "typescript";
import { BugCheckerEngine } from "../../../src/engines/bug-checker.js";
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

describe("BugCheckerEngine", () => {
  it("detects unhandled promise rejections and empty catch blocks", async () => {
    const code = `
      function test() {
        try {
          fetchData().then(data => console.log(data));
        } catch (e) {
        }
      }
    `;
    const parsed = createMockParsedFile("test.ts", code);
    const engine = new BugCheckerEngine();
    const findings = await engine.analyze([parsed], "./");

    expect(findings.some((f) => f.category === "error_handling")).toBe(true);
    expect(findings.some((f) => f.category === "unhandled_promise")).toBe(true);
  });
});
