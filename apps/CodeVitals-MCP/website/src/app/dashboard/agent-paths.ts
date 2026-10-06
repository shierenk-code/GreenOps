export const AGENT_MODULE_IDS = [
  'carbon-incident',
  'digital-waste',
  'ai-efficiency',
  'architecture',
  'disaster-recovery',
  'collaboration',
  'pipeline-efficiency',
  'code-analysis',
] as const;

export type AgentModuleId = (typeof AGENT_MODULE_IDS)[number];

export function isAgentModuleId(value: string): value is AgentModuleId {
  return AGENT_MODULE_IDS.some((id) => id === value);
}

export function agentModulePath(id: string): string {
  return isAgentModuleId(id) ? `/dashboard/agents/${id}` : '/dashboard/agents';
}
