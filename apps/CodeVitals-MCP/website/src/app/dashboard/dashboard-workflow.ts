import type { Finding } from './ledger-dashboard';

export type WorkflowStage = 'needs-review' | 'needs-verification' | 'verified';

/** Use the derived finding state, not approval/attempt counts, to choose one queue. */
export function getWorkflowStage(finding: Pick<Finding, 'state'>): WorkflowStage {
  if (finding.state === 'verified') return 'verified';
  if (finding.state === 'unverified') return 'needs-verification';
  return 'needs-review';
}

export interface ManualGuide {
  implementationSteps: string[];
  verificationSteps: string[];
  risks: string[];
  automaticApplyAvailable: false;
  automaticApplyReason: string;
}

type GuideTemplate = Pick<ManualGuide, 'implementationSteps' | 'verificationSteps' | 'risks'>;
type GuideKey =
  | 'token-limit'
  | 'cache'
  | 'retry'
  | 'storage'
  | 'retention'
  | 'image'
  | 'recovery'
  | 'region'
  | 'compute'
  | 'carbon-incident'
  | 'imports'
  | 'pipeline'
  | 'generic';

const TEMPLATES: Record<GuideKey, GuideTemplate> = {
  'token-limit': {
    implementationSteps: [
      'Record actual output-token usage and completion status for representative tasks, grouped by model and task type.',
      'In a test configuration, choose an output limit with enough headroom for longer valid answers. Check which output-limit setting your provider supports.',
      'Test quality and truncated answers before requesting approval to roll the configuration out gradually. Keep the previous limit available for rollback.',
    ],
    verificationSteps: [
      'Compare answer quality, truncation, latency, and actual billed or reported tokens on equivalent before-and-after requests.',
      'Count a token reduction only when actual usage falls. Unused output allowance is not tokens consumed or saved.',
    ],
    risks: [
      'A lower output limit can truncate answers or cause retries; reasoning and output limits may be shared by some models.',
    ],
  },
  cache: {
    implementationSteps: [
      'Identify repeated requests that are safe to reuse. Exclude sensitive, personalized, or intentionally variable responses unless isolation and access checks are designed for them.',
      'Design the cache key around tenant and access scope, model/version, system prompt, input, and generation settings. Define expiry and invalidation rules.',
      'Test a small, approved cache rollout behind a reversible configuration switch; retain an uncached path for comparison and rollback.',
    ],
    verificationSteps: [
      'Test that one user or tenant cannot receive another user’s cached response, and that changed source data invalidates stale results.',
      'Compare actual cache hits, provider requests, token usage, latency, and answer quality for the same workload window.',
    ],
    risks: [
      'An incomplete cache key can leak data or serve stale answers. Matching prompt text alone does not establish that reuse is safe.',
    ],
  },
  retry: {
    implementationSteps: [
      'Inspect attempt-level status codes and usage to distinguish transient failures from access, validation, or configuration errors.',
      'In a test environment, add bounded exponential backoff with jitter for transient failures and respect server retry guidance. Set a maximum attempt count and total deadline.',
      'Check idempotency before retrying actions with side effects. Test a circuit breaker with a recovery path rather than permanently stopping after a single temporary error.',
    ],
    verificationSteps: [
      'Simulate temporary and permanent failures; confirm retry limits, recovery, and the absence of duplicate side effects.',
      'Compare recorded attempts, reported tokens, success rate, and latency under equivalent failure conditions. Missing usage from failed attempts remains unknown, not zero.',
    ],
    risks: [
      'Retries can repeat side effects or increase costs; overly aggressive limits can turn recoverable errors into failed requests.',
    ],
  },
  storage: {
    implementationSteps: [
      'Ask the resource owner to confirm the volume’s identity, dependencies, last use, retention obligations, and legal holds. An unattached volume is not automatically disposable.',
      'If retirement is appropriate, prepare an approved retention or archive plan and test restoration from the required recovery copy.',
      'Schedule any removal through the owner’s normal change process only after retention and recovery checks pass. Do not delete storage based on this finding alone.',
    ],
    verificationSteps: [
      'Confirm recovery works and no workload or backup process depends on the volume before executing the approved plan.',
      'After the approved change, compare retained storage over the same period, including new snapshots or archives; record service health and actual resource usage.',
    ],
    risks: [
      'Removal may cause irreversible data loss. Recovery copies consume storage too, and retention or legal holds can prohibit removal.',
    ],
  },
  retention: {
    implementationSteps: [
      'Confirm the owner’s retention policy, audit requirements, legal holds, and recovery needs for these logs or recordings.',
      'For suspected duplicates, compare content and permissions and confirm the retained copy is accessible. For verbose logs, identify required security and diagnostic events.',
      'Preview the affected items and test a policy change on a small approved scope before scheduling any expiry or removal. Preserve a tested recovery route where required.',
    ],
    verificationSteps: [
      'Check that retained records still meet audit, access, and troubleshooting requirements and that required recovery works.',
      'Compare ingestion and retained bytes over matching time windows, including archive copies; do not count the same duplicate or retention reduction twice.',
    ],
    risks: [
      'Shorter retention can remove required evidence; content similarity alone does not prove two records are interchangeable.',
    ],
  },
  image: {
    implementationSteps: [
      'Inspect image layers and runtime dependencies to identify build tools or files that are not needed at runtime.',
      'Create a test build using an approved minimal base and a multi-stage build where appropriate. Pin reviewed dependencies and retain the previous image digest.',
      'Run compatibility and security checks, then request a gradual rollout with rollback to the previous image.',
    ],
    verificationSteps: [
      'Test startup, health checks, required native libraries, certificates, and application behavior using the candidate image.',
      'Compare compressed image size and actual transferred/stored bytes under the same deployment pattern; a smaller image does not prove lower runtime electricity use.',
    ],
    risks: [
      'A smaller base can omit required libraries, certificates, or debugging tools; unreviewed base images introduce supply-chain risk.',
    ],
  },
  recovery: {
    implementationSteps: [
      'Confirm documented availability targets, quorum requirements, recovery time objective (RTO), and acceptable data loss or recovery point objective (RPO) with the service owner.',
      'Model the proposed replica, standby, or replication-schedule change against peak load and failure scenarios. Do not infer a safe replica count or recovery target from this finding alone.',
      'Test failover and restoration in an isolated environment, including replication lag and worst-case recovery time. Seek explicit owner approval before a gradual operational change and retain a rollback plan.',
    ],
    verificationSteps: [
      'Perform an approved recovery exercise and confirm quorum, availability, RTO, and RPO still meet the documented requirements.',
      'Compare actual replication traffic, compute and storage use over equivalent windows, including backup and standby costs; monitor after rollout.',
    ],
    risks: [
      'Reducing redundancy or replication frequency can increase downtime or data loss. A configured interval alone does not guarantee RPO.',
    ],
  },
  region: {
    implementationSteps: [
      'Review candidate regions with the workload owner for data residency, access, service availability, latency, resilience, and transfer cost.',
      'Compare documented grid-intensity estimates for matching periods and include transfer and temporary duplicate-capacity costs in the migration proposal.',
      'Test the candidate deployment and data synchronization, then obtain approval for a staged migration with a verified rollback plan.',
    ],
    verificationSteps: [
      'Check data integrity, user latency, availability, and compliance after an approved migration.',
      'Compare actual energy or resource usage and region-specific carbon factors for equivalent workloads. A lower-carbon region does not by itself save energy.',
    ],
    risks: [
      'Migration can affect residency obligations, availability, latency, and cost; temporary duplicate environments may increase consumption.',
    ],
  },
  compute: {
    implementationSteps: [
      'Collect representative CPU, memory, peak-demand, queue-depth, and latency measurements; include seasonal or scheduled peaks.',
      'Test a smaller allocation or an autoscaling policy in a non-production environment, keeping capacity headroom and clear minimum/maximum limits.',
      'Request an owner-approved gradual rollout with health thresholds and a rollback to the previous capacity configuration.',
    ],
    verificationSteps: [
      'Load-test normal traffic and spikes; confirm latency, errors, queue growth, memory pressure, and scale-out timing remain acceptable.',
      'Compare actual allocated and consumed resources over equivalent workload windows rather than treating lower reservation alone as metered energy savings.',
    ],
    risks: [
      'Undersizing or slow scale-out can cause throttling, failed requests, or outages; idle averages can hide critical peak demand.',
    ],
  },
  'carbon-incident': {
    implementationSteps: [
      'Check the measurement source, timestamp, region factor, and baseline before treating the reported spike as a workload incident.',
      'Correlate the interval with jobs, deployments, traffic, and retries, and ask the responsible owner to confirm the cause.',
      'Test a targeted fix or resource limit only after assessing workload criticality, then use the normal approved change and rollback process.',
    ],
    verificationSteps: [
      'Compare the affected and baseline intervals with consistent workload volume, measurement scope, and carbon factors.',
      'Confirm the spike does not recur and that any resource limit has not shifted work to retries, queues, or another service.',
    ],
    risks: [
      'A change in grid intensity or measurement coverage can resemble a workload spike; an arbitrary cap can disrupt necessary work.',
    ],
  },
  imports: {
    implementationSteps: [
      'Inspect the duplicate imports and confirm module side effects, type-only imports, aliases, and execution order before changing them.',
      'Prepare the smallest equivalent import cleanup in a branch or sandbox and review the diff before merging.',
    ],
    verificationSteps: [
      'Run type checks and relevant tests, then re-run the scan to confirm the duplicate finding is gone without changing behavior.',
      'Keep the before-and-after diff and test results. Static cleanup alone does not establish a measured energy reduction.',
    ],
    risks: [
      'Combining imports can alter side-effect order or type/value semantics if the transformation is not equivalent.',
    ],
  },
  pipeline: {
    implementationSteps: [
      'Review the workflow file and its triggers with the repository owner; confirm which runs and artifacts other jobs or releases depend on.',
      'Change one thing at a time in a branch: restore dependency and layer caches, add a concurrency group or narrow triggers, or upload only deployable outputs.',
      'Merge through the normal review process so the pipeline change is itself tested by CI.',
    ],
    verificationSteps: [
      'Compare run count, median duration and cache hit rate over equivalent periods before and after the change.',
      'Confirm required checks still run on every pull request and that releases still find the artifacts they need.',
    ],
    risks: [
      'Stale caches can hide build breakages; skipping duplicate runs can remove a required status check; trimmed artifacts can break downstream deploy or debug steps.',
    ],
  },
  generic: {
    implementationSteps: [
      'Review the recorded evidence and recommendation with the code or resource owner; confirm the issue still exists.',
      'Define the smallest safe change, the expected behavior, a comparable baseline, and a rollback plan. Treat generated code as a proposal, not an approved fix.',
      'Test in a branch or isolated environment and obtain the required approval before changing a shared or production system.',
    ],
    verificationSteps: [
      'Run the relevant functional and regression checks and repeat the analysis on the changed workload.',
      'Compare actual usage over equivalent periods and keep the evidence. Estimated opportunities are not verified savings.',
    ],
    risks: [
      'This category has no specific implementation recipe. Dependencies and operational constraints require owner review before proceeding.',
    ],
  },
};

const CATEGORY_GUIDES = new Map<string, GuideKey>([
  ['oversized-token-request', 'token-limit'],
  ['uncached-completion', 'cache'],
  ['ai-retry-storm', 'retry'],
  ['retry-storm', 'retry'],
  ['unattached-storage', 'storage'],
  ['verbose-logging', 'retention'],
  ['excessive-retention', 'retention'],
  ['redundant-recording', 'retention'],
  ['oversized-image', 'image'],
  ['over-replication', 'recovery'],
  ['idle-standby', 'recovery'],
  ['rto-rpo-mismatch', 'recovery'],
  ['high-carbon-region', 'region'],
  ['overprovisioned-compute', 'compute'],
  ['idle-compute', 'compute'],
  ['off-hours-runtime', 'compute'],
  ['prompt-overhead', 'cache'],
  ['inefficient-sizing', 'compute'],
  ['no-autoscale', 'compute'],
  ['carbon-anomaly', 'carbon-incident'],
  ['pipeline-cache-miss', 'pipeline'],
  ['redundant-pipeline-run', 'pipeline'],
  ['artifact-bloat', 'pipeline'],
  ['duplicate-import', 'imports'],
]);

const STRATEGY_GUIDES = new Map<string, GuideKey>([
  ['right-size-max-tokens', 'token-limit'],
  ['add-response-cache', 'cache'],
  ['backoff-circuit-breaker', 'retry'],
  ['deprovision-volume', 'storage'],
  ['lower-log-level-retention', 'retention'],
  ['apply-retention-policy', 'retention'],
  ['dedupe-recording', 'retention'],
  ['slim-base-image', 'image'],
  ['reduce-replicas', 'recovery'],
  ['warm-standby', 'recovery'],
  ['periodic-replication', 'recovery'],
  ['relocate-low-carbon-region', 'region'],
  ['rightsize-cpu', 'compute'],
  ['downsize-instance', 'compute'],
  ['enable-autoscale', 'compute'],
  ['investigate-and-cap', 'carbon-incident'],
  ['merge-imports', 'imports'],
]);

/** Static, reviewable guidance: never interpolate uploaded recommendations into commands. */
export function buildManualGuide(
  finding: Pick<Finding, 'category' | 'recommendationId'>,
): ManualGuide {
  // The detected category wins over a conflicting model-proposed strategy ID.
  const key =
    CATEGORY_GUIDES.get(finding.category) ??
    STRATEGY_GUIDES.get(finding.recommendationId) ??
    'generic';
  const template = TEMPLATES[key];
  return {
    implementationSteps: [...template.implementationSteps],
    verificationSteps: [
      ...template.verificationSteps,
      'Keep the before-and-after results with your change review. After a follow-up analysis is complete, refresh the dashboard to see the updated findings and verification results.',
    ],
    risks: [...template.risks],
    automaticApplyAvailable: false,
    automaticApplyReason:
      'Automatic changes are not connected to this dashboard. Follow the manual steps in your development or operations workflow; review and approval must happen there.',
  };
}
