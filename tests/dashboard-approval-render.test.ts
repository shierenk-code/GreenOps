import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import ApprovalInbox, {
  ApprovalDecisionHistory,
  FindingApprovalPanel,
  filterApprovalProposals,
  selectedApprovalProposal,
  type ApprovalStore,
} from '../apps/CodeVitals-MCP/website/src/app/dashboard/approval-inbox';
import {
  appendApprovalRecord,
  summarizeApprovals,
  type ApprovalProposal,
} from '../apps/CodeVitals-MCP/website/src/app/dashboard/approval-decisions';
vi.mock('../apps/CodeVitals-MCP/website/node_modules/next/link', () => ({
  default: ({ href, children, ...props }: { href: string; children: unknown }) =>
    createElement('a', { href, ...props }, children),
}));
vi.mock('../apps/CodeVitals-MCP/website/src/app/dashboard/approval-inbox.module.css', () => ({
  default: {},
}));
const websiteRequire = createRequire(
  resolve(__dirname, '../apps/CodeVitals-MCP/website/package.json'),
);
const { createElement } = websiteRequire('react');
const { renderToStaticMarkup } = websiteRequire('react-dom/server');
const p: ApprovalProposal = {
  id: 'cache',
  runId: 'selected-run',
  fingerprint: 'a'.repeat(64),
  title: 'Repeated public requests',
  agentName: 'AI Efficiency',
  recommendationTitle: 'Cache public responses',
  recommendation: 'Cache only public reusable responses.',
  source: 'Rule-based fallback',
  confidence: 'high',
  reversible: true,
  evidence: [{ label: 'Potentially avoidable tokens', value: '400' }],
  policy: 'Automatic policy: withheld the change',
};
const recorded = appendApprovalRecord(
  { version: 1, records: [] },
  p,
  {
    decision: 'approved',
    reviewer: 'Demo reviewer',
    reason: 'Checked ownership and expiry.',
    acknowledged: true,
  },
  'review-1',
  '2026-10-04T02:00:00Z',
).records;
const store = (overrides: Partial<ApprovalStore> = {}): ApprovalStore => ({
  proposals: [p],
  records: [],
  ready: true,
  error: null,
  counts: summarizeApprovals([p], [], p.runId),
  save: async () => ({ ok: true, message: 'Recorded' }),
  exportHistory() {},
  ...overrides,
});
const render = (s = store(), props: Record<string, unknown> = {}) =>
  renderToStaticMarkup(
    createElement(ApprovalInbox, {
      store: s,
      run: { runId: p.runId, entries: [], timestamp: '', kind: 'run' },
      ...props,
    }),
  );

describe('local human review inbox', () => {
  it('offers three explicit review-only decisions and requires self-declared identity, reason and acknowledgment', () => {
    const html = render();
    for (const text of [
      'Approve plan only',
      'Reject plan',
      'Request revision',
      'Reviewer name',
      'self-declared',
      'Decision reason',
      'Record decision',
      'does not apply it',
      'does not override this policy decision',
      'estimates, not verified outcomes',
    ])
      expect(html).toContain(text);
    expect(html).toContain('type="checkbox" required=""');
    expect(html).toContain('name=');
    expect(html).toContain('/dashboard/review?finding=cache&amp;run=selected-run');
    expect(html).not.toContain('Apply change');
  });
  it('keeps a directly selected finding visible and links exact run', () => {
    const another = {
      ...p,
      id: 'retention',
      title: 'Retained logs',
      recommendationTitle: 'Review retention',
    };
    const html = render(store({ proposals: [p, another] }), { initialFindingId: 'retention' });
    expect(html).toContain('<h3>Review retention</h3>');
    expect(html).toContain('finding=retention&amp;run=selected-run');
  });
  it('shows recorded evidence and recommendation provenance without a fabricated measured saving', () => {
    const html = render();
    expect(html).toContain('Rule-based fallback');
    expect(html).toContain('Potentially avoidable tokens');
    expect(html).toContain('400');
    expect(html).not.toContain('kg CO');
  });
  it('shows unavailable proposals honestly and does not render decision controls', () => {
    const html = render(store({ proposals: [], counts: summarizeApprovals([], [], p.runId) }));
    expect(html).toContain('No unapplied recommendations with reviewable details');
    expect(html).not.toContain('Record decision');
  });
  it('shows loading, not zero approvals or absent history, until storage and fingerprints are ready', () => {
    const html = render(store({ ready: false }));
    expect(html).toContain('Preparing recommendations');
    expect(html).toContain('Loading local review history');
    expect(html).not.toContain('No local human decisions');
    expect(html).not.toContain('Record decision');
  });
  it('shows storage errors without review controls or enabled export', () => {
    const html = render(
      store({ ready: false, error: 'Browser storage is unavailable.', records: recorded }),
    );
    expect(html).toContain('role="alert"');
    expect(html).not.toContain('Record decision');
    expect(html).toContain('disabled=""');
    expect(html).not.toContain('No local human decisions');
  });
  it('shows an existing approval as plan-only with revision history, never as an applied result', () => {
    const html = render(
      store({ records: recorded, counts: summarizeApprovals([p], recorded, p.runId) }),
    );
    expect(html).toContain('Plan approved locally');
    expect(html).toContain('A new decision adds to history');
    expect(html).toContain('Current decision');
    expect(html).toContain('No execution');
    expect(html).toContain('not authenticated or tamper-proof');
  });
  it('keeps changed proposal approvals in history but requires new review', () => {
    const changed = { ...p, fingerprint: 'b'.repeat(64) };
    const html = render(
      store({
        proposals: [changed],
        records: recorded,
        counts: summarizeApprovals([changed], recorded, p.runId),
      }),
    );
    expect(html).toContain('Your earlier decision does not approve this version');
    expect(html).toContain('Older or unavailable proposal');
    expect(html).toContain('need review');
  });
  it('provides the same reusable local decision form beside finding review', () => {
    const html = renderToStaticMarkup(
      createElement(FindingApprovalPanel, { store: store(), findingId: p.id }),
    );
    expect(html).toContain('Your review decision');
    expect(html).toContain('Approve plan only');
    expect(html).toContain('No infrastructure, files, or workloads will be changed');
  });
  it('does not expose other findings in a per-finding history panel', () => {
    const html = renderToStaticMarkup(
      createElement(ApprovalDecisionHistory, {
        store: store({ records: recorded }),
        findingId: 'other',
      }),
    );
    expect(html).toContain('No local human decisions');
    expect(html).not.toContain('Demo reviewer');
  });
  it('filters by searchable public fields and current local decision, then selects only from matching results', () => {
    const pending = { ...p, id: 'other', title: 'Retry spike', agentName: 'Digital Waste' };
    const proposals = [p, pending];
    const visible = filterApprovalProposals(proposals, recorded, 'pending', '');
    expect(visible).toEqual([pending]);
    expect(selectedApprovalProposal(visible, recorded, p.id)).toBe(pending);
    expect(filterApprovalProposals(proposals, recorded, 'approved', '')).toEqual([p]);
    expect(filterApprovalProposals(proposals, [], 'all', ' digital waste ')).toEqual([pending]);
    expect(selectedApprovalProposal([], recorded, p.id)).toBeUndefined();
  });
});
