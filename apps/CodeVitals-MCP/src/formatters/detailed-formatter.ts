import { CodeHealthReport } from "../types/findings.js";
import { SummaryFormatter } from "./summary-formatter.js";

export class DetailedFormatter {
  static format(report: CodeHealthReport): string {
    let output = SummaryFormatter.format(report);

    output += `\n\n==================================================`;
    output += `\n  DETAILED FINDINGS (${report.findings.length})`;
    output += `\n==================================================\n`;

    for (const f of report.findings) {
      output += `\n[${f.severity.toUpperCase()}] ${f.category} (${f.file}:${f.line}:${f.column})`;
      output += `\n  Message: ${f.message}`;
      if (f.codeSnippet) {
        output += `\n  Snippet: ${f.codeSnippet}`;
      }
      if (f.replacement) {
        output += `\n  Suggested Fix: ${f.replacement}`;
      }
      output += `\n`;
    }

    return output;
  }
}
