import { describe, expect, it } from 'vitest';
import type { SustainabilityFinding, SustainabilityReviewResult } from '@greenops/detect';
import {
  formatSustainabilityInlineFinding,
  formatSustainabilityReview,
} from '../src/review-formatter.js';

function review(findings: SustainabilityFinding[] = []): SustainabilityReviewResult {
  return {
    analysisId: 'test-review',
    repositoryPath: '/synthetic',
    mode: 'repository',
    generatedAt: '2026-10-04T00:00:00.000Z',
    findings,
    summary: {
      filesAnalyzed: 1,
      findings: findings.length,
      severity: { high: 0, medium: findings.length, low: 0 },
      fixesAvailable: findings.length,
      approvalRequired: findings.length,
      estimatedEnergyKwh: 0,
      estimatedCarbonKgCo2e: 0,
      verified: 0,
    },
  };
}

describe('review claim boundaries', () => {
  it.each(['text', 'markdown'] as const)(
    'does not claim standards conformance for a clean %s review',
    (format) => {
      const output = formatSustainabilityReview(review(), format);
      expect(output).toContain('No sustainability issues were detected by the enabled checks.');
      expect(output).toContain('This is not a standards-conformance assessment.');
      expect(output).not.toContain('adheres to');
      expect(output).not.toContain('Everything looks green');
    },
  );

  it('labels headroom impact unquantified in text, Markdown and inline reviews', () => {
    const finding: SustainabilityFinding = {
      id: 'headroom',
      category: 'oversized-token-request',
      severity: 'medium',
      confidence: 'high',
      file: 'ai-usage.json',
      title: 'Unused output allowance',
      description: 'Output cap is above observed output.',
      evidence: { wastedHeadroom: 1985 },
      rootCause: 'A high output limit.',
      blastRadius: 'low',
      fix: { available: true, requiresApproval: true, trivial: false, reversible: true },
      status: 'detected',
      verification: 'not_run',
      // A legacy saved finding must not present its invalid projected impact as new evidence.
      impact: { energyKwh: 123, carbonKgCo2e: 49.2 },
    };
    const outputs = [
      formatSustainabilityReview(review([finding]), 'text'),
      formatSustainabilityReview(review([finding]), 'markdown'),
      formatSustainabilityInlineFinding(finding),
    ];
    for (const output of outputs) {
      expect(output).toContain(
        'Not quantified — unused output allowance is not consumed tokens or measured energy.',
      );
      expect(output).not.toContain('123,000');
    }
  });
});
