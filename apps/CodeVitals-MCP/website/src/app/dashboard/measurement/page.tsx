import type { Metadata } from 'next';
import { connection } from 'next/server';
import ControlPlaneDashboard from '../control-plane/control-plane-dashboard';
import { loadLatestLedger } from '../ledger-loader';
import MeasurementClient from './measurement-client';

export const metadata: Metadata = {
  title: 'SCI Assessment | GreenOps',
  description: 'Compare evidence-backed software carbon intensity for a declared system boundary.',
};

export default async function MeasurementPage() {
  await connection();
  const loaded = await loadLatestLedger();
  return (
    <ControlPlaneDashboard
      initialLedger={loaded.ledger}
      initialFileName={loaded.fileName}
      initialError={loaded.error}
      view="reports"
    >
      <MeasurementClient embedded />
    </ControlPlaneDashboard>
  );
}
