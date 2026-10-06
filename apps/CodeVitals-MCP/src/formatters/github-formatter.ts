import { CodeHealthReport } from "../types/findings.js";

export class GitHubAnnotationsFormatter {
  static format(report: CodeHealthReport): string {
    const lines: string[] = [];

    for (const f of report.findings) {
      const level = f.severity === "critical" || f.severity === "high" ? "error" : "warning";
      lines.push(`::${level} file=${f.file},line=${f.line},col=${f.column}::${f.message}`);
    }

    return lines.join("\n");
  }
}
