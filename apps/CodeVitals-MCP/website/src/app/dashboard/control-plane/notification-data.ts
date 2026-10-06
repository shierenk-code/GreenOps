import type { ControlPlaneData, ControlTab } from './types';

export interface DashboardNotification {
  id: string;
  title: string;
  description: string;
  tab: ControlTab;
  findingId?: string;
  tone: 'attention' | 'warning' | 'info';
}

/** Snapshot-derived alerts, not a live monitoring feed. No model or network calls. */
export function buildNotifications(
  data: ControlPlaneData,
  state: { unavailable?: boolean; loadFailed?: boolean } = {},
): DashboardNotification[] {
  const scope = `${data.mode}:${data.runId ?? 'sample'}:${data.asOf ?? 'none'}`;
  const items: DashboardNotification[] = [];
  if (state.loadFailed)
    items.push({
      id: `${scope}:load-failed`,
      title: 'Results could not be loaded',
      description:
        'Your previous results are unchanged. Try Refresh results or import a saved analysis.',
      tab: 'overview',
      tone: 'warning',
    });
  if (state.unavailable) return items;
  for (const agent of data.agents) {
    const pending = data.opportunities.filter(
      (o) =>
        o.agentKey === agent.key && (o.status === 'pending' || o.status === 'revision-requested'),
    );
    if (pending.length)
      items.push({
        id: `${scope}:pending:${agent.key}:${pending
          .map((o) => o.id + ':' + o.status)
          .sort()
          .join('|')}`,
        title: `${agent.name}: ${pending.length} awaiting review`,
        description: pending[0].title,
        tab: agent.key,
        findingId: pending[0].id,
        tone: 'attention',
      });
    const fallback = data.opportunities.filter(
      (o) => o.agentKey === agent.key && /fallback/i.test(o.source),
    );
    if (fallback.length)
      items.push({
        id: `${scope}:fallback:${agent.key}:${fallback
          .map((o) => o.id)
          .sort()
          .join('|')}`,
        title: `${agent.name}: fallback recommendations`,
        description: `${fallback.length} recommendation(s) used fallback guidance. Review the evidence before acting.`,
        tab: agent.key,
        findingId: fallback[0].id,
        tone: 'warning',
      });
  }
  if (data.asOf)
    items.push({
      id: `${scope}:ready`,
      title:
        data.mode === 'sample'
          ? 'Sample scenarios ready to explore'
          : 'Saved analysis ready to review',
      description:
        data.mode === 'sample'
          ? 'Synthetic examples only. Review decisions do not change real resources.'
          : 'Results are from the selected saved analysis, not live monitoring.',
      tab: 'overview',
      tone: 'info',
    });
  return items;
}
