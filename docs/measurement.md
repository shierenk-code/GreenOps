# Measurement and evidence

GreenOps distinguishes **potential opportunity**, **applied change**, **passed check** and **measured environmental result**. None should be silently substituted for another.

## GreenOps' own resource usage

The dashboard and ledger report available model requests, consumed tokens, tool calls, retries, duration and missing usage. Keep these separate from the workload's potential savings.

Provider failures can consume resources without returning usage. Unknown is not zero. Deterministic runs can legitimately make zero model calls, but that does not mean zero electricity. Duration is wall-clock time, not CPU time or a power reading.

## Subscription baseline

The [Azure fixture](../fixtures/azure-baseline) contains synthetic resource observations and factors. The [translation engine](../packages/measure/src/translate.ts) derives modeled energy/carbon and records assumptions/gaps.

Opportunity, maturity and team scorecards are calculated estimates, not measured savings or an external certification. The original baseline period remains fixed when finding date filters change. Overlapping findings must not be assumed to be additive independent savings.

Legacy conversions use illustrative coefficients. Unused output-token allowance is not consumed or avoided tokens. A positive model-based estimate is not proof of net environmental benefit.

## SCI worksheet

Open [the local worksheet](http://127.0.0.1:3003/dashboard/measurement). The [SCI implementation](../packages/measure/src/sci.ts) uses:

`SCI = (E × I + M) / R`

- E: electricity inside the declared system boundary.
- I: corresponding location-based grid intensity.
- M: allocated embodied hardware emissions.
- R: successful functional units for the same workload/quality definition.

Comparable before/after evidence needs matching scope/method, energy sources, hardware allocation and quality checks. Missing inputs, failed quality checks or incompatible boundaries block a complete comparison. Reductions can be negative.

The synthetic worksheet example demonstrates arithmetic only. Worksheet edits are local to the page; export before leaving. It does not update the fleet ledger.

## What verification proves

| Check                          | Proves                                                  | Does not prove                               |
| ------------------------------ | ------------------------------------------------------- | -------------------------------------------- |
| Source re-detection            | Supported finding disappeared in the sandbox            | Measured electricity reduction               |
| Cache replay                   | Call reduction and the included answer/isolation checks | General production quality or carbon benefit |
| Waste simulation               | Expected synthetic inventory transition                 | Live cleanup, energy or billing savings      |
| Carbon forecast/Job completion | A plan estimate or execution state                      | Measured before/after emissions              |
| Complete SCI assessment        | Calculation from supplied compatible evidence           | Independent assurance or certification       |

Standards references are background, not conformance claims: the SCI-based calculator is not ISO certification; GHG Protocol inventories and ESRS/ISSB disclosure reporting are not implemented.

## Evidence to include in a submission

Export the selected run and supported demo evidence. State the data source, period, baseline, approved change, observed checks, agent overhead, estimation method, assumptions and missing inputs. Use public/open/synthetic evidence and non-personal demo aliases.

See [submission status](SUBMISSION.md) for what has actually been checked.
