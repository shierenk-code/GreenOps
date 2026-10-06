# GreenOps architecture

Implementation reference, reviewed 6 October 2026. Start with the [quick start](../../README.md#quick-start); this document describes the current code, not a target architecture.

## System boundaries

GreenOps is a TypeScript monorepo with a CLI, repository analysis, seven specialist detectors, optional Gemini reasoning, evidence storage and a Next.js dashboard.

There are three distinct paths:

| Path                  | Input and processing                                                                        | Output                                                                                           |
| --------------------- | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Source review         | Repository/diff, AST, symbols and dependencies; sustainability rules and optional reasoning | Findings and ledger; supported duplicate-import fix can be checked in a temporary sandbox        |
| Fleet assessment      | Supplied operational records or the synthetic Azure baseline; seven specialist checks       | Recommendations, stage trace, usage and optional subscription rollup; no general cloud execution |
| Operational workflows | Explicit Carbon planning/dispatch or Waste discovery/planning commands                      | Separate operational outcomes and evidence; each adapter has its own safety boundaries           |

The dashboard presents evidence. Opening a page or refreshing results does not start a fleet scan or invoke Gemini.

## Core components

| Component                                                                                                                  | Responsibility                                                                        |
| -------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| [CLI](../../apps/cli/src)                                                                                                  | Scan/review/run, connection/sync, monitoring and operational commands                 |
| [Repository engine](../../packages/repository/src), [parser](../../packages/parser/src), [graph](../../packages/graph/src) | Static repository context and relationships                                           |
| [Detection](../../packages/detect/src)                                                                                     | Sustainability rule findings                                                          |
| [Fleet orchestrator](../../packages/agents/src/orchestrator.ts)                                                            | Plan input-to-agent work, delegate, aggregate findings and record specialist failures |
| [Baseline scan](../../packages/agents/src/baseline-scan.ts)                                                                | Assess the supplied Azure subscription and build rollups                              |
| [Workflow agent](../../packages/agent/src/index.ts)                                                                        | Detect, investigate, compare, simulate, approve, improve and verify                   |
| [Gemini reasoner](../../packages/agent/src/gemini-reasoner.ts)                                                             | Bounded model-assisted investigation with validated output, provenance and fallback   |
| [Measurement](../../packages/measure/src)                                                                                  | Modeled conversions, baseline translation and SCI evidence checks                     |
| [Ledger](../../packages/ledger/src)                                                                                        | Stage events, outcomes and agent resource accounting                                  |
| [MCP server](../../apps/CodeVitals-MCP/src)                                                                                | Repository-analysis tools; legacy component name retained                             |
| [Website](../../apps/CodeVitals-MCP/website/src)                                                                           | Presentation, account API, saved-run review and isolated demos                        |

GitHub review uses a separate webhook service; see [configuration](../github-app-setup.md). It is not the dashboard server.

## Seven specialists

| Specialist                                     | Supplied evidence                                       | Execution limit                                                                         |
| ---------------------------------------------- | ------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Carbon Efficiency (internal `carbon-incident`) | Energy intervals and regional intensity                 | Fleet only recommends; separate Carbon CLI can plan and dispatch a restricted batch Job |
| Digital Waste                                  | Compute/storage/image/log inventory and utilization     | Read-only Kubernetes discovery and synthetic changes; no live cleanup/resizing          |
| AI Efficiency                                  | Requests, tokens, repeatable prompts and retries        | Isolated cache demo works; no automatic changes to external applications                |
| Architecture                                   | Infrastructure records, sizing, autoscaling and regions | Recommendations, not comprehensive IaC deployment                                       |
| Disaster Recovery                              | Replicas, standby capacity and RTO/RPO                  | No real failover or recovery drills                                                     |
| Collaboration                                  | Retention, duplicate recordings and workflow records    | No live deletion or meeting-transcription service                                       |
| Pipeline Efficiency                            | CI runs, runner sizing, cache and artifacts             | No automatic CI configuration deployment                                                |

These are specialist checks with optional LLM assistance, not seven independently running LLM services.

## Reasoning and human control

Deterministic detectors identify evidence-backed candidates. The reasoner explains supported recommendations; provider output is validated and never grants execution authority. Gemini is the configured project LLM. Legacy adapters remain in source for compatibility but are not part of the recommended setup.

Explicit offline mode uses rules. Provider failures record generated/fallback status and available token usage; failed requests with unknown usage are not counted as zero. Loading a recorded Gemini-labelled run does not establish current API availability.

The workflow withholds by default. Repository policy, supported-operation checks and explicit approvals govern application. Approving a finding in the dashboard records a **plan review only**. No UI approval directly calls Kubernetes, deploys code or deletes resources.

## Evidence and storage

| Mode                       | Runs                                             | Decisions                             | Identity                    |
| -------------------------- | ------------------------------------------------ | ------------------------------------- | --------------------------- |
| Local, no database         | Bounded JSON ledger load/import                  | Browser-local, proposal-bound history | Self-declared reviewer      |
| Connected workspace        | Account-scoped MongoDB snapshots uploaded by CLI | Account-scoped proposal-bound records | Signed-in account           |
| Dashboard Sample scenarios | Separate synthetic catalog                       | Session-only simulations              | Demonstration only          |
| Cache/Waste sandbox        | Separate server-side demo sessions and exports   | Version-bound sandbox decisions       | Self-declared demo reviewer |

Account mode activates when `MONGODB_URI`, `WEBSITE_HOSTNAME`, or an HTTPS `GREENOPS_PUBLIC_URL` is set. It authenticates the user and loads their uploaded run; it does not fall back to a local ledger when the account is empty.

The CLI connects through a short-lived, single-use link, then uploads run evidence. The website polls for account updates every ten seconds. See [connected workspace](../cloud-dashboard.md) for configuration and privacy boundaries.

Local ledger saves use temporary files and atomic replacement. This protects readers from partial JSON; it does **not** provide cryptographic immutability or concurrent-writer safety. Review fingerprints bind decisions to evidence but do not make the whole ledger tamper-proof.

## Dashboard presentation

The active UI is [control-plane](../../apps/CodeVitals-MCP/website/src/app/dashboard/control-plane):

- `control-plane-dashboard.tsx`: shell, selected run, source/date filters and review state.
- `data.ts`: recorded-run adapter and explicitly synthetic scenario catalog.
- `workspace-pages.tsx`: shared specialist summaries, chart, three initial findings and expandable inventory.
- `audit-pages.tsx`: finding evidence, safeguards, decision form and separate prototype-demo panel.
- `carbon-atlas.tsx`: recorded/synthetic regional observations, rankings and resource links.
- `live-workspace.tsx`: separately connected machine counters, public grid context and explicit Gemini assessment.
- `subscription-rollup.tsx`: modeled subscription comparison, maturity and team scorecard.

Navigation includes Overview, Investigations, Approvals, seven specialists, Results & Evidence and Agent Activity. Each specialist has Findings, Recommendations, Results and Activity sections. The appearance picker has been removed; existing theme compatibility remains.

Recorded date presets are relative to the selected run timestamp. Custom dates filter finding timestamps inclusively by UTC date. Same-day mock findings can appear identically under multiple presets. Run overhead and the subscription baseline keep their original measurement period.

Account refresh preserves an unfinished review when evidence is unchanged. Changing the selected evidence can invalidate the review. The signed-in identity comes from the server, not a freely editable reviewer field.

## Operational paths and verification

Carbon supports synthetic or cached public GB forecasts, constraint-based planning and a restricted approval-gated Kubernetes batch-Job adapter. Live AKS validation, a durable scheduler and arbitrary running-workload migration remain gaps.

Waste supports bounded read-only namespace discovery and evidence-gated CPU/storage plans. Its simulation changes a copy of synthetic inventory, never the live cluster.

The cache demo applies an actual per-run cache to synthetic/provider responses and checks call reduction, answers and private-response isolation. Waste checks a synthetic state transition. Source remediation re-runs detection. None of those checks alone establishes measured carbon savings.

CLI `operationalOutcomes` and separate demo sessions are not merged into fleet dashboard counts. Generic source-code findings also remain outside the seven specialist inventory mappings.

See [operational safeguards](../operational-workflows.md), [measurement](../measurement.md) and [current validation](../SUBMISSION.md#validation-record). Public hosting needs deployment-specific security validation; account support is not enterprise-readiness certification.
