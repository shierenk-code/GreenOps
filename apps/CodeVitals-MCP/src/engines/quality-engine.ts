import ts from "typescript";
import { BaseEngine } from "./base-engine.js";
import { Finding } from "../types/findings.js";
import { ParsedFile } from "../analyzers/ast-analyzer.js";
import { DuplicationDetector } from "../analyzers/duplication-detector.js";
import { DeadCodeFinder } from "../analyzers/dead-code-finder.js";
import { ComplexityCalculator } from "../analyzers/complexity-calculator.js";

export class QualityEngine extends BaseEngine {
  name = "Code Quality";
  dimension: "quality" = "quality";

  async analyze(files: ParsedFile[], rootPath: string): Promise<Finding[]> {
    const findings: Finding[] = [];

    // 1. Universal Code Duplication across all languages
    const duplications = DuplicationDetector.findExactDuplications(files, 10);
    for (const dup of duplications) {
      findings.push(
        this.createFinding({
          id: `qual-dup-${dup.block1.file}-${dup.block1.startLine}`,
          severity: "medium",
          category: "code_duplication",
          file: dup.block2.file,
          line: dup.block2.startLine,
          column: 1,
          message: `Duplicated code block (${dup.block2.lineCount} lines) also found in ${dup.block1.file}:${dup.block1.startLine}`,
          suggestion: "Refactor duplicated logic into shared utility function.",
          confidence: 0.85,
        })
      );
    }

    // 2. Multi-language File Quality Checks
    for (const file of files) {
      // Check oversized files
      if (file.loc > 1000) {
        findings.push(
          this.createFinding({
            id: `qual-oversized-file-${file.relativePath}`,
            severity: "medium",
            category: "oversized_file",
            file: file.relativePath,
            line: 1,
            column: 1,
            message: `Oversized source file (${file.loc} LOC > 1000 LOC threshold)`,
            confidence: 0.95,
          })
        );
      }

      // AST-based dead code and complexity for JS/TS
      if (file.sourceFile && ["typescript", "javascript"].includes(file.language)) {
        const sourceFile = file.sourceFile;
        const unused = DeadCodeFinder.findUnusedLocalVariables(file);
        for (const u of unused) {
          findings.push(
            this.createFinding({
              id: `qual-dead-var-${file.relativePath}-${u.line}`,
              severity: "low",
              category: "dead_code",
              file: file.relativePath,
              line: u.line,
              column: 1,
              message: `Unused variable '${u.name}'`,
              symbol: u.name,
              confidence: 0.8,
            })
          );
        }

        const visit = (node: ts.Node) => {
          if (ts.isFunctionDeclaration(node) || ts.isMethodDeclaration(node) || ts.isArrowFunction(node)) {
            const comp = ComplexityCalculator.calculateFunctionComplexity(node, sourceFile);
            if (comp.cyclomaticComplexity > 15) {
              findings.push(
                this.createFinding({
                  id: `qual-complexity-${file.relativePath}-${comp.line}`,
                  severity: "medium",
                  category: "cyclomatic_complexity",
                  file: file.relativePath,
                  line: comp.line,
                  column: 1,
                  message: `Function '${comp.name}' has high cyclomatic complexity (${comp.cyclomaticComplexity} > 15 threshold)`,
                  confidence: 0.95,
                })
              );
            }

            const fnText = node.getText(sourceFile);
            const fnLines = fnText.split("\n").length;
            if (fnLines > 50) {
              findings.push(
                this.createFinding({
                  id: `qual-fn-size-${file.relativePath}-${comp.line}`,
                  severity: "low",
                  category: "oversized_function",
                  file: file.relativePath,
                  line: comp.line,
                  column: 1,
                  message: `Function '${comp.name}' is too long (${fnLines} lines > 50 LOC limit)`,
                  confidence: 0.9,
                })
              );
            }
          }

          ts.forEachChild(node, visit);
        };

        visit(sourceFile);
      }
    }

    return findings;
  }
}
