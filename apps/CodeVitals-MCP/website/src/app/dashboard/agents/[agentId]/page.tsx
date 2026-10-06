import { notFound } from 'next/navigation';
import DashboardRoute from '../../dashboard-route';
import { isAgentModuleId } from '../../agent-paths';

export default async function AgentModulePage({
  params, searchParams,
}: {
  params: Promise<{ agentId: string }>;
  searchParams: Promise<{ run?: string }>;
}) {
  const { agentId } = await params;
  if (!isAgentModuleId(agentId)) notFound();
  return <DashboardRoute view="agents" cloudRunId={(await searchParams).run} initialAgentId={agentId} />;
}
