import type { SustainabilityBug } from '@greenops/detect';
import type {
  Reasoner,
  Investigation,
  Approver,
  ApprovalDecision,
  FixStrategy,
} from './contracts.js';

/**
 * OfflineReasoner: a deterministic, zero-token Investigate+Compare implementation.
 *
 * It maps each bug category to a small catalog of known fix strategies with
 * defensible reduction factors, picks the best trade-off (highest reduction that
 * is reversible and low-effort), and explains why. Because it uses no LLM, a judge
 * can run the entire loop offline with no API key — and GreenOps' self-cost for
 * these runs is honestly reported as (near) zero tokens.
 *
 * A real LLM reasoner implementing the same Reasoner interface can be swapped in
 * for a richer demo; the loop code does not change.
 */
export class OfflineReasoner implements Reasoner {
  public readonly name = 'offline-rule-reasoner';
  public readonly usesModel = false;

  public async investigate(bug: SustainabilityBug, _codeSnippet?: string): Promise<Investigation> {
    const strategies = STRATEGY_CATALOG[bug.category] ?? [];
    // Recommend the reversible, lowest-effort strategy with the highest reduction.
    const ranked = [...strategies].sort((a, b) => {
      if (a.reversible !== b.reversible) return a.reversible ? -1 : 1;
      return b.expectedReductionFactor - a.expectedReductionFactor;
    });
    const recommended = ranked[0];
    return {
      rootCause: ROOT_CAUSE[bug.category] ?? 'Unclassified inefficiency.',
      strategies,
      recommendedStrategyId: recommended?.id ?? 'none',
      reasoning: recommended
        ? bug.category === 'oversized-token-request'
          ? `Recommended '${recommended.title}': review representative output lengths and validate quality before changing the limit. ` +
            'Savings are unquantified; unused output allowance is not consumed tokens or evidence of reserved compute.'
          : `Recommended '${recommended.title}': reversible=${recommended.reversible}, effort=${recommended.effort}, ` +
            `expected to remove ~${Math.round(recommended.expectedReductionFactor * 100)}% of the measured waste.`
        : 'No known safe fix strategy for this category; escalate for manual review.',
      tokensUsed: 0,
      analysis: { provider: 'offline', status: 'offline', tokensUsed: 0, requestAttempted: false },
    };
  }
}

const ROOT_CAUSE: Record<string, string> = {
  'dead-code':
    'Code was added and later orphaned when its callers were removed, but never deleted.',
  'duplicate-import':
    'Separate edits each added an import of the same module without noticing the existing one.',
  'redundant-call':
    'The same computation/request is repeated in a hot path with no memoization or cache.',
  'oversized-dependency': 'A heavy dependency is pulled in for a small slice of its functionality.',
  'retry-storm': 'A failing operation is retried without backoff or a circuit breaker.',
  // AI Efficiency
  'uncached-completion':
    'Identical prompts are sent repeatedly with no response cache in front of the model.',
  'oversized-token-request':
    'max_tokens is above the observed completion length. This is unused output allowance, not measured token consumption or reserved compute.',
  'ai-retry-storm':
    'A failing model call is retried without backoff, re-billing the full prompt each attempt.',
  'prompt-overhead':
    'Large shared context is resent with every request instead of being cached or retrieved selectively.',
  'model-tier-mismatch':
    'A large general-purpose model was chosen once and reused for short tasks a small model handles.',
  // Digital Waste
  'idle-compute':
    'A non-production resource was left running after the work that needed it finished.',
  'off-hours-runtime':
    'A resource used only during working hours has no shutdown schedule, so it runs all night and weekend.',
  // Pipeline Efficiency
  'pipeline-cache-miss':
    'Dependency and Docker layer caches are not restored, so every run rebuilds from scratch.',
  'redundant-pipeline-run':
    'Overlapping push and pull_request triggers build the same commit more than once.',
  'artifact-bloat':
    'The pipeline uploads its whole workspace instead of only the deployable outputs.',
  'overprovisioned-compute':
    'CPU requests were set high "to be safe" and never right-sized to real utilisation.',
  'unattached-storage': 'A volume outlived the workload it backed and was never de-provisioned.',
  'oversized-image':
    'A full base image was used where a slim variant carries everything the app needs.',
  'verbose-logging':
    'Debug-level logging and long retention were left on after the incident that needed them.',
  // Carbon Incident
  'carbon-anomaly': 'A job or misconfiguration drives energy draw far above the normal baseline.',
  // Architecture
  'no-autoscale':
    'Fixed capacity was provisioned instead of an autoscaler, so idle hours still draw full power.',
  'high-carbon-region':
    'The workload was placed in a convenient region without considering its grid carbon intensity.',
  'inefficient-sizing': 'The instance was sized well above the declared workload requirement.',
  // DR
  'over-replication': 'More replicas were configured than the service criticality/RPO warrants.',
  'idle-standby':
    'A hot standby is kept always-on where a warm/cold standby meets the recovery target.',
  'rto-rpo-mismatch':
    'Continuous replication runs for a workload whose RPO tolerates periodic snapshots.',
  // Collaboration
  'redundant-recording': 'A full-size duplicate recording is retained alongside the original.',
  'excessive-retention': 'Media is retained far beyond the period anyone actually accesses it.',
};

const STRATEGY_CATALOG: Record<string, FixStrategy[]> = {
  'dead-code': [
    {
      id: 'delete-dead-code',
      title: 'Delete the unused symbol',
      description:
        'Remove the orphaned function/method/class so it is no longer parsed, bundled or maintained.',
      expectedReductionFactor: 1.0,
      effort: 'trivial',
      reversible: true,
    },
    {
      id: 'deprecate-dead-code',
      title: 'Mark deprecated, delete next release',
      description:
        'Annotate as deprecated and schedule deletion, in case an external caller exists off-repo.',
      expectedReductionFactor: 0.0,
      effort: 'trivial',
      reversible: true,
    },
  ],
  'duplicate-import': [
    {
      id: 'merge-imports',
      title: 'Merge duplicate imports into one',
      description: 'Collapse the repeated import statements for the module into a single import.',
      expectedReductionFactor: 1.0,
      effort: 'trivial',
      reversible: true,
    },
  ],
  'redundant-call': [
    {
      id: 'memoize',
      title: 'Memoize / cache the repeated call',
      description:
        'Wrap the repeated call in a memoization or request cache so identical calls return a cached result.',
      expectedReductionFactor: 0.8,
      effort: 'small',
      reversible: true,
    },
    {
      id: 'hoist-call',
      title: 'Hoist the call out of the repeated path',
      description:
        'Compute once and reuse the value where the call is invariant across iterations.',
      expectedReductionFactor: 0.9,
      effort: 'small',
      reversible: true,
    },
  ],
  // ---- AI Efficiency ----
  'uncached-completion': [
    {
      id: 'add-response-cache',
      title: 'Add a prompt/response cache',
      description:
        'Cache completions keyed by prompt so identical prompts are served without re-inference.',
      expectedReductionFactor: 0.9,
      effort: 'small',
      reversible: true,
    },
  ],
  'oversized-token-request': [
    {
      id: 'right-size-max-tokens',
      title: 'Review output limits against representative completion lengths',
      description:
        'Use representative output-length distributions and a safety margin, then check answer quality and truncation before lowering the limit. Measure usage or allocation changes separately; savings are not quantified from headroom alone.',
      expectedReductionFactor: 0,
      effort: 'trivial',
      reversible: true,
    },
  ],
  'ai-retry-storm': [
    {
      id: 'backoff-circuit-breaker',
      title: 'Add exponential backoff + circuit breaker',
      description:
        'Stop blind retries; back off and fail fast so a broken call does not re-bill the full prompt repeatedly.',
      expectedReductionFactor: 0.8,
      effort: 'small',
      reversible: true,
    },
  ],
  'prompt-overhead': [
    {
      id: 'compress-context',
      title: 'Cache or trim repeated prompt context',
      description:
        'Use provider prompt caching or retrieve only the relevant context, so shared instructions are not resent in full.',
      expectedReductionFactor: 0.5,
      effort: 'small',
      reversible: true,
    },
  ],
  'model-tier-mismatch': [
    {
      id: 'route-small-model',
      title: 'Route short tasks to a small model',
      description:
        'Send classification-style calls to a small model after checking accuracy on a labeled sample; keep the large model as fallback.',
      expectedReductionFactor: 0.8,
      effort: 'small',
      reversible: true,
    },
  ],
  // ---- Digital Waste ----
  'idle-compute': [
    {
      id: 'deallocate-idle',
      title: 'Deallocate the idle resource',
      description:
        'Stop and deallocate the resource after confirming with its owner; keep the disk or configuration so it can be restarted.',
      expectedReductionFactor: 1.0,
      effort: 'trivial',
      reversible: true,
    },
  ],
  'off-hours-runtime': [
    {
      id: 'auto-shutdown-schedule',
      title: 'Add an auto-shutdown schedule',
      description: 'Stop the resource outside business hours and start it on weekday mornings.',
      expectedReductionFactor: 1.0,
      effort: 'trivial',
      reversible: true,
    },
  ],
  // ---- Pipeline Efficiency ----
  'pipeline-cache-miss': [
    {
      id: 'restore-build-caches',
      title: 'Restore dependency and Docker layer caches',
      description:
        'Key the dependency cache on the lockfile and enable remote Docker layer caching so unchanged layers are reused.',
      expectedReductionFactor: 0.6,
      effort: 'small',
      reversible: true,
    },
  ],
  'redundant-pipeline-run': [
    {
      id: 'dedupe-triggers',
      title: 'Deduplicate pipeline triggers',
      description:
        'Run on pull_request only (or use concurrency groups) so a commit is not built twice.',
      expectedReductionFactor: 0.9,
      effort: 'trivial',
      reversible: true,
    },
  ],
  'artifact-bloat': [
    {
      id: 'trim-artifacts',
      title: 'Upload only deployable artifacts',
      description:
        'Restrict artifact paths to build outputs and shorten retention for intermediate files.',
      expectedReductionFactor: 0.8,
      effort: 'trivial',
      reversible: true,
    },
  ],
  'overprovisioned-compute': [
    {
      id: 'rightsize-cpu',
      title: 'Right-size CPU requests to utilisation',
      description:
        'Lower the CPU request to a headroom margin above real usage, freeing reserved idle cores.',
      expectedReductionFactor: 0.7,
      effort: 'moderate',
      reversible: true,
    },
  ],
  'unattached-storage': [
    {
      id: 'deprovision-volume',
      title: 'Snapshot then de-provision the unattached volume',
      description:
        'Take a safety snapshot, then release the volume so it no longer draws storage energy.',
      expectedReductionFactor: 1.0,
      effort: 'moderate',
      reversible: true,
    },
  ],
  'oversized-image': [
    {
      id: 'slim-base-image',
      title: 'Rebuild on a slim base image',
      description:
        'Switch to a minimal base and multi-stage build so the stored/replicated/pulled image is far smaller.',
      expectedReductionFactor: 0.6,
      effort: 'moderate',
      reversible: true,
    },
  ],
  'verbose-logging': [
    {
      id: 'lower-log-level-retention',
      title: 'Lower log level and retention',
      description: 'Drop from debug to info and shorten retention to what is actually queried.',
      expectedReductionFactor: 0.7,
      effort: 'trivial',
      reversible: true,
    },
  ],
  // ---- Carbon Incident ----
  'carbon-anomaly': [
    {
      id: 'investigate-and-cap',
      title: 'Investigate the spike and cap the runaway job',
      description:
        'Trace the interval to its job and apply a resource cap / fix so the excess draw does not recur.',
      expectedReductionFactor: 0.9,
      effort: 'moderate',
      reversible: true,
    },
  ],
  // ---- Architecture ----
  'no-autoscale': [
    {
      id: 'enable-autoscale',
      title: 'Enable autoscaling',
      description:
        'Add an autoscaler so idle capacity scales in off-peak instead of drawing full power continuously.',
      expectedReductionFactor: 0.5,
      effort: 'moderate',
      reversible: true,
    },
  ],
  'high-carbon-region': [
    {
      id: 'relocate-low-carbon-region',
      title: 'Relocate to a low-carbon region',
      description:
        'Move the workload to a region with lower grid carbon intensity — same energy, far less carbon.',
      expectedReductionFactor: 0.7,
      effort: 'moderate',
      reversible: false,
    },
  ],
  'inefficient-sizing': [
    {
      id: 'downsize-instance',
      title: 'Downsize the instance to the workload need',
      description:
        'Pick an instance sized to the declared requirement so excess cores are not powered continuously.',
      expectedReductionFactor: 0.7,
      effort: 'moderate',
      reversible: true,
    },
  ],
  // ---- DR ----
  'over-replication': [
    {
      id: 'reduce-replicas',
      title: 'Reduce replicas to the justified count',
      description:
        'Lower replica count to what the criticality/RPO warrants, cutting always-on replica compute.',
      expectedReductionFactor: 0.6,
      effort: 'moderate',
      reversible: true,
    },
  ],
  'idle-standby': [
    {
      id: 'warm-standby',
      title: 'Switch hot standby to warm/cold',
      description:
        'Downgrade the standby tier so idle cores spin down between failovers while still meeting recovery.',
      expectedReductionFactor: 0.8,
      effort: 'moderate',
      reversible: true,
    },
  ],
  'rto-rpo-mismatch': [
    {
      id: 'periodic-replication',
      title: 'Switch to periodic replication at the RPO cadence',
      description:
        'Replace continuous replication with snapshots at the RPO interval, cutting always-on replication work.',
      expectedReductionFactor: 0.5,
      effort: 'moderate',
      reversible: true,
    },
  ],
  // ---- Collaboration ----
  'redundant-recording': [
    {
      id: 'dedupe-recording',
      title: 'Delete the duplicate recording',
      description:
        'Remove the full-size duplicate; the original (and transcript) already preserve the content.',
      expectedReductionFactor: 1.0,
      effort: 'trivial',
      reversible: true,
    },
  ],
  'excessive-retention': [
    {
      id: 'apply-retention-policy',
      title: 'Apply the standard retention policy',
      description:
        'Age the media out at the target retention so rarely-accessed recordings stop drawing storage energy.',
      expectedReductionFactor: 0.8,
      effort: 'trivial',
      reversible: true,
    },
  ],
};

/**
 * PolicyApprover: the human-oversight guardrail with an explicit, logged policy.
 * Withholds by default. Automatic approval requires explicit repository opt-in
 * and is still limited to trivial, reversible fixes.
 */
export class PolicyApprover implements Approver {
  public readonly name = 'policy-approver';

  constructor(
    private readonly policy: {
      enabled?: boolean;
      autoApply?: boolean;
      requireApproval?: boolean;
    } = {},
  ) {}

  public async decide(
    _bug: SustainabilityBug,
    investigation: Investigation,
  ): Promise<ApprovalDecision> {
    if (
      this.policy.enabled === false ||
      this.policy.requireApproval !== false ||
      this.policy.autoApply !== true
    ) {
      return {
        approved: false,
        approver: this.name,
        reason:
          this.policy.enabled === false
            ? 'Repository policy disables fixes.'
            : 'Withheld: explicit human approval is required or automatic application is disabled.',
      };
    }
    const rec = investigation.strategies.find((s) => s.id === investigation.recommendedStrategyId);
    const safe =
      !!rec && rec.reversible && rec.effort === 'trivial' && rec.expectedReductionFactor > 0;
    return {
      approved: safe,
      approver: this.name,
      reason: safe
        ? `Auto-approved: '${rec?.title}' is trivial and reversible (policy allows).`
        : `Withheld for human review: recommended fix is not both trivial and reversible, or has no effect.`,
    };
  }
}
