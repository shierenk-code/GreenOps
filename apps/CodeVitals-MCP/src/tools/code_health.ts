import { CodeHealthReport, Finding } from '../types/findings.js';
import { CodeHealthOptions } from '../types/mcp-tools.js';
import { FileSystem } from '../utils/file-system.js';
import { ASTAnalyzer } from '../analyzers/ast-analyzer.js';
import { BugCheckerEngine } from '../engines/bug-checker.js';
import { DependencyEngine } from '../engines/dependency-engine.js';
import { SecurityEngine } from '../engines/security-engine.js';
import { DeprecationEngine } from '../engines/deprecation-engine.js';
import { ArchitectureEngine } from '../engines/architecture-engine.js';
import { QualityEngine } from '../engines/quality-engine.js';
import { HealthScoreAggregator } from '../aggregators/health-score.js';
import { RemediationPlanner } from '../aggregators/remediation-planner.js';
import { SummaryFormatter } from '../formatters/summary-formatter.js';
import { DetailedFormatter } from '../formatters/detailed-formatter.js';
import { JSONFormatter } from '../formatters/json-formatter.js';
import { GitHubAnnotationsFormatter } from '../formatters/github-formatter.js';

export async function handleCodeHealth(
  options: CodeHealthOptions,
): Promise<{ report: CodeHealthReport; formattedOutput: string }> {
  const startTime = Date.now();
  const rootPath = options.path || './';

  const astAnalyzer = new ASTAnalyzer();

  try {
    const fileEntries = await FileSystem.collectFiles(rootPath, options.exclude_patterns);

    // Limit maximum files in single pass to 500 to prevent V8 memory heap overflow
    const targetEntries = fileEntries.slice(0, 500);

    const parsedFiles = targetEntries
      .map((e) => astAnalyzer.parseFile(e.path, e.relativePath))
      .filter((f): f is NonNullable<typeof f> => f !== null);

    const metrics = astAnalyzer.getMetrics(parsedFiles);

    const engines = [];
    if (options.include_bugs ?? true) engines.push(new BugCheckerEngine());
    if (options.include_dependencies ?? true) engines.push(new DependencyEngine());
    if (options.include_security ?? true) engines.push(new SecurityEngine());
    if (options.include_deprecations ?? true) engines.push(new DeprecationEngine());
    if (options.include_architecture ?? options.depth === 'full')
      engines.push(new ArchitectureEngine());
    if (options.include_quality ?? options.depth === 'full') engines.push(new QualityEngine());

    let allFindings: Finding[] = [];
    const warnings: string[] = [];
    for (const engine of engines) {
      try {
        const engineFindings = await engine.analyze(parsedFiles, rootPath);
        allFindings.push(...engineFindings);
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        warnings.push(`${engine.name} failed: ${message}`);
      }
    }

    // Deduplicate
    const seen = new Set<string>();
    allFindings = allFindings.filter((f) => {
      const key = `${f.file}:${f.line}:${f.category}:${f.message}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    // Cap total findings reported in output to 250 max to ensure safe payload size
    const totalFindingsCount = allFindings.length;
    const cappedFindings = allFindings.slice(0, 250);

    const { healthScore, scoresByDimension } = HealthScoreAggregator.calculateScores(allFindings);
    const remediationPlan = RemediationPlanner.generatePlan(allFindings);

    const report: CodeHealthReport = {
      healthScore,
      scoresByDimension,
      summary: {
        criticalCount: allFindings.filter((f) => f.severity === 'critical').length,
        highCount: allFindings.filter((f) => f.severity === 'high').length,
        mediumCount: allFindings.filter((f) => f.severity === 'medium').length,
        lowCount: allFindings.filter((f) => f.severity === 'low').length,
        totalFindings: totalFindingsCount,
      },
      findings: cappedFindings,
      remediationPlan,
      metadata: {
        analyzedFiles: parsedFiles.length,
        totalLoc: metrics.totalLoc,
        analysisTimeMs: Date.now() - startTime,
        timestamp: new Date().toISOString(),
        warnings,
      },
    };

    let formattedOutput = '';
    switch (options.output_format) {
      case 'detailed':
        formattedOutput = DetailedFormatter.format(report);
        break;
      case 'json':
        formattedOutput = JSONFormatter.format(report);
        break;
      case 'github_annotations':
        formattedOutput = GitHubAnnotationsFormatter.format(report);
        break;
      case 'summary':
      default:
        formattedOutput = SummaryFormatter.format(report);
        break;
    }

    return { report, formattedOutput };
  } finally {
    // Reclaim memory immediately after analysis pass completes
    astAnalyzer.clearCache();
  }
}
