import ts from "typescript";
import { ParsedFile } from "./ast-analyzer.js";

export interface UnusedDeclaration {
  file: string;
  name: string;
  line: number;
  kind: "function" | "variable" | "class";
}

export class DeadCodeFinder {
  static findUnusedLocalVariables(file: ParsedFile): UnusedDeclaration[] {
    const unused: UnusedDeclaration[] = [];
    if (!file.sourceFile) return unused;
    const sourceFile = file.sourceFile;
    const declaredVars = new Map<string, { line: number; node: ts.Node }>();
    const usedVars = new Set<string>();

    const visit = (node: ts.Node) => {
      if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)) {
        const name = node.name.text;
        const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart());
        declaredVars.set(name, { line: line + 1, node });
      } else if (ts.isIdentifier(node)) {
        usedVars.add(node.text);
      }
      ts.forEachChild(node, visit);
    };

    visit(sourceFile);

    for (const [name, info] of declaredVars.entries()) {
      if (!usedVars.has(name) && !name.startsWith("_")) {
        unused.push({
          file: file.relativePath,
          name,
          line: info.line,
          kind: "variable",
        });
      }
    }

    return unused;
  }
}
