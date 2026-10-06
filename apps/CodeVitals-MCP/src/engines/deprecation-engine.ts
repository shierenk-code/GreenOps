import ts from "typescript";
import { BaseEngine } from "./base-engine.js";
import { Finding } from "../types/findings.js";
import { ParsedFile } from "../analyzers/ast-analyzer.js";
import { KNOWN_DEPRECATIONS } from "../config/deprecations.js";
import { JSDocParser } from "../analyzers/jsdoc-parser.js";

export class DeprecationEngine extends BaseEngine {
  name = "Deprecation Checker";
  dimension: "deprecations" = "deprecations";

  async analyze(files: ParsedFile[], rootPath: string): Promise<Finding[]> {
    const findings: Finding[] = [];

    for (const file of files) {
      this.checkFile(file, findings);
    }

    return findings;
  }

  private checkFile(file: ParsedFile, findings: Finding[]): void {
    if (file.sourceFile && ["typescript", "javascript"].includes(file.language)) {
      const sourceFile = file.sourceFile;
      const visit = (node: ts.Node) => {
        const jsdoc = JSDocParser.checkDeprecation(node);
        if (jsdoc.isDeprecated) {
          const { line, character } = sourceFile.getLineAndCharacterOfPosition(node.getStart());
          findings.push(
            this.createFinding({
              id: `deprec-jsdoc-${file.relativePath}-${line + 1}`,
              severity: "medium",
              category: "api_deprecation",
              file: file.relativePath,
              line: line + 1,
              column: character + 1,
              message: `Declaration is marked @deprecated: ${jsdoc.message}`,
              confidence: 0.95,
            })
          );
        }

        const text = node.getText(sourceFile);
        for (const known of KNOWN_DEPRECATIONS) {
          if (text.includes(known.symbol)) {
            const { line, character } = sourceFile.getLineAndCharacterOfPosition(node.getStart());
            findings.push(
              this.createFinding({
                id: `deprec-known-${known.symbol}-${file.relativePath}-${line + 1}`,
                severity: known.severity,
                category: "framework_deprecation",
                file: file.relativePath,
                line: line + 1,
                column: character + 1,
                message: `Deprecated API usage '${known.symbol}': ${known.message}`,
                symbol: known.symbol,
                replacement: known.replacement,
                autofixAvailable: !!known.replacement,
                confidence: 0.85,
              })
            );
            break;
          }
        }

        ts.forEachChild(node, visit);
      };

      visit(sourceFile);
      return;
    }

    // Multi-language text scanner for deprecations
    const lines = file.content.split("\n");
    lines.forEach((lineText, idx) => {
      for (const known of KNOWN_DEPRECATIONS) {
        if (lineText.includes(known.symbol)) {
          findings.push(
            this.createFinding({
              id: `deprec-known-${known.symbol}-${file.relativePath}-${idx + 1}`,
              severity: known.severity,
              category: "framework_deprecation",
              file: file.relativePath,
              line: idx + 1,
              column: 1,
              message: `Deprecated API usage '${known.symbol}': ${known.message}`,
              symbol: known.symbol,
              replacement: known.replacement,
              autofixAvailable: !!known.replacement,
              confidence: 0.85,
            })
          );
          break;
        }
      }
    });
  }
}
