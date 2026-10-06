import { connection } from 'next/server';
import { redirect } from 'next/navigation';
import { CloudError } from '../../server/cloud-security';
import { type DashboardView } from './ledger-dashboard';
import ControlPlaneDashboard from './control-plane/control-plane-dashboard';
import { loadLatestLedger } from './ledger-loader';

export default async function DashboardRoute({
  view,
  initialAgentId,
  cloudRunId,
}: {
  view: DashboardView;
  initialAgentId?: string;
  cloudRunId?: string;
}) {
  await connection();
  let loaded;
  try { loaded = await loadLatestLedger(cloudRunId); }
  catch (error) {
    if (error instanceof CloudError && error.status === 401) redirect('/login');
    throw error;
  }
  return (
    <ControlPlaneDashboard
      initialLedger={loaded.ledger}
      initialFileName={loaded.fileName}
      initialError={loaded.error}
      view={view}
      initialAgentId={initialAgentId}
    />
  );
}
