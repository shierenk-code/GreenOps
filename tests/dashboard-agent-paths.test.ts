import { describe, expect, it } from 'vitest';
import {
  AGENT_MODULE_IDS,
  agentModulePath,
  isAgentModuleId,
} from '../apps/CodeVitals-MCP/website/src/app/dashboard/agent-paths.js';
import { withRecordedRun } from '../apps/CodeVitals-MCP/website/src/app/dashboard/dashboard-run.js';

describe('Dedicated specialist module routes', () => {
  it('keeps the requested display sequence without changing route IDs', () => {
    expect(AGENT_MODULE_IDS).toEqual([
      'carbon-incident',
      'digital-waste',
      'ai-efficiency',
      'architecture',
      'disaster-recovery',
      'collaboration',
      'pipeline-efficiency',
      'code-analysis',
    ]);
  });

  it.each(AGENT_MODULE_IDS)('creates a run-bound route for %s', (id) => {
    expect(isAgentModuleId(id)).toBe(true);
    expect(withRecordedRun(`${agentModulePath(id)}#agent-detail`, 'historical-run')).toBe(
      `/dashboard/agents/${id}?run=historical-run#agent-detail`,
    );
  });

  it.each(['unknown', '../reports', 'AI-Efficiency', '', 'https://external.test'])(
    'rejects unsupported module %s',
    (id) => {
      expect(isAgentModuleId(id)).toBe(false);
      expect(agentModulePath(id)).toBe('/dashboard/agents');
    },
  );
});
