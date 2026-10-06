import { PRReviewResult } from '@codevitals/review';
import { InlineComment } from './types.js';
import type { SustainabilityReviewResult } from '@greenops/detect';
import { formatSustainabilityInlineFinding, formatSustainabilityReview } from '@greenops/agent';

export class GitHubMarkdownFormatter {
  public static formatSustainabilityReview(review: SustainabilityReviewResult): string {
    return formatSustainabilityReview(review, 'markdown');
  }

  public static generateSustainabilityInlineComments(
    review: SustainabilityReviewResult,
  ): InlineComment[] {
    return review.findings
      .filter((finding) => finding.line !== undefined)
      .slice(0, 50)
      .map((finding) => ({
        path: finding.file,
        line: finding.line ?? 1,
        side: 'RIGHT',
        body: formatSustainabilityInlineFinding(finding),
      }));
  }

  public static formatPRReviewMarkdown(review: PRReviewResult): string {
    const r = review.riskAnalysis;
    const sd = review.semanticDiff;
    const br = review.blastRadius;

    const riskBadgeColor =
      r.level === 'critical'
        ? 'red'
        : r.level === 'high'
          ? 'orange'
          : r.level === 'medium'
            ? 'yellow'
            : 'green';

    const lines: string[] = [];

    lines.push(`## 🩺 GreenOps AI Code Review & Blast Radius Report`);
    lines.push(
      `![Risk Level](https://img.shields.io/badge/Risk_Level-${r.level.toUpperCase()}-${riskBadgeColor}?style=for-the-badge) ![Risk Score](https://img.shields.io/badge/Risk_Score-${r.score}%2F100-${riskBadgeColor}?style=for-the-badge)`,
    );
    lines.push('');

    lines.push(`### 📊 PR Impact Summary`);
    lines.push(`| Metric | Count | Details |`);
    lines.push(`| :--- | :---: | :--- |`);
    lines.push(
      `| **Files Changed** | \`${sd.changedFiles.length}\` | Modified source & config files |`,
    );
    lines.push(
      `| **Symbols Added** | \`${sd.addedSymbolsCount}\` | New functions, classes & types |`,
    );
    lines.push(
      `| **Symbols Modified** | \`${sd.modifiedSymbolsCount}\` | Modified existing symbol definitions |`,
    );
    lines.push(
      `| **Symbols Removed** | \`${sd.removedSymbolsCount}\` | Deleted symbol definitions |`,
    );
    lines.push(
      `| **Affected Downstream Callers** | \`${br.affectedCallers.length}\` | External functions/methods impacted |`,
    );
    lines.push(
      `| **Affected Test Suites** | \`${br.affectedTests.length}\` | Covered test files in repo |`,
    );
    lines.push('');

    if (sd.changedSymbols.length > 0) {
      lines.push(
        `<details><summary><strong>🔎 Changed Symbols (${sd.changedSymbols.length})</strong></summary>`,
      );
      lines.push('');
      lines.push(`| Action | Symbol Name | Kind | Location | Public Export |`);
      lines.push(`| :--- | :--- | :--- | :--- | :---: |`);
      for (const sym of sd.changedSymbols.slice(0, 30)) {
        const actionBadge =
          sym.changeType === 'added'
            ? '🟢 ADDED'
            : sym.changeType === 'removed'
              ? '🔴 REMOVED'
              : '🟡 MODIFIED';
        lines.push(
          `| \`${actionBadge}\` | \`${sym.qualifiedName || sym.name}\` | \`${sym.kind}\` | \`${sym.filePath}:${sym.startLine}\` | ${sym.exported ? '✅' : '❌'} |`,
        );
      }
      if (sd.changedSymbols.length > 30) {
        lines.push(`| ... | *and ${sd.changedSymbols.length - 30} more symbols* | | | |`);
      }
      lines.push('');
      lines.push(`</details>`);
      lines.push('');
    }

    if (br.affectedCallers.length > 0) {
      lines.push(
        `<details><summary><strong>💥 Affected Callers (${br.affectedCallers.length})</strong></summary>`,
      );
      lines.push('');
      lines.push(`| Caller Node | Node Type | Identifier |`);
      lines.push(`| :--- | :--- | :--- |`);
      for (const c of br.affectedCallers.slice(0, 20)) {
        lines.push(`| \`${c.name}\` | \`${c.type}\` | \`${c.id}\` |`);
      }
      lines.push('');
      lines.push(`</details>`);
      lines.push('');
    }

    if (br.affectedTests.length > 0) {
      lines.push(`### 🧪 Affected Test Suites to Run`);
      for (const testNode of br.affectedTests) {
        lines.push(`- [ ] \`${testNode.name}\``);
      }
      lines.push('');
    }

    if (r.factors.length > 0) {
      lines.push(`### ⚠️ Risk Factors Identified`);
      for (const factor of r.factors) {
        lines.push(`- ⚠️ **${factor}**`);
      }
      lines.push('');
    }

    if (r.recommendations.length > 0) {
      lines.push(`### 💡 Actionable Recommendations`);
      for (const rec of r.recommendations) {
        lines.push(`- ➜ ${rec}`);
      }
      lines.push('');
    }

    lines.push(`---`);
    lines.push(
      `*Report generated automatically by [GreenOps Intelligence Engine](https://github.com/shierenk-code/GreenOps).*`,
    );

    return lines.join('\n');
  }

  public static generateInlineComments(review: PRReviewResult): InlineComment[] {
    const comments: InlineComment[] = [];
    const sd = review.semanticDiff;
    const br = review.blastRadius;

    for (const sym of sd.changedSymbols) {
      if (sym.changeType === 'modified' && sym.exported) {
        const matchingCallers = br.affectedCallers;
        if (matchingCallers.length > 0) {
          comments.push({
            path: sym.filePath,
            line: sym.startLine,
            body: `🩺 **GreenOps Alert**: Modified public export \`${sym.name}\` impacts ${matchingCallers.length} downstream caller(s). Verify signature compatibility.`,
          });
        }
      }
    }

    return comments;
  }
}
