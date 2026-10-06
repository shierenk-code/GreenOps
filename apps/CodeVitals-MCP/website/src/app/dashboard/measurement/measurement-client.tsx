'use client';

import Link from 'next/link';
import { useState, type ReactNode } from 'react';
import {
  createSyntheticSciExample,
  SCI_SPEC_URL,
  type SciAssessment,
  type SciAssessmentResult,
  type SciEvidenceKind,
  type SciMethodology,
} from '../../../../../../../packages/measure/src/sci';
import {
  createEmptyWorksheet,
  createWorksheetReport,
  emptyHardware,
  worksheetFromAssessment,
  type ComponentDraft,
  type HardwareDraft,
  type ObservationDraft,
  type QuantityDraft,
} from './worksheet';
import shell from '../ai-efficiency-demo/demo.module.css';
import styles from './measurement.module.css';

function Field({
  label,
  value,
  onChange,
  hint,
  multiline = false,
  type = 'text',
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  hint?: string;
  multiline?: boolean;
  type?: string;
}) {
  return (
    <label className={styles.field}>
      {label}
      {multiline ? (
        <textarea rows={3} value={value} onChange={(event) => onChange(event.target.value)} />
      ) : (
        <input
          type={type}
          step={type === 'number' ? 'any' : undefined}
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
      )}
      {hint && <span className={styles.hint}>{hint}</span>}
    </label>
  );
}

function Select({
  label,
  value,
  onChange,
  children,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: ReactNode;
}) {
  return (
    <label className={styles.field}>
      {label}
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        {children}
      </select>
    </label>
  );
}

function Quantity({
  label,
  quantity,
  onChange,
}: {
  label: string;
  quantity: QuantityDraft;
  onChange: (quantity: QuantityDraft) => void;
}) {
  return (
    <div>
      <p className={styles.quantityHeading}>{label}</p>
      <div className={styles.quantity}>
        <Field
          label={`${label} — value`}
          type="number"
          value={quantity.value}
          onChange={(value) => onChange({ ...quantity, value })}
        />
        <Select
          label={`${label} — evidence type`}
          value={quantity.kind}
          onChange={(kind) => onChange({ ...quantity, kind: kind as SciEvidenceKind })}
        >
          <option value="measured">Measured</option>
          <option value="modeled">Modeled</option>
          <option value="synthetic">Synthetic example</option>
        </Select>
        <Field
          label={`${label} — source`}
          value={quantity.source}
          onChange={(source) => onChange({ ...quantity, source })}
        />
      </div>
    </div>
  );
}

function HardwareFields({
  hardware,
  onChange,
  onRemove,
}: {
  hardware: HardwareDraft;
  onChange: (hardware: HardwareDraft) => void;
  onRemove: () => void;
}) {
  const quantities: Array<
    [
      keyof Pick<
        HardwareDraft,
        | 'totalEmbodiedGrams'
        | 'expectedLifetimeHours'
        | 'reservedHours'
        | 'reservedResources'
        | 'totalResources'
      >,
      string,
    ]
  > = [
    ['totalEmbodiedGrams', 'Total hardware embodied emissions (g CO₂e)'],
    ['expectedLifetimeHours', 'Expected hardware lifetime (hours)'],
    ['reservedHours', 'Time reserved during this observation (hours)'],
    ['reservedResources', 'Resources reserved by the software'],
    ['totalResources', 'Total resources in that hardware'],
  ];
  return (
    <fieldset className={styles.fieldset}>
      <legend>Hardware allocation</legend>
      <div className={styles.formGrid}>
        <Field
          label="Hardware identifier"
          value={hardware.id}
          onChange={(id) => onChange({ ...hardware, id })}
        />
        <Field
          label="Resource unit"
          value={hardware.resourceUnit}
          hint="Use one consistent allocation unit, for example CPU cores."
          onChange={(resourceUnit) => onChange({ ...hardware, resourceUnit })}
        />
      </div>
      {quantities.map(([key, label]) => (
        <Quantity
          key={key}
          label={label}
          quantity={hardware[key]}
          onChange={(value) => onChange({ ...hardware, [key]: value })}
        />
      ))}
      <div>
        <button type="button" className={styles.remove} onClick={onRemove}>
          Remove hardware allocation
        </button>
      </div>
    </fieldset>
  );
}

function ObservationFields({
  observation,
  methods,
  onChange,
}: {
  observation: ObservationDraft;
  methods: SciMethodology['components'];
  onChange: (observation: ObservationDraft) => void;
}) {
  const updateComponent = (index: number, component: ComponentDraft) =>
    onChange({
      ...observation,
      components: observation.components.map((old, i) => (i === index ? component : old)),
    });
  return (
    <div className={styles.stack}>
      <div className={styles.formGrid}>
        <Field
          label="Period start (UTC)"
          type="datetime-local"
          value={utcInput(observation.period.start)}
          onChange={(start) =>
            onChange({
              ...observation,
              period: { ...observation.period, start: start ? `${start}:00Z` : '' },
            })
          }
        />
        <Field
          label="Period end (UTC)"
          type="datetime-local"
          value={utcInput(observation.period.end)}
          onChange={(end) =>
            onChange({
              ...observation,
              period: { ...observation.period, end: end ? `${end}:00Z` : '' },
            })
          }
        />
        <Field
          label="Observed workload / version"
          value={observation.workloadId}
          onChange={(workloadId) => onChange({ ...observation, workloadId })}
          hint="Must match the shared workload identifier, not just use a similar name."
        />
        <Select
          label="Quality checks"
          value={observation.qualityPassed === null ? '' : String(observation.qualityPassed)}
          onChange={(value) =>
            onChange({ ...observation, qualityPassed: value === '' ? null : value === 'true' })
          }
        >
          <option value="">Not evaluated</option>
          <option value="true">Passed the declared checks</option>
          <option value="false">Did not pass</option>
        </Select>
        <Field
          label="Attempted tasks"
          type="number"
          value={observation.attemptedTasks === null ? '' : String(observation.attemptedTasks)}
          onChange={(value) =>
            onChange({ ...observation, attemptedTasks: value === '' ? null : Number(value) })
          }
        />
        <Field
          label="Successful tasks (functional units)"
          type="number"
          value={observation.successfulTasks === null ? '' : String(observation.successfulTasks)}
          onChange={(value) =>
            onChange({ ...observation, successfulTasks: value === '' ? null : Number(value) })
          }
        />
      </div>
      <Field
        label="Quality-check evidence"
        value={observation.qualityEvidence}
        hint="Reference test results and the version or data set evaluated."
        onChange={(qualityEvidence) => onChange({ ...observation, qualityEvidence })}
      />
      <label className={shell.checkbox}>
        <input
          type="checkbox"
          checked={observation.energyCoverageConfirmed}
          onChange={(event) =>
            onChange({ ...observation, energyCoverageConfirmed: event.target.checked })
          }
        />
        Energy includes all attempts, failed work, and provisioned or idle resources for this
        period.
      </label>
      {observation.components.map((component, index) => {
        const method = methods.find((candidate) => candidate.id === component.componentId);
        return (
          <fieldset key={component.componentId} className={styles.fieldset}>
            <legend>{method?.name || 'Whole system boundary'}</legend>
            <Field
              label="Observation evidence"
              value={component.evidence}
              hint="Reference the meter export or documented model covering the whole declared boundary."
              onChange={(evidence) => updateComponent(index, { ...component, evidence })}
            />
            <Quantity
              label="Energy used (kWh)"
              quantity={component.energyKwh}
              onChange={(energyKwh) => updateComponent(index, { ...component, energyKwh })}
            />
            {method?.energyBasis === 'it' && (
              <Quantity
                label="Power usage effectiveness (PUE)"
                quantity={component.pue}
                onChange={(pue) => updateComponent(index, { ...component, pue })}
              />
            )}
            <Field
              label="Electricity region"
              value={component.region}
              onChange={(region) => updateComponent(index, { ...component, region })}
            />
            <Quantity
              label="Location-based carbon intensity (g CO₂e/kWh)"
              quantity={component.carbonIntensityGramsPerKwh}
              onChange={(carbonIntensityGramsPerKwh) =>
                updateComponent(index, { ...component, carbonIntensityGramsPerKwh })
              }
            />
            <details className={shell.details}>
              <summary>
                Hardware footprint and allocation ({component.hardware.length} recorded)
              </summary>
              <p>
                Required for a complete SCI calculation. Use hardware lifecycle emissions and the
                reserved time and resource share, including idle capacity. Missing hardware evidence
                is not zero.
              </p>
              <div className={styles.stack}>
                {component.hardware.map((hardware, hardwareIndex) => (
                  <HardwareFields
                    key={hardwareIndex}
                    hardware={hardware}
                    onChange={(value) =>
                      updateComponent(index, {
                        ...component,
                        hardware: component.hardware.map((old, i) =>
                          i === hardwareIndex ? value : old,
                        ),
                      })
                    }
                    onRemove={() =>
                      updateComponent(index, {
                        ...component,
                        hardware: component.hardware.filter((_, i) => i !== hardwareIndex),
                      })
                    }
                  />
                ))}
                <div>
                  <button
                    type="button"
                    className={shell.secondaryButton}
                    onClick={() => {
                      let nextId = 1;
                      while (component.hardware.some((item) => item.id === `hardware-${nextId}`))
                        nextId += 1;
                      updateComponent(index, {
                        ...component,
                        hardware: [...component.hardware, emptyHardware(`hardware-${nextId}`)],
                      });
                    }}
                  >
                    Add hardware allocation
                  </button>
                </div>
              </div>
            </details>
          </fieldset>
        );
      })}
    </div>
  );
}

function displayNumber(value: number | null) {
  return value === null
    ? 'Not available'
    : value.toLocaleString('en-US', { maximumSignificantDigits: 5 });
}

function utcInput(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString().slice(0, 16);
}

export function AssessmentSummary({
  assessment,
  functionalUnit,
  example,
}: {
  assessment: SciAssessmentResult;
  functionalUnit: string;
  example: boolean;
}) {
  const comparison = assessment.comparison;
  const change = comparison.reductionPercent;
  const allIssues = [
    ...assessment.baseline.issues,
    ...(assessment.after?.issues ?? []),
    ...comparison.issues,
  ];
  const issues = allIssues.filter(
    (issue, index) =>
      allIssues.findIndex(
        (candidate) => candidate.path === issue.path && candidate.code === issue.code,
      ) === index,
  );
  const synthetic = example || assessment.baseline.synthetic || assessment.after?.synthetic;
  return (
    <section className={shell.card} id="assessment" aria-labelledby="assessment-title">
      <div className={shell.cardHeading}>
        <div>
          <h2 id="assessment-title">Assessment result</h2>
          <p>Recalculated whenever you edit the worksheet. A missing input never becomes a zero.</p>
        </div>
        <span className={shell.badge}>
          {synthetic ? 'Synthetic illustration' : 'User-entered evidence'}
        </span>
      </div>
      <div className={shell.cardBody}>
        <div
          role="status"
          className={comparison.status === 'comparable' ? shell.notice : shell.warning}
        >
          <div>
            <strong>
              {comparison.status === 'comparable'
                ? synthetic
                  ? 'Illustrative comparison available — not a real-world result'
                  : 'Calculation available for the declared evidence'
                : 'No defensible before-and-after SCI comparison yet'}
            </strong>
            <p>
              {comparison.status === 'comparable'
                ? 'Input completeness is not independent verification of the measurements or system boundary.'
                : 'Complete the boundary, quality checks, energy sources, and hardware allocation below. No reduction is claimed while required evidence is missing or incompatible.'}
            </p>
          </div>
        </div>
        <div className={styles.resultGrid}>
          <div>
            <span>Baseline SCI</span>
            <strong>{displayNumber(assessment.baseline.sciGramsPerUnit)}</strong>
            <small>
              {assessment.baseline.sciGramsPerUnit === null
                ? 'Full calculation unavailable'
                : `g CO₂e / ${functionalUnit || 'functional unit'}`}
            </small>
          </div>
          <div>
            <span>After-change SCI</span>
            <strong>{displayNumber(assessment.after?.sciGramsPerUnit ?? null)}</strong>
            <small>
              {assessment.after?.sciGramsPerUnit == null
                ? 'Full calculation unavailable'
                : `g CO₂e / ${functionalUnit || 'functional unit'}`}
            </small>
          </div>
          <div>
            <span>Change in carbon intensity</span>
            <strong>
              {change === null
                ? 'Not comparable'
                : `${displayNumber(Math.abs(change))}% ${change < 0 ? 'increase' : change > 0 ? 'reduction' : 'change'}`}
            </strong>
            <small>
              {change === null
                ? 'No result inferred from missing evidence'
                : synthetic
                  ? 'Synthetic example only'
                  : 'For the declared comparable workload'}
            </small>
          </div>
        </div>
        <details className={shell.details}>
          <summary>
            {issues.length > 0
              ? `Evidence to complete or correct (${issues.length})`
              : 'Calculation breakdown'}
          </summary>
          {issues.length > 0 && (
            <ul className={styles.issues}>
              {issues.map((issue) => (
                <li key={`${issue.path}-${issue.code}`}>
                  {issue.message} <span className={styles.hint}>({issue.path})</span>
                </li>
              ))}
            </ul>
          )}
          <div className={shell.tableScroll}>
            <table className={shell.table}>
              <caption className={shell.srOnly}>Operational and embodied carbon breakdown</caption>
              <thead>
                <tr>
                  <th scope="col">Measure</th>
                  <th scope="col">Baseline</th>
                  <th scope="col">After change</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <th scope="row">Facility-inclusive energy (kWh)</th>
                  <td>{displayNumber(assessment.baseline.facilityEnergyKwh)}</td>
                  <td>{displayNumber(assessment.after?.facilityEnergyKwh ?? null)}</td>
                </tr>
                <tr>
                  <th scope="row">Operational carbon (g CO₂e)</th>
                  <td>{displayNumber(assessment.baseline.operationalGrams)}</td>
                  <td>{displayNumber(assessment.after?.operationalGrams ?? null)}</td>
                </tr>
                <tr>
                  <th scope="row">Allocated hardware carbon (g CO₂e)</th>
                  <td>{displayNumber(assessment.baseline.embodiedGrams)}</td>
                  <td>{displayNumber(assessment.after?.embodiedGrams ?? null)}</td>
                </tr>
                <tr>
                  <th scope="row">Operational-only intensity (not full SCI)</th>
                  <td>{displayNumber(assessment.baseline.operationalGramsPerUnit)}</td>
                  <td>{displayNumber(assessment.after?.operationalGramsPerUnit ?? null)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </details>
        <p className={shell.muted}>
          SCI-based calculation, not certification, a corporate emissions inventory, or proof of
          production savings. Evidence types and sources are included in the export.
        </p>
      </div>
    </section>
  );
}

export default function MeasurementClient({
  initialAssessment,
  initialExample = false,
  embedded = false,
}: {
  initialAssessment?: SciAssessment;
  initialExample?: boolean;
  embedded?: boolean;
}) {
  const Content = embedded ? 'section' : 'main';
  const Heading = embedded ? 'h2' : 'h1';
  const [draft, setDraft] = useState(() =>
    initialAssessment ? worksheetFromAssessment(initialAssessment) : createEmptyWorksheet(),
  );
  const [example, setExample] = useState(initialExample);
  const report = createWorksheetReport(draft, example);
  const methodology = draft.methodology;
  const updateMethodology = (value: SciMethodology) =>
    setDraft((current) => ({ ...current, methodology: value }));
  function download() {
    const currentReport = createWorksheetReport(draft, example);
    const blob = new Blob([JSON.stringify(currentReport, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = example
      ? 'greenops-sci-synthetic-example.json'
      : 'greenops-sci-assessment.json';
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return (
    <div
      className={`${shell.root} ${embedded ? shell.embedded : ''}`}
      data-embedded={embedded || undefined}
    >
      {!embedded && (
        <a className={shell.skipLink} href="#measurement-main">
          Skip to assessment
        </a>
      )}
      {!embedded && (
        <aside className={shell.sidebar}>
          <Link className={shell.brand} href="/dashboard">
            <span className={shell.brandIcon} aria-hidden="true">
              G
            </span>
            <span>
              <strong>GreenOps</strong>
              <small>Sustainability workspace</small>
            </span>
          </Link>
          <nav className={shell.navigation} aria-label="Workspace navigation">
            <Link href="/dashboard">Overview</Link>
            <Link href="/dashboard/agents">Agents</Link>
            <Link href="/dashboard/findings">Findings</Link>
            <Link href="/dashboard/ai-efficiency-demo">AI efficiency demo</Link>
            <Link href="/dashboard/reports">Reports</Link>
            <Link href="/dashboard/measurement" aria-current="page">
              SCI assessment
            </Link>
          </nav>
          <div className={shell.sidebarNote}>
            Local worksheet. No API calls, model requests, or changes to your fleet ledger.
          </div>
        </aside>
      )}
      <div className={shell.workspace}>
        {!embedded && (
          <header className={shell.topbar}>
            <Link href="/dashboard/reports">Reports</Link>
            <span aria-hidden="true">/</span>
            <span>SCI assessment</span>
          </header>
        )}
        <Content
          className={shell.main}
          id="measurement-main"
          aria-label="Software carbon intensity assessment"
        >
          <div className={shell.pageHeading}>
            <div>
              <span className={shell.eyebrow}>Measurement and evidence</span>
              <Heading>Compare software carbon intensity</Heading>
              <p>
                Account for the whole system, then compare emissions per successful task before and
                after a change.
              </p>
            </div>
            <button type="button" className={shell.primaryButton} onClick={download}>
              Export assessment
            </button>
          </div>
          <div className={shell.notice}>
            <div>
              <strong>
                {example
                  ? 'Synthetic example loaded — separate from your real results.'
                  : 'Start with your own evidence, or explore a synthetic example.'}
              </strong>
              <p>
                This worksheet is kept only in this browser page. Export before leaving or
                refreshing; it is not saved automatically. Enter only public, open, or synthetic
                data.
              </p>
              {embedded && (
                <p>
                  This local worksheet does not make model requests or change your fleet ledger.
                </p>
              )}
            </div>
          </div>
          <div className={shell.actions}>
            <button
              type="button"
              className={shell.secondaryButton}
              onClick={() => {
                setDraft(worksheetFromAssessment(createSyntheticSciExample()));
                setExample(true);
              }}
            >
              Load synthetic example
            </button>
            <button
              type="button"
              className={shell.secondaryButton}
              onClick={() => {
                setDraft(createEmptyWorksheet());
                setExample(false);
              }}
            >
              Reset worksheet
            </button>
            <div className={styles.flow}>
              <a href="#scope">1. Define scope</a>
              <a href="#baseline">2. Baseline</a>
              <a href="#after">3. After change</a>
              <a href="#assessment">4. Review result</a>
            </div>
          </div>
          <AssessmentSummary
            assessment={report.assessment}
            functionalUnit={methodology.functionalUnit}
            example={example}
          />
          <section className={shell.card} id="scope" aria-labelledby="scope-title">
            <div className={shell.cardHeading}>
              <div>
                <h2 id="scope-title">1. Define a comparable system boundary</h2>
                <p>
                  Use the same functional unit, workload, quality criterion, and calculation methods
                  for both observations.
                </p>
              </div>
            </div>
            <div className={shell.cardBody}>
              <div className={styles.formGrid}>
                <Field
                  label="Boundary identifier"
                  value={methodology.boundary.id}
                  onChange={(id) =>
                    updateMethodology({ ...methodology, boundary: { ...methodology.boundary, id } })
                  }
                />
                <Field
                  label="Functional unit"
                  value={methodology.functionalUnit}
                  hint="For example: one successfully resolved support question."
                  onChange={(functionalUnit) =>
                    updateMethodology({ ...methodology, functionalUnit })
                  }
                />
                <Field
                  label="Shared workload identifier / version"
                  value={methodology.workloadId}
                  onChange={(workloadId) => updateMethodology({ ...methodology, workloadId })}
                />
                <Select
                  label="Workload type"
                  value={methodology.workloadKind ?? ''}
                  onChange={(value) =>
                    updateMethodology({
                      ...methodology,
                      workloadKind:
                        value === 'synthetic' || value === 'observed' ? value : undefined,
                    })
                  }
                >
                  <option value="">Not declared</option>
                  <option value="synthetic">Synthetic or test workload</option>
                  <option value="observed">Observed workload using permitted data</option>
                </Select>
                <Field
                  label="Required quality criterion"
                  value={methodology.qualityCriterion}
                  hint="Define what a successful task must achieve before comparing efficiency."
                  onChange={(qualityCriterion) =>
                    updateMethodology({ ...methodology, qualityCriterion })
                  }
                />
              </div>
              <Field
                label="Systems included in the boundary"
                multiline
                value={methodology.boundary.description}
                hint="Include all significant systems: inference, application, local cache, agent work, storage, networking, reserved capacity and supporting infrastructure. Inference alone is not automatically a complete system."
                onChange={(description) =>
                  updateMethodology({
                    ...methodology,
                    boundary: { ...methodology.boundary, description },
                  })
                }
              />
              <Field
                label="Boundary coverage evidence"
                value={methodology.boundary.assessmentEvidence}
                onChange={(assessmentEvidence) =>
                  updateMethodology({
                    ...methodology,
                    boundary: { ...methodology.boundary, assessmentEvidence },
                  })
                }
              />
              <label className={shell.checkbox}>
                <input
                  type="checkbox"
                  checked={methodology.boundary.assessed}
                  onChange={(event) =>
                    updateMethodology({
                      ...methodology,
                      boundary: { ...methodology.boundary, assessed: event.target.checked },
                    })
                  }
                />
                I have assessed all significant components, including supporting and idle resources,
                and documented any exclusions.
              </label>
              <details className={shell.details}>
                <summary>Calculation methods, assumptions, and exclusions</summary>
                <div className={styles.stack}>
                  <p>
                    This worksheet uses a declared aggregate boundary. Only combine systems where
                    the energy scope and electricity-factor method are defensible; otherwise assess
                    components separately with the calculation API.
                  </p>
                  {methodology.components.map((method, index) => (
                    <fieldset key={method.id} className={styles.fieldset}>
                      <legend>Boundary calculation method</legend>
                      <Field
                        label="Component / aggregate name"
                        value={method.name}
                        onChange={(name) =>
                          updateMethodology({
                            ...methodology,
                            components: methodology.components.map((old, i) =>
                              i === index ? { ...old, name } : old,
                            ),
                          })
                        }
                      />
                      <Field
                        label="Reproducible measurement and allocation method"
                        multiline
                        value={method.method}
                        onChange={(value) =>
                          updateMethodology({
                            ...methodology,
                            components: methodology.components.map((old, i) =>
                              i === index ? { ...old, method: value } : old,
                            ),
                          })
                        }
                      />
                      <div className={styles.formGrid}>
                        <Select
                          label="Energy measurement scope"
                          value={method.energyBasis}
                          onChange={(energyBasis) =>
                            updateMethodology({
                              ...methodology,
                              components: methodology.components.map((old, i) =>
                                i === index
                                  ? { ...old, energyBasis: energyBasis as 'it' | 'facility' }
                                  : old,
                              ),
                            })
                          }
                        >
                          <option value="facility">Facility-inclusive: no additional PUE</option>
                          <option value="it">IT-only: PUE required</option>
                        </Select>
                        <Select
                          label="Location-based electricity factor method"
                          value={method.gridIntensityMethod}
                          onChange={(gridIntensityMethod) =>
                            updateMethodology({
                              ...methodology,
                              components: methodology.components.map((old, i) =>
                                i === index
                                  ? {
                                      ...old,
                                      gridIntensityMethod:
                                        gridIntensityMethod as typeof method.gridIntensityMethod,
                                    }
                                  : old,
                              ),
                            })
                          }
                        >
                          <option value="location-average">Location average</option>
                          <option value="location-short-run-marginal">
                            Location short-run marginal
                          </option>
                          <option value="location-long-run-marginal">
                            Location long-run marginal
                          </option>
                        </Select>
                      </div>
                    </fieldset>
                  ))}
                  <Field
                    label="Shared assumptions (one per line)"
                    multiline
                    value={methodology.assumptions.join('\n')}
                    onChange={(value) =>
                      updateMethodology({ ...methodology, assumptions: value.split('\n') })
                    }
                  />
                  {methodology.boundary.exclusions.map((exclusion, index) => (
                    <fieldset key={index} className={styles.fieldset}>
                      <legend>Excluded component {index + 1}</legend>
                      {(['component', 'reason', 'evidence'] as const).map((key) => (
                        <Field
                          key={key}
                          label={
                            key === 'component'
                              ? 'Excluded system'
                              : key === 'reason'
                                ? 'Reason for excluding it'
                                : 'Evidence for significance'
                          }
                          value={exclusion[key]}
                          onChange={(value) =>
                            updateMethodology({
                              ...methodology,
                              boundary: {
                                ...methodology.boundary,
                                exclusions: methodology.boundary.exclusions.map((old, i) =>
                                  i === index ? { ...old, [key]: value } : old,
                                ),
                              },
                            })
                          }
                        />
                      ))}
                      <Select
                        label="Significance"
                        value={exclusion.significance}
                        onChange={(significance) =>
                          updateMethodology({
                            ...methodology,
                            boundary: {
                              ...methodology.boundary,
                              exclusions: methodology.boundary.exclusions.map((old, i) =>
                                i === index
                                  ? {
                                      ...old,
                                      significance: significance as typeof exclusion.significance,
                                    }
                                  : old,
                              ),
                            },
                          })
                        }
                      >
                        <option value="unknown">Unknown</option>
                        <option value="significant">Significant</option>
                        <option value="negligible">Negligible, with evidence</option>
                      </Select>
                      <div>
                        <button
                          className={styles.remove}
                          type="button"
                          onClick={() =>
                            updateMethodology({
                              ...methodology,
                              boundary: {
                                ...methodology.boundary,
                                exclusions: methodology.boundary.exclusions.filter(
                                  (_, i) => i !== index,
                                ),
                              },
                            })
                          }
                        >
                          Remove exclusion
                        </button>
                      </div>
                    </fieldset>
                  ))}
                  <div>
                    <button
                      type="button"
                      className={shell.secondaryButton}
                      onClick={() =>
                        updateMethodology({
                          ...methodology,
                          boundary: {
                            ...methodology.boundary,
                            exclusions: [
                              ...methodology.boundary.exclusions,
                              { component: '', reason: '', evidence: '', significance: 'unknown' },
                            ],
                          },
                        })
                      }
                    >
                      Document an exclusion
                    </button>
                  </div>
                </div>
              </details>
            </div>
          </section>
          {(['baseline', 'after'] as const).map((key, index) => (
            <section key={key} id={key} className={shell.card} aria-labelledby={`${key}-title`}>
              <div className={shell.cardHeading}>
                <div>
                  <h2 id={`${key}-title`}>
                    {index + 2}.{' '}
                    {key === 'baseline' ? 'Baseline observation' : 'After-change observation'}
                  </h2>
                  <p>
                    Record actual observations or a documented model, with evidence for every
                    quantity. Never infer energy from unused token limits.
                  </p>
                </div>
              </div>
              <div className={shell.cardBody}>
                <ObservationFields
                  observation={draft[key]}
                  methods={methodology.components}
                  onChange={(observation) =>
                    setDraft((current) => ({ ...current, [key]: observation }))
                  }
                />
              </div>
            </section>
          ))}
          <section className={shell.card} aria-labelledby="method-title">
            <div className={shell.cardBody}>
              <h2 id="method-title">How the calculation works</h2>
              <div className={styles.formula}>
                <strong>
                  SCI = (operational carbon + allocated hardware carbon) ÷ successful tasks
                </strong>
                <p>
                  Operational carbon = energy × location-based electricity intensity. IT-only energy
                  is adjusted by PUE once. Facility-inclusive energy is not adjusted again.
                </p>
              </div>
              <p>
                Hardware allocation = lifecycle embodied emissions × reserved-time share ×
                reserved-resource share. No offsets or avoided-emissions credits are subtracted.
              </p>
              <div className={styles.flow}>
                <a href={SCI_SPEC_URL} target="_blank" rel="noreferrer">
                  Read the SCI specification
                </a>
                <Link href="/dashboard/ai-efficiency-demo">Back to AI efficiency demo</Link>
                <Link href="/dashboard/reports">Back to reports</Link>
              </div>
              <div>
                <button type="button" className={shell.primaryButton} onClick={download}>
                  Export assessment
                </button>
              </div>
            </div>
          </section>
        </Content>
      </div>
    </div>
  );
}
