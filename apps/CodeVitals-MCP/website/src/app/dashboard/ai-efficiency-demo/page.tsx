import type { Metadata } from 'next';
import { connection } from 'next/server';
import ControlPlaneDashboard from '../control-plane/control-plane-dashboard';
import { loadLatestLedger } from '../ledger-loader';
import DemoClient from './demo-client';

export const metadata: Metadata = {
  title: 'AI Efficiency Demo | GreenOps',
  description: 'Review, approve, and verify a cache improvement in an isolated synthetic workload.',
};

export default async function AIEfficiencyDemoPage() {
  await connection();
  const loaded = await loadLatestLedger();
  return (
    <ControlPlaneDashboard
      initialLedger={loaded.ledger}
      initialFileName={loaded.fileName}
      initialError={loaded.error}
      view="agents"
      initialAgentId="ai-efficiency"
    >
      <DemoClient embedded />
    </ControlPlaneDashboard>
  );
}
