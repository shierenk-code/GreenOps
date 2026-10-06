import type { Metadata } from 'next';
import { Suspense, type ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { connection } from 'next/server';
import { cloudEnabled } from '../../server/cloud-db';
import { authenticate } from '../../server/cloud-auth';
import { CloudError } from '../../server/cloud-security';
import { CloudWorkspace } from '../cloud-client';

export const metadata: Metadata = {
  title: 'GreenOps | Sustainability workspace',
  description:
    'Review sustainability findings, compare recommendations, and follow recorded decisions and verified results.',
};

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  await connection();
  if (!cloudEnabled()) return children;
  let principal;
  try { principal = await authenticate(); } catch (error) {
    if (error instanceof CloudError && error.status === 401) redirect('/login');
    throw new Error('Account storage is temporarily unavailable. Please try again.');
  }
  return <Suspense fallback={<p>Loading your workspace…</p>}><CloudWorkspace email={principal.email}>{children}</CloudWorkspace></Suspense>;
}
