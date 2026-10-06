import { describe, expect, it } from 'vitest';
import { buildSampleData } from '../apps/CodeVitals-MCP/website/src/app/dashboard/control-plane/data';
import { buildNotifications } from '../apps/CodeVitals-MCP/website/src/app/dashboard/control-plane/notification-data';

describe('evidence-derived dashboard notifications', () => {
  it('groups pending recommendations by agent and links to their own finding', () => {
    const data = buildSampleData('All', '30d');
    const items = buildNotifications(data);
    expect(items.filter((item) => item.tone === 'attention')).toHaveLength(6);
    for (const item of items.filter((item) => item.findingId)) {
      const finding = data.opportunities.find((o) => o.id === item.findingId);
      expect(finding?.agentKey).toBe(item.tab);
      expect(finding?.status).toBe('pending');
    }
    expect(items.at(-1)?.title).toBe('Sample scenarios ready to explore');
    expect(items.some((item) => /live|verified/i.test(item.title))).toBe(false);
  });
  it('removes reviewed findings and treats requested revisions as needing attention', () => {
    const data = buildSampleData('All', '30d');
    data.opportunities = data.opportunities.map((o) => ({ ...o, status: 'approved' }));
    expect(buildNotifications(data).filter((item) => item.tone === 'attention')).toHaveLength(0);
    data.opportunities[0].status = 'revision-requested';
    const items = buildNotifications(data).filter((item) => item.tone === 'attention');
    expect(items).toHaveLength(1);
    expect(items[0].findingId).toBe(data.opportunities[0].id);
  });
  it('only reports fallback guidance when its source is recorded', () => {
    const data = buildSampleData('All', '30d');
    expect(buildNotifications(data).filter((item) => item.tone === 'warning')).toHaveLength(0);
    data.mode = 'recorded';
    data.runId = 'run-one';
    data.opportunities[0].source = 'Offline fallback';
    const warning = buildNotifications(data).find((item) => item.tone === 'warning');
    expect(warning?.findingId).toBe(data.opportunities[0].id);
    expect(warning?.title).toContain('fallback recommendations');
    expect(warning?.description).not.toContain('API key');
  });
  it('does not announce results or findings when the selected run is unavailable', () => {
    expect(buildNotifications(buildSampleData('All', '30d'), { unavailable: true })).toEqual([]);
  });
  it('reports a generic load failure without guessing a provider problem', () => {
    const items = buildNotifications(buildSampleData('All', '30d'), {
      unavailable: true,
      loadFailed: true,
    });
    expect(items).toHaveLength(1);
    expect(items[0].title).toBe('Results could not be loaded');
  });
  it('scopes read identifiers to each run and dataset', () => {
    const sample = buildSampleData('All', '30d');
    const recorded = { ...sample, mode: 'recorded' as const, runId: 'run-one' };
    const next = { ...recorded, runId: 'run-two' };
    const firstIds = new Set(buildNotifications(sample).map((item) => item.id));
    const recordedIds = new Set(buildNotifications(recorded).map((item) => item.id));
    expect(buildNotifications(recorded).every((item) => !firstIds.has(item.id))).toBe(true);
    expect(buildNotifications(next).every((item) => !recordedIds.has(item.id))).toBe(true);
  });
});
