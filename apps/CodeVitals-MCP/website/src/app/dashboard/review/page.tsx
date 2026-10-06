import DashboardRoute from '../dashboard-route';

export default async function FindingReviewPage({ searchParams }: { searchParams: Promise<{ run?: string }> }) {
  return <DashboardRoute cloudRunId={(await searchParams).run} view="review" />;
}
