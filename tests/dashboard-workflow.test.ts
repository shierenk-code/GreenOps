import { describe, expect, it } from 'vitest';
import {
  buildManualGuide,
  getWorkflowStage,
} from '../apps/CodeVitals-MCP/website/src/app/dashboard/dashboard-workflow.js';
import type { Finding } from '../apps/CodeVitals-MCP/website/src/app/dashboard/ledger-dashboard.js';

const guide = (category: string, recommendationId = 'none') =>
  buildManualGuide({ category, recommendationId });
const copy = (category: string) => JSON.stringify(guide(category));

describe('Dashboard actionable workflow queues', () => {
  it.each(['not-applied', 'withheld', 'in-progress', 'review-only'] as const)(
    'keeps %s findings in review rather than claiming a change was applied',
    (state) => expect(getWorkflowStage({ state })).toBe('needs-review'),
  );

  it('routes only applied but unverified findings to verification', () => {
    expect(getWorkflowStage({ state: 'unverified' })).toBe('needs-verification');
  });

  it('keeps successfully verified findings in the verified queue', () => {
    expect(getWorkflowStage({ state: 'verified' })).toBe('verified');
  });

  it('does not turn an approval or improvement attempt into a successful application', () => {
    const finding = {
      state: 'not-applied' as const,
      entries: [
        { stage: 'approve', data: { approved: true, approver: 'policy-approver' } },
        { stage: 'improve', data: { applied: false } },
      ],
    };
    expect(getWorkflowStage(finding)).toBe('needs-review');
  });

  it('assigns each finding to exactly one queue without changing its recorded state', () => {
    const states: Finding['state'][] = [
      'review-only',
      'in-progress',
      'withheld',
      'not-applied',
      'unverified',
      'verified',
    ];
    const findings = states.map((state) => Object.freeze({ state }));
    const queues = ['needs-review', 'needs-verification', 'verified'].map((stage) =>
      findings.filter((finding) => getWorkflowStage(finding) === stage),
    );
    expect(queues.map((queue) => queue.length)).toEqual([4, 1, 1]);
    expect(queues.flat()).toHaveLength(findings.length);
    expect(new Set(queues.flat()).size).toBe(findings.length);
    expect(findings.map(({ state }) => state)).toEqual(states);
  });
});

describe('Dashboard manual implementation guidance', () => {
  it('provides actionable implementation, verification, and risk text without claiming automatic changes', () => {
    const result = guide('oversized-token-request');
    expect(result.implementationSteps.length).toBeGreaterThan(1);
    expect(result.verificationSteps.length).toBeGreaterThan(1);
    expect(result.risks.length).toBeGreaterThan(0);
    expect(result.automaticApplyAvailable).toBe(false);
    expect(result.automaticApplyReason).toContain('not connected to this dashboard');
    expect(result.verificationSteps.at(-1)).toContain('After a follow-up analysis is complete');
  });

  it('separates unused output allowance from actual tokens and checks answer truncation', () => {
    expect(copy('oversized-token-request')).toContain(
      'Unused output allowance is not tokens consumed or saved',
    );
    expect(copy('oversized-token-request')).toContain('truncation');
    expect(copy('oversized-token-request')).toContain('actual billed or reported tokens');
  });

  it('requires tenant isolation, cache eligibility, expiry, and quality checks', () => {
    const result = copy('uncached-completion');
    expect(result).toContain('tenant and access scope');
    expect(result).toContain('sensitive, personalized');
    expect(result).toContain('expiry and invalidation');
    expect(result).toContain('answer quality');
  });

  it('bounds retries, checks idempotency, and does not convert unknown usage into zero', () => {
    const result = copy('ai-retry-storm');
    expect(result).toContain('maximum attempt count and total deadline');
    expect(result).toContain('idempotency');
    expect(result).toContain('single temporary error');
    expect(result).toContain('unknown, not zero');
  });

  it('never treats unattached storage as permission to delete it', () => {
    const result = copy('unattached-storage');
    expect(result).toContain('legal holds');
    expect(result).toContain('test restoration');
    expect(result).toContain('Do not delete storage based on this finding alone');
  });

  it('requires retention and accessibility checks before recording cleanup', () => {
    const result = copy('redundant-recording');
    expect(result).toContain('legal holds');
    expect(result).toContain('content and permissions');
    expect(result).toContain('retained copy is accessible');
    expect(result).toContain('do not count the same duplicate or retention reduction twice');
  });

  it('checks compatibility and rollback for a smaller container image', () => {
    const result = copy('oversized-image');
    expect(result).toContain('previous image digest');
    expect(result).toContain('required native libraries');
    expect(result).toContain('does not prove lower runtime electricity use');
  });

  it.each(['over-replication', 'idle-standby', 'rto-rpo-mismatch'])(
    'requires recovery requirements and tests for %s, without prescribing a replica count',
    (category) => {
      const result = copy(category);
      expect(result).toContain('RTO');
      expect(result).toContain('RPO');
      expect(result).toContain('quorum');
      expect(result).toContain('explicit owner approval');
      expect(result).toContain('Do not infer a safe replica count');
    },
  );

  it('distinguishes region carbon intensity from energy savings', () => {
    const result = copy('high-carbon-region');
    expect(result).toContain('data residency');
    expect(result).toContain('transfer and temporary duplicate-capacity costs');
    expect(result).toContain('does not by itself save energy');
  });

  it('checks peak capacity instead of blindly reducing resource allocation', () => {
    const result = copy('overprovisioned-compute');
    expect(result).toContain('peak-demand');
    expect(result).toContain('capacity headroom');
    expect(result).toContain(
      'rather than treating lower reservation alone as metered energy savings',
    );
  });

  it('validates the incident baseline before proposing a resource cap', () => {
    expect(copy('carbon-anomaly')).toContain(
      'measurement source, timestamp, region factor, and baseline',
    );
    expect(copy('carbon-anomaly')).toContain('assessing workload criticality');
  });

  it('uses a recognized strategy when the category is unknown', () => {
    expect(guide('legacy-category', 'right-size-max-tokens')).toEqual(
      guide('oversized-token-request'),
    );
  });

  it('prioritizes the detected category over a conflicting model strategy', () => {
    expect(guide('unattached-storage', 'right-size-max-tokens')).toEqual(
      guide('unattached-storage'),
    );
  });

  it('uses a conservative fallback for unknown categories without inventing a fix', () => {
    const result = guide('unknown');
    expect(result.implementationSteps.join(' ')).toContain('confirm the issue still exists');
    expect(result.risks.join(' ')).toContain('no specific implementation recipe');
    expect(result.automaticApplyAvailable).toBe(false);
  });

  it('does not interpolate untrusted uploaded identifiers into instructions or commands', () => {
    const payload = '$(Remove-Item C:\\*) https://private.example/key?secret=value';
    expect(JSON.stringify(guide(payload, payload))).not.toContain(payload);
    expect(guide('__proto__', 'constructor')).toEqual(guide('unknown'));
  });

  it('returns independent arrays so callers cannot alter shared guidance', () => {
    const result = guide('ai-retry-storm');
    result.implementationSteps.length = 0;
    result.verificationSteps.push('untrusted change');
    result.risks.length = 0;
    const next = guide('ai-retry-storm');
    expect(next.implementationSteps.length).toBeGreaterThan(0);
    expect(next.risks.length).toBeGreaterThan(0);
    expect(next.verificationSteps).not.toContain('untrusted change');
  });

  it('keeps import cleanup guidance manual despite the existing CLI sandbox fixer', () => {
    const result = guide('duplicate-import');
    expect(result.automaticApplyAvailable).toBe(false);
    expect(result.implementationSteps.join(' ')).toContain('branch or sandbox');
    expect(result.verificationSteps.join(' ')).toContain(
      'does not establish a measured energy reduction',
    );
  });
});
