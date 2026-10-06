# GreenOps Engineering — Prototype and Submission Status

Last reviewed against `greenops-init` on **6 October 2026**. This is an implementation inventory, not a claim of production readiness or a predicted jury score. Confirm the submission deadline and required artefacts with the organizers.

**Proof-of-concept repository:** [shierenk-code/GreenOps — develop](https://github.com/shierenk-code/GreenOps/tree/develop). Submit this branch link while `main` differs. Confirm judge access if private. The [README judge quick start](../README.md#judge-quick-start-run-the-proof-of-concept) contains clone/install instructions, three terminal demos with expected results, dashboard startup, two end-to-end workflows, sample-data provenance and limitations. The [setup guide](development/getting-started.md#troubleshooting) covers common failures.

## Deliverables

| Artefact         | Repository status                                                                                         | Next step                                                    |
| ---------------- | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| Proof of concept | CLI analysis, synthetic fleet assessment, local dashboard, sandbox improvements and tests are implemented | Rehearse the exact run that will be presented                |
| Agent design     | [Architecture](architecture/overview.md) describes execution and trust boundaries                         | Convert to the organizer's required format if necessary      |
| Pitch deck       | Completion not established by this code review                                                            | Confirm the team's current deck and use current-run evidence |
| Demo video       | Completion not established by this code review                                                            | Record a complete review-to-verification demonstration       |

## What is implemented

### Code analysis and PR review

The shared sustainability review engine supports local review, changed-file filtering, text/JSON/Markdown output and GitHub PR review integration. Supported fixes run through the approval-gated workflow, not directly against the developer's working tree.

The bundled static-analysis demo detects deliberately wasteful code. Its implemented duplicate-import remediation changes a retained temporary sandbox, records hashes and re-runs detection. Other unsupported strategies stay unapplied. This is evidence of a source-code improvement, not metered environmental savings.

Run from the repository root after installation/build:

```powershell
pnpm.cmd greenops run .\fixtures\greenops-sample --provider offline --ledger .\greenops-ledger.json
```

The current six-agent dashboard does not expose generic code-analysis findings in agent inventories/approvals. Present this slice using CLI output and its ledger until the visibility gap is addressed.

### Six-agent fleet assessment

```powershell
pnpm.cmd greenops run .\fixtures\greenops-mock --fleet --provider offline --ledger .\greenops-fleet-ledger.json
```

Bundled synthetic fixtures cover Carbon Efficiency (underlying Carbon Incident agent), Digital Waste, AI Efficiency, Architecture, Disaster Recovery and Collaboration. The fixture set's expected 34 findings are distributed as 2 / 8 / 10 / 5 / 6 / 3 respectively. Quote the counts from the actual demonstration run, not this expected inventory.

The orchestrator plans from supported input contracts, delegates to specialist detectors and aggregates results. Provider-backed investigation is configurable; offline rules and disclosed fallback remain available. This is not an unrestricted autonomous LLM planner. The fleet loop does not execute cloud actions. A separate opt-in Carbon CLI adapter supports restricted Kubernetes batch-Job dispatch; arbitrary region migration, cloud deletion, IaC deployment and real failover remain unsupported.

Fleet ledgers record the orchestrator plan, specialist lifecycle events and GreenOps self-accounting events. For unsupported fleet execution adapters, zero applied/verified changes is an explicit capability boundary.

Unused `max_tokens` allowance is a right-sizing opportunity only, not consumed or avoided tokens, energy, carbon, or verified savings.

### Dashboard and local human review

Start the website separately; see [setup](development/getting-started.md).

- **Workspace:** Overview, Investigations and Approvals.
- **Specialist Agents:** Carbon Efficiency, Digital Waste, AI Efficiency, Architecture, Disaster Recovery and Collaboration.
- **Evidence:** Results & Evidence and Agent Activity. Each specialist has Findings, Recommendations, Results and Activity sections. Findings open dedicated full-page reviews.
- Recorded decisions are browser-local, proposal-bound plan reviews. Approve, reject and request-revision states do not imply execution.
- Notifications summarize pending work, recorded fallback and result-loading status. They are not live service monitoring.
- Recorded analysis is the default. Explicit Sample scenarios provide synthetic UI examples, not evidence of model success or achieved savings.
- Refresh/import loads existing results; it does not start an analysis.
- Environment switching is deliberately absent. Range filters are relative to the loaded snapshot.
- The overview exposes Resources used by GreenOps: reported tokens, requests, tool calls, retries, duration and missing usage, separately from workload savings.
- Five themes are available: sage/lime, Charcoal & Olive (default, second picker option), Dark Cyber, Sustainable Forest and High Contrast. Appearance changes preserve navigation and review context.
- The decision-first Overview includes a cross-agent review queue, six specialist links and a separate synthetic Digital Waste sandbox entry point. Its lifecycle strip is guidance, not claimed execution progress; resource accounting is expandable.
- Trace/audit routes resolve to Agent Activity; reports/improvements to Results & Evidence. Curated lifecycle events and whole-run resource usage are available; CLI operational-outcome records and separate sandbox sessions are not integrated into fleet navigation.

See the [README](../README.md#open-the-dashboard) for the current route table.

### Working AI Efficiency cache demo

Open **AI Efficiency Agent → Test cache optimization here**. The auxiliary route is also available at /dashboard/ai-efficiency-demo.

The controlled workflow is baseline → recommendation → explicit decision → sandbox cache change → replay verification → optional rollback. Fixture replay executes real cache/control logic against synthetic responses: eight requests require eight provider calls before caching and four afterward. All expected answers and private-response isolation must pass. The 340 → 180 token units are illustrative fixture values, not API usage.

Optional Live Gemini mode requires explicit API-use confirmation and uses only built-in synthetic prompts. Calls are bounded; workload failures stop rather than silently substitute fixture responses. Recommendation fallback is disclosed. A configured key or a successful one-off request does not prove a completed live benchmark.

Local reviewer labels and JSON evidence are not authenticated or tamper-proof approvals. The demo is loopback-only and single-process; it must not be exposed publicly without additional controls. Running a benchmark consumes resources and does not itself create net environmental savings.

### Carbon and Digital Waste operational workflows

- **Carbon:** synthetic scheduling/dispatch demo, optional public GB grid forecasts, cached evidence and bounded planning; minimum improvement defaults to 10 g CO2 and 5%. Restricted real batch-Job dispatch requires explicit CLI approval and cluster prerequisites and has not been validated on live AKS. Separate verification checks supplied baseline/after/quality evidence; forecast or Job completion alone is not verified savings.
- **Digital Waste:** explicit read-only Kubernetes inventory, supplied history and evidence-gated recommendations. No live cleanup/resizing. Synthetic CLI and dashboard workflows simulate changes and keep real savings unverified.
- **Dashboard Waste walkthrough:** open Digital Waste Agent → Open sandbox → Start waste workflow → `api-gateway` → approve simulation → simulate → check → export. Expected CPU request is 2 → 0.6 cores per replica in a copy; the two blocked findings demonstrate missing-evidence handling. Its session is separate from fleet findings and Approvals.
- **Accounting:** shared operational orchestration records run/plan IDs, calls/failures, retries and duration; deterministic operations use no model calls. Physical energy/carbon remain unknown, not inferred from elapsed time. CLI ledgers store these in `operationalOutcomes`; dashboard Waste exports its own accounting.
- **Gemini adapter:** CLI/agent uses native structured generation by default, validates completion and records reported total usage including thinking tokens. Rejected/truncated responses remain fallback; the separate cache demo retains its own bounded adapter.

See [architecture and boundaries](architecture/overview.md#operational-paths-added-alongside-the-fleet-loop) and [README operational instructions](../README.md#carbon-aware-kubernetes--aks-batch-scheduling).

### Standards and measurement

The SCI-based calculator and auxiliary /dashboard/measurement worksheet implement the calculation structure **(E × I + M) / R**, evidence fields, functional units, consistent before/after methods and data-gap checks. The worksheet is directly reachable but not linked in the current sidebar.

A complete assessment needs electricity, regional grid intensity, hardware allocation and workload/quality evidence. Token counters and cache-hit checks alone do not supply those inputs. Synthetic examples are calculation demonstrations, not actual improvements.

This is a reference implementation, **not ISO certification, GHG Protocol inventory compliance, ESRS reporting or ISSB conformance**. User-supplied evidence is not independently assured. See [measurement and assumptions](../README.md#measurement--assumptions).

## Position against the judging criteria

| Criterion                               | Evidence available                                                                               | Still needed for a convincing demonstration                                      |
| --------------------------------------- | ------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------- |
| Sustainability impact and measurability | Before/after sandbox checks, cache replay, explicit assumptions, SCI calculator                  | A defensible baseline and measured energy evidence if claiming carbon reductions |
| Agentic depth                           | Specialist delegation, staged lifecycle, tools, approval gates, failure handling, re-detection   | Make trace and decision-to-verification evidence discoverable in the new UI      |
| Sustainability of the agent             | Overview usage summary, ledger and operational accounting, unknown-usage handling                | Obtain complete usage and measured footprint evidence for stronger claims        |
| Demo and communication                  | Eleven destinations, consistent specialist tabs, full-page reviews and executable sandbox slices | A rehearsed end-to-end recording and final pitch artefacts                       |
| Innovation                              | Sustainability review combines code evidence, operational scenarios and agent self-accounting    | Demonstrate the integrated workflow rather than relying on feature breadth       |

## Validation record

**6 October 2026, cleanup on `greenops-init` (after `d30d2b2`):**

- Atomic ledger writes (temp file, fsync, rename) with new crash-safety tests; 17/17 ledger tests passed.
- Removed the unused MCP stub, `AutoApprover`, the unvalidated Docker/API-server stack and stale planning docs. Repo-scan tests now use a small generated Git repository instead of the whole monorepo.
- Full root suite completed: **1272 tests passed in 77 files**; MCP Jest **31/31**; frozen install, lint, build and version check passed. Offline fleet smoke run: 34 findings, all withheld.
- CI now runs a frozen-lockfile install with the 24-hour release-age guard and the MCP Jest suite. A hosted GitHub CI result was not checked.

**6 October 2026, existing local installation, implementation `d30d2b2`:**

- 405 tests passed across 15 targeted Carbon, Waste, orchestration, Gemini and dashboard files before the code push.
- Website production build passed using Next.js 16.3.6, including TypeScript and route generation.
- Theme selection and navigation were checked in the browser; screenshot capture timed out, so this is not a completed visual screenshot audit.
- During this documentation update, the three README terminal scenarios were rerun successfully with isolated `.tmp/docs-*-check.json` ledgers: fleet 34 findings/0 improved; Carbon about 0.432 kg CO2 projected reduction with simulated completion; Waste four findings, two reviewable and two evidence-blocked. Both operational simulations reported zero real cloud changes and unverified savings.
- No paid model calls or real cluster changes were made for these checks. No fresh-machine installation was performed. The attempted full root suite was stopped without a final result; do not describe the targeted pass as a full-suite pass. GitHub CI success was not verified.

Reproduce the targeted regression command from the repository root after both installations:

```powershell
pnpm.cmd exec vitest run tests/carbon-efficiency.test.ts tests/carbon-kubectl.test.ts tests/carbon-receipt-store.test.ts tests/carbon-verification.test.ts tests/dashboard-palette.test.ts tests/dashboard-waste-workflow.test.ts tests/digital-waste-inventory.test.ts tests/digital-waste-kubectl.test.ts tests/digital-waste-planner.test.ts tests/operational-orchestration.test.ts tests/control-plane-dashboard.test.ts tests/control-plane-agent-pages.test.ts packages/agent/tests/gemini-reasoner.test.ts packages/agent/tests/agent.test.ts packages/agent/tests/usage-accounting.test.ts --maxWorkers=2
```

### Historical validation

On 5 October 2026:

- **606 tests passed across 26 targeted dashboard/demo/worksheet files.**
- The website production build was rerun.
- These are targeted local checks, not a fresh full-monorepo, GitHub-hosted or live-provider certification.
- No paid model calls, real cloud mutations or production approvals were performed in this documentation review.

Historical checks are not presented as new evidence. In particular, earlier live-provider diagnostics did not establish a completed live benchmark.

## Submission priorities

1. Confirm judge repository access, rehearse from a fresh checkout and review GitHub CI; add explicit website production-build/lint coverage before claiming those checks run in CI.
2. Rehearse the synthetic fleet plus one complete cache or Waste decision-to-result flow, retaining exported evidence. Keep CLI operational records separate from fleet counters.
3. Label synthetic, observed, provider-reported and modeled figures distinctly.
4. Show agent overhead and incomplete SCI evidence honestly; do not claim verified net carbon benefit without it.
5. Confirm the pitch/video, deadline and third-party component disclosures with the team.

Only public, open or synthetic data should be used for the event. Keep credentials, customer material and personal data out of fixtures, recordings and committed artefacts. The root `.env` is a temporary documented exception; see [SECURITY.md](../SECURITY.md#data-and-disclosure).
