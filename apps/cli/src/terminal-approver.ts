import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import {
  PolicyApprover,
  type Approver,
  type ApprovalDecision,
  type Investigation,
} from '@greenops/agent';
import type { SustainabilityBug } from '@greenops/detect';
import type { GreenOpsConfig } from '@codevitals/config';

type Prompt = (question: string) => Promise<string>;

/** Self-declared local identity; permission applies only to the displayed sandbox proposal. */
export class TerminalApprover implements Approver {
  readonly name = 'terminal-human';

  constructor(private readonly prompt?: Prompt) {}

  async decide(bug: SustainabilityBug, investigation: Investigation): Promise<ApprovalDecision> {
    const strategy = investigation.strategies.find(
      (s) => s.id === investigation.recommendedStrategyId,
    );
    const withheld = (reason: string): ApprovalDecision => ({
      approved: false,
      approver: this.name,
      reason,
    });
    if (bug.category !== 'duplicate-import' || strategy?.id !== 'merge-imports') {
      return withheld('Recommendation only: no supported sandbox execution adapter.');
    }
    if (!this.prompt && (!stdin.isTTY || !stdout.isTTY)) {
      return withheld('An interactive terminal is required for human approval; nothing applied.');
    }
    const terminal = this.prompt ? undefined : createInterface({ input: stdin, output: stdout });
    const ask = this.prompt ?? ((question: string) => terminal!.question(question));
    try {
      const answer = await ask(
        `\nProposal: ${bug.title}\nSource: ${bug.location.filePath}:${bug.location.startLine}\n` +
          `Change: ${strategy.description}\nScope: temporary sandbox copy only; source is not edited.\n` +
          'Verification: re-detect the finding; energy/carbon remain estimates.\n' +
          'Type APPROVE to apply this proposal, or press Enter to reject: ',
      );
      if (answer.trim() !== 'APPROVE')
        return withheld('Human rejected or did not approve this proposal.');
      const actor = (await ask('Reviewer label (self-declared): ')).trim();
      const reason = (await ask('Decision reason: ')).trim();
      if (!actor || !reason) return withheld('Reviewer and reason are required; nothing applied.');
      return { approved: true, approver: `terminal-human:${actor}`, reason };
    } catch {
      return withheld('Approval input interrupted; nothing applied.');
    } finally {
      terminal?.close();
    }
  }
}

export function selectRunApprover(
  policy: GreenOpsConfig['fixes'],
  options: { auto?: boolean; approve?: boolean; fleet?: boolean },
): Approver {
  if (options.auto && options.approve)
    throw new Error('Choose either --approve or --auto, not both.');
  if (
    options.auto &&
    (policy.enabled !== true || policy.requireApproval !== false || policy.autoApply !== true)
  ) {
    throw new Error(
      '--auto is blocked by repository policy. Use --approve for a human-reviewed sandbox change.',
    );
  }
  if (options.approve && policy.enabled !== true)
    throw new Error('Repository policy disables fixes.');
  if (options.approve && options.fleet)
    throw new Error(
      'Fleet findings are recommendation-only; no operational execution adapter is available.',
    );
  return options.approve ? new TerminalApprover() : new PolicyApprover(policy);
}
