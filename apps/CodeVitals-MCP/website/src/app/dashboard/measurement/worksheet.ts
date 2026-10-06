import {
  assessSci,
  type SciAssessment,
  type SciComponentObservation,
  type SciEvidenceKind,
  type SciHardware,
  type SciObservation,
  type SciQuantity,
} from '../../../../../../../packages/measure/src/sci';

export interface QuantityDraft {
  value: string;
  source: string;
  kind: SciEvidenceKind;
}

export type HardwareDraft = Omit<
  SciHardware,
  | 'totalEmbodiedGrams'
  | 'expectedLifetimeHours'
  | 'reservedHours'
  | 'reservedResources'
  | 'totalResources'
> & {
  totalEmbodiedGrams: QuantityDraft;
  expectedLifetimeHours: QuantityDraft;
  reservedHours: QuantityDraft;
  reservedResources: QuantityDraft;
  totalResources: QuantityDraft;
};

export type ComponentDraft = Omit<
  SciComponentObservation,
  'energyKwh' | 'pue' | 'carbonIntensityGramsPerKwh' | 'hardware'
> & {
  energyKwh: QuantityDraft;
  pue: QuantityDraft;
  carbonIntensityGramsPerKwh: QuantityDraft;
  hardware: HardwareDraft[];
};

export type ObservationDraft = Omit<SciObservation, 'components'> & {
  components: ComponentDraft[];
};

export type WorksheetDraft = Omit<SciAssessment, 'baseline' | 'after'> & {
  baseline: ObservationDraft;
  after: ObservationDraft;
};

export const emptyQuantity = (): QuantityDraft => ({ value: '', source: '', kind: 'measured' });

export function emptyHardware(id: string): HardwareDraft {
  return {
    id,
    resourceUnit: '',
    totalEmbodiedGrams: emptyQuantity(),
    expectedLifetimeHours: emptyQuantity(),
    reservedHours: emptyQuantity(),
    reservedResources: emptyQuantity(),
    totalResources: emptyQuantity(),
  };
}

export function emptyObservation(label: string): ObservationDraft {
  return {
    label,
    period: { start: '', end: '' },
    workloadId: '',
    attemptedTasks: null,
    successfulTasks: null,
    qualityPassed: null,
    qualityEvidence: '',
    energyCoverageConfirmed: false,
    components: [
      {
        componentId: 'system',
        evidence: '',
        energyKwh: emptyQuantity(),
        pue: emptyQuantity(),
        region: '',
        carbonIntensityGramsPerKwh: emptyQuantity(),
        hardware: [],
      },
    ],
  };
}

export function createEmptyWorksheet(): WorksheetDraft {
  return {
    schemaVersion: 1,
    methodology: {
      boundary: {
        id: '',
        description: '',
        assessed: false,
        assessmentEvidence: '',
        exclusions: [],
      },
      functionalUnit: '',
      workloadId: '',
      qualityCriterion: '',
      assumptions: [],
      components: [
        {
          id: 'system',
          name: '',
          method: '',
          energyBasis: 'facility',
          gridIntensityMethod: 'location-average',
        },
      ],
    },
    baseline: emptyObservation('Baseline'),
    after: emptyObservation('After change'),
  };
}

function quantityDraft(quantity: SciQuantity | null): QuantityDraft {
  return quantity ? { ...quantity, value: String(quantity.value) } : emptyQuantity();
}

function observationDraft(observation: SciObservation): ObservationDraft {
  return {
    ...observation,
    components: observation.components.map((component) => ({
      ...component,
      energyKwh: quantityDraft(component.energyKwh),
      pue: quantityDraft(component.pue),
      carbonIntensityGramsPerKwh: quantityDraft(component.carbonIntensityGramsPerKwh),
      hardware: (component.hardware ?? []).map((hardware) => ({
        ...hardware,
        totalEmbodiedGrams: quantityDraft(hardware.totalEmbodiedGrams),
        expectedLifetimeHours: quantityDraft(hardware.expectedLifetimeHours),
        reservedHours: quantityDraft(hardware.reservedHours),
        reservedResources: quantityDraft(hardware.reservedResources),
        totalResources: quantityDraft(hardware.totalResources),
      })),
    })),
  };
}

export function worksheetFromAssessment(assessment: SciAssessment): WorksheetDraft {
  return {
    ...structuredClone(assessment),
    baseline: observationDraft(assessment.baseline),
    after: assessment.after ? observationDraft(assessment.after) : emptyObservation('After change'),
  };
}

function quantityInput(quantity: QuantityDraft): SciQuantity | null {
  if (quantity.value.trim() === '') return null;
  return { value: Number(quantity.value), source: quantity.source, kind: quantity.kind };
}

export function assessmentFromWorksheet(draft: WorksheetDraft): SciAssessment {
  function observationInput(observation: ObservationDraft): SciObservation {
    return {
      ...observation,
      components: observation.components.map((component) => ({
        ...component,
        energyKwh: quantityInput(component.energyKwh),
        pue:
          draft.methodology.components.find((method) => method.id === component.componentId)
            ?.energyBasis === 'it'
            ? quantityInput(component.pue)
            : null,
        carbonIntensityGramsPerKwh: quantityInput(component.carbonIntensityGramsPerKwh),
        hardware:
          component.hardware.length === 0
            ? null
            : component.hardware.map((hardware) => ({
                ...hardware,
                totalEmbodiedGrams: quantityInput(hardware.totalEmbodiedGrams),
                expectedLifetimeHours: quantityInput(hardware.expectedLifetimeHours),
                reservedHours: quantityInput(hardware.reservedHours),
                reservedResources: quantityInput(hardware.reservedResources),
                totalResources: quantityInput(hardware.totalResources),
              })),
      })),
    };
  }
  return {
    schemaVersion: 1,
    methodology: {
      ...structuredClone(draft.methodology),
      assumptions: draft.methodology.assumptions.map((value) => value.trim()).filter(Boolean),
    },
    baseline: observationInput(draft.baseline),
    after: observationInput(draft.after),
  };
}

/** Recompute at export time; never export a previously cached score. */
export function createWorksheetReport(draft: WorksheetDraft, syntheticExample: boolean) {
  const inputs = assessmentFromWorksheet(draft);
  const assessment = assessSci(inputs);
  return {
    reportType: 'GreenOps SCI assessment worksheet',
    syntheticExample:
      syntheticExample || assessment.baseline.synthetic || (assessment.after?.synthetic ?? false),
    loadedSyntheticPreset: syntheticExample,
    disclosure:
      'User-entered evidence; not independently verified or certified. Separate from live ledger results.',
    worksheetDraft: structuredClone(draft),
    inputs,
    assessment,
  };
}
