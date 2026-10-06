/** SCI-based calculations, not certification or a corporate emissions inventory. */
export const SCI_SPEC_URL = 'https://sci.greensoftware.foundation/';
export const SCI_SCHEMA_VERSION = 1;

export type SciEvidenceKind = 'measured' | 'modeled' | 'synthetic';

export interface SciQuantity {
  value: number;
  /** A meter/export, published factor, documented model, or explicit synthetic source. */
  source: string;
  kind: SciEvidenceKind;
}

export interface SciComponentMethod {
  id: string;
  name: string;
  /** Reproducible measurement/model and allocation method, shared by both observations. */
  method: string;
  /** Facility energy already includes cooling and must not be multiplied by PUE again. */
  energyBasis: 'it' | 'facility';
  gridIntensityMethod:
    'location-average' | 'location-short-run-marginal' | 'location-long-run-marginal';
}

export interface SciMethodology {
  /** A live model can still be evaluating synthetic task inputs. */
  workloadKind?: 'synthetic' | 'observed';
  boundary: {
    id: string;
    description: string;
    /** Includes reserved/idle resources and supporting infrastructure, not only active compute. */
    assessed: boolean;
    assessmentEvidence: string;
    exclusions: Array<{
      component: string;
      reason: string;
      significance: 'negligible' | 'significant' | 'unknown';
      evidence: string;
    }>;
  };
  functionalUnit: string;
  workloadId: string;
  qualityCriterion: string;
  /** Baseline and after use exactly these same methods and assumptions. */
  assumptions: string[];
  components: SciComponentMethod[];
}

export interface SciHardware {
  id: string;
  /** Allocation is TE * (reserved hours / lifetime hours) * (reserved resources / total resources). */
  totalEmbodiedGrams: SciQuantity | null;
  expectedLifetimeHours: SciQuantity | null;
  reservedHours: SciQuantity | null;
  reservedResources: SciQuantity | null;
  totalResources: SciQuantity | null;
  resourceUnit: string;
}

export interface SciComponentObservation {
  componentId: string;
  evidence: string;
  energyKwh: SciQuantity | null;
  /** Required for IT energy; must be null for facility-inclusive energy. */
  pue: SciQuantity | null;
  region: string;
  carbonIntensityGramsPerKwh: SciQuantity | null;
  /** All allocated hardware, or null when unavailable. Empty does not mean zero. */
  hardware: SciHardware[] | null;
}

export interface SciObservation {
  label: string;
  period: { start: string; end: string };
  /** Both observations must reference the shared workload, including input/version identity. */
  workloadId: string;
  attemptedTasks: number | null;
  successfulTasks: number | null;
  qualityPassed: boolean | null;
  qualityEvidence: string;
  /** Affirm that energy covers all attempts and provisioned/idle resources in this period. */
  energyCoverageConfirmed: boolean;
  components: SciComponentObservation[];
}

export interface SciAssessment {
  schemaVersion: 1;
  methodology: SciMethodology;
  baseline: SciObservation;
  after: SciObservation | null;
}

export interface SciIssue {
  code: string;
  path: string;
  message: string;
  severity: 'missing' | 'invalid';
}

export interface SciComponentResult {
  componentId: string;
  facilityEnergyKwh: number | null;
  operationalGrams: number | null;
  embodiedGrams: number | null;
}

export interface SciResult {
  status: 'complete' | 'incomplete' | 'invalid';
  synthetic: boolean;
  evidenceKinds: SciEvidenceKind[];
  successfulTasks: number | null;
  facilityEnergyKwh: number | null;
  operationalGrams: number | null;
  embodiedGrams: number | null;
  totalGrams: number | null;
  /** Partial operational estimate only; never a complete SCI score. */
  operationalGramsPerUnit: number | null;
  sciGramsPerUnit: number | null;
  components: SciComponentResult[];
  issues: SciIssue[];
}

export interface SciAssessmentResult {
  schemaVersion: 1;
  standard: 'SCI-based calculation';
  specificationUrl: string;
  disclaimer: string;
  baseline: SciResult;
  after: SciResult | null;
  comparison: {
    status: 'comparable' | 'not-comparable';
    /** Positive means reduction; negative means increased intensity. No offsets are subtracted. */
    reductionGramsPerUnit: number | null;
    reductionPercent: number | null;
    synthetic: boolean;
    issues: SciIssue[];
  };
}

type UnknownRecord = Record<string, unknown>;
const record = (value: unknown): UnknownRecord =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as UnknownRecord)
    : {};

function issue(
  issues: SciIssue[],
  code: string,
  path: string,
  message: string,
  severity: SciIssue['severity'] = 'missing',
): void {
  issues.push({ code, path, message, severity });
}

function requiredText(value: unknown, path: string, issues: SciIssue[]): string {
  if (typeof value === 'string' && value.trim()) return value.trim();
  issue(
    issues,
    'missing-description',
    path,
    'Provide a non-empty description or evidence reference.',
    value == null || value === '' ? 'missing' : 'invalid',
  );
  return '';
}

function list(value: unknown, path: string, issues: SciIssue[]): unknown[] {
  if (Array.isArray(value)) return value;
  issue(
    issues,
    'missing-list',
    path,
    'Provide a list; use an empty list only when there are no entries.',
    value == null ? 'missing' : 'invalid',
  );
  return [];
}

function finiteValue(
  value: unknown,
  path: string,
  issues: SciIssue[],
  positive = false,
): number | null {
  if (value == null) {
    issue(issues, 'missing-value', path, 'This value is unknown; it is not assumed to be zero.');
    return null;
  }
  if (
    typeof value !== 'number' ||
    !Number.isFinite(value) ||
    value < 0 ||
    (positive && value === 0)
  ) {
    issue(
      issues,
      'invalid-value',
      path,
      positive
        ? 'Enter a finite number greater than zero.'
        : 'Enter a finite, non-negative number.',
      'invalid',
    );
    return null;
  }
  return value;
}

function quantity(
  value: unknown,
  path: string,
  issues: SciIssue[],
  kinds: Set<SciEvidenceKind>,
  positive = false,
): number | null {
  if (value == null) {
    issue(
      issues,
      'missing-quantity',
      path,
      'A sourced quantity is unavailable; it is not assumed to be zero.',
    );
    return null;
  }
  const q = record(value);
  const result = finiteValue(q.value, `${path}.value`, issues, positive);
  const source = requiredText(q.source, `${path}.source`, issues);
  const kind = q.kind;
  if (kind !== 'measured' && kind !== 'modeled' && kind !== 'synthetic') {
    issue(
      issues,
      'invalid-evidence-kind',
      `${path}.kind`,
      'Label the input measured, modeled, or synthetic.',
      'invalid',
    );
    return null;
  }
  kinds.add(kind);
  return source ? result : null;
}

function validateMethodology(value: unknown, issues: SciIssue[]): SciMethodology {
  const m = record(value);
  if (
    m.workloadKind !== undefined &&
    m.workloadKind !== 'synthetic' &&
    m.workloadKind !== 'observed'
  )
    issue(
      issues,
      'invalid-workload-kind',
      'methodology.workloadKind',
      'Identify the workload as synthetic or observed.',
      'invalid',
    );
  const b = record(m.boundary);
  const boundary = {
    id: requiredText(b.id, 'methodology.boundary.id', issues),
    description: requiredText(b.description, 'methodology.boundary.description', issues),
    assessed: b.assessed === true,
    assessmentEvidence: requiredText(
      b.assessmentEvidence,
      'methodology.boundary.assessmentEvidence',
      issues,
    ),
    exclusions: [] as SciMethodology['boundary']['exclusions'],
  };
  if (!boundary.assessed)
    issue(
      issues,
      'boundary-unassessed',
      'methodology.boundary.assessed',
      'Assess all significant supporting infrastructure, reserved resources and downstream effects.',
    );
  for (const [i, entry] of list(
    b.exclusions,
    'methodology.boundary.exclusions',
    issues,
  ).entries()) {
    const e = record(entry);
    const path = `methodology.boundary.exclusions[${i}]`;
    const component = requiredText(e.component, `${path}.component`, issues);
    const reason = requiredText(e.reason, `${path}.reason`, issues);
    const evidence = requiredText(e.evidence, `${path}.evidence`, issues);
    let significance: 'negligible' | 'significant' | 'unknown' = 'unknown';
    if (
      e.significance === 'negligible' ||
      e.significance === 'significant' ||
      e.significance === 'unknown'
    )
      significance = e.significance;
    else
      issue(
        issues,
        'invalid-significance',
        `${path}.significance`,
        'Classify the exclusion as negligible, significant, or unknown.',
        'invalid',
      );
    if (significance !== 'negligible')
      issue(
        issues,
        'boundary-exclusion',
        path,
        `The excluded component ${component || i + 1} is significant or unassessed; include or assess it before reporting a complete calculation.`,
      );
    boundary.exclusions.push({ component, reason, significance, evidence });
  }
  const components: SciComponentMethod[] = [];
  const seen = new Set<string>();
  for (const [i, entry] of list(m.components, 'methodology.components', issues).entries()) {
    const c = record(entry);
    const path = `methodology.components[${i}]`;
    const id = requiredText(c.id, `${path}.id`, issues);
    if (seen.has(id))
      issue(
        issues,
        'duplicate-component',
        `${path}.id`,
        'Each boundary component must have a unique ID to prevent double counting.',
        'invalid',
      );
    seen.add(id);
    if (c.energyBasis !== 'it' && c.energyBasis !== 'facility')
      issue(
        issues,
        'invalid-energy-basis',
        `${path}.energyBasis`,
        'Specify IT-only energy or facility-inclusive energy.',
        'invalid',
      );
    const allowed = [
      'location-average',
      'location-short-run-marginal',
      'location-long-run-marginal',
    ];
    if (!allowed.includes(c.gridIntensityMethod as string))
      issue(
        issues,
        'invalid-grid-method',
        `${path}.gridIntensityMethod`,
        'Use a region-specific location-based grid factor. Market-based credits and offsets are excluded.',
        'invalid',
      );
    components.push({
      id,
      name: requiredText(c.name, `${path}.name`, issues),
      method: requiredText(c.method, `${path}.method`, issues),
      energyBasis: c.energyBasis === 'it' ? 'it' : 'facility',
      gridIntensityMethod: c.gridIntensityMethod as SciComponentMethod['gridIntensityMethod'],
    });
  }
  if (!components.length)
    issue(
      issues,
      'empty-boundary',
      'methodology.components',
      'Include at least one component. An aggregate component must describe every system covered and avoid overlap.',
    );
  const assumptions = list(m.assumptions, 'methodology.assumptions', issues).map((a, i) =>
    requiredText(a, `methodology.assumptions[${i}]`, issues),
  );
  if (!assumptions.length)
    issue(
      issues,
      'missing-assumptions',
      'methodology.assumptions',
      'Document the shared assumptions, including allocation and any aggregate-component coverage.',
    );
  return {
    ...(m.workloadKind === 'synthetic' || m.workloadKind === 'observed'
      ? { workloadKind: m.workloadKind }
      : {}),
    boundary,
    components,
    assumptions,
    functionalUnit: requiredText(m.functionalUnit, 'methodology.functionalUnit', issues),
    workloadId: requiredText(m.workloadId, 'methodology.workloadId', issues),
    qualityCriterion: requiredText(m.qualityCriterion, 'methodology.qualityCriterion', issues),
  };
}

function hardwareEmissions(
  value: unknown,
  path: string,
  periodHours: number | null,
  issues: SciIssue[],
  kinds: Set<SciEvidenceKind>,
): number | null {
  if (!Array.isArray(value) || value.length === 0) {
    issue(
      issues,
      'missing-hardware',
      path,
      'Provide embodied emissions and allocation for all hardware in this component; missing hardware is not zero.',
      value != null && !Array.isArray(value) ? 'invalid' : 'missing',
    );
    return null;
  }
  const seen = new Set<string>();
  const amounts: Array<number | null> = [];
  for (const [i, entry] of value.entries()) {
    const h = record(entry);
    const p = `${path}[${i}]`;
    const startIssues = issues.length;
    const id = requiredText(h.id, `${p}.id`, issues);
    if (seen.has(id))
      issue(
        issues,
        'duplicate-hardware',
        `${p}.id`,
        'Do not allocate the same hardware twice within a component.',
        'invalid',
      );
    seen.add(id);
    requiredText(h.resourceUnit, `${p}.resourceUnit`, issues);
    const embodied = quantity(h.totalEmbodiedGrams, `${p}.totalEmbodiedGrams`, issues, kinds);
    const lifetime = quantity(
      h.expectedLifetimeHours,
      `${p}.expectedLifetimeHours`,
      issues,
      kinds,
      true,
    );
    const reserved = quantity(h.reservedHours, `${p}.reservedHours`, issues, kinds);
    const resources = quantity(h.reservedResources, `${p}.reservedResources`, issues, kinds);
    const totalResources = quantity(h.totalResources, `${p}.totalResources`, issues, kinds, true);
    if (reserved !== null && lifetime !== null && reserved > lifetime)
      issue(
        issues,
        'invalid-time-share',
        p,
        'Reserved hours cannot exceed the expected hardware lifetime.',
        'invalid',
      );
    if (reserved !== null && periodHours !== null && reserved > periodHours + 1e-9)
      issue(
        issues,
        'period-mismatch',
        p,
        'Reserved hours must fall within this observation period; use separate entries for distinct devices.',
        'invalid',
      );
    if (resources !== null && totalResources !== null && resources > totalResources)
      issue(
        issues,
        'invalid-resource-share',
        p,
        'Reserved resources cannot exceed the total available resources.',
        'invalid',
      );
    if (
      issues.length !== startIssues ||
      embodied === null ||
      lifetime === null ||
      reserved === null ||
      resources === null ||
      totalResources === null
    )
      amounts.push(null);
    else amounts.push(embodied * (reserved / lifetime) * (resources / totalResources));
  }
  return completeSum(amounts);
}

function completeSum(values: Array<number | null>): number | null {
  if (!values.length || values.some((value) => value === null)) return null;
  return (values as number[]).reduce((sum, value) => sum + value, 0);
}

function validTimestamp(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const fields =
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?(?:Z|([+-])(\d{2}):(\d{2}))$/.exec(
      value,
    );
  if (!fields) return false;
  const [, year, month, day, hours, minutes, seconds, , offsetHours, offsetMinutes] = fields;
  const y = Number(year);
  const m = Number(month);
  const leap = y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return (
    m >= 1 &&
    m <= 12 &&
    Number(day) >= 1 &&
    Number(day) <= (days[m - 1] ?? 0) &&
    Number(hours) < 24 &&
    Number(minutes) < 60 &&
    Number(seconds ?? 0) < 60 &&
    Number(offsetHours ?? 0) <= 14 &&
    Number(offsetMinutes ?? 0) < 60 &&
    !(Number(offsetHours ?? 0) === 14 && Number(offsetMinutes ?? 0) > 0) &&
    Number.isFinite(Date.parse(value))
  );
}

/** Shared physical devices may be apportioned, but not allocated beyond their available core-hours. */
function validateSharedHardware(
  components: unknown[],
  periodHours: number | null,
  prefix: string,
  issues: SciIssue[],
): void {
  const devices = new Map<string, { factors: UnknownRecord; shares: number }>();
  for (const component of components) {
    const c = record(component);
    for (const entry of Array.isArray(c.hardware) ? c.hardware : []) {
      const h = record(entry);
      if (typeof h.id !== 'string') continue;
      const device = devices.get(h.id);
      const fixed = ['totalEmbodiedGrams', 'expectedLifetimeHours', 'totalResources'];
      if (device) {
        const inconsistent =
          fixed.some(
            (key) =>
              record(device.factors[key]).value !== record(h[key]).value ||
              record(device.factors[key]).kind !== record(h[key]).kind,
          ) || device.factors.resourceUnit !== h.resourceUnit;
        if (inconsistent)
          issue(
            issues,
            'inconsistent-hardware',
            `${prefix}.components`,
            `Shared hardware ${h.id} must use identical embodied, lifetime and capacity inputs.`,
            'invalid',
          );
      }
      const reserved = record(h.reservedHours).value;
      const resources = record(h.reservedResources).value;
      const total = record(h.totalResources).value;
      if (
        typeof reserved !== 'number' ||
        typeof resources !== 'number' ||
        typeof total !== 'number' ||
        !Number.isFinite(reserved) ||
        !Number.isFinite(resources) ||
        !Number.isFinite(total) ||
        total <= 0 ||
        periodHours === null
      )
        continue;
      const share = (reserved / periodHours) * (resources / total);
      const shares = (device?.shares ?? 0) + share;
      if (shares > 1 + 1e-12)
        issue(
          issues,
          'overallocated-hardware',
          `${prefix}.components`,
          `Combined allocations for hardware ${h.id} exceed its available resources during this observation.`,
          'invalid',
        );
      devices.set(h.id, { factors: device?.factors ?? h, shares });
    }
  }
}

function observationResult(
  methodology: SciMethodology,
  input: unknown,
  prefix: string,
  sharedIssues: SciIssue[],
): SciResult {
  const issues = [...sharedIssues];
  const kinds = new Set<SciEvidenceKind>();
  const o = record(input);
  requiredText(o.label, `${prefix}.label`, issues);
  const workloadId = requiredText(o.workloadId, `${prefix}.workloadId`, issues);
  if (workloadId && workloadId !== methodology.workloadId)
    issue(
      issues,
      'workload-mismatch',
      `${prefix}.workloadId`,
      'The observation must use the workload/version declared in the shared methodology.',
      'invalid',
    );
  const period = record(o.period);
  const start = typeof period.start === 'string' ? Date.parse(period.start) : NaN;
  const end = typeof period.end === 'string' ? Date.parse(period.end) : NaN;
  // Require an explicit timezone, so exports are reproducible across clients.
  const validDates = validTimestamp(period.start) && validTimestamp(period.end);
  const validPeriod = validDates && end > start;
  const unavailablePeriod =
    period.start == null ||
    period.end == null ||
    period.start === '' ||
    period.end === '' ||
    (validDates && end === start);
  if (!validPeriod)
    issue(
      issues,
      unavailablePeriod ? 'missing-period' : 'invalid-period',
      `${prefix}.period`,
      'Supply precise start and end timestamps with a timezone; end must be after start.',
      unavailablePeriod ? 'missing' : 'invalid',
    );
  const periodHours = validPeriod ? (end - start) / 3_600_000 : null;
  const attempted = finiteValue(o.attemptedTasks, `${prefix}.attemptedTasks`, issues);
  const successful = finiteValue(o.successfulTasks, `${prefix}.successfulTasks`, issues);
  for (const [name, count] of [
    ['attemptedTasks', attempted],
    ['successfulTasks', successful],
  ] as const) {
    if (count !== null && !Number.isSafeInteger(count))
      issue(
        issues,
        'invalid-task-count',
        `${prefix}.${name}`,
        'Task counts must be non-negative safe integers.',
        'invalid',
      );
  }
  if (attempted !== null && successful !== null && successful > attempted)
    issue(
      issues,
      'invalid-success-count',
      `${prefix}.successfulTasks`,
      'Successful tasks cannot exceed attempted tasks.',
      'invalid',
    );
  if (successful === 0)
    issue(
      issues,
      'no-successful-tasks',
      `${prefix}.successfulTasks`,
      'A per-successful-task rate is unavailable when no task succeeded.',
    );
  if (o.qualityPassed !== true)
    issue(
      issues,
      'quality-not-passed',
      `${prefix}.qualityPassed`,
      'Demonstrate that this workload meets the declared quality criterion.',
    );
  requiredText(o.qualityEvidence, `${prefix}.qualityEvidence`, issues);
  if (o.energyCoverageConfirmed !== true)
    issue(
      issues,
      'energy-coverage-unconfirmed',
      `${prefix}.energyCoverageConfirmed`,
      'Confirm that energy includes failed attempts and provisioned/idle resources throughout this period.',
    );
  const observations = list(o.components, `${prefix}.components`, issues);
  validateSharedHardware(observations, periodHours, prefix, issues);
  const byId = new Map<string, UnknownRecord>();
  for (const [i, entry] of observations.entries()) {
    const c = record(entry);
    const id = requiredText(c.componentId, `${prefix}.components[${i}].componentId`, issues);
    if (byId.has(id))
      issue(
        issues,
        'duplicate-component',
        `${prefix}.components[${i}].componentId`,
        'Each component must be reported exactly once.',
        'invalid',
      );
    if (!methodology.components.some((method) => method.id === id))
      issue(
        issues,
        'unknown-component',
        `${prefix}.components[${i}].componentId`,
        'This component is absent from the shared boundary.',
        'invalid',
      );
    byId.set(id, c);
  }
  const components: SciComponentResult[] = methodology.components.map((method) => {
    const c = byId.get(method.id) ?? {};
    const p = `${prefix}.components[${method.id}]`;
    requiredText(c.evidence, `${p}.evidence`, issues);
    const energy = quantity(c.energyKwh, `${p}.energyKwh`, issues, kinds);
    let facilityEnergyKwh = energy;
    if (method.energyBasis === 'it') {
      const pue = quantity(c.pue, `${p}.pue`, issues, kinds, true);
      if (pue !== null && pue < 1)
        issue(issues, 'invalid-pue', `${p}.pue`, 'PUE cannot be less than one.', 'invalid');
      facilityEnergyKwh = energy !== null && pue !== null && pue >= 1 ? energy * pue : null;
    } else if (c.pue != null) {
      issue(
        issues,
        'double-counted-pue',
        `${p}.pue`,
        'Facility-inclusive energy already contains facility overhead; remove PUE to avoid counting it twice.',
        'invalid',
      );
      facilityEnergyKwh = null;
    }
    const region = requiredText(c.region, `${p}.region`, issues);
    const intensity = quantity(
      c.carbonIntensityGramsPerKwh,
      `${p}.carbonIntensityGramsPerKwh`,
      issues,
      kinds,
    );
    const operationalGrams =
      facilityEnergyKwh !== null && intensity !== null && region
        ? facilityEnergyKwh * intensity
        : null;
    const embodiedGrams = hardwareEmissions(
      c.hardware,
      `${p}.hardware`,
      periodHours,
      issues,
      kinds,
    );
    return { componentId: method.id, facilityEnergyKwh, operationalGrams, embodiedGrams };
  });
  // Overflow is invalid, not a value JSON may silently serialize as null.
  const facilityEnergyKwh = completeSum(components.map((c) => c.facilityEnergyKwh));
  const operationalGrams = completeSum(components.map((c) => c.operationalGrams));
  const embodiedGrams = completeSum(components.map((c) => c.embodiedGrams));
  const totalGrams =
    operationalGrams !== null && embodiedGrams !== null ? operationalGrams + embodiedGrams : null;
  const denominator = successful !== null && successful > 0 ? successful : null;
  const operationalGramsPerUnit =
    operationalGrams !== null && denominator !== null ? operationalGrams / denominator : null;
  const sciGramsPerUnit =
    totalGrams !== null && denominator !== null ? totalGrams / denominator : null;
  const allNumbers = [
    facilityEnergyKwh,
    operationalGrams,
    embodiedGrams,
    totalGrams,
    operationalGramsPerUnit,
    sciGramsPerUnit,
    ...components.flatMap((c) => [c.facilityEnergyKwh, c.operationalGrams, c.embodiedGrams]),
  ];
  if (allNumbers.some((n) => n !== null && !Number.isFinite(n)))
    issue(
      issues,
      'numeric-overflow',
      prefix,
      'The supplied values exceed a finite calculation range.',
      'invalid',
    );
  const invalid = issues.some((entry) => entry.severity === 'invalid');
  const status = invalid ? 'invalid' : issues.length ? 'incomplete' : 'complete';
  return {
    status,
    synthetic: methodology.workloadKind === 'synthetic' || kinds.has('synthetic'),
    evidenceKinds: [...kinds].sort(),
    successfulTasks: invalid ? null : successful,
    facilityEnergyKwh: invalid ? null : facilityEnergyKwh,
    operationalGrams: invalid ? null : operationalGrams,
    embodiedGrams: invalid ? null : embodiedGrams,
    totalGrams: status === 'complete' ? totalGrams : null,
    operationalGramsPerUnit: invalid ? null : operationalGramsPerUnit,
    sciGramsPerUnit: status === 'complete' ? sciGramsPerUnit : null,
    components: invalid
      ? components.map((c) => ({
          componentId: c.componentId,
          facilityEnergyKwh: null,
          operationalGrams: null,
          embodiedGrams: null,
        }))
      : components,
    issues,
  };
}

/** Evaluate user-supplied evidence without network requests, defaults, persistence or secret access. */
export function assessSci(input: unknown): SciAssessmentResult {
  const document = record(input);
  const issues: SciIssue[] = [];
  if (document.schemaVersion !== SCI_SCHEMA_VERSION)
    issue(
      issues,
      'unsupported-schema',
      'schemaVersion',
      'Expected SCI assessment schema version 1.',
      'invalid',
    );
  const methodology = validateMethodology(document.methodology, issues);
  const baseline = observationResult(methodology, document.baseline, 'baseline', issues);
  const after =
    document.after == null ? null : observationResult(methodology, document.after, 'after', issues);
  const comparisonIssues: SciIssue[] = [];
  if (!after)
    issue(
      comparisonIssues,
      'missing-after',
      'after',
      'Add an after observation to compare equivalent work.',
    );
  if (baseline.status !== 'complete' || after?.status !== 'complete')
    issue(
      comparisonIssues,
      'incomplete-assessment',
      'comparison',
      'Both observations need complete boundary, quality, energy, grid and hardware evidence.',
    );
  const beforeInput = record(document.baseline);
  const afterInput = record(document.after);
  if (
    after &&
    (beforeInput.attemptedTasks !== afterInput.attemptedTasks ||
      beforeInput.successfulTasks !== afterInput.successfulTasks)
  )
    issue(
      comparisonIssues,
      'unequal-work',
      'comparison',
      'Compare the same number of attempted and successfully completed equivalent-quality tasks; do not drop failures.',
    );
  if (after && JSON.stringify(baseline.evidenceKinds) !== JSON.stringify(after.evidenceKinds))
    issue(
      comparisonIssues,
      'inconsistent-evidence-method',
      'comparison',
      'Use consistent measured/modeled/synthetic input methods in baseline and after.',
    );
  // Shared methodology fixes component boundary, functional unit, assumptions and quality criterion.
  // Input-level provenance is also checked so changing a meter to a synthetic value is not a saving.
  if (after) {
    const beforeComponents = new Map(
      (Array.isArray(beforeInput.components) ? beforeInput.components : []).map(
        (entry: unknown) => [record(entry).componentId, record(entry)],
      ),
    );
    for (const entry of Array.isArray(afterInput.components) ? afterInput.components : []) {
      const c = record(entry);
      const b = beforeComponents.get(c.componentId);
      if (!b) continue;
      for (const field of ['energyKwh', 'pue', 'carbonIntensityGramsPerKwh']) {
        if (record(b[field]).kind !== record(c[field]).kind)
          issue(
            comparisonIssues,
            'inconsistent-evidence-method',
            `comparison.${String(c.componentId)}.${field}`,
            'Keep the quantification approach consistent across the comparison.',
          );
      }
      const beforeAllocations = new Map(
        (Array.isArray(b.hardware) ? b.hardware : []).map((item: unknown) => [
          record(item).id,
          record(item),
        ]),
      );
      for (const item of Array.isArray(c.hardware) ? c.hardware : []) {
        const allocation = record(item);
        const previous = beforeAllocations.get(allocation.id);
        if (!previous) continue;
        for (const field of ['reservedHours', 'reservedResources']) {
          if (record(previous[field]).kind !== record(allocation[field]).kind)
            issue(
              comparisonIssues,
              'inconsistent-evidence-method',
              `comparison.${String(c.componentId)}.hardware[${String(allocation.id)}].${field}`,
              'Keep per-component hardware allocation quantification consistent.',
            );
        }
      }
    }
    const hardware = (observation: UnknownRecord) => {
      const map = new Map<string, UnknownRecord>();
      for (const entry of Array.isArray(observation.components) ? observation.components : []) {
        for (const item of Array.isArray(record(entry).hardware)
          ? (record(entry).hardware as unknown[])
          : []) {
          const h = record(item);
          if (typeof h.id === 'string') map.set(h.id, h);
        }
      }
      return map;
    };
    const beforeHardware = hardware(beforeInput);
    for (const [id, h] of hardware(afterInput)) {
      const b = beforeHardware.get(id);
      if (!b) continue; // A physical replacement uses a new ID; the allocation method is still shared.
      for (const field of [
        'totalEmbodiedGrams',
        'expectedLifetimeHours',
        'reservedHours',
        'reservedResources',
        'totalResources',
      ]) {
        if (record(b[field]).kind !== record(h[field]).kind)
          issue(
            comparisonIssues,
            'inconsistent-evidence-method',
            `comparison.hardware[${id}].${field}`,
            'Keep hardware quantification approaches consistent across observations.',
          );
      }
      for (const field of ['totalEmbodiedGrams', 'expectedLifetimeHours', 'totalResources']) {
        if (record(b[field]).value !== record(h[field]).value)
          issue(
            comparisonIssues,
            'changed-hardware-assumption',
            `comparison.hardware[${id}].${field}`,
            'For the same physical hardware, embodied totals, expected lifetime and capacity must stay fixed. Record a replacement with a new hardware ID.',
          );
      }
      if (b.resourceUnit !== h.resourceUnit)
        issue(
          comparisonIssues,
          'changed-hardware-assumption',
          `comparison.hardware[${id}].resourceUnit`,
          'Use the same capacity unit for the same physical hardware.',
        );
    }
  }
  const comparable =
    !comparisonIssues.length &&
    after !== null &&
    baseline.sciGramsPerUnit !== null &&
    after.sciGramsPerUnit !== null;
  const reduction = comparable ? baseline.sciGramsPerUnit! - after!.sciGramsPerUnit! : null;
  const percent =
    reduction !== null && baseline.sciGramsPerUnit! > 0
      ? (reduction / baseline.sciGramsPerUnit!) * 100
      : null;
  const comparisonOverflow =
    (reduction !== null && !Number.isFinite(reduction)) ||
    (percent !== null && !Number.isFinite(percent));
  if (comparisonOverflow)
    issue(
      comparisonIssues,
      'numeric-overflow',
      'comparison',
      'The comparison exceeds a finite calculation range; no reduction is reported.',
      'invalid',
    );
  return {
    schemaVersion: 1,
    standard: 'SCI-based calculation',
    specificationUrl: SCI_SPEC_URL,
    disclaimer:
      'A calculation using supplied evidence, not standards certification, a verified real-world reduction, or a GHG/ESRS/ISSB inventory. Synthetic results are illustrative only. No carbon offsets are deducted.',
    baseline,
    after,
    comparison: {
      status: comparable && !comparisonOverflow ? 'comparable' : 'not-comparable',
      reductionGramsPerUnit: comparisonOverflow ? null : reduction,
      reductionPercent: comparisonOverflow ? null : percent,
      synthetic: baseline.synthetic || (after?.synthetic ?? false),
      issues: comparisonIssues,
    },
  };
}

/** An arithmetic demonstration only, deliberately unrelated to measured GreenOps fleet/demo savings. */
export function createSyntheticSciExample(): SciAssessment {
  const synthetic = (value: number, description: string): SciQuantity => ({
    value,
    source: `Synthetic teaching assumption: ${description}. Not provider telemetry.`,
    kind: 'synthetic',
  });
  const observation = (label: string, energyKwh: number): SciObservation => ({
    label,
    period: { start: '2026-01-01T00:00:00Z', end: '2026-01-01T01:00:00Z' },
    workloadId: 'synthetic-support-tasks-v1',
    attemptedTasks: 100,
    successfulTasks: 100,
    qualityPassed: true,
    qualityEvidence:
      'Synthetic scenario: all 100 tasks pass the same expected-answer and tenant-isolation checks. No actual test execution is represented.',
    energyCoverageConfirmed: true,
    components: [
      {
        componentId: 'system',
        evidence:
          'Synthetic aggregate for one reserved host containing inference, API, cache, agent, monitoring, storage, network allocation and idle capacity. No real provider or multi-region workload is represented.',
        energyKwh: synthetic(
          energyKwh,
          'aggregate facility-inclusive workload energy including failed attempts and provisioned capacity',
        ),
        pue: null,
        region: 'Synthetic region A (not a real grid)',
        carbonIntensityGramsPerKwh: synthetic(
          400,
          'location-average grid intensity in grams CO2e per kWh',
        ),
        hardware: [
          {
            id: 'synthetic-host',
            totalEmbodiedGrams: synthetic(
              400_000,
              'aggregate hardware manufacture/disposal emissions in grams CO2e',
            ),
            expectedLifetimeHours: synthetic(40_000, 'hardware lifetime in hours'),
            reservedHours: synthetic(1, 'one hour reserved within the observation'),
            reservedResources: synthetic(4, 'reserved cores'),
            totalResources: synthetic(8, 'total cores'),
            resourceUnit: 'cores',
          },
        ],
      },
    ],
  });
  return {
    schemaVersion: 1,
    methodology: {
      workloadKind: 'synthetic',
      boundary: {
        id: 'synthetic-support-system-v1',
        description:
          'Synthetic single-host support service: inference, API, cache, agent and all allocated supporting infrastructure.',
        assessed: true,
        assessmentEvidence:
          'Teaching scenario explicitly assumes the aggregate covers every significant operational component and reserved/idle resources; no claim is made about actual deployment coverage.',
        exclusions: [],
      },
      functionalUnit: 'one successfully completed equivalent-quality support task',
      workloadId: 'synthetic-support-tasks-v1',
      qualityCriterion:
        'Same task inputs and expected answers, including tenant isolation; all 100 requests must pass.',
      assumptions: [
        'All quantities and quality outcomes are synthetic, not measured savings.',
        'Same 100 task inputs, one-hour period, region, factor, allocation method and system boundary in both observations; only energy changes in this teaching scenario.',
        'Facility energy includes cooling exactly once and does not receive another PUE multiplier. Aggregate hardware and energy do not overlap.',
      ],
      components: [
        {
          id: 'system',
          name: 'Complete synthetic support system',
          method:
            'Same synthetic aggregate facility energy model and location-average grid factor; hardware TE × time-share × resource-share allocation.',
          energyBasis: 'facility',
          gridIntensityMethod: 'location-average',
        },
      ],
    },
    baseline: observation('Synthetic baseline', 0.1),
    after: observation('Synthetic after caching', 0.06),
  };
}
