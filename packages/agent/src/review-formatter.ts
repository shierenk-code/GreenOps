import pc from 'picocolors';
import type { SustainabilityFinding, SustainabilityReviewResult } from '@greenops/detect';

export type SustainabilityReviewFormat = 'text' | 'json' | 'markdown';

export function formatSustainabilityReview(
  review: SustainabilityReviewResult,
  format: SustainabilityReviewFormat,
  options: { verbose?: boolean } = {},
): string {
  if (format === 'json') return JSON.stringify(review, null, 2);
  if (format === 'markdown') return formatMarkdown(review);
  return formatText(review, options.verbose ?? false);
}

function groupFindingsByFile(
  findings: SustainabilityFinding[],
): Map<string, SustainabilityFinding[]> {
  const map = new Map<string, SustainabilityFinding[]>();
  for (const f of findings) {
    const list = map.get(f.file) ?? [];
    list.push(f);
    map.set(f.file, list);
  }
  return map;
}

function getLineRange(finding: SustainabilityFinding): string {
  const start = finding.line ?? 1;
  const end = finding.endLine && finding.endLine > start ? finding.endLine : start + 3;
  return `${start}-${end}`;
}

function formatText(review: SustainabilityReviewResult, _verbose: boolean): string {
  const lines: string[] = [
    '',
    pc.bold(pc.green('╔════════════════════════════════════════════════════════════════════════╗')),
    pc.bold(pc.green('║                  🌱 GreenOps Sustainability Review                     ║')),
    pc.bold(pc.green('╚════════════════════════════════════════════════════════════════════════╝')),
    '',
    `  ${pc.bold('Status')}: ${
      review.summary.findings === 0
        ? pc.green('✔ All clean — No sustainability bugs detected')
        : pc.yellow(
            `⚠ ${review.summary.findings} Sustainability Bug${review.summary.findings === 1 ? '' : 's'} detected`,
          )
    }`,
    `  ${pc.bold('Scope')}:  Mode: ${pc.cyan(review.mode)} | Files analyzed: ${pc.cyan(String(review.summary.filesAnalyzed))}`,
    '',
  ];

  if (review.findings.length === 0) {
    lines.push(
      pc.green('  No sustainability issues were detected by the enabled checks.'),
      '  This is not a standards-conformance assessment.',
      '',
    );
  } else {
    lines.push(
      pc.bold(pc.white('── FINDINGS & CODE REMEDIATIONS (GROUPED BY FILE) ────────────────────')),
      '',
    );

    const grouped = groupFindingsByFile(review.findings);
    for (const [file, fileFindings] of grouped.entries()) {
      lines.push(
        pc.bold(pc.cyan(`📂 ${file}`)) +
          pc.dim(` (${fileFindings.length} issue${fileFindings.length === 1 ? '' : 's'})`),
      );

      for (const finding of fileFindings) {
        lines.push(formatTerminalFindingCard(finding));
      }
      lines.push('');
    }
  }

  lines.push(
    pc.bold(pc.white('── IMPACT & SAVINGS SUMMARY ──────────────────────────────────────────')),
    `  ${pc.bold('Potential Energy Saving')}: ${pc.bold(pc.green(`⚡ ${formatEnergy(review.summary.estimatedEnergyKwh)}`))}`,
    `  ${pc.bold('Potential Carbon Saving')}: ${pc.bold(pc.green(`🍃 ${formatCarbon(review.summary.estimatedCarbonKgCo2e)}`))}`,
    `  ${pc.bold('Fixes Available')}:         ${pc.cyan(String(review.summary.fixesAvailable))} (${review.summary.approvalRequired} require human approval)`,
    `  ${pc.bold('Verified Reductions')}:     ${pc.cyan(String(review.summary.verified))}`,
    pc.bold(pc.green('──────────────────────────────────────────────────────────────────────')),
    '',
  );

  return lines.join('\n');
}

function formatTerminalFindingCard(finding: SustainabilityFinding): string {
  const lineRange = getLineRange(finding);
  const severityBadge =
    finding.severity === 'high'
      ? pc.bgRed(pc.white(pc.bold(' HIGH ')))
      : finding.severity === 'medium'
        ? pc.bgYellow(pc.black(pc.bold(' MED ')))
        : pc.bgCyan(pc.black(pc.bold(' LOW ')));

  const quickWin = finding.fix.trivial ? pc.green('⚡ Quick Win') : pc.cyan('🛠️ Optimization');

  const lines: string[] = [
    `  ${pc.yellow(lineRange)} : ${severityBadge} ${pc.bold(finding.title)} | ${quickWin}`,
    `    ${pc.dim('Problem:')} ${finding.description}`,
    `    ${pc.dim('Root Cause:')} ${pc.italic(finding.rootCause || 'Inefficient resource consumption pattern.')}`,
  ];

  if (finding.codeSnippet || finding.suggestedCode) {
    lines.push(`    ${pc.bold(pc.white('🛡️  Proposed Fix:'))}`);
    const diff = formatDiff(finding.codeSnippet, finding.suggestedCode);
    for (const diffLine of diff.split('\n')) {
      if (diffLine.startsWith('+')) {
        lines.push(`      ${pc.green(diffLine)}`);
      } else if (diffLine.startsWith('-')) {
        lines.push(`      ${pc.red(diffLine)}`);
      } else {
        lines.push(`      ${pc.dim(diffLine)}`);
      }
    }
  }

  if (finding.recommendation) {
    lines.push(`    ${pc.dim('Recommendation:')} ${finding.recommendation}`);
  }

  lines.push(
    `    ${pc.dim('Estimated Savings:')} ${formatFindingImpact(finding)} | ${pc.dim('Strategy:')} ${finding.fix.requiresApproval ? pc.yellow('🔒 Approval Required') : pc.green('⚡ Safe Auto-fix')}`,
    '',
  );

  return lines.join('\n');
}

function formatDiff(snippet?: string, suggested?: string): string {
  if (!suggested && !snippet) return '// Manual inspection required';
  if (
    suggested &&
    (suggested.includes('\n-') ||
      suggested.includes('\n+') ||
      suggested.startsWith('-') ||
      suggested.startsWith('+'))
  ) {
    return suggested;
  }
  const lines: string[] = [];
  if (snippet) {
    for (const l of snippet.split('\n').slice(0, 4)) {
      const clean = l
        .replace(/^>\s*/, '')
        .replace(/^\s*\d+\s*\|\s*/, '')
        .trim();
      if (clean) lines.push(`- ${clean}`);
    }
  }
  if (suggested) {
    for (const l of suggested.split('\n')) {
      const clean = l.trim();
      if (clean) lines.push(`+ ${clean}`);
    }
  }
  return lines.join('\n');
}

function formatMarkdown(review: SustainabilityReviewResult): string {
  const lines = [
    '<!-- greenops-sustainability-review -->',
    '## Summary by GreenOps 🌱',
    '',
    `> **Automated Sustainability & PR Intelligence** | Analysis: \`${review.analysisId}\`${review.commitSha ? ` (\`${review.commitSha.slice(0, 12)}\`)` : ''}`,
    '',
    '### 📊 Impact & Savings Overview',
    '',
    '| Metric | Result | Impact |',
    '|:---|:---:|:---|',
    `| **Files Analyzed** | \`${review.summary.filesAnalyzed}\` | Scope of changed files |`,
    `| **Sustainability Bugs** | \`${review.summary.findings}\` | Areas for optimization |`,
    `| **High Impact Issues** | \`${review.summary.severity.high}\` | Priority remediations |`,
    `| **Medium Impact Issues** | \`${review.summary.severity.medium}\` | Caching & resource savings |`,
    `| **Safe Fixes Available** | \`${review.summary.fixesAvailable - review.summary.approvalRequired}\` | Automated safe patches |`,
    `| **Approval Required** | \`${review.summary.approvalRequired}\` | Human-in-the-loop oversight |`,
    `| **Estimated Energy Saving** | \`${formatEnergy(review.summary.estimatedEnergyKwh)}\` | ⚡ Avoidable compute energy |`,
    `| **Estimated Carbon Saving** | \`${formatCarbon(review.summary.estimatedCarbonKgCo2e)}\` | 🍃 Avoidable CO₂e emissions |`,
    '',
    '### 🔍 Findings & Proposed Fixes (Grouped by File)',
    '',
  ];

  if (review.findings.length === 0) {
    lines.push(
      'No sustainability issues were detected by the enabled checks.',
      'This is not a standards-conformance assessment.',
      '',
    );
  } else {
    const grouped = groupFindingsByFile(review.findings);

    for (const [file, fileFindings] of grouped.entries()) {
      lines.push(
        '<details open>',
        `<summary>📂 <b>${file}</b> (${fileFindings.length} issue${fileFindings.length === 1 ? '' : 's'})</summary>`,
        '',
      );

      for (const finding of fileFindings) {
        lines.push(formatMarkdownFindingCard(finding));
      }

      lines.push('</details>', '');
    }
  }

  lines.push(
    '### 💬 Available Bot Commands',
    '',
    '- `@greenops-bot review` or `/greenops review` — Re-analyze the pull request and refresh findings',
    '- `@greenops-bot fix` or `/greenops fix` — Generate remediation patches',
    '- `@greenops-bot help` — Display all interactive bot commands',
  );

  return lines.join('\n');
}

function formatMarkdownFindingCard(finding: SustainabilityFinding): string {
  const lineRange = getLineRange(finding);
  const severityBadge =
    finding.severity === 'high'
      ? '🟠 Major'
      : finding.severity === 'medium'
        ? '🟡 Medium'
        : '🟢 Minor';
  const quickWinBadge = finding.fix.trivial ? '⚡ Quick win' : '🛠️ Optimization';
  const diff = formatDiff(finding.codeSnippet, finding.suggestedCode);

  return [
    `#### \`${lineRange}\` : 🚀 ${capitalize(finding.category)} | ${severityBadge} | ${quickWinBadge}`,
    '',
    `**${finding.title}**`,
    '',
    `${finding.description}`,
    '',
    `> **Root Cause**: ${finding.rootCause || 'Inefficient resource consumption pattern.'}  `,
    `> **Estimated Savings**: ${formatFindingImpact(finding)}`,
    '',
    '<details open>',
    '<summary>🛡️ <b>Proposed fix</b></summary>',
    '',
    '```diff',
    diff,
    '```',
    '</details>',
    '',
    '<details>',
    '<summary>🤖 <b>Prompt for AI Agents</b></summary>',
    '',
    '```markdown',
    `Fix the sustainability bug in ${finding.file}:${finding.line ?? 1} (${finding.title}).`,
    `Problem: ${finding.description}`,
    `Root Cause: ${finding.rootCause || 'Inefficient resource pattern'}`,
    `Remediation: ${finding.recommendation ?? 'Optimize resource consumption.'}`,
    '```',
    '</details>',
    '',
  ].join('\n');
}

export function formatSustainabilityInlineFinding(finding: SustainabilityFinding): string {
  const lineRange = getLineRange(finding);
  const badgeSeverity =
    finding.severity === 'high'
      ? '🟠 Major Impact'
      : finding.severity === 'medium'
        ? '🟡 Medium Impact'
        : '🟢 Minor';
  const badgeQuickWin = finding.fix.trivial ? '⚡ Quick win' : '🛠️ Optimization';
  const diff = formatDiff(finding.codeSnippet, finding.suggestedCode);

  const lines = [
    `_🌱 GreenOps Sustainability Review | ${badgeSeverity} | ${badgeQuickWin}_`,
    '',
    `### \`${lineRange}\` : ${finding.title}`,
    '',
    `**Problem**: ${finding.description}`,
    '',
    `**Root Cause**: ${finding.rootCause || 'Repeated resource consumption increases energy usage, carbon footprint, and runtime latency.'}`,
    '',
    `**Suggested Fix**: ${finding.recommendation ?? 'Review and optimize resource usage.'}`,
    '',
    '<details open>',
    '<summary>🛡️ <b>Proposed fix</b></summary>',
    '',
    '```diff',
    diff,
    '```',
    '</details>',
    '',
    `**Estimated Impact**: ${formatFindingImpact(finding)}`,
    '',
    '<details>',
    '<summary>💡 <b>Detailed Analysis & Evidence</b></summary>',
    '',
    `- **Evidence**: \`${formatEvidence(finding.evidence)}\``,
    `- **Confidence**: \`${capitalize(finding.confidence)}\``,
    `- **Blast Radius**: \`${capitalize(finding.blastRadius)}\``,
    `- **Approval Gate**: ${finding.fix.requiresApproval ? '🔒 Human approval required' : '✅ Safe automated fix'}`,
    '</details>',
    '',
    '<details>',
    '<summary>🤖 <b>Prompt for AI Agents</b></summary>',
    '',
    '```markdown',
    `Fix the sustainability bug in ${finding.file}:${finding.line ?? 1} (${finding.title}).`,
    `Problem: ${finding.description}`,
    `Remediation: ${finding.recommendation ?? 'Optimize resource consumption.'}`,
    '```',
    '</details>',
  ];

  return lines.join('\n');
}

function formatEvidence(evidence: Record<string, number | string>): string {
  return (
    Object.entries(evidence)
      .map(([key, value]) => `${key}=${value}`)
      .join(', ') || 'No evidence recorded'
  );
}

function formatEnergy(kwh: number): string {
  const wh = kwh * 1000;
  if (wh === 0) return '0 Wh';
  if (Math.abs(wh) < 0.001) return '<0.001 Wh';
  return `${wh.toLocaleString(undefined, { maximumFractionDigits: 3 })} Wh`;
}

function formatCarbon(kg: number): string {
  const grams = kg * 1000;
  if (grams === 0) return '0 g CO2e';
  if (Math.abs(grams) < 0.001) return '<0.001 g CO2e';
  return `${grams.toLocaleString(undefined, { maximumFractionDigits: 3 })} g CO2e`;
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function formatFindingImpact(finding: SustainabilityFinding): string {
  if (finding.category === 'oversized-token-request') {
    return 'Not quantified — unused output allowance is not consumed tokens or measured energy.';
  }
  return `⚡ ${formatEnergy(finding.impact?.energyKwh ?? 0)} · 🍃 ${formatCarbon(finding.impact?.carbonKgCo2e ?? 0)}`;
}
