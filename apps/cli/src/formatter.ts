import pc from 'picocolors';
import { ScanResult } from '@codevitals/core';
import { AnalysisResult } from '@codevitals/repository';
import { GitStatusResult, GitDiffFile } from '@codevitals/git';
import { PRReviewResult } from '@codevitals/review';
import { DependencyGraph } from '@codevitals/graph';

export class ResultFormatter {
  public static formatText(result: ScanResult): string {
    const lines: string[] = [];

    lines.push(pc.bold(pc.cyan('GreenOps Repository Scan')));
    lines.push(pc.gray('────────────────────────────────'));
    lines.push('');

    lines.push(pc.bold('Repository'));
    lines.push(`  Path: ${pc.dim(result.repository.path)}`);
    lines.push('');

    lines.push(pc.bold('Files'));
    lines.push(`  Total:       ${String(result.files.total).padStart(8, ' ')}`);
    lines.push(`  Source:      ${String(result.files.source).padStart(8, ' ')}`);
    lines.push(`  Tests:       ${String(result.files.tests).padStart(8, ' ')}`);
    lines.push(`  Generated:   ${String(result.files.generated).padStart(8, ' ')}`);
    lines.push('');

    if (result.languageBreakdown.length > 0) {
      lines.push(pc.bold('Languages'));
      for (const lang of result.languageBreakdown) {
        const langName = lang.name.padEnd(12, ' ');
        const percentStr = `${lang.percentage}%`.padStart(5, ' ');
        lines.push(`  ${langName} ${pc.yellow(percentStr)}`);
      }
      lines.push('');
    }

    lines.push(pc.bold('Scanner'));
    lines.push(`  Duration:    ${result.scanner.durationSeconds}`);
    lines.push(`  Cache:       ${result.scanner.cache}`);
    lines.push('');

    lines.push(pc.bold('Status'));
    lines.push(`  ${pc.green(result.status)}`);

    return lines.join('\n');
  }

  public static formatJson(result: ScanResult): string {
    const lowerLanguages: Record<string, number> = {};
    for (const [lang, count] of Object.entries(result.languages)) {
      lowerLanguages[lang.toLowerCase()] = count;
    }

    const payload = {
      repository: {
        path: result.repository.path,
      },
      files: {
        total: result.files.total,
        source: result.files.source,
        tests: result.files.tests,
        generated: result.files.generated,
      },
      languages: lowerLanguages,
    };

    return JSON.stringify(payload, null, 2);
  }

  public static formatAnalyzeText(res: AnalysisResult): string {
    const s = res.statistics;
    const lines: string[] = [];

    lines.push(pc.bold(pc.cyan('GreenOps Code Intelligence')));
    lines.push(pc.gray('────────────────────────────────────'));
    lines.push('');

    lines.push(pc.bold('Repository'));
    lines.push(`  Path: ${pc.dim(res.repository.path)}`);
    lines.push('');

    lines.push(pc.bold('Files'));
    lines.push(`  Analyzed:    ${String(s.files.analyzed).padStart(8, ' ')}`);
    lines.push(`  Skipped:     ${String(s.files.skipped).padStart(8, ' ')}`);
    lines.push(`  Failed:      ${String(s.files.failed).padStart(8, ' ')}`);
    lines.push('');

    if (Object.keys(s.languages).length > 0) {
      lines.push(pc.bold('Languages'));
      for (const [lang, count] of Object.entries(s.languages)) {
        lines.push(`  ${lang.padEnd(14, ' ')} ${String(count).padStart(6, ' ')}`);
      }
      lines.push('');
    }

    lines.push(pc.bold('Symbols'));
    lines.push(`  Functions:   ${String(s.symbols.functions).padStart(8, ' ')}`);
    lines.push(`  Classes:     ${String(s.symbols.classes).padStart(8, ' ')}`);
    lines.push(`  Interfaces:  ${String(s.symbols.interfaces).padStart(8, ' ')}`);
    lines.push(`  Types:       ${String(s.symbols.types).padStart(8, ' ')}`);
    lines.push(`  Methods:     ${String(s.symbols.methods).padStart(8, ' ')}`);
    lines.push('');

    lines.push(pc.bold('Imports'));
    lines.push(`  Total:       ${String(s.imports.total).padStart(8, ' ')}`);
    lines.push('');

    lines.push(pc.bold('Exports'));
    lines.push(`  Total:       ${String(s.exports.total).padStart(8, ' ')}`);
    lines.push('');

    lines.push(pc.bold('References'));
    lines.push(`  Total:       ${String(s.references.total).padStart(8, ' ')}`);
    lines.push('');

    lines.push(pc.bold('AST'));
    lines.push(`  Parsed:      ${String(s.ast.parsed).padStart(8, ' ')}`);
    lines.push(`  Failed:      ${String(s.ast.failed).padStart(8, ' ')}`);
    lines.push(`  Skipped:     ${String(s.ast.skipped).padStart(8, ' ')}`);
    lines.push('');

    lines.push(pc.bold('Graph'));
    lines.push(`  Nodes:       ${String(s.graph.nodes).padStart(8, ' ')}`);
    lines.push(`  Edges:       ${String(s.graph.edges).padStart(8, ' ')}`);
    lines.push('');

    lines.push(pc.bold('Status'));
    lines.push(`  ${pc.green('✓ Analysis completed successfully.')}`);

    return lines.join('\n');
  }

  public static formatAnalyzeJson(res: AnalysisResult): string {
    return JSON.stringify(res, null, 2);
  }

  public static formatGitStatusText(status: GitStatusResult): string {
    const lines: string[] = [];
    lines.push(pc.bold(pc.cyan('GreenOps Git Status')));
    lines.push(pc.gray('────────────────────────────────────'));
    lines.push(`Branch: ${pc.bold(status.branch)}`);
    lines.push(`State:  ${status.isClean ? pc.green('Clean') : pc.yellow('Modified')}`);
    lines.push('');

    if (status.files.length === 0) {
      lines.push(pc.dim('No working tree changes.'));
    } else {
      lines.push(pc.bold('Changed Files:'));
      for (const f of status.files) {
        const color = f.status === 'added' ? pc.green : f.status === 'deleted' ? pc.red : pc.yellow;
        lines.push(`  ${color(f.status.padEnd(10, ' '))} ${f.path}`);
      }
    }

    return lines.join('\n');
  }

  public static formatGitStatusJson(status: GitStatusResult): string {
    return JSON.stringify(status, null, 2);
  }

  public static formatGitDiffText(diffFiles: GitDiffFile[]): string {
    const lines: string[] = [];
    lines.push(pc.bold(pc.cyan('GreenOps Git Diff')));
    lines.push(pc.gray('────────────────────────────────────'));
    lines.push('');

    if (diffFiles.length === 0) {
      lines.push(pc.dim('No diff changes detected.'));
      return lines.join('\n');
    }

    for (const file of diffFiles) {
      lines.push(
        `${pc.bold(file.path)} (${pc.green('+' + file.additions)} ${pc.red('-' + file.deletions)})`,
      );
      for (const hunk of file.hunks) {
        lines.push(`  ${pc.cyan(hunk.header)}`);
        for (const l of hunk.lines) {
          if (l.type === 'add') lines.push(`    ${pc.green('+' + l.content)}`);
          else if (l.type === 'delete') lines.push(`    ${pc.red('-' + l.content)}`);
        }
      }
      lines.push('');
    }

    return lines.join('\n');
  }

  public static formatGitDiffJson(diffFiles: GitDiffFile[]): string {
    return JSON.stringify(diffFiles, null, 2);
  }

  public static formatGraphOverviewText(graph: DependencyGraph): string {
    const lines: string[] = [];
    lines.push(pc.bold(pc.cyan('GreenOps Dependency Graph')));
    lines.push(pc.gray('────────────────────────────────────'));
    lines.push('');
    lines.push(`Total Nodes: ${pc.bold(String(graph.getNodeCount()))}`);
    lines.push(`Total Edges: ${pc.bold(String(graph.getEdgeCount()))}`);
    lines.push('');

    const nodesByType: Record<string, number> = {};
    for (const node of graph.getAllNodes()) {
      nodesByType[node.type] = (nodesByType[node.type] || 0) + 1;
    }

    lines.push(pc.bold('Nodes Breakdown:'));
    for (const [type, count] of Object.entries(nodesByType)) {
      lines.push(`  ${type.padEnd(14, ' ')} ${String(count).padStart(6, ' ')}`);
    }

    return lines.join('\n');
  }

  public static formatGraphOverviewJson(graph: DependencyGraph): string {
    return JSON.stringify(
      {
        nodesCount: graph.getNodeCount(),
        edgesCount: graph.getEdgeCount(),
        nodes: graph.getAllNodes(),
        edges: graph.getAllEdges(),
      },
      null,
      2,
    );
  }

  public static formatReviewText(review: PRReviewResult): string {
    const lines: string[] = [];
    const r = review.riskAnalysis;
    const sd = review.semanticDiff;
    const br = review.blastRadius;

    lines.push(pc.bold(pc.cyan('GreenOps PR / Diff Intelligence Review')));
    lines.push(pc.gray('──────────────────────────────────────────────────'));
    lines.push('');

    lines.push(pc.bold('Risk Assessment'));
    const levelColor = r.level === 'low' ? pc.green : r.level === 'medium' ? pc.yellow : pc.red;
    lines.push(`  Risk Level:   ${levelColor(r.level.toUpperCase())}`);
    lines.push(`  Risk Score:   ${levelColor(String(r.score) + '/100')}`);
    lines.push('');

    lines.push(pc.bold('Semantic Diff'));
    lines.push(`  Files Changed:    ${sd.changedFiles.length}`);
    lines.push(`  Symbols Added:    ${sd.addedSymbolsCount}`);
    lines.push(`  Symbols Modified: ${sd.modifiedSymbolsCount}`);
    lines.push(`  Symbols Removed:  ${sd.removedSymbolsCount}`);
    lines.push('');

    if (sd.changedSymbols.length > 0) {
      lines.push(pc.bold('Changed Symbols:'));
      for (const sym of sd.changedSymbols) {
        const changeColor =
          sym.changeType === 'added' ? pc.green : sym.changeType === 'removed' ? pc.red : pc.yellow;
        lines.push(
          `  - ${changeColor(sym.changeType.toUpperCase().padEnd(8, ' '))} ${sym.qualifiedName} [${sym.kind}] (${sym.filePath}:${sym.startLine})`,
        );
      }
      lines.push('');
    }

    lines.push(pc.bold('Blast Radius Impact'));
    lines.push(`  Affected Callers: ${br.affectedCallers.length}`);
    lines.push(`  Affected Callees: ${br.affectedCallees.length}`);
    lines.push(`  Affected Tests:   ${br.affectedTests.length}`);
    lines.push(`  Affected Modules: ${br.affectedModules.length}`);
    lines.push('');

    if (br.affectedCallers.length > 0) {
      lines.push(pc.bold('Affected Callers:'));
      for (const c of br.affectedCallers) {
        lines.push(`  - ${pc.cyan(c.name)} [${c.type}] (${c.id})`);
      }
      lines.push('');
    }

    if (br.affectedTests.length > 0) {
      lines.push(pc.bold('Affected Test Suites:'));
      for (const t of br.affectedTests) {
        lines.push(`  - ${pc.green(t.name)} [${t.type}]`);
      }
      lines.push('');
    }

    if (r.factors.length > 0) {
      lines.push(pc.bold('Risk Factors:'));
      for (const f of r.factors) {
        lines.push(`  • ${pc.yellow(f)}`);
      }
      lines.push('');
    }

    if (r.recommendations.length > 0) {
      lines.push(pc.bold('Recommendations:'));
      for (const rec of r.recommendations) {
        lines.push(`  ➜ ${pc.cyan(rec)}`);
      }
      lines.push('');
    }

    lines.push(pc.bold('Status'));
    lines.push(`  ${pc.green(review.status)}`);

    return lines.join('\n');
  }

  public static formatReviewJson(review: PRReviewResult): string {
    return JSON.stringify(review, null, 2);
  }
}
