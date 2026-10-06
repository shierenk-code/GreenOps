# Design: Azure subscription baseline and carbon translation engine

Status: synthetic baseline, translation, seven-agent assessment and dashboard rollup are implemented in the local prototype. A limited read-only VMSS/autoscale configuration collector was added on 7 October 2026; see [data onboarding](../development/bring-your-own-data.md). Full live Azure baseline discovery and writes remain out of scope. This document retains the design phases and formulas; see [current architecture](../architecture/overview.md) for execution/storage boundaries.

## Goal

Every GreenOps agent works from one shared mock Azure subscription, so each finding traces back to a resource, team, region and grid factor. A single translation engine turns raw metrics into energy and carbon, and the dashboard rolls the results up into one story.

## Principles

1. **Fixtures contain facts, not conclusions.** No waste labels, recommendations, ratings or carbon results in data files. `validateBaseline` rejects those fields, so the dashboard cannot just display numbers typed into a fixture.
2. **Every number declares its evidence kind:** `measured`, `modeled` or `synthetic`, with sourced assumptions.
3. **Unknown is not zero.** Missing inputs produce `null` plus a visible gap.
4. **Same method before and after.** A saving is `before − after` under identical factors.
5. **Backward compatible.** The existing fleet fixtures, CLI and tests keep working while agents move to the baseline.

## Decisions

| Question                      | Decision                                                                                                                                           |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Which agents use the baseline | All of them: Digital Waste, AI Efficiency, Carbon Incident, Architecture, Disaster Recovery, Collaboration, plus the new Pipeline Efficiency agent |
| Pipeline Efficiency in the UI | Its own specialist tab                                                                                                                             |
| Grid factors                  | Illustrative values labeled `synthetic` in the first pass; replace with cited annual averages later                                                |
| Maturity rubric               | As proposed below                                                                                                                                  |

## Data (Phase 1, implemented)

- `fixtures/azure-baseline/subscription.json`: Contoso Retail (synthetic), one subscription, September 2026 (720 h), regions `eastus`, `northeurope`, `centralindia`, teams platform/commerce/data/ai-assistants/corp-it.
- `fixtures/azure-baseline/factors.json`: per-region grid factors, PUE, per-vCPU min/max watts, memory, storage, replication, embodied carbon, AI Wh per 1k tokens by model tier, and a SKU catalog. Each factor carries `kind` and `source`; values are starting points to verify.
- `packages/measure/src/baseline.ts`: types and `validateBaseline()`.

What the data covers, per agent (waste is planted alongside healthy controls):

| Agent               | Raw inputs in the baseline                                                                    | Planted waste                                                                                                                                                                                  | Healthy controls                                                                                                                |
| ------------------- | --------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Digital Waste       | VMs, App Service plans, AKS pools and workloads, disks, registry images, Log Analytics tables | 4 idle dev VMs running 24/7; over-tiered marketing App Service plan; idle dev preview plan; over-requested AKS pods; 2 orphaned Premium disks; 2.4 GB image; 12 GB/day debug logs kept 90 days | Scheduled dev VM; busy commerce API plan; recently detached scratch disk; attached ETL disk; slim image; compliance audit table |
| Pipeline Efficiency | GitHub Actions and Azure Pipelines run summaries, runner SKU or self-hosted VMSS              | commerce-api: 22% cache hit, no layer reuse, 96 duplicate-commit runs, 1.8 GB artifacts; web-frontend: 140 duplicate runs                                                                      | data-platform: 81% cache hit, PR-only trigger                                                                                   |
| AI Efficiency       | Azure OpenAI deployments and monthly gateway aggregates with prompt fingerprints              | Low cache use on repeatable support prompts; large model for short classifications with 2,000 max tokens; retry storm with zero backoff                                                        | PR review agent on a small model with high cache use                                                                            |
| Carbon Incident     | Hourly CPU for the nightly ETL VM, hourly regional grid intensity                             | Two runaway spikes (03:00, 06:00), the second in a higher-carbon hour                                                                                                                          | Steady baseline hours                                                                                                           |
| Architecture        | VMSS/App Service autoscale settings, IaC source tags, region placement                        | Web VMSS fixed at 4 instances at 18% CPU; prod reporting VM in the highest-carbon region with no residency constraint                                                                          | Autoscaled build agents and API plan                                                                                            |
| Disaster Recovery   | SQL and Redis replicas, modes, RPO/RTO targets                                                | Low-criticality reporting DB with 2 hot geo-replicas and a 24 h RPO target; session cache with 3 hot replicas                                                                                  | High-criticality billing DB with one hot replica and a 5-minute RPO                                                             |
| Collaboration       | Microsoft 365 recordings linked to the tenant                                                 | Duplicate all-hands recording; long retention with no views                                                                                                                                    | Short-retention standup; board review under compliance hold                                                                     |

## Translation engine (Phase 2)

New `packages/measure/src/translate.ts`; existing `GreenOpsMeasure` methods stay.

| Resource                                              | IT energy (then × PUE)                                                                               |
| ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Compute (VM, VMSS, App Service, SQL, Redis, AKS pool) | `hours × vCPU × instances × (minW + util × (maxW − minW)) / 1000` + `hours × memoryGb × memW / 1000` |
| Disk / storage                                        | `hours × TB × Wh_per_TB_hour(media) × replicationFactor / 1000`                                      |
| CI/CD                                                 | Runner energy via the compute formula × run minutes / 60 × runs                                      |
| AI                                                    | `(input + output tokens) / 1000 × Wh_per_1k(modelTier) / 1000`                                       |

Carbon: `kWh × grid(region) / 1000`. Embodied (SCI M): `hostKgCo2e × hours / lifetime × vCPU / hostVCpu`, reported separately.

Output: `Footprint { energyKwh, operationalKgCo2e, embodiedKgCo2e, kind, assumptions, gaps }` and `Saving { before, after, deltaKwh, deltaKgCo2e, method }`, with `null` for unknowns.

## Agents (Phases 3–4)

- Each existing agent gains a baseline mode, selected when the input file has `schemaVersion`. Legacy fixture mode is unchanged.
- New `pipeline-efficiency` agent and dashboard tab.
- Findings carry populated `assumptions` and a `Saving`. Remediation text comes from the rule that fired.

## Rollup and dashboard (Phase 5)

- Optional ledger field `baselineRollup`: current vs. optimized monthly burn by region, team and agent; share of each total that is measured, modeled or synthetic; GreenOps' own footprint and break-even.
- Maturity rating out of 100: remediated waste share 30, placement carbon intensity 20, pipeline efficiency 15, AI efficiency 15, evidence quality 10, agent accountability 10. A ≥ 85, B ≥ 70, C ≥ 55, D ≥ 40, E ≥ 25, F below. The breakdown is always shown.
- Panels: Infra & Idle Assets, Clean Code & CI/CD, AI Workload Footprint, Executive Rollup, and a team scorecard. A "Synthetic subscription" badge is shown when `provenance = synthetic`.

## Out of scope

Real Azure reads (the schema is designed so `az graph query` plus Azure Monitor can produce it later), any Azure writes, and measured energy. Savings stay **not verified** until metering exists.
