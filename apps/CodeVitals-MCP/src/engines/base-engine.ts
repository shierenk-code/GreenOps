import { Finding, Severity } from "../types/findings.js";
import { ParsedFile } from "../analyzers/ast-analyzer.js";

export abstract class BaseEngine {
  abstract name: string;
  abstract dimension:
    | "bugs"
    | "dependencies"
    | "security"
    | "deprecations"
    | "versions"
    | "architecture"
    | "quality"
    | "tests"
    | "performance";

  abstract analyze(files: ParsedFile[], rootPath: string): Promise<Finding[]>;

  protected createFinding(params: {
    id: string;
    severity: Severity;
    category: Finding["category"];
    file: string;
    line: number;
    column: number;
    message: string;
    codeSnippet?: string;
    symbol?: string;
    replacement?: string;
    suggestion?: string;
    autofixAvailable?: boolean;
    confidence?: number;
  }): Finding {
    return {
      id: params.id,
      severity: params.severity,
      category: params.category,
      dimension: this.dimension,
      file: params.file,
      line: params.line,
      column: params.column,
      message: params.message,
      codeSnippet: params.codeSnippet,
      symbol: params.symbol,
      replacement: params.replacement,
      suggestion: params.suggestion,
      autofixAvailable: params.autofixAvailable ?? false,
      confidence: params.confidence ?? 0.9,
    };
  }
}
