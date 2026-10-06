import {
  assessSci,
  type SciAssessment,
  type SciAssessmentResult,
  type SciObservation,
} from '../../../../../../../packages/measure/src/sci';
import type { DemoReplay, DemoRun } from './demo-types';

export interface DemoCarbonAssessment {
  input: SciAssessment;
  result: SciAssessmentResult;
}

/** Usage and quality are evidence, but neither token counts nor elapsed time measure electricity. */
export function assessDemoCarbon(run: DemoRun): DemoCarbonAssessment {
  const workloadId = `${run.datasetHash}:${run.mode}:${run.model}`;
  function observation(replay: DemoReplay | undefined, after: boolean): SciObservation {
    const events = run.activity.filter(
      (item) => item.stage === (after ? 'verification' : 'baseline'),
    );
    return {
      label: after ? 'After exact-match caching' : 'Before caching',
      period: {
        start: events[0]?.at ?? run.createdAt,
        end: events.at(-1)?.at ?? run.updatedAt,
      },
      workloadId,
      attemptedTasks: replay ? replay.modelCalls + replay.cacheHits : null,
      successfulTasks: replay ? replay.results.filter((item) => item.correct).length : null,
      qualityPassed: replay
        ? replay.qualityPassed &&
          replay.results.length === replay.requests &&
          (!after || run.verification?.outputsEquivalent === true)
        : null,
      qualityEvidence: replay
        ? `${run.mode === 'fixture' ? 'Synthetic fixture' : 'Live model on synthetic inputs'}; ${replay.results.filter((item) => item.correct).length}/${replay.requests} expected-answer checks passed. See exported per-request results. This narrow check does not establish production quality.`
        : '',
      energyCoverageConfirmed: false,
      components: [
        {
          componentId: 'workload-system',
          evidence:
            'Request, token and quality evidence only; electricity and hardware allocation are not instrumented.',
          energyKwh: null,
          pue: null,
          region: '',
          carbonIntensityGramsPerKwh: null,
          hardware: null,
        },
      ],
    };
  }
  const input: SciAssessment = {
    schemaVersion: 1,
    methodology: {
      workloadKind: 'synthetic',
      boundary: {
        id: 'ai-efficiency-replay-v1',
        description:
          'One FAQ workload replay including inference, local cache and application, networking, and their allocated supporting infrastructure and hardware.',
        assessed: false,
        assessmentEvidence:
          'Required boundary identified, but supporting systems and reserved resources have not been quantified.',
        exclusions: [
          {
            component: 'Benchmark setup, recommendation and verification overhead',
            reason:
              'Tracked separately as agent overhead; no net system-benefit claim. Allocation to the functional unit needs assessment.',
            significance: 'unknown',
            evidence: 'Recorded provider-call/token counters do not establish energy significance.',
          },
        ],
      },
      functionalUnit:
        'One successfully completed FAQ request meeting the same expected-answer and privacy checks',
      workloadId,
      qualityCriterion:
        'All eight expected answers correct, private requests isolated, and baseline/replay outputs equivalent',
      assumptions: [
        'No token-to-electricity conversion or wall-clock-to-CPU conversion is used.',
        'The model location, location-based grid factor, and allocated embodied hardware emissions are unavailable.',
        'Fixture units are synthetic. Neither fixture nor live token usage establishes a carbon score.',
      ],
      components: [
        {
          id: 'workload-system',
          name: 'Complete replay system',
          method:
            'Pending facility-inclusive energy measurement or documented model and hardware allocation for the entire boundary.',
          energyBasis: 'facility',
          gridIntensityMethod: 'location-average',
        },
      ],
    },
    baseline: observation(run.baseline, false),
    after: run.verification ? observation(run.verification.after, true) : null,
  };
  return { input, result: assessSci(input) };
}
