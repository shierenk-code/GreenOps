import type { ApprovalInput } from '../approval-decisions';
import type { BaselineRollup } from '../baseline-rollup';
import type { ResourceUsage, VerificationEvidence } from './run-evidence';

export type AgentKey = 'ai' | 'waste' | 'carbon' | 'arch' | 'dr' | 'collab' | 'pipeline';
/** Specialist tabs in navigation order. */
export const SPECIALIST_KEYS: AgentKey[] = [
  'carbon',
  'waste',
  'ai',
  'arch',
  'dr',
  'collab',
  'pipeline',
];
export type ControlTab =
  | 'overview'
  | AgentKey
  | 'approval'
  | 'investigations'
  | 'results'
  | 'activity'
  | 'ledger'
  | 'meta';
export type DataMode = 'recorded' | 'sample';
export type ThemeName = 'sunset' | 'clean' | 'olive' | 'dark' | 'forest' | 'highContrast';
export type EnvironmentFilter = 'All' | 'Prod' | 'Staging';
export type TimeRange = '24h' | '7d' | '30d' | '1y' | 'custom';
export interface DateWindow { from: string; to: string }
export type Tone = 'green' | 'blue' | 'amber' | 'purple' | 'rose' | 'neutral';
export interface Fact {
  label: string;
  value: string;
}
export interface Metric {
  label: string;
  value: string;
  hint: string;
  tone?: Tone;
}
export interface ChartPoint {
  label: string;
  primary: number;
  secondary?: number;
}
export interface ChartData {
  title: string;
  description: string;
  primaryLabel: string;
  primaryUnit: string;
  secondaryLabel?: string;
  secondaryUnit?: string;
  points: ChartPoint[];
}
export interface ResourceRow {
  id: string;
  name: string;
  cells: string[];
  opportunityId?: string;
  status?: string;
  facts?: Fact[];
}
export interface AgentWorkspace {
  key: AgentKey;
  name: string;
  description: string;
  savingsMonthly: number | null;
  runCostMonthly: number | null;
  roiPercent: number | null;
  metrics: Metric[];
  inventoryTitle: string;
  columns: string[];
  rows: ResourceRow[];
  chart?: ChartData;
}
export interface Opportunity {
  verification?: VerificationEvidence;
  id: string;
  agentKey: AgentKey;
  title: string;
  target: string;
  description: string;
  recommendation: string;
  evidence: Fact[];
  risk: 'Low' | 'Medium' | 'High' | 'Unknown';
  riskNote: string;
  confidence: string;
  source: string;
  monthlyUsd: number | null;
  carbonKg: number | null;
  status: 'pending' | 'approved' | 'rejected' | 'revision-requested' | 'applied' | 'verified';
  history: Fact[];
}
export interface AuditRow {
  kind?: 'recorded' | 'local-decision' | 'sample';
  id: string;
  timestamp: string;
  agent: string;
  action: string;
  costSavings: string;
  carbonSaved: string;
  status: string;
  findingId?: string;
}
export interface ControlPlaneData {
  reviewCategories?: ChartData;
  reviewEstimates?: { energyKwh: number; carbonKg: number; findings: number };
  /**
   * Subscription-wide baseline recorded on the selected run outcome. This is
   * deliberately separate from filtered finding counts: it is never prorated
   * or presented as a verified saving.
   */
  baselineRollup?: BaselineRollup | null;
  resourceUsage?: ResourceUsage;
  mode: DataMode;
  asOf: string | null;
  runId: string | null;
  agents: AgentWorkspace[];
  opportunities: Opportunity[];
  ledger: AuditRow[];
  executiveMetrics: Metric[];
  trend: ChartData;
  selfAudit: Metric[];
  usageDetails: Fact[];
  filterNote: string;
}
export type SaveDecision = (
  id: string,
  input: ApprovalInput,
) => Promise<{ ok: boolean; message: string }>;

export const AGENT_IDS: Record<AgentKey, string> = {
  ai: 'ai-efficiency',
  waste: 'digital-waste',
  carbon: 'carbon-incident',
  arch: 'architecture',
  dr: 'disaster-recovery',
  collab: 'collaboration',
  pipeline: 'pipeline-efficiency',
};
export const TAB_LABELS: Record<ControlTab, string> = {
  overview: 'Overview',
  ai: 'AI Efficiency Agent',
  waste: 'Digital Waste Agent',
  carbon: 'Carbon Efficiency Agent',
  arch: 'Architecture Agent',
  dr: 'Disaster Recovery',
  collab: 'Collaboration Agent',
  pipeline: 'Pipeline Efficiency Agent',
  approval: 'Approvals',
  investigations: 'Investigations',
  results: 'Results & Evidence',
  activity: 'Agent Activity',
  ledger: 'Sustainability Ledger',
  meta: 'Meta Self-Audit',
};
export const CONTROL_TABS: ControlTab[] = [
  'overview',
  'investigations',
  'approval',
  'carbon',
  'waste',
  'ai',
  'arch',
  'dr',
  'collab',
  'pipeline',
  'results',
  'activity',
];
