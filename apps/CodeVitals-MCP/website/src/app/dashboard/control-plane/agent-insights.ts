import type { Finding } from '../ledger-dashboard';
import { asRecord, entryFor } from '../dashboard-format';
import { safeAuditText } from '../dashboard-audit';
import type { Fact, Opportunity } from './types';

const quantity = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
export const displayQuantity = (value: number | null) =>
  value === null ? 'Not available' : value.toLocaleString('en-US', { maximumFractionDigits: 2 });

/** Workload evidence only; never use GreenOps' own model-request counters. */
export function findingInsights(
  finding: Finding,
): Pick<Opportunity, 'aiUsage' | 'estimatedBenefit'> {
  const detection = entryFor(finding.entries, 'detect');
  const evidence = asRecord(detection?.data.evidence);
  const location = asRecord(detection?.data.location);
  const category = finding.category;
  const workload =
    safeAuditText(evidence.workload, '') || safeAuditText(location.symbol, 'Unknown application');
  const period = quantity(evidence.periodHours);
  let tokens: number | null = null;
  if (category === 'uncached-completion') {
    tokens = quantity(evidence.wastedTokens);
    if (
      tokens === null &&
      quantity(evidence.avoidableRequests) !== null &&
      quantity(evidence.tokensPerRequest) !== null
    ) {
      tokens = quantity(
        (evidence.avoidableRequests as number) * (evidence.tokensPerRequest as number),
      );
    }
  } else if (category === 'prompt-overhead') {
    tokens = quantity(evidence.removableTokens);
  } else if (category === 'ai-retry-storm') {
    tokens = quantity(evidence.wastedTokens);
  }
  const energy = quantity(evidence.savingKwh);
  const carbon = quantity(evidence.savingKgCo2e);
  const estimatedBenefit: Fact =
    category === 'oversized-token-request'
      ? { label: 'Configuration only', value: 'Unused allowance is not consumed-token savings' }
      : tokens !== null
        ? {
            label: 'Estimated token opportunity',
            value: `${displayQuantity(tokens)} tokens${period === null ? ' · recorded scope' : ` / ${period} h`}`,
          }
        : (energy === null || energy === 0) && carbon !== null && carbon > 0
          ? {
              label: 'Modeled carbon opportunity',
              value: `${displayQuantity(carbon)} kg CO₂e${period === null ? ' · recorded scope' : ` / ${period} h`}`,
            }
          : energy !== null
            ? {
                label: 'Modeled energy opportunity',
                value: `${displayQuantity(energy)} kWh${period === null ? ' · recorded scope' : ` / ${period} h`}`,
              }
            : { label: 'Estimated benefit', value: 'Not available' };
  return {
    estimatedBenefit,
    ...(finding.agentId === 'ai-efficiency'
      ? {
          aiUsage: {
            workload,
            // Only explicitly identified workloads have deduplicatable request totals.
            scope: JSON.stringify([
              safeAuditText(evidence.subscriptionId, '') || safeAuditText(location.filePath, ''),
              safeAuditText(evidence.resourceId, ''),
              workload,
              period,
            ]),
            requests: typeof evidence.workload === 'string' ? quantity(evidence.requests) : null,
            avoidableTokens: tokens,
          },
        }
      : {}),
  };
}

/** Pick the largest standalone option per workload/scope; overlapping options are not summed. */
export function aiInsights(opportunities: Opportunity[]) {
  const groups = new Map<
    string,
    { workload: string; requests: Set<number>; tokens: number | null }
  >();
  for (const item of opportunities.filter((item) => item.agentKey === 'ai')) {
    const usage = item.aiUsage;
    const key = usage?.scope ?? item.target;
    const group = groups.get(key) ?? {
      workload: usage?.workload ?? item.target,
      requests: new Set<number>(),
      tokens: null,
    };
    if (usage?.requests !== null && usage?.requests !== undefined)
      group.requests.add(usage.requests);
    if (usage?.avoidableTokens !== null && usage?.avoidableTokens !== undefined) {
      group.tokens = Math.max(group.tokens ?? 0, usage.avoidableTokens);
    }
    groups.set(key, group);
  }
  const applications = [...groups.values()];
  const knownRequests = applications.filter((app) => app.requests.size === 1);
  const points = applications
    .filter((app) => app.tokens !== null)
    .map((app) => ({ label: app.workload, primary: app.tokens! }))
    .sort((a, b) => b.primary - a.primary);
  return {
    requests: knownRequests.length
      ? quantity(knownRequests.reduce((total, app) => total + [...app.requests][0], 0))
      : null,
    coverage: `${knownRequests.length} of ${applications.length} application scopes with consistent request counts`,
    largestOpportunity: points.length ? points[0].primary : null,
    chart: {
      title: 'Avoidable tokens by application',
      description:
        'Largest standalone estimate per application scope. Options may overlap; bars are not additive or achieved savings.',
      primaryLabel: 'Potentially avoidable tokens',
      primaryUnit: 'tokens',
      points,
    },
  };
}

export function benefitFor(item: Opportunity): Fact {
  if (item.estimatedBenefit) return item.estimatedBenefit;
  if (item.monthlyUsd !== null)
    return {
      label: 'Illustrative estimate',
      value: `$${displayQuantity(item.monthlyUsd)} / month`,
    };
  return { label: 'Estimated benefit', value: 'Not available' };
}

export const statusLabel = (status: Opportunity['status']) =>
  ({
    pending: 'Needs review',
    approved: 'Plan approved',
    rejected: 'Rejected',
    'revision-requested': 'Revision requested',
    applied: 'Applied · check needed',
    verified: 'Change check passed',
  })[status];
