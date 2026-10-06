import { Finding, RemediationStep } from "../types/findings.js";

export class RemediationPlanner {
  static generatePlan(findings: Finding[]): RemediationStep[] {
    const grouped = new Map<string, Finding[]>();

    for (const f of findings) {
      const key = f.category;
      if (!grouped.has(key)) {
        grouped.set(key, []);
      }
      grouped.get(key)!.push(f);
    }

    const steps: RemediationStep[] = [];
    let priorityCounter = 1;

    for (const [category, itemFindings] of grouped.entries()) {
      const files = Array.from(new Set(itemFindings.map((f) => f.file)));
      const autofixCount = itemFindings.filter((f) => f.autofixAvailable).length;
      const manualCount = itemFindings.length - autofixCount;

      const hasCriticalOrHigh = itemFindings.some((f) => f.severity === "critical" || f.severity === "high");
      const estimatedEffort = hasCriticalOrHigh ? (manualCount > 5 ? "complex" : "medium") : "quick";

      steps.push({
        priority: priorityCounter++,
        description: `Address ${itemFindings.length} ${category.replace(/_/g, " ")} issue(s) across ${files.length} file(s)`,
        category: category as Finding["category"],
        affectedFiles: files.slice(0, 5),
        autofixCount,
        manualCount,
        estimatedEffort,
      });
    }

    return steps.sort((a, b) => a.priority - b.priority);
  }
}
