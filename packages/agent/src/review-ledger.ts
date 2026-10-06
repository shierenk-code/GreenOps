import type { SustainabilityReviewResult } from '@greenops/detect';
import { SustainabilityLedger } from '@greenops/ledger';

export interface ReviewLedgerContext {
  source: 'local' | 'github';
  pullRequest?: number;
}

/** Append the review decision trail once per analysis/commit. */
export function recordSustainabilityReview(
  review: SustainabilityReviewResult,
  ledgerPath: string,
  context: ReviewLedgerContext,
): void {
  const ledger = new SustainabilityLedger(ledgerPath);
  if (ledger.allEntries().some((entry) => entry.runId === review.analysisId)) return;

  for (const finding of review.findings) {
    const common = {
      runId: review.analysisId,
      bugId: finding.id,
    };
    ledger.append({
      ...common,
      stage: 'detect',
      summary: finding.title,
      data: {
        agentId: finding.agentId,
        agentName: finding.agentName,
        category: finding.category,
        severity: finding.severity,
        confidence: finding.confidence,
        location: { filePath: finding.file, startLine: finding.line, endLine: finding.endLine },
        evidence: finding.evidence,
        rationale: finding.description,
        source: context.source,
        pullRequest: context.pullRequest,
        commitSha: review.commitSha,
        codeSnippet: finding.codeSnippet,
      },
    });
    ledger.append({
      ...common,
      stage: 'investigate',
      summary: `Root cause identified for ${finding.title}`,
      data: {
        rootCause: finding.rootCause,
        blastRadius: finding.blastRadius,
        analysis: finding.analysis,
        tokensUsed: finding.tokensUsed,
      },
    });
    ledger.append({
      ...common,
      stage: 'compare',
      summary: finding.recommendation ?? 'No automated remediation is available.',
      data: {
        recommendation: finding.recommendation,
        fix: finding.fix,
        reasoning: finding.reasoning,
        suggestedCode: finding.suggestedCode,
      },
    });
    ledger.append({
      ...common,
      stage: 'simulate',
      summary: `Estimated impact for ${finding.title}`,
      data: { savings: finding.impact ?? { energyKwh: 0, carbonKgCo2e: 0 } },
    });
    ledger.append({
      ...common,
      stage: 'approve',
      summary: finding.fix.requiresApproval
        ? 'Withheld for human approval.'
        : 'Permitted by the safe-fix policy.',
      data: {
        approved: finding.fix.available && !finding.fix.requiresApproval,
        reason: finding.fix.requiresApproval
          ? 'The proposed fix exceeds the automatic approval policy.'
          : 'The proposed fix is trivial and reversible.',
      },
    });
  }
}
