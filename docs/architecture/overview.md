# GreenOps Engineering Architecture

Implementation alignment: **6 October 2026**, `greenops-init`. GreenOps is a TypeScript monorepo containing repository analysis, six specialist assessments, a staged sustainability workflow, ledger accounting and a local Next.js dashboard. See the [judge quick start](../../README.md#judge-quick-start-run-the-proof-of-concept) for runnable paths.

## Execution and presentation

```text
Repository / diff / PR             Synthetic operational JSON
          |                                  |
Repository analysis                   Fleet orchestrator
          |                          plan -> delegate -> aggregate
          |                                  |
          +---------- findings --------------+
                         |
 Detect -> Investigate -> Compare -> Simulate -> Approve -> Improve -> Verify
                         |                                  |
                 Sustainability Ledger               Re-run detection
                         |
                Local dashboard loader
                         |
      Executive Overview / six agents / Human Approvals
                         |
        Browser-local plan decisions (not execution)
```

Read-only review can stop before application and need not have a completed run outcome. Fleet planning is implemented orchestration over supported data contracts, not an unconstrained LLM planner. Reasoners assist investigation/recommendation where supported; deterministic detectors, safety rules and execution adapters remain authoritative.

| Specialist, in dashboard order                   | Evidence scope                                             |
| ------------------------------------------------ | ---------------------------------------------------------- |
| Carbon Efficiency (internal ID: carbon-incident) | Carbon/energy time-series and regional anomalies           |
| Digital Waste                                    | Cloud utilization, storage, images, log retention          |
| AI Efficiency                                    | Token usage, prompt fingerprints, repeated calls, retries  |
| Architecture                                     | Infrastructure sizing, IaC, autoscaling, regions           |
| Disaster Recovery                                | Replicas, backup retention, standby and RTO/RPO            |
| Collaboration                                    | Recordings, transcripts, duplicate summaries and retention |

Specialist findings are not permission to mutate a system. Fleet fixtures simulate operational evidence; they are not live cloud discovery.

## Components

| Component                                                  | Implemented responsibility                                                            |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| @codevitals/repository, parser, symbols, references, graph | Static repository evidence and relationships                                          |
| @greenops/detect                                           | Static sustainability detectors                                                       |
| @greenops/measure                                          | Disclosed modeled conversions and SCI-based evidence/calculation                      |
| @greenops/ledger                                           | Stage records, outcomes and self-accounting                                           |
| @greenops/agent                                            | Seven-stage workflow, policy, bounded retries, supported sandbox fix and verification |
| @greenops/agents                                           | Six specialist detectors and fleet planning/delegation                                |
| apps/cli                                                   | Review, code-analysis run, synthetic fleet, Carbon/Waste and `serve` entry points     |
| @codevitals/github-app, connectors                         | Webhook listener (`greenops serve`), PR checks, summaries and inline comments         |
| apps/CodeVitals-MCP                                        | stdio MCP repository-health server (`codevitals-mcp`)                                 |
| apps/CodeVitals-MCP/website                                | Local ledger presentation, plan-review UI, isolated cache demo and SCI worksheet      |

## Operating modes and safety

**Code analysis:** analyzes source and supports duplicate-import remediation in a retained temporary sandbox. It re-runs detection and records before/after hashes. The analyzed working tree is not edited. Other strategies can remain withheld or unapplied.

**Fleet assessment:** reads synthetic AI/cloud/carbon/IaC/DR/collaboration contracts. Findings traverse the decision workflow, but live infrastructure execution adapters are not wired into this fleet path. Approval does not turn an unsupported strategy into an implementation.

**Isolated cache demo:** has its own versioned baseline/decision/application/replay/rollback workflow, separate from fleet ledgers and real workloads.

Default policy requires human approval. `--auto` cannot bypass `requireApproval: true`, `autoApply: false` or disabled fixes; an explicit automatic-policy opt-in still allows only trivial reversible proposals. Unsupported operations remain unapplied. Verified finding resolution is separate from metered carbon savings.

### Operational paths added alongside the fleet loop

`OrchestratorAgent.runOperational()` delegates Carbon planning and Waste discovery/planning through typed operations. The existing fleet `run()` does not implicitly access clusters or invoke these execution adapters.

| Path                        | Implemented boundary                                                                                                                                | Remaining gap                                                                                                           |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Carbon forecast and plan    | Cached public GB forecasts or synthetic provider; complete-window comparison, deadline/residency/cost/latency checks and minimum-benefit thresholds | No global feed or automatic cloud-to-grid mapping                                                                       |
| Carbon dispatch             | Opt-in CLI approval; restricted suspended, stateless/idempotent Kubernetes batch Job; dry run, freshness/state checks and persisted receipt         | Not validated against live AKS; no durable scheduler, running-workload migration or cross-cluster transaction guarantee |
| Carbon verification         | Separate compatible before/after evidence and quality checks; simulation stays unverified                                                           | Inputs are supplied, not automatically metered or independently assured                                                 |
| Digital Waste discovery     | Explicit context/namespace, read-only kubectl inventory and bounded supplied utilization history                                                    | No Azure subscription-wide discovery or automatic history collection                                                    |
| Digital Waste plan/simulate | Source/version-bound proposal, evidence blockers, expiring local decision and copy-only synthetic change                                            | No live cleanup/resizing or measured savings                                                                            |

CLI commands append stage records and separate `operationalOutcomes` with run/plan IDs, tool calls/failures, retries, duration and model counters. Zero model calls in deterministic operations does not mean zero electricity: physical footprint remains unknown. Ledger persistence is application-level append-only JSON. Each save writes a temp file, fsyncs it and renames it over the ledger, so a crash or a concurrent reader sees a complete old or new document. It is not cryptographically immutable or safe for concurrent writers.

## Model boundary

The reasoner factory supports offline, Gemini, OpenAI and loopback Ollama. Explicit CLI provider selection overrides environment selection. With no selection, configured Gemini credentials (`GEMINI_API_KEY` or `GOOGLE_API_KEY`) take precedence over OpenAI, otherwise rules are used. The committed root `.env` currently selects Gemini; a shell-exported `GREENOPS_LLM_PROVIDER` overrides it. Model defaults are code configuration, not evidence of service availability or account access.

Structured provider output is validated. Available provenance includes provider/model, generated or fallback status, safe failure information and returned usage. Rejected output can still have consumed tokens. A timeout can leave usage unknown; unknown is not zero. Circuit breaking and bounded attempts avoid repeatedly calling an unavailable service during one reasoner instance.

Keep credentials server-side and out of ledgers/exports. The dashboard loads recorded provenance; loading results does not call a model or test a key. Raw private reasoning is not a dashboard feature.

## Dashboard architecture

The active implementation is under website/src/app/dashboard/control-plane:

| Module                                   | Role                                                                                          |
| ---------------------------------------- | --------------------------------------------------------------------------------------------- |
| control-plane-dashboard.tsx              | Shared shell, query navigation, data mode, refresh/import, approval overlay, notifications    |
| types.ts                                 | Agent mappings, data contracts and eleven supported navigation destinations                   |
| data.ts                                  | Selected-run adapter and explicitly synthetic scenario catalog                                |
| executive-overview.tsx                   | Decision-first summary, finding review queue, separate sandbox entry and six specialist links |
| workspace-pages.tsx                      | Shared specialist sections, investigations, results export and recorded activity              |
| evidence-comparison.tsx                  | Compatible recorded CPU/energy comparisons; no missing-value inference                        |
| audit-pages.tsx                          | Full-page recommendation review, shared approval queue and curated lifecycle ledger           |
| notification-data.ts / notifications.tsx | Data-derived alerts, links and temporary read state                                           |

### Navigation

**Workspace** contains Overview, Investigations and Approvals. **Specialists** contains Carbon Efficiency, Digital Waste, AI Efficiency, Architecture, Disaster Recovery and Collaboration. **Evidence** contains Results & Evidence and Agent Activity.

Canonical views use /dashboard?tab=overview|investigations|approval|carbon|waste|ai|arch|dr|collab|results|activity. `workspace-pages.tsx` supplies four consistent specialist sections selected by `section=findings|recommendations|results|activity`, the cross-agent investigation list, result export and curated activity view. `finding` selects a full-page review in place of the inventory. Agent/finding links preserve selected run context. The environment selector has been removed; the UI requests all environments.

Legacy agent routes map to specialist tabs; findings to Investigations, trace/audit to Agent Activity, reports/improvements to Results & Evidence. The ledger component is mounted by Agent Activity; the old Meta self-audit page remains unmounted. Cache and Waste workflows open explicitly via `sandbox=1`, separate from the four specialist sections. The cache demo and measurement worksheet remain auxiliary routes.

### Data acquisition

1. The CLI writes a versioned JSON ledger.
2. The server loader honors an explicit GREENOPS_LEDGER_PATH; otherwise it searches known filenames in the root and website directories and picks the newest valid file by modification time.
3. Bounded reads reject files over 20 MiB. An invalid explicit path is an error, not permission to substitute a different dataset.
4. Selected-run lookup fails closed when a requested run is absent.
5. The adapter reconstructs public evidence from the selected run, then builds six agent workspaces. Category mappings support older agent attribution.
6. Refresh fetches the latest saved ledger. Import parses a selected file locally and caches a validated snapshot in session storage; refresh clears snapshot mode.

Recorded time filters use the selected run timestamp, not wall-clock live monitoring. Recorded financial ROI and monthly carbon projections remain unavailable without a suitable basis. Application followed by successful verification is required for a verified state.

**Known coverage gap:** findings classified as generic code-analysis have no seventh specialist mapping and are omitted from current agent inventories and opportunities. The ledger itself is retained. **Current presentation:** the overview exposes Resources used by GreenOps (reported tokens, model requests, tool calls, retries, duration and missing usage) with expandable limits. Agent Activity exposes curated lifecycle records, but CLI `operationalOutcomes` and separate sandbox sessions are not integrated into the fleet UI.

The theme picker has five URL-preserved choices: `clean` (sage/lime), `olive` (default; charcoal sidebar/white panels/forest-olive accents), `dark`, `forest`, and `highContrast`. Themes do not change run selection, evidence or approvals. The Overview lifecycle strip explains the workflow rather than asserting current run progress, and resource usage is collapsed by default.

### Digital Waste dashboard sandbox

`digital-waste/workflow-client.tsx` calls the same-origin loopback API in `digital-waste/api/route.ts`; `workflow-service.ts` uses the shared compiled orchestrator/planner. Its synthetic inventory and historical usage come from `packages/agents/src/waste-demo.ts`. It cannot call a live cluster or model. The workflow is find → inspect → human decision → simulate → check → export, with server-side version/expiry checks. Saved decisions replace the review form until explicitly revised.

Local sessions and historical JSON snapshots are under the website's ignored `.tmp/digital-waste-workflow/`. They are separate from browser-local fleet reviews and the selected fleet ledger; workflow checks do not increase fleet verified counters. Exports include decisions, before/after inventory and operational accounting. A checked simulation is not production verification, authentication or tamper-proof audit evidence.

### Samples, decisions and notifications

Sample scenarios are generated locally and explicitly selected with data=sample. Their 30-scenario catalog is independent of CLI fixture output; the default 30-day scope includes 24. Sample figures and history are illustrative. Sample approval state resets on reload.

Recorded plan decisions reuse the local approval store. A self-declared reviewer, reason and acknowledgment are required. Records bind to run/finding and a SHA-256 proposal fingerprint; changed evidence requires new review. Browser locks serialize local saves and storage/locking failures disable them. History is browser-local, not authenticated, shared or tamper-proof. It is not written back to the source ledger and cannot authorize execution.

The bell derives notifications from the selected dataset: pending/revision groups, recorded fallback, analysis readiness and load errors. Links open the corresponding agent/finding. Read state is in memory and resets on reload. There is no external notification service or live model-health check.

## Controlled AI cache demonstration

The AI agent's embedded demo and /dashboard/ai-efficiency-demo use the existing isolated demo API. Fixture replay uses eight synthetic requests, preserving private-request cache exclusions and expected outputs. A successful replay reduces provider calls from eight to four; fixture token units are illustrative.

Optional Gemini execution requires confirmation and uses built-in synthetic prompts only. A completed run is bounded to 13 requests (8 baseline, 1 recommendation, 4 replay), each with a 15-second timeout and 1,024-token output cap, without automatic retries. Workload failure stops execution; advice-only fallback is disclosed.

Actions require same-origin JSON, an action header, a session cookie and matching run version. Local versioned records live under the website's ignored .tmp/ai-efficiency-demo directory. Decisions are self-declared, not enterprise identities. This is a single-process loopback demonstration; origin checks are not a replacement for authentication and deployment isolation.

New runs report request/quality evidence without converting tokens into measured carbon. Exported SCI assessments identify missing electricity, region and hardware inputs. Benchmark and recommendation costs remain distinct.

## Measurement boundary

The SCI-based calculator uses (E × I + M) / R with a declared workload boundary, successful functional unit, evidence quality and compatible before/after methods. PUE is applied only to IT-only energy. Missing material inputs, incompatible workloads or failed quality checks prevent a complete comparison.

The auxiliary /dashboard/measurement worksheet is user-supplied evidence capture, not automatic metering, certification or corporate disclosure compliance. Legacy fleet estimates use illustrative assumptions and may overlap; summing them is not a verified savings plan.

## Deployment boundary

This is a local prototype. Website dev/start bind to 127.0.0.1. Do not expose ledger/demo endpoints over a public interface or tunnel without authentication, authorization, durable protected storage, rate controls and execution-specific safeguards.

The website is nested outside the root pnpm workspace globs and needs its own installation/build. Its `predev`/`prebuild` scripts compile the shared agents/ledger packages. CI installs website dependencies and tests security patches, but does not explicitly run the website production build or lint. Local builds do not establish fresh-machine or GitHub-hosted success; see [submission validation](../SUBMISSION.md#validation-record).
