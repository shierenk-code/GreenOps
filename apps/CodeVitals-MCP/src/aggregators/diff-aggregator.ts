import { CodeHealthDiffReport, Finding, Severity } from "../types/findings.js";

export class DiffAggregator {
  static compareFindings(currentFindings: Finding[], changedFiles: string[]): CodeHealthDiffReport {
    const relevantFindings = currentFindings.filter((f) => changedFiles.includes(f.file));

    const newIssues: Record<Severity, number> = { critical: 0, high: 0, medium: 0, low: 0 };
    const fixedIssues: Record<Severity, number> = { critical: 0, high: 0, medium: 0, low: 0 };
    const unchangedIssues: Record<Severity, number> = { critical: 0, high: 0, medium: 0, low: 0 };

    for (const f of relevantFindings) {
      newIssues[f.severity]++;
    }

    const prHealthScore = -1 * (newIssues.critical * 30 + newIssues.high * 15 + newIssues.medium * 5 + newIssues.low * 2);

    let recommendation = "Good to merge";
    if (newIssues.critical > 0 || newIssues.high > 0) {
      recommendation = `Fix ${newIssues.critical + newIssues.high} critical/high issues before merging`;
    }

    const fileMap: Record<string, { newFindings: Finding[]; fixedFindings: Finding[] }> = {};
    for (const file of changedFiles) {
      fileMap[file] = {
        newFindings: relevantFindings.filter((f) => f.file === file),
        fixedFindings: [],
      };
    }

    return {
      prHealthScore,
      newIssues,
      fixedIssues,
      unchangedIssues,
      changedFiles: Object.entries(fileMap).map(([file, val]) => ({
        file,
        newFindings: val.newFindings,
        fixedFindings: val.fixedFindings,
      })),
      recommendation,
    };
  }
}
