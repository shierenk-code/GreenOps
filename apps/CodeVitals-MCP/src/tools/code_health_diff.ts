import { CodeHealthDiffOptions } from "../types/mcp-tools.js";
import { CodeHealthDiffReport } from "../types/findings.js";
import { handleCodeHealth } from "./code_health.js";
import { GitAnalyzer } from "../analyzers/git-analyzer.js";
import { DiffAggregator } from "../aggregators/diff-aggregator.js";

export async function handleCodeHealthDiff(options: CodeHealthDiffOptions): Promise<CodeHealthDiffReport> {
  const rootPath = options.path || "./";
  const against = options.against || "HEAD";

  const changedFiles = GitAnalyzer.getDiffChangedFiles(against, rootPath);
  const { report } = await handleCodeHealth({
    path: rootPath,
    depth: "medium",
    exclude_patterns: options.exclude_patterns,
  });

  return DiffAggregator.compareFindings(report.findings, changedFiles);
}
