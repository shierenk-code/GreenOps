import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  ApprovalPage,
  LedgerPage,
  MetaPage,
  ReviewDialog,
  filterAuditRows,
  filterOpportunities,
  validateReviewInput,
} from '../apps/CodeVitals-MCP/website/src/app/dashboard/control-plane/audit-pages';
import type {
  AuditRow,
  ControlPlaneData,
  Opportunity,
} from '../apps/CodeVitals-MCP/website/src/app/dashboard/control-plane/types';

vi.mock(
  '../apps/CodeVitals-MCP/website/src/app/dashboard/control-plane/audit-pages.module.css',
  () => ({ default: {} }),
);
const websiteRequire = createRequire(
  resolve(__dirname, '../apps/CodeVitals-MCP/website/package.json'),
);
const { createElement } = websiteRequire('react');
const { renderToStaticMarkup } = websiteRequire('react-dom/server');

const opportunity: Opportunity = {
  id: 'repeated-prompt',
  agentKey: 'ai',
  title: 'Cache repeated public requests',
  target: 'Public FAQ service',
  description: 'Identical public questions are sent to the same model more than once.',
  recommendation: 'Cache eligible public responses by model and prompt, with a short expiry.',
  evidence: [{ label: 'Duplicate tokens', value: '415 reported' }],
  risk: 'Medium',
  riskNote: 'Exclude private responses and validate expiry before implementation.',
  confidence: 'High',
  source: 'Rule-based fallback',
  monthlyUsd: null,
  carbonKg: null,
  status: 'pending',
  history: [],
};
const rows: AuditRow[] = [
  {
    id: 'source-1',
    timestamp: '2026-10-04T10:00:00Z',
    agent: 'AI Efficiency',
    action: 'Detected repeated calls',
    costSavings: 'Not measured',
    carbonSaved: 'Not measured',
    status: 'Detected',
    findingId: opportunity.id,
    kind: 'recorded',
  },
  {
    id: 'local-1',
    timestamp: '2026-10-04T10:01:00Z',
    agent: 'AI Efficiency',
    action: 'Plan approved locally',
    costSavings: 'No execution',
    carbonSaved: 'No verification',
    status: 'Plan approved',
    findingId: opportunity.id,
    kind: 'local-decision',
  },
];
const data: ControlPlaneData = {
  mode: 'recorded',
  asOf: null,
  runId: 'run with spaces',
  agents: [],
  opportunities: [opportunity],
  ledger: rows,
  executiveMetrics: [],
  trend: {
    title: 'Trend',
    description: 'No data',
    primaryLabel: 'Findings',
    primaryUnit: '',
    points: [],
  },
  selfAudit: [
    { label: 'Agent energy', value: 'Unknown', hint: 'Energy not metered' },
    { label: 'Verified savings', value: 'Not established', hint: 'No comparable measurement' },
    { label: 'Net multiplier', value: 'Unknown', hint: 'A complete baseline is required' },
  ],
  usageDetails: [
    { label: 'Known tokens', value: '949 reported' },
    { label: 'Usage completeness', value: 'Unknown' },
  ],
  filterNote: '',
};
const render = (component: unknown, props: Record<string, unknown>) =>
  renderToStaticMarkup(createElement(component, props));
const review = (props: Record<string, unknown> = {}) =>
  render(ReviewDialog, {
    opportunity,
    mode: 'recorded',
    onClose: vi.fn(),
    onSave: vi.fn(),
    canSave: true,
    ...props,
  });

describe('reference dashboard approval workspace', () => {
  it('shows verification evidence inline without treating plan approval as verification', () => {
    const pending = review({ inline: true });
    expect(pending).toContain('Before &amp; after verification');
    expect(pending).toContain('Not verified');
    expect(pending).toContain('Approving a plan does not verify');
    const verified = review({
      inline: true,
      opportunity: {
        ...opportunity,
        verification: {
          status: 'Change check passed',
          baseline: [{ label: 'Source file / record', value: 'usage.json:2' }],
          change: [{ label: 'Application', value: 'Applied in isolated sandbox' }],
          result: [{ label: 'Observed resource reduction', value: '75 tokens' }],
          quality: 'Task quality checks are not recorded.',
        },
      },
    });
    for (const text of [
      'Change check passed',
      'usage.json:2',
      '75 tokens',
      'Quality checks',
      'Task quality checks are not recorded.',
    ]) {
      expect(verified).toContain(text);
    }
    expect(review({ mode: 'sample', inline: true })).toContain('synthetic scenario');
  });

  it('shows actionable review cards with honest projected impact, not execution promises', () => {
    const html = render(ApprovalPage, { data, onReview: vi.fn() });
    for (const text of [
      'Human-in-the-loop safety queue',
      '1 awaiting review',
      'Public FAQ service',
      'Medium risk',
      'Review &amp; approve',
      'Review rejection',
      'Not measured',
      'do not deploy or verify',
    ])
      expect(html).toContain(text);
    expect(html).not.toContain('Executed');
    expect(html).not.toContain('Trees');
    expect(html).not.toContain('$0');
  });

  it('labels sample review as synthetic and session only', () => {
    const html = render(ApprovalPage, { data: { ...data, mode: 'sample' }, onReview: vi.fn() });
    expect(html).toContain('synthetic proposals');
    expect(html).toContain('stay in this session');
    expect(html).toContain('never change your recorded runs');
  });

  it('filters on actual recommendation values and status', () => {
    const approved = {
      ...opportunity,
      id: 'approved',
      status: 'approved' as const,
      target: 'Production worker',
    };
    expect(filterOpportunities([opportunity, approved], ' PUBLIC faq ', 'all')).toEqual([
      opportunity,
    ]);
    expect(filterOpportunities([opportunity, approved], 'AI Efficiency', 'approved')).toEqual([
      approved,
    ]);
    expect(filterOpportunities([opportunity], 'not here', 'pending')).toEqual([]);
  });

  it('provides a useful empty state rather than fabricated recommendations', () => {
    const html = render(ApprovalPage, { data: { ...data, opportunities: [] }, onReview: vi.fn() });
    expect(html).toContain('No reviewable recommendations');
    expect(html).not.toContain('Review &amp; approve');
  });

  it('preserves approved as plan approval instead of executed', () => {
    const html = render(ApprovalPage, {
      data: { ...data, opportunities: [{ ...opportunity, status: 'approved' }] },
      onReview: vi.fn(),
    });
    expect(html).toContain('Review details');
    expect(html).not.toContain('Executed');
    expect(html).toContain('0 awaiting review');
  });

  it('counts requested revisions alongside pending plans in the awaiting-review summary', () => {
    const html = render(ApprovalPage, {
      data: {
        ...data,
        opportunities: [
          opportunity,
          { ...opportunity, id: 'revision', status: 'revision-requested' },
          { ...opportunity, id: 'approved', status: 'approved' },
        ],
      },
      onReview: vi.fn(),
    });
    expect(html).toContain('2 awaiting review');
    expect(html).toContain('3 total recommendations');
  });
});

describe('reference dashboard human review dialog', () => {
  it('renders a named native dialog with evidence, provenance, risk and decision history', () => {
    const html = review();
    expect(html).toContain('<dialog');
    expect(html).toContain('aria-labelledby=');
    expect(html).toContain('aria-describedby=');
    for (const text of [
      'Review optimization plan',
      'Duplicate tokens',
      '415 reported',
      'Rule-based fallback',
      'Confidence',
      'Risk &amp; safeguards',
      'Exclude private responses',
      'Decision history',
      'No human decisions recorded',
    ])
      expect(html).toContain(text);
    expect(html).not.toContain('Approve &amp; Execute');
  });

  it('requires explicit decision, reviewer, reason and scope with no preselected approval', () => {
    const html = review();
    for (const text of [
      'Choose a decision',
      'Approve plan only',
      'Reject plan',
      'Request revision',
      'Reviewer',
      'self-declared',
      'Decision reason',
      'scope-acknowledgment',
      'local plan review only',
      'Record decision',
    ])
      expect(html).toContain(text);
    expect(html).toMatch(/<option value="" selected="">Choose a decision/);
    expect(html).toMatch(/<input(?=[^>]*name="reviewer")(?=[^>]*required="")[^>]*>/);
    expect(html).toMatch(/name="reason" required=""/);
    expect(html).toMatch(/type="checkbox"[^>]*required=""/);
  });

  it('fails closed if safe storage is unavailable', () => {
    const html = review({ canSave: false, storageError: 'Local review storage is blocked.' });
    expect(html).toContain('role="alert"');
    expect(html).toContain('Local review storage is blocked.');
    expect(html).toContain('<fieldset');
    expect(html).toMatch(/<fieldset[^>]*disabled=""/);
    expect(html).toMatch(/type="submit"[^>]*disabled=""/);
  });

  it('does not render a review form for an already applied or verified finding', () => {
    for (const status of ['applied', 'verified']) {
      const html = review({ opportunity: { ...opportunity, status } });
      expect(html).toContain('Recorded outcome');
      expect(html).not.toContain('name="decision"');
      expect(html).not.toContain('type="submit"');
    }
  });

  it('keeps sample approval scoped to synthetic session data', () => {
    const html = review({ mode: 'sample' });
    expect(html).toContain('Simulated human review');
    expect(html).toContain('Save simulated decision');
    expect(html).toContain('does not apply a real change');
    expect(html).not.toContain('verified savings have increased');
  });

  it('does not expose undeclared reasoning fields or interpret evidence as markup', () => {
    const html = review({
      opportunity: {
        ...opportunity,
        reasoning: 'secret raw model reasoning',
        evidence: [{ label: 'Source', value: '<script>alert(1)</script>' }],
      },
    });
    expect(html).not.toContain('secret raw model reasoning');
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('renders nothing when no opportunity is selected', () => {
    expect(review({ opportunity: null })).toBe('');
  });

  it('validates missing, unsupported, whitespace-only and oversized inputs', () => {
    const valid = {
      decision: 'approved',
      reviewer: 'Reviewer',
      reason: 'Evidence checked.',
      acknowledged: true,
    };
    expect(validateReviewInput(valid)).toBeNull();
    for (const patch of [
      { decision: '' },
      { decision: 'execute' },
      { reviewer: '  ' },
      { reason: '  ' },
      { acknowledged: false },
      { reviewer: 'a'.repeat(101) },
      { reason: 'a'.repeat(1001) },
    ]) {
      expect(validateReviewInput({ ...valid, ...patch })).toEqual(expect.any(String));
    }
  });
});

describe('reference sustainability ledger and self audit', () => {
  it('separates recorded agent activity from local human decisions', () => {
    const html = render(LedgerPage, { data, onReview: vi.fn() });
    expect(html).toContain('Recorded activity');
    expect(html).toContain('Local human decision');
    expect(html).toContain('No verification');
    expect(html).toContain('aria-expanded="false"');
    expect(html).not.toMatch(
      /Immutable Audit Ledger|cryptographic hashes|corporate ESG compliance/,
    );
  });

  it('filters ledger by visible activity and status', () => {
    expect(filterAuditRows(rows, ' approved ', 'all')).toEqual([rows[1]]);
    expect(filterAuditRows(rows, 'ai', 'Detected')).toEqual([rows[0]]);
    expect(filterAuditRows(rows, 'not here', 'all')).toEqual([]);
  });

  it('clearly labels every sample audit row and empty ledger', () => {
    const sample = render(LedgerPage, { data: { ...data, mode: 'sample' }, onReview: vi.fn() });
    expect(sample.match(/Synthetic sample/g)).toHaveLength(2);
    const empty = render(LedgerPage, { data: { ...data, ledger: [] }, onReview: vi.fn() });
    expect(empty).toContain('No activity has been recorded');
    expect(empty).not.toContain('<table');
  });

  it('shows honest unknown footprint metrics with available usage and a run-bound SCI action', () => {
    const html = render(MetaPage, { data });
    for (const text of [
      'saving more than it consumes',
      'Missing measurements stay unknown',
      '949 reported',
      'Not established',
      'Unknown',
      'Open SCI measurement worksheet',
    ])
      expect(html).toContain(text);
    expect(html).toContain('/dashboard/measurement?run=run+with+spaces');
    expect(html).not.toMatch(/157\.7|142 kWh|22,400|Net Positive/);
  });

  it('never sends synthetic evidence to a recorded-run measurement worksheet', () => {
    const html = render(MetaPage, { data: { ...data, mode: 'sample' } });
    expect(html).toContain('Switch to recorded data');
    expect(html).not.toContain('href="/dashboard/measurement');
  });
});
