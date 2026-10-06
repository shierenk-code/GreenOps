'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import {
  Activity,
  BarChart3,
  BrainCircuit,
  LayoutDashboard,
  Leaf,
  ListFilter,
  ShieldCheck,
} from 'lucide-react';
import { withRecordedRun } from './dashboard-run';
import styles from './dashboard.module.css';

export const WORKSPACE_NAVIGATION = [
  { view: 'dashboard', label: 'Overview', href: '/dashboard', icon: LayoutDashboard },
  { view: 'agents', label: 'Agent detail', href: '/dashboard/agents', icon: BrainCircuit },
  { view: 'findings', label: 'Finding review', href: '/dashboard/findings', icon: ListFilter },
  { view: 'approvals', label: 'Approval inbox', href: '/dashboard/approvals', icon: ShieldCheck },
  { view: 'trace', label: 'Run trace', href: '/dashboard/trace', icon: Activity },
  {
    view: 'ai-efficiency-demo',
    label: 'AI Efficiency demo',
    href: '/dashboard/ai-efficiency-demo',
    icon: BrainCircuit,
  },
  { view: 'reports', label: 'Impact reports', href: '/dashboard/reports', icon: BarChart3 },
] as const;

export type WorkspaceView = (typeof WORKSPACE_NAVIGATION)[number]['view'];

export function WorkspaceSidebar({
  activeView,
  runId,
  findingsCount,
  pendingReviews,
  actions,
}: {
  activeView: WorkspaceView;
  runId?: string | null;
  findingsCount?: number;
  pendingReviews?: number;
  actions?: ReactNode;
}) {
  const router = useRouter();
  // The demo has its own isolated run and must never inherit a fleet run ID.
  const destination = (item: (typeof WORKSPACE_NAVIGATION)[number]) =>
    item.view === 'ai-efficiency-demo' ? item.href : withRecordedRun(item.href, runId);

  return (
    <header className={styles.workspaceHeader} aria-label="Workspace navigation">
      <div className={styles.brandRow}>
        <Link
          href={withRecordedRun('/dashboard', runId)}
          className={styles.brand}
          aria-label="GreenOps overview"
        >
          <span className={styles.brandIcon}>
            <Leaf size={21} aria-hidden="true" />
          </span>
          <span>
            <span className={styles.brandName}>
              GreenOps <span>Control Plane</span>
            </span>
            <span className={styles.brandCaption}>
              Understand the waste. Review the change. Measure the difference.
            </span>
          </span>
        </Link>
        <div className={styles.headerActions}>{actions}</div>
      </div>
      <nav aria-label="Main navigation" className={styles.nav}>
        {WORKSPACE_NAVIGATION.map((item) => {
          const Icon = item.icon;
          const count =
            item.view === 'findings'
              ? findingsCount
              : item.view === 'approvals'
                ? pendingReviews
                : undefined;
          return (
            <Link
              key={item.view}
              href={destination(item)}
              aria-current={item.view === activeView ? 'page' : undefined}
              title={item.label}
              aria-label={item.label}
              className={`${styles.navLink} ${item.view === activeView ? styles.navActive : ''}`}
            >
              <Icon size={18} aria-hidden="true" />
              <span>{item.label}</span>
              {count !== undefined && (
                <span
                  className={styles.navCount}
                  aria-label={
                    item.view === 'approvals' ? `${count} pending reviews` : `${count} findings`
                  }
                >
                  {count}
                </span>
              )}
            </Link>
          );
        })}
      </nav>
      <label className={styles.mobileNav}>
        Workspace page
        <select
          aria-label="Workspace page"
          value={activeView}
          onChange={(event) => {
            const item = WORKSPACE_NAVIGATION.find(
              (candidate) => candidate.view === event.target.value,
            );
            if (item) router.push(destination(item));
          }}
        >
          {WORKSPACE_NAVIGATION.map((item) => (
            <option key={item.view} value={item.view}>
              {item.label}
            </option>
          ))}
        </select>
      </label>
    </header>
  );
}
