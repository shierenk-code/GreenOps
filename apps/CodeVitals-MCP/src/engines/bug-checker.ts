import ts from "typescript";
import { BaseEngine } from "./base-engine.js";
import { Finding } from "../types/findings.js";
import { ParsedFile } from "../analyzers/ast-analyzer.js";

export class BugCheckerEngine extends BaseEngine {
  name = "Bug Checker";
  dimension: "bugs" = "bugs";

  async analyze(files: ParsedFile[], rootPath: string): Promise<Finding[]> {
    const findings: Finding[] = [];

    for (const file of files) {
      if (file.sourceFile && ["typescript", "javascript"].includes(file.language)) {
        this.checkFileAST(file, findings);
      }
      this.checkFileMultiLanguage(file, findings);
    }

    return findings;
  }

  private checkFileMultiLanguage(file: ParsedFile, findings: Finding[]): void {
    const lines = file.content.split("\n");

    lines.forEach((lineText, index) => {
      const trimmed = lineText.trim();
      const lineNum = index + 1;

      // Python bare except
      if (file.language === "python" && /^except\s*:/.test(trimmed)) {
        findings.push(
          this.createFinding({
            id: `bug-py-bare-except-${file.relativePath}-${lineNum}`,
            severity: "high",
            category: "error_handling",
            file: file.relativePath,
            line: lineNum,
            column: 1,
            message: "Bare except clause catches all exceptions including SystemExit and KeyboardInterrupt",
            codeSnippet: trimmed,
            suggestion: "Use 'except Exception:' instead of bare 'except:'.",
            confidence: 0.95,
          })
        );
      }

      // Go ignored error
      if (file.language === "go" && /_,\s*err\s*:=|\w+,\s*_\s*:=.*err/i.test(trimmed)) {
        findings.push(
          this.createFinding({
            id: `bug-go-ignored-err-${file.relativePath}-${lineNum}`,
            severity: "medium",
            category: "error_handling",
            file: file.relativePath,
            line: lineNum,
            column: 1,
            message: "Explicitly ignoring returned error variable in Go assignment",
            codeSnippet: trimmed,
            confidence: 0.85,
          })
        );
      }

      // Java / C# empty catch block
      if (["java", "csharp"].includes(file.language) && /catch\s*\([^\)]+\)\s*\{\s*\}/.test(trimmed)) {
        findings.push(
          this.createFinding({
            id: `bug-empty-catch-${file.relativePath}-${lineNum}`,
            severity: "high",
            category: "error_handling",
            file: file.relativePath,
            line: lineNum,
            column: 1,
            message: "Empty catch block swallows exceptions silently",
            codeSnippet: trimmed,
            confidence: 0.95,
          })
        );
      }

      // C / C++ unsafe string functions
      if (["c", "cpp"].includes(file.language) && /\b(gets|strcpy|sprintf)\s*\(/.test(trimmed)) {
        findings.push(
          this.createFinding({
            id: `bug-c-unsafe-func-${file.relativePath}-${lineNum}`,
            severity: "high",
            category: "logic_error",
            file: file.relativePath,
            line: lineNum,
            column: 1,
            message: "Unsafe C function call prone to buffer overflow vulnerabilities",
            codeSnippet: trimmed,
            suggestion: "Use snprintf, strncpy, or fgets instead.",
            confidence: 0.9,
          })
        );
      }

      // Generic TODO / FIXME bug marker
      if (/\/\/\s*(TODO|FIXME|BUG|HACK):|\#\s*(TODO|FIXME|BUG|HACK):/i.test(trimmed)) {
        findings.push(
          this.createFinding({
            id: `bug-todo-${file.relativePath}-${lineNum}`,
            severity: "low",
            category: "logic_error",
            file: file.relativePath,
            line: lineNum,
            column: 1,
            message: `Unresolved TODO/FIXME bug annotation: ${trimmed.slice(0, 60)}`,
            codeSnippet: trimmed,
            confidence: 0.8,
          })
        );
      }
    });
  }

  private checkFileAST(file: ParsedFile, findings: Finding[]): void {
    if (!file.sourceFile) return;
    const sourceFile = file.sourceFile;

    const visit = (node: ts.Node) => {
      if (ts.isCallExpression(node)) {
        this.checkUnhandledPromise(node, file, findings);
      }
      if (ts.isCatchClause(node)) {
        this.checkEmptyCatchClause(node, file, findings);
      }
      if (ts.isPropertyAccessExpression(node)) {
        this.checkNullRiskPropertyAccess(node, file, findings);
      }
      if (ts.isIfStatement(node)) {
        this.checkIfStatementLogic(node, file, findings);
      }
      if (ts.isAwaitExpression(node)) {
        this.checkAwaitWithoutTryCatch(node, file, findings);
      }
      ts.forEachChild(node, visit);
    };

    visit(sourceFile);
  }

  private checkUnhandledPromise(node: ts.CallExpression, file: ParsedFile, findings: Finding[]): void {
    if (!file.sourceFile) return;
    if (ts.isPropertyAccessExpression(node.expression)) {
      const propName = node.expression.name.text;
      if (propName === "then") {
        let parent: ts.Node | undefined = node.parent;
        let hasCatch = false;

        while (parent && !ts.isStatement(parent)) {
          if (ts.isCallExpression(parent) && ts.isPropertyAccessExpression(parent.expression)) {
            if (parent.expression.name.text === "catch" || parent.expression.name.text === "finally") {
              hasCatch = true;
              break;
            }
          }
          parent = parent.parent;
        }

        if (!hasCatch && ts.isExpressionStatement(node.parent)) {
          const { line, character } = file.sourceFile.getLineAndCharacterOfPosition(node.getStart());
          findings.push(
            this.createFinding({
              id: `bug-unhandled-promise-${file.relativePath}-${line + 1}`,
              severity: "high",
              category: "unhandled_promise",
              file: file.relativePath,
              line: line + 1,
              column: character + 1,
              message: "Promise call with .then() does not handle rejections with .catch()",
              codeSnippet: node.getText(file.sourceFile).slice(0, 80),
              suggestion: "Chain .catch(err => ...) to handle potential errors.",
              confidence: 0.85,
            })
          );
        }
      }
    }
  }

  private checkEmptyCatchClause(node: ts.CatchClause, file: ParsedFile, findings: Finding[]): void {
    if (!file.sourceFile) return;
    const statements = node.block.statements;
    if (statements.length === 0) {
      const { line, character } = file.sourceFile.getLineAndCharacterOfPosition(node.getStart());
      findings.push(
        this.createFinding({
          id: `bug-empty-catch-${file.relativePath}-${line + 1}`,
          severity: "high",
          category: "error_handling",
          file: file.relativePath,
          line: line + 1,
          column: character + 1,
          message: "Empty catch block silently swallows exceptions",
          codeSnippet: node.getText(file.sourceFile),
          suggestion: "Log or handle the exception instead of ignoring it.",
          confidence: 0.95,
          autofixAvailable: false,
        })
      );
    }
  }

  private checkNullRiskPropertyAccess(node: ts.PropertyAccessExpression, file: ParsedFile, findings: Finding[]): void {
    if (!file.sourceFile) return;
    if (node.expression.kind === ts.SyntaxKind.Identifier) {
      const identText = node.expression.getText(file.sourceFile);
      if (identText.endsWith("Maybe") || identText.endsWith("Result") || identText === "user" || identText === "data") {
        if (!node.questionDotToken) {
          const { line, character } = file.sourceFile.getLineAndCharacterOfPosition(node.getStart());
          findings.push(
            this.createFinding({
              id: `bug-null-risk-${file.relativePath}-${line + 1}`,
              severity: "high",
              category: "null_risk",
              file: file.relativePath,
              line: line + 1,
              column: character + 1,
              message: `Potential null/undefined dereference when accessing property '${node.name.text}' on '${identText}'`,
              codeSnippet: node.getText(file.sourceFile),
              replacement: `${identText}?.${node.name.text}`,
              autofixAvailable: true,
              confidence: 0.75,
            })
          );
        }
      }
    }
  }

  private checkIfStatementLogic(node: ts.IfStatement, file: ParsedFile, findings: Finding[]): void {
    if (!file.sourceFile) return;
    if (node.expression.kind === ts.SyntaxKind.TrueKeyword || node.expression.kind === ts.SyntaxKind.FalseKeyword) {
      const { line, character } = file.sourceFile.getLineAndCharacterOfPosition(node.getStart());
      findings.push(
        this.createFinding({
          id: `bug-logic-boolean-literal-${file.relativePath}-${line + 1}`,
          severity: "medium",
          category: "logic_error",
          file: file.relativePath,
          line: line + 1,
          column: character + 1,
          message: "If condition uses constant boolean literal, creating dead or unconditional code",
          codeSnippet: node.getText(file.sourceFile).slice(0, 60),
          confidence: 0.95,
        })
      );
    }
  }

  private checkAwaitWithoutTryCatch(node: ts.AwaitExpression, file: ParsedFile, findings: Finding[]): void {
    if (!file.sourceFile) return;
    let parent: ts.Node | undefined = node.parent;
    let insideTry = false;

    while (parent) {
      if (ts.isTryStatement(parent)) {
        insideTry = true;
        break;
      }
      if (
        ts.isFunctionDeclaration(parent) ||
        ts.isMethodDeclaration(parent) ||
        ts.isArrowFunction(parent) ||
        ts.isFunctionExpression(parent)
      ) {
        break;
      }
      parent = parent.parent;
    }

    if (!insideTry) {
      const { line, character } = file.sourceFile.getLineAndCharacterOfPosition(node.getStart());
      findings.push(
        this.createFinding({
          id: `bug-await-no-try-${file.relativePath}-${line + 1}`,
          severity: "medium",
          category: "unhandled_promise",
          file: file.relativePath,
          line: line + 1,
          column: character + 1,
          message: "await expression outside try/catch block can lead to unhandled rejections",
          codeSnippet: node.getText(file.sourceFile).slice(0, 60),
          confidence: 0.7,
        })
      );
    }
  }
}
