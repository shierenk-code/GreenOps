import ts from "typescript";
import { DeprecationEngine } from "../../../src/engines/deprecation-engine.js";
import { ParsedFile } from "../../../src/analyzers/ast-analyzer.js";

function createMockParsedFile(filename: string, code: string): ParsedFile {
  const sourceFile = ts.createSourceFile(filename, code, ts.ScriptTarget.Latest, true);
  return {
    filePath: filename,
    relativePath: filename,
    sourceFile,
    content: code,
    loc: code.split("\n").length,
    functionsCount: 1,
    classesCount: 0,
    importsCount: 0,
  };
}

describe("DeprecationEngine", () => {
  it("detects known deprecated API util.print and componentWillMount", async () => {
    const code = `
      util.print("hello");
      class MyComp {
        componentWillMount() {}
      }
    `;
    const parsed = createMockParsedFile("test-deprec.ts", code);

    const engine = new DeprecationEngine();
    const findings = await engine.analyze([parsed], "./");

    expect(findings.some((f) => f.symbol === "util.print")).toBe(true);
    expect(findings.some((f) => f.symbol === "componentWillMount")).toBe(true);
  });
});
