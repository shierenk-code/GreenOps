import DashboardRoute from '../dashboard-route';

export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ run?: string }> }) {
  return <DashboardRoute cloudRunId={(await searchParams).run} view="reports" />;
}
