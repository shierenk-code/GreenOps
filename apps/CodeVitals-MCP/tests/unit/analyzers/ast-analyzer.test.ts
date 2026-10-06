import ts from "typescript";
import { ASTAnalyzer } from "../../../src/analyzers/ast-analyzer.js";

describe("ASTAnalyzer", () => {
  let analyzer: ASTAnalyzer;

  beforeEach(() => {
    analyzer = new ASTAnalyzer();
  });

  it("calculates metrics accurately from parsed files", () => {
    const code = `
      import fs from 'fs';
      import path from 'path';

      export class SampleClass {
        public methodOne() {
          return 42;
        }
      }

      function standaloneFunc() {
        const arrow = () => true;
      }
    `;

    const sourceFile = ts.createSourceFile("sample.ts", code, ts.ScriptTarget.Latest, true);
    const parsed = {
      filePath: "sample.ts",
      relativePath: "sample.ts",
      sourceFile,
      content: code,
      loc: code.split("\n").filter((l) => l.trim().length > 0).length,
      functionsCount: 3,
      classesCount: 1,
      importsCount: 2,
    };

    const metrics = analyzer.getMetrics([parsed]);
    expect(metrics.totalFiles).toBe(1);
    expect(metrics.totalFunctions).toBe(3);
    expect(metrics.totalClasses).toBe(1);
    expect(metrics.totalImports).toBe(2);
    expect(metrics.totalLoc).toBeGreaterThan(0);
  });

  it("traverses AST nodes with visitor callback", () => {
    const code = `const a = 10; const b = 20;`;
    const sourceFile = ts.createSourceFile("sample.ts", code, ts.ScriptTarget.Latest, true);
    let identifierCount = 0;

    analyzer.traverse(sourceFile, (node) => {
      if (ts.isIdentifier(node)) {
        identifierCount++;
      }
    });

    expect(identifierCount).toBeGreaterThanOrEqual(2);
  });

  it("clears cache without error", () => {
    expect(() => analyzer.clearCache()).not.toThrow();
  });
});
