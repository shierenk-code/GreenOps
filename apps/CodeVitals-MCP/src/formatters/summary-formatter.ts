import { CodeHealthReport } from "../types/findings.js";

export class SummaryFormatter {
  static format(report: CodeHealthReport): string {
    const lines: string[] = [];

    lines.push(`==================================================`);
    lines.push(`  CODEVITALS HEALTH REPORT — Overall Score: ${report.healthScore}/100`);
    lines.push(`==================================================\n`);

    lines.push(`Summary:`);
    lines.push(`  - Critical Issues : ${report.summary.criticalCount}`);
    lines.push(`  - High Issues     : ${report.summary.highCount}`);
    lines.push(`  - Medium Issues   : ${report.summary.mediumCount}`);
    lines.push(`  - Low Issues      : ${report.summary.lowCount}`);
    lines.push(`  - Total Findings  : ${report.summary.totalFindings}\n`);

    lines.push(`Dimension Scores:`);
    for (const [dim, score] of Object.entries(report.scoresByDimension)) {
      lines.push(`  - ${dim.padEnd(14)}: ${score}/100`);
    }

    if (report.remediationPlan.length > 0) {
      lines.push(`\nRemediation Plan (Top ${Math.min(5, report.remediationPlan.length)}):`);
      for (const step of report.remediationPlan.slice(0, 5)) {
        lines.push(`  ${step.priority}. ${step.description} [Effort: ${step.estimatedEffort}]`);
      }
    }

    lines.push(`\nAnalysis completed in ${report.metadata.analysisTimeMs}ms across ${report.metadata.analyzedFiles} files (${report.metadata.totalLoc} LOC).`);

    return lines.join("\n");
  }
}
