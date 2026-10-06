import { describe, expect, it } from 'vitest';
import { PolicyApprover, OfflineReasoner } from '../packages/agent/src/offline-reasoner.js';
import { TerminalApprover, selectRunApprover } from '../apps/cli/src/terminal-approver.js';
import type { SustainabilityBug } from '@greenops/detect';

const bug: SustainabilityBug = {
  id: 'imports',
  category: 'duplicate-import',
  severity: 'low',
  title: 'Duplicate imports',
  rationale: 'Duplicate declarations.',
  location: { filePath: 'service.ts', startLine: 1, endLine: 2 },
  evidence: { module: './util', importCount: 2 },
  estimatedWaste: { metric: 'imports.redundant', perRun: 1, unit: 'imports', assumptions: [] },
};
const safePolicy = { enabled: true, autoApply: false, requireApproval: true };

describe('execution approval policy', () => {
  it('withholds even trivial reversible changes by default', async () => {
    expect(
      (await new PolicyApprover().decide(bug, await new OfflineReasoner().investigate(bug)))
        .approved,
    ).toBe(false);
  });
  it.each([
    safePolicy,
    { enabled: false, autoApply: true, requireApproval: false },
    { enabled: true, autoApply: false, requireApproval: false },
    { enabled: true, autoApply: true, requireApproval: true },
  ])('does not let --auto bypass policy %j', (policy) => {
    expect(() => selectRunApprover(policy, { auto: true })).toThrow('blocked');
  });
  it('permits automatic safe fixes only with explicit repository settings', async () => {
    const approver = selectRunApprover(
      { enabled: true, autoApply: true, requireApproval: false },
      { auto: true },
    );
    expect(
      (await approver.decide(bug, await new OfflineReasoner().investigate(bug))).approved,
    ).toBe(true);
  });
  it('blocks conflicting flags, disabled fixes and unsupported fleet execution', () => {
    expect(() => selectRunApprover(safePolicy, { approve: true, auto: true })).toThrow('either');
    expect(() => selectRunApprover({ ...safePolicy, enabled: false }, { approve: true })).toThrow(
      'disables',
    );
    expect(() => selectRunApprover(safePolicy, { approve: true, fleet: true })).toThrow(
      'recommendation-only',
    );
  });
  it.each([
    { answers: ['APPROVE', 'test reviewer', 'Synthetic sandbox verification'], approved: true },
    { answers: [''], approved: false },
    { answers: ['yes'], approved: false },
    { answers: ['APPROVE', '', 'test'], approved: false },
    { answers: ['APPROVE', 'tester', ''], approved: false },
  ])('requires explicit approval, identity and reason: %j', async ({ answers, approved }) => {
    const prompts: string[] = [];
    const approver = new TerminalApprover(async (question) => {
      prompts.push(question);
      return answers.shift() ?? '';
    });
    const decision = await approver.decide(bug, await new OfflineReasoner().investigate(bug));
    expect(decision.approved).toBe(approved);
    expect(prompts[0]).toContain('temporary sandbox copy');
  });
  it('fails closed if input is interrupted', async () => {
    const approver = new TerminalApprover(async () => {
      throw new Error('EOF');
    });
    expect(
      (await approver.decide(bug, await new OfflineReasoner().investigate(bug))).approved,
    ).toBe(false);
  });
});
