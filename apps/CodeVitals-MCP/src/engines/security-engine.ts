import ts from "typescript";
import { BaseEngine } from "./base-engine.js";
import { Finding } from "../types/findings.js";
import { ParsedFile } from "../analyzers/ast-analyzer.js";
import { SECURITY_RULES } from "../config/security-patterns.js";
import { SecretScanner } from "../analyzers/secret-scanner.js";
import { InjectionDetector } from "../analyzers/injection-detector.js";

export class SecurityEngine extends BaseEngine {
  name = "Security Checker";
  dimension: "security" = "security";

  async analyze(files: ParsedFile[], rootPath: string): Promise<Finding[]> {
    const findings: Finding[] = [];

    for (const file of files) {
      this.checkFileRegexRules(file, findings);
      if (file.sourceFile && ["typescript", "javascript"].includes(file.language)) {
        this.checkFileAST(file, findings);
      }
    }

    return findings;
  }

  private checkFileRegexRules(file: ParsedFile, findings: Finding[]): void {
    const lines = file.content.split("\n");

    lines.forEach((lineText, index) => {
      for (const rule of SECURITY_RULES) {
        if (rule.pattern.test(lineText)) {
          findings.push(
            this.createFinding({
              id: `${rule.id}-${file.relativePath}-${index + 1}`,
              severity: rule.severity,
              category: rule.category,
              file: file.relativePath,
              line: index + 1,
              column: 1,
              message: rule.message,
              codeSnippet: lineText.trim().slice(0, 80),
              suggestion: rule.suggestion,
              confidence: 0.9,
            })
          );
        }
      }

      // Check high entropy string assign
      const stringMatches = lineText.match(/["']([A-Za-z0-9+/=_-]{24,})["']/g);
      if (stringMatches) {
        for (const rawStr of stringMatches) {
          const innerStr = rawStr.slice(1, -1);
          if (SecretScanner.isHighEntropySecret(innerStr) && !lineText.includes("import") && !lineText.includes("require")) {
            findings.push(
              this.createFinding({
                id: `sec-entropy-${file.relativePath}-${index + 1}`,
                severity: "high",
                category: "secret_leak",
                file: file.relativePath,
                line: index + 1,
                column: lineText.indexOf(innerStr) + 1,
                message: "High-entropy string detected, potential leaked credential or private key",
                codeSnippet: lineText.trim().slice(0, 80),
                confidence: 0.8,
              })
            );
          }
        }
      }
    });
  }

  private checkFileAST(file: ParsedFile, findings: Finding[]): void {
    if (!file.sourceFile) return;
    const sourceFile = file.sourceFile;

    const visit = (node: ts.Node) => {
      if (ts.isPropertyAccessExpression(node) && InjectionDetector.isUnsafeInnerHTML(node)) {
        const { line, character } = sourceFile.getLineAndCharacterOfPosition(node.getStart());
        findings.push(
          this.createFinding({
            id: `sec-xss-innerhtml-${file.relativePath}-${line + 1}`,
            severity: "high",
            category: "xss_injection",
            file: file.relativePath,
            line: line + 1,
            column: character + 1,
            message: "Direct innerHTML assignment creates DOM Cross-Site Scripting (XSS) risks",
            codeSnippet: node.getText(sourceFile),
            suggestion: "Use textContent or safe DOM sanitization libraries.",
            confidence: 0.95,
          })
        );
      }

      if (ts.isCallExpression(node) && InjectionDetector.isEvalCall(node, sourceFile)) {
        const { line, character } = sourceFile.getLineAndCharacterOfPosition(node.getStart());
        findings.push(
          this.createFinding({
            id: `sec-unsafe-eval-${file.relativePath}-${line + 1}`,
            severity: "critical",
            category: "unsafe_deserialization",
            file: file.relativePath,
            line: line + 1,
            column: character + 1,
            message: "Use of eval() allows arbitrary remote code execution",
            codeSnippet: node.getText(sourceFile),
            confidence: 0.99,
          })
        );
      }

      ts.forEachChild(node, visit);
    };

    visit(sourceFile);
  }
}
