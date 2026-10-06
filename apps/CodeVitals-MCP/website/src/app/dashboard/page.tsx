import DashboardRoute from './dashboard-route';
export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ run?: string }> }) { return <DashboardRoute view="dashboard" cloudRunId={(await searchParams).run} />; }
