'use client';

import Link from 'next/link';
import type { MouseEvent } from 'react';
import {
  Activity,
  Bot,
  Box,
  Leaf,
  Layers,
  ShieldCheck,
  Users,
  ArrowRight,
  ChevronRight,
  FileText,
  Cloud,
  CircleCheck,
  Workflow,
} from 'lucide-react';
import type { AgentKey, ControlPlaneData, ControlTab, Opportunity } from './types';
import { useCloud } from '../../cloud-client';
import { carbonObservations } from './carbon-map-data';
import { LiveWorkspace } from './live-workspace';
import { CarbonAtlas } from './carbon-atlas';
import { OverviewInsights } from './overview-insights';
import { WorkspaceHero, ScrollSection } from './workspace-motion';
import { ResourceSummary } from './resource-summary';
import { SubscriptionRollup } from './subscription-rollup';
import styles from './executive-overview.module.css';

const specialists: { key: AgentKey; name: string; icon: typeof Leaf }[] = [
  { key: 'carbon', name: 'Carbon Efficiency', icon: Leaf },
  { key: 'waste', name: 'Digital Waste', icon: Box },
  { key: 'ai', name: 'AI Efficiency', icon: Bot },
  { key: 'arch', name: 'Architecture', icon: Layers },
  { key: 'dr', name: 'Disaster Recovery', icon: ShieldCheck },
  { key: 'collab', name: 'Collaboration', icon: Users },
  { key: 'pipeline', name: 'Pipeline Efficiency', icon: Workflow },
];
const FALLBACK_SPECIALIST = { name: 'Specialist', icon: FileText };
const pending = (item: Opportunity) =>
  item.status === 'pending' || item.status === 'revision-requested';

/** Stable, evidence-derived queue: revision requests first, then disclosed risk. */
export function overviewReviewQueue(opportunities: Opportunity[]) {
  const riskOrder = { High: 0, Unknown: 1, Medium: 2, Low: 3 };
  const sorted = opportunities
    .filter(pending)
    .sort(
      (a, b) =>
        Number(b.status === 'revision-requested') - Number(a.status === 'revision-requested') ||
        riskOrder[a.risk] - riskOrder[b.risk],
    );
  const seen = new Set<AgentKey>();
  const representatives = sorted.filter((item) => {
    if (seen.has(item.agentKey)) return false;
    seen.add(item.agentKey);
    return true;
  });
  return [...representatives, ...sorted.filter((item) => !representatives.includes(item))].slice(
    0,
    3,
  );
}

const lifecycle = [
  'Status',
  'Activity',
  'Evidence',
  'Recommendation',
  'Human decision',
  'Verified result',
];

export function ExecutiveOverview({
  data,
  href,
  onNavigate,
}: {
  data: ControlPlaneData;
  href: (tab: ControlTab, patch?: Record<string, string | null>) => string;
  onNavigate: (event: MouseEvent<HTMLAnchorElement>) => void;
}) {
  const cloud = useCloud();
  const sample = data.mode === 'sample';
  const pendingCount = data.opportunities.filter(pending).length;
  const verifiedCount = data.opportunities.filter((item) => item.status === 'verified').length;
  const queue = overviewReviewQueue(data.opportunities);
  const coverage = data.agents.filter((agent) => agent.rows.length > 0).length;
  const specialistNoun = coverage === 1 ? 'specialist' : 'specialists';
  const heroSummary = sample
    ? `${data.opportunities.length} illustrative findings across ${coverage} ${specialistNoun}. Pipeline Efficiency needs a recorded Azure baseline.`
    : `${pendingCount} findings across ${coverage} ${specialistNoun} in this analysis. Review a recommendation before changing anything.`;
  return (
    <section className={styles.overview} aria-label="Executive orchestrator overview">
      {(sample || !data.runId) && (
        <WorkspaceHero
          href={href('investigations')}
          onNavigate={onNavigate}
          summary={heroSummary}
        />
      )}
      {!sample && data.runId && (
        <header className={styles.title}>
          <h2>Your recorded review</h2>
          <p>Findings, model usage and estimated impact from the selected codebase.</p>
        </header>
      )}
      <div className={styles.summary}>
        <article>
          <span className={styles.icon}>
            <FileText size={25} aria-hidden="true" />
          </span>
          <div>
            <h3>Findings to review</h3>
            <strong>{pendingCount}</strong>
            <p>{sample ? 'Synthetic scenario decisions' : 'In the selected analysis'}</p>
          </div>
        </article>
        <article>
          <span className={styles.icon}>
            <Users size={25} aria-hidden="true" />
          </span>
          <div>
            <h3>Agent coverage</h3>
            <strong>
              {coverage}
              <small> / {data.agents.length}</small>
            </strong>
            <p>Specialists with findings · not live health</p>
          </div>
        </article>
        <article>
          <span className={styles.icon}>
            <Cloud size={25} aria-hidden="true" />
          </span>
          <div>
            <h3>Verified improvements</h3>
            <strong>{verifiedCount}</strong>
            <p>
              {sample
                ? 'Illustrative states · not real savings'
                : verifiedCount
                  ? 'Recorded follow-up checks passed'
                  : 'No verified changes in this selection'}
            </p>
          </div>
        </article>
      </div>
      <SubscriptionRollup rollup={data.baselineRollup} />
      {!sample && data.runId && <ResourceSummary data={data} />}
      {!sample && data.reviewEstimates && data.reviewEstimates.findings > 0 && (
        <section aria-label="Modeled review opportunities" className={styles.summary}>
          <article>
            <div>
              <h3>Potential energy reduction</h3>
              <strong>
                {data.reviewEstimates.energyKwh.toLocaleString('en-US', {
                  maximumFractionDigits: 4,
                })}{' '}
                kWh
              </strong>
              <p>Static estimate under scanner assumptions</p>
            </div>
          </article>
          <article>
            <div>
              <h3>Potential carbon reduction</h3>
              <strong>
                {data.reviewEstimates.carbonKg.toLocaleString('en-US', {
                  maximumFractionDigits: 4,
                })}{' '}
                kg CO₂e
              </strong>
              <p>Modeled opportunity, not achieved savings</p>
            </div>
          </article>
          <article>
            <div>
              <h3>Estimate coverage</h3>
              <strong>{data.reviewEstimates.findings}</strong>
              <p>
                Findings with recorded estimates; overlapping opportunities may not be additive.
              </p>
            </div>
          </article>
        </section>
      )}
      {!sample && data.runId && (
        <OverviewInsights data={data} href={href} onNavigate={onNavigate} />
      )}
      <ScrollSection id="global-footprint">
        <div className={styles.chapter}>
          <span>01 / YOUR GLOBAL FOOTPRINT</span>
          <h2>
            Every region.
            <br />A different impact.
          </h2>
          <p>
            Explore the carbon context behind your infrastructure. Follow each observation back to
            its evidence.
          </p>
        </div>
        {!sample && <LiveWorkspace />}
        {(!cloud || sample || carbonObservations(data).observations.length > 0) && (
          <CarbonAtlas data={data} href={href} onNavigate={onNavigate} />
        )}
      </ScrollSection>
      {(sample || !data.runId) && (
        <ScrollSection>
          <div className={styles.chapter}>
            <span>02 / FROM SIGNAL TO DECISION</span>
            <h2>See the bigger picture.</h2>
          </div>
          <OverviewInsights data={data} href={href} onNavigate={onNavigate} />
        </ScrollSection>
      )}
      <ScrollSection>
        <div className={styles.workGrid}>
          <section className={styles.queue} aria-labelledby="overview-attention-title">
            <header className={styles.sectionHeader}>
              <h3 id="overview-attention-title">What needs your attention</h3>
              <Link
                href={href('approval')}
                prefetch={false}
                onClick={onNavigate}
                className={styles.textLink}
              >
                View all <ArrowRight size={15} aria-hidden="true" />
              </Link>
            </header>
            {queue.length ? (
              <ul className={styles.queueList}>
                {queue.map((item) => {
                  const agent =
                    specialists.find((s) => s.key === item.agentKey) ?? FALLBACK_SPECIALIST;
                  const Icon = agent.icon;
                  return (
                    <li key={item.id}>
                      <span className={styles.icon}>
                        <Icon size={22} aria-hidden="true" />
                      </span>
                      <div className={styles.findingText}>
                        <h4>{item.title}</h4>
                        <p>
                          {agent.name} · {item.target}
                        </p>
                        <span>
                          {item.risk === 'Unknown' ? 'Risk not assessed' : `${item.risk} risk`}
                        </span>
                      </div>
                      <span className={styles.reviewBadge}>
                        {item.status === 'revision-requested'
                          ? 'Revision requested'
                          : 'Needs review'}
                      </span>
                      <Link
                        href={href(item.agentKey, { finding: item.id })}
                        prefetch={false}
                        onClick={onNavigate}
                        className={styles.textLink}
                        aria-label={`Review ${item.title} for ${item.target}`}
                      >
                        Review <ArrowRight size={17} aria-hidden="true" />
                      </Link>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <div className={styles.empty}>
                <CircleCheck size={28} aria-hidden="true" />
                <h4>
                  {data.opportunities.length
                    ? 'No pending reviews in this selection'
                    : 'No findings in this selection'}
                </h4>
                <p>
                  {data.opportunities.length
                    ? 'A reviewed plan is not an applied or verified change.'
                    : 'Check the analysis and time range, or explore the separate sandbox.'}
                </p>
              </div>
            )}
            <p className={styles.queueHint}>
              Starting points across agents, prioritized by revision and risk. Unknown risk needs
              investigation.
            </p>
          </section>
          <div className={styles.guidance}>
            <section className={styles.feature} aria-label="Digital Waste synthetic sandbox">
              <span className={styles.featureLabel}>Separate synthetic sandbox</span>
              <h3>One problem. A complete journey.</h3>
              <p>Try the Digital Waste sandbox.</p>
              <div
                className={styles.comparison}
                aria-label="Example CPU request: 2 cores before, 0.6 cores proposed per replica"
              >
                <strong>
                  2 <span>CPU cores</span>
                </strong>
                <ArrowRight size={23} aria-hidden="true" />
                <strong>
                  0.6 <span>CPU cores</span>
                </strong>
              </div>
              <p className={styles.featureNote}>Example request per replica · not a live result</p>
              <Link
                href={href('waste', { sandbox: '1' })}
                prefetch={false}
                onClick={onNavigate}
                className={styles.featureAction}
              >
                Start guided workflow <ArrowRight size={18} aria-hidden="true" />
              </Link>
            </section>
            <div className={styles.guardrail}>
              <ShieldCheck size={23} aria-hidden="true" />
              <div>
                <strong>Approval ≠ verified savings</strong>
                <p>Apply a supported change, then check the evidence.</p>
              </div>
            </div>
          </div>
        </div>
      </ScrollSection>
      <section
        className={styles.journey}
        aria-label="Decision lifecycle guide, not current run progress"
      >
        <p>How a change becomes a verified result</p>
        <ol>
          {lifecycle.map((stage, i) => (
            <li key={stage}>
              <span aria-hidden="true">{i + 1}</span>
              {stage}
            </li>
          ))}
        </ol>
      </section>
      <ScrollSection>
        <section className={styles.workspaces} aria-labelledby="overview-workspaces-title">
          <h3 id="overview-workspaces-title">Seven specialist workspaces</h3>
          <div className={styles.agentGrid}>
            {specialists.map(({ key, name, icon: Icon }) => {
              const agent = data.agents.find((item) => item.key === key);
              const count = agent?.rows.length ?? 0;
              return (
                <Link
                  key={key}
                  href={href(key)}
                  prefetch={false}
                  onClick={onNavigate}
                  className={styles.agentLink}
                >
                  <span className={styles.icon}>
                    <Icon size={24} aria-hidden="true" />
                  </span>
                  <div>
                    <h4>{name}</h4>
                    <p>
                      {count} {count === 1 ? 'finding' : 'findings'}
                      {sample ? ' · sample' : count === 0 ? ' · no evidence in this run' : ''}
                    </p>
                  </div>
                  <ChevronRight size={19} aria-hidden="true" />
                </Link>
              );
            })}
          </div>
        </section>
      </ScrollSection>
      {(sample || !data.runId) && (
        <details className={styles.resources}>
          <summary>
            <span>
              <Activity size={17} aria-hidden="true" />
              Resources used by GreenOps
            </span>
            <span className={styles.resourceHint}>
              Model requests · Tokens · Tool calls · Measurement gaps
            </span>
          </summary>
          <ResourceSummary data={data} />
        </details>
      )}
    </section>
  );
}
