# GreenOps Engineering 🌱

> A local sustainability prototype that detects waste, supports human review, and verifies supported sandbox improvements. Operational savings and agent footprint estimates are not power-meter measurements.

GreenOps Engineering brings sustainability **into the decision loop** instead of checking it after the fact. It scans a real software workload, finds hidden sources of waste it calls **Sustainability Bugs**, and runs each one through a complete, human-controlled, fully-traceable loop:

```
Detect → Investigate → Compare → Simulate → Get Human Approval → Improve → Verify
```

Lifecycle records are written to an append-only **Sustainability Ledger**. GreenOps records its own reported tokens, tool calls and retries, preserving unknown usage. Its energy estimates help investigate—but do not establish a measured answer to—the question:

> **Is GreenOps saving more energy and carbon than it consumes?**

GreenOps is built on top of a real static-analysis engine (AST + symbols + dependency graph across TypeScript, JavaScript, Python, Go and Java), so the waste it detects is backed by concrete evidence, not guesses.

---

## Judge quick start: run the proof of concept

**Repository:** [shierenk-code/GreenOps](https://github.com/shierenk-code/GreenOps). **Current development branch:** [develop](https://github.com/shierenk-code/GreenOps/tree/develop). Use `develop` for the latest prototype work; `main` is the stable submission branch. If the repository is private, the submitter must grant the judges access before submission; the link alone is not sufficient.

Documentation last reviewed against `develop` on **6 October 2026**. The steps below need **Git, Node.js 22.12+ (22.x recommended), npm and pnpm 11.17.0**. Internet access is needed to clone/install; after installation, the default synthetic walkthrough needs **no API key, Gemini subscription, Ollama installation, Azure account or Kubernetes cluster**. Gemini is an optional model-assisted path, not a requirement for judging the safety workflow.

### 1. Install and generate the demonstration evidence

Commands are for **PowerShell**. On macOS/Linux use `pnpm`/`npm` instead of `pnpm.cmd`/`npm.cmd`, and `export NAME=value` instead of `$env:NAME = "value"`.

```powershell
git clone --branch develop --single-branch https://github.com/shierenk-code/GreenOps.git
cd GreenOps
node --version
npm.cmd install --global pnpm@11.17.0
pnpm.cmd install --frozen-lockfile
pnpm.cmd build

# Seven-specialist Azure subscription assessment using bundled synthetic inputs; no model calls.
pnpm.cmd greenops run ./fixtures/azure-baseline --fleet --provider offline --ledger ./.tmp/judge-baseline.json

# Independent operational demonstrations; approval and execution are simulated.
pnpm.cmd greenops carbon demo --simulate --ledger ./.tmp/judge-carbon.json
pnpm.cmd greenops waste demo --simulate --ledger ./.tmp/judge-waste.json
```

Expected results with the current fixtures:

| Demonstration     | What to look for                                                                                                                             | What it does not prove                                                       |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Azure baseline fleet | Seven specialists, 31 findings including 4 Pipeline Efficiency findings, 0 improved; a modeled subscription rollup shows 555.307 kWh current demand, a 229.939 kWh opportunity and maturity E → B; recommendations are withheld for human review | All data and savings are synthetic/modeled; no cloud changes or verified environmental savings |
| Carbon scheduling | `ready`, synthetic South England → South Wales plan, about **0.432 kg CO2 projected reduction**, simulated completion, `realCloudChanges: 0` | Forecast arithmetic is not measured savings; `savingsVerified` remains false |
| Digital Waste     | Four findings: two ready for review and two needing evidence; synthetic CPU request **2 → 0.6 cores per replica**; `realCloudChanges: 0`     | Reserved CPU capacity is not electricity or billing reduction                |

Run IDs, timestamps, duration and floating-point formatting vary. The Carbon/Waste commands also print `operationRun` accounting: these deterministic demos use zero model requests, and physical energy/carbon stay `null`. Their ledgers are separate from the fleet dashboard dataset.

### 2. Start the dashboard

In a second terminal, start in the cloned **GreenOps repository root**:

```powershell
cd apps/CodeVitals-MCP/website
npm.cmd ci
$env:GREENOPS_LEDGER_PATH = "../../../.tmp/judge-baseline.json"
npm.cmd run build
npm.cmd run start -- --port 3003
```

Open **<http://127.0.0.1:3003/dashboard>**. Keep that terminal running; `Ctrl+C` stops your server. If port 3003 is occupied, use `--port 3004` and open that port instead. Stop your own running server before rebuilding. The nested website is a separate installation; root `pnpm build` alone does not build its UI. Installation lifecycle scripts apply the repository's dependency security patches; do not disable them.

### 3. Follow one complete decision

1. **Overview:** inspect seven-specialist findings, the **Subscription baseline** rollup and **Resources used by GreenOps**. The rollup compares modeled opportunity with the analysis footprint; it is not a verified saving. Recorded usage is separate from workload savings; missing usage is not zero.
2. **Digital Waste Agent → Open sandbox → Start waste workflow:** start the isolated synthetic sandbox. Select `api-gateway`, review evidence and manual steps, enter a demo alias/reason, acknowledge the scope, then **Approve simulation → Simulate approved change → Check simulation result**.
3. Expect **Simulation checked. Real savings are still not verified.** Inspect the before/after values and **Export evidence**. No Kubernetes resource was changed; this sandbox does not update fleet counts or the central approval queue.
4. For a second executable slice, use **AI Efficiency Agent → Open sandbox → Fixture replay**: baseline → approve → apply to sandbox → replay and verify. Expected provider calls: **8 → 4**, with answer and private-response-isolation checks. Download evidence; optionally roll back.
5. Themes are appearance-only: **GreenOps Sunset** is the default; sage/lime, Charcoal & Olive, Dark Cyber, Sustainable Forest and High Contrast remain available. Changing themes does not run an agent or change evidence.

Normal recommendation reviews and **Human Approvals** record a plan decision only. Approval is not deployment or verification. Sample scenarios is a separate synthetic UI catalog, not this recorded fleet run. Refresh results reloads a saved file; it does not start a scan. If the page is empty, confirm the pinned fleet ledger exists and remove a stale `run=` URL parameter; see [troubleshooting](docs/development/getting-started.md#troubleshooting).

**Submission limits:** this is a local, single-process prototype with self-declared reviewers, local JSON/browser storage and no production authentication. Never expose it publicly or use customer/personal data. Read the [sample-data inventory](#sample-data), [known limitations](#known-limitations-honest-disclosure), [current submission status](docs/SUBMISSION.md) and [component-origin declaration](#component-origin-and-compatibility) before presenting claims. Live cluster execution is not part of this judge walkthrough.

## Digital Sustainability Control Plane

```text
                    DIGITAL SUSTAINABILITY CONTROL PLANE
                                  |
                    +-------------+-------------+
                    |      ORCHESTRATOR AGENT   |
                    |  Plan - Reason - Delegate |
                    +-------------+-------------+
                                  |
       +------------------------------ SPECIALIST AGENTS -------------------------------+
       |              |              |              |              |              |
       v              v              v              v              v              v
 AI Efficiency   Digital Waste   Carbon Incident  Architecture  Disaster Recovery  Collaboration
 tokens/retries  Cloud/AKS       energy/carbon    IaC/sizing    replicas/RTO-RPO   retention/knowledge
 tool calls      storage/logs    anomalies        regions       backup/storage     records/transcripts
       |
       +---------------------------+
                                   |
                                   v
                         Pipeline Efficiency
                  CI/CD cache misses, duplicate runs,
                       and oversized artifacts
```

### Architecture and execution flow

GreenOps uses one shared analysis core for local development, CI, GitHub pull requests, and the dashboard. Integrations collect context and present results; they do not duplicate sustainability detection logic.

```text
 Local repository / Git diff        GitHub PR / Webhook        Operational fixtures
              \                            |                            /
               +---------------------------+---------------------------+
                                           |
                                  ORCHESTRATOR AGENT
                           plan -> route -> aggregate -> account
                                           |
       +-------------------+---------------+---------------+-------------------+
       |                   |               |               |                   |
 AI Efficiency       Digital Waste   Carbon Incident  Architecture    Disaster Recovery
 tokens, retries,    compute, AKS,   energy/carbon    IaC, sizing,    replicas, backup,
 tool calls, cache   storage, logs   anomalies        regions         RTO/RPO
       +-------------------+---------------+---------------+-------------------+
                                           |
                    +----------------------+----------------------+
                    |                                             |
          Collaboration Agent                         Pipeline Efficiency
 meetings, recordings, transcripts, summaries       CI/CD cache, duplicate runs, artifacts
                                           |
                                UNIFIED FINDING MODEL
                  evidence + severity + confidence + impact + fix safety
                                           |
       Detect -> Investigate -> Compare -> Simulate -> Approve -> Improve -> Verify
                                           |
                         +-----------------+------------------+
                         |                                    |
              Sustainability Ledger                  Human approval gate
          decisions, cost, commit, PR,          required for risky changes
             before/after evidence
                         |
          CLI text/JSON/Markdown | GitHub Check + inline findings | Dashboard
```

| Agent                 | Primary responsibility                                                                                          | Example evidence                                                                   |
| --------------------- | --------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| **Orchestrator**      | Plans work, delegates to specialists, aggregates findings, and feeds the shared policy workflow                 | execution plan, agent coverage, retries, total self-cost                           |
| **AI Efficiency**     | Finds avoidable model and agent consumption using privacy-safe prompt fingerprints and token-accurate estimates | input/output tokens, repeated cacheable prompts, retry storms, backoff, tool calls |
| **Digital Waste**     | Detects idle or oversized digital resources                                                                     | compute utilization, unattached storage, large images, log retention               |
| **Carbon Incident**   | Detects abnormal energy or carbon behavior                                                                      | time-series spikes, carbon intensity, regional anomalies                           |
| **Architecture**      | Reviews designs and infrastructure-as-code for preventable waste                                                | autoscaling, resource sizing, Terraform, cloud region choices                      |
| **Disaster Recovery** | Balances resilience requirements against excess standby resources                                               | replicas, backup retention, RTO/RPO, idle failover capacity                        |
| **Collaboration**     | Identifies waste in collaboration data and AI-generated work products                                           | recordings, transcripts, duplicate summaries, retention periods                    |
| **Pipeline Efficiency** | Identifies preventable CI/CD compute and storage waste                                                        | cache-hit rate, duplicate commit runs, runner SKU and build-artifact size          |

The orchestrator never treats an agent recommendation as permission to change a system. Every proposed improvement carries evidence, estimated impact, confidence, blast radius, reversibility, and an approval decision. Only a change that is applied, tested, re-analyzed, and confirmed by verification is counted as a verified saving. GreenOps' own tokens, tool calls, retries, energy, and carbon are recorded as operational cost.

The core assessment loop has two deliberately separate modes; operational Carbon/Waste paths and isolated dashboard demos are described below:

- **Code-analysis mode** runs the real static analyzer against source code and can apply the implemented duplicate-import remediation to a safe sandbox.
- **Fleet mode** runs the orchestrator and all seven specialist agents against bundled synthetic operational fixtures. The legacy mock fixture supplies six domain inputs; Pipeline Efficiency intentionally returns zero findings until a pipeline inventory is supplied. It demonstrates breadth, planning, delegation, investigation, comparison, approval, and ledger traceability. Operational remediations remain approval-gated and are not falsely reported as applied.

Fleet-mode ledgers now retain the orchestrator plan, each agent's start/completion/failure event, GreenOps self-accounting events, and the resulting finding stages. Zero applied or verified operational changes is an intentional boundary: `GreenOpsAgent` refuses to apply code-analysis fixes when findings come from the fleet provider. The separate Carbon CLI dispatch adapter is not wired into this fleet path, and general fleet execution/rollback controls remain unimplemented.

---

## Quick start (offline, no API key required)

Use **Node.js 22** (the CI version) and **pnpm 11.17.0** (the repository pin). Run these commands from the **repository root**, not your home directory or the website folder. The nested website has a separate npm installation; see [development setup](docs/development/getting-started.md).

```bash
# 1. Install
pnpm install --frozen-lockfile

# 2. Build all packages
pnpm build

# Required for offline runs: the committed root .env selects Gemini.
# A shell value takes precedence over .env.
# PowerShell: $env:GREENOPS_LLM_PROVIDER = "offline"
export GREENOPS_LLM_PROVIDER=offline

# 3A. Review Sustainability Bugs locally (no source changes)
pnpm greenops review .
pnpm greenops review . --diff
pnpm greenops review . --format json
pnpm greenops review . --verbose  # include full code context

# 3B. Run the approval-gated improvement and verification workflow
pnpm greenops review ./fixtures/greenops-sample --fix

# 3C. Run the real code-analysis and sandbox-remediation demo directly
pnpm greenops run ./fixtures/greenops-sample --provider offline --ledger ./greenops-ledger.json

# 3D. Run the complete seven-specialist sustainability control plane
pnpm greenops run ./fixtures/greenops-mock --fleet --provider offline --ledger ./greenops-fleet-ledger.json
```

`greenops review` is the shared local/PR review surface. Text output is intended for developers; `--format json` supports CI and other integrations; `--format markdown` produces the same summary used by GitHub. `--diff` limits results to locally changed files. `--fix` delegates to the seven-stage workflow with an explicit terminal approval prompt. Without an interactive terminal it withholds changes.

### Terminal safety walkthrough (offline)

From the repository root:

```powershell
# Seven specialists: record findings, withhold changes under the default policy.
pnpm.cmd greenops run .\fixtures\greenops-mock --fleet --provider offline --ledger .\.tmp\fleet-review.json

# Supported code fix: explicitly review a duplicate-import merge in a sandbox copy.
pnpm.cmd greenops run .\fixtures\greenops-sample --provider offline --approve --ledger .\.tmp\sandbox-review.json
```

For the second command, type `APPROVE` only after reviewing the displayed proposal, then enter a reviewer label and reason. Entering anything else rejects it. The original fixture is not edited; re-detection verifies the sandbox change. Reviewer identity is self-declared, not authenticated. Other strategies remain recommendation-only. Energy/carbon output is an estimated conversion, not measured savings.

Default policy requires human approval. `--auto` cannot override `requireApproval: true`, `autoApply: false`, or disabled fixes; even with an explicit automatic-policy opt-in, only trivial reversible proposals qualify. `--approve` and `--auto` cannot be combined. Fleet execution adapters are not available.

### GitHub Pull Request review

Start the webhook listener with `pnpm greenops serve --port 3002` (secret and token from `--secret`/`--token` or `GITHUB_WEBHOOK_SECRET`/`GITHUB_TOKEN`; requests are rejected when the secret is missing). See [GitHub App setup](docs/github-app-setup.md). The listener invokes the same `SustainabilityReviewEngine` on pull-request `opened`, `reopened`, and `synchronize` events, using the environment's provider setting. It publishes a **GreenOps Sustainability Analysis** Check Run, an updatable commit-specific summary, inline findings where file/line evidence exists, and an auditable ledger trail. The integrated repository risk review remains active.

### Repository configuration

Add a `greenops` object to `.greenopsrc` or `.greenopsrc.json`:

```json
{
  "greenops": {
    "enabled": true,
    "local": { "enabled": true },
    "pullRequest": {
      "enabled": true,
      "checkRun": true,
      "inlineComments": true,
      "summaryComment": true
    },
    "fixes": { "enabled": true, "autoApply": false, "requireApproval": true },
    "thresholds": { "minimumSeverity": "low", "minimumConfidence": "medium" },
    "sustainability": { "reportEnergy": true, "reportCarbon": true }
  }
}
```

Risky fixes remain approval-gated. The current PoC never silently edits the developer's working tree: supported changes are applied to a retained sandbox and verified there.

Both modes retain a **fully offline fallback**. Select `GREENOPS_LLM_PROVIDER=gemini` for Google Gemini (`GEMINI_MODEL` selects the model; code default `gemini-3.8-flash`), `openai` for OpenAI API (`gpt-5`), `ollama` for a local model, or `offline` for deterministic rules. Precedence is `--provider` (on `run`), then a shell-exported variable, then the root `.env`, then `.env.local`; an already-set value is never overwritten. If the variable is unset everywhere, GreenOps uses `GEMINI_API_KEY` (or `GOOGLE_API_KEY`), then `OPENAI_API_KEY`, then rules.

> **Current repository default:** the committed root `.env` sets `GREENOPS_LLM_PROVIDER=gemini` and `GEMINI_MODEL=gemini-3.5-flash`. Commands without `--provider offline` — including `greenops review`, which has no `--provider` flag — therefore call Gemini and spend that key's quota. Set `$env:GREENOPS_LLM_PROVIDER = "offline"` in the shell for deterministic runs. See the `.env` note in [SECURITY.md](SECURITY.md#data-and-disclosure). The CLI and GitHub PR reviews present evidence-backed explanations with line gutters, severity badges, and concrete LLM-generated code remediations.

The CLI/agent Gemini adapter defaults to Google's native `generateContent` API with a bounded structured response. It accepts only completed, validated recommendations from the existing strategy catalog and records reported total token usage, including thinking tokens. Truncated or blocked responses remain fallback results; missing usage stays unknown. An explicitly configured `GEMINI_ENDPOINT` can retain the previous OpenAI-compatible transport. This does not change the separate dashboard cache-demo adapter. Model availability in a list does not guarantee a successful generation; validate one synthetic finding before a fleet run.

### Carbon-aware Kubernetes / AKS batch scheduling

The Carbon Efficiency module now has an opt-in scheduling path alongside its existing energy-spike detector. It compares full execution windows, including destination energy and transfer overhead, against a supplied baseline. It checks deadlines, maximum delay, residency, latency, cost and destination data readiness. Missing or stale forecasts block decisions instead of becoming zero emissions.

The minimum-benefit policy defaults to **0.01 kg CO2 (10 g) AND 5% reduction**. Override `minReductionKgCo2` and `minReductionPercent` in a workload configuration to fit the use case. Both thresholds are checked during planning and immediately before dispatch. A positive but insufficient improvement returns `below-threshold`: keep the existing schedule. These are configurable operational defaults, not scientific uncertainty bounds. Actual measurement uncertainty is checked separately during verification.

**Public data attribution:** [NESO Carbon Intensity API](https://api.carbonintensity.org.uk/) and [methodology/API documentation](https://carbon-intensity.github.io/api-definitions/), licensed [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). This adapter covers **Great Britain grid regions only**, with up to 48-hour forecasts in **gCO2/kWh**. It does not provide global coverage or lifecycle CO2e. Cloud-to-grid mappings must be supplied explicitly, not inferred from Azure region names. The demo adds separate synthetic South England / South Wales locations; existing US, Germany and South Africa infrastructure fixtures are not mapped to GB.

From the repository root:

```powershell
# Fully synthetic end-to-end demonstration, including simulated approval and clock advancement.
# It never calls Gemini, kubectl, or a cloud account.
pnpm.cmd greenops carbon demo --simulate

# Actual public grid data (no API key).
pnpm.cmd greenops carbon forecast --region 12

# Real forecasts + a clearly synthetic workload; planning only, no cluster access.
pnpm.cmd greenops carbon demo --live-forecast --output .tmp/carbon-plan.json --workload-output .tmp/carbon-workload.json

# Re-plan an explicitly configured workload using fresh public forecasts.
pnpm.cmd greenops carbon plan .tmp/carbon-workload.json --output .tmp/carbon-reviewed-plan.json
```

Plan/output files use exclusive creation: select a new filename instead of overwriting evidence. Times in generated workload files are UTC and must be refreshed when stale. `simulationOnly: true` prevents demo workloads from reaching real clusters, even when the forecasts are live.

**Real dispatch is opt-in and has not been validated against a live AKS cluster.** Before enabling it, configure real Kubernetes contexts, namespaces, region node labels and verified GB grid mappings; supply defensible energy/runtime estimates and confirm data, images, secrets, service accounts and network dependencies exist at the destination. Set `simulationOnly: false` only in that reviewed workload configuration. The source must be a stateless, idempotent, never-started, suspended `batch/v1` Job labelled `greenops.dev/carbon-managed=true`, with one completion/parallel worker and no CronJob owner, persistent/host volumes, custom affinity or fixed node. Running workloads, storage/data migration and creating AKS clusters are unsupported.

Dispatch uses a volume allowlist (`emptyDir`, `configMap`, `secret`, `projected`, `downwardAPI`), rejecting NFS, CSI, Azure disk/file, PVC, host-path, generic ephemeral and unknown volume sources. It supports standard `NonIndexed` Job semantics only. Indexed/external-controller Jobs, custom failure/success/replacement policies, per-index retries, TTL cleanup and unknown Job-spec fields are rejected instead of silently dropped. A source active-deadline limit is preserved as an upper bound on the target deadline. Configuration volumes and credentials must still be valid at the explicitly approved destination.

```powershell
# Only after the prerequisites above and a freshly generated plan:
pnpm.cmd greenops carbon execute .tmp/carbon-reviewed-plan.json --approve --receipt .tmp/carbon-receipt.json
pnpm.cmd greenops carbon status .tmp/carbon-receipt.json
```

Execution requires interactive `APPROVE`, a reviewer label and a reason; repository fix policy can still disable it. Approval is bound to the plan, source UID/version and pod-template fingerprint. The foreground process waits for the selected time, refreshes destination carbon evidence, checks the benefit (maximum 5% upward drift), source state, existing pods and available region-labelled nodes, then server-dry-runs the proposed Job. It claims the source with an optimistic version check, creates a deterministic suspended target, and resumes only the approved target. The original stays suspended. Stop the waiting process to cancel before dispatch; this is **not a durable scheduler**.

Execution reserves and flushes a new receipt file before any cluster mutation. Existing/unwritable receipt paths stop dispatch. A confirmed receipt is flushed before follow-up audit/status operations; a pending receipt left by interruption identifies the plan and expected target for manual investigation. This does not provide atomic cross-cluster/file transactions or crash-proof storage: disk failure can still leave partial output, so retain the separate dispatch-intent audit. Dispatch windows are rechecked after preflight and before resume; slow checks may leave a safely suspended target for review.

Safety boundaries: keep these Jobs exclusively managed by this workflow and restrict other writers with Kubernetes RBAC. Cross-cluster transactions/exactly-once guarantees are not provided. API failures may leave a source claim or suspended target; inspect and reconcile them before retrying, and never manually resume the original after target dispatch. No automatic deletion, rollback or retry of an ambiguous write is performed. Reviewer identity remains self-declared. The existing JSON audit ledger remains single-writer storage, not an immutable database. A plan fingerprint detects accidental edits; it is not a digital signature.

`carbon status` reports Kubernetes completion/failure, **not verified carbon savings or application-quality checks**. Carbon reductions remain forecast-based projections until comparable post-run energy measurements and output-quality evidence are provided. Gemini is deliberately not called for scheduling arithmetic or approval decisions. This CLI capability is not yet connected to dashboard execution controls.

After collecting workload measurements, generate a blank evidence worksheet and validate it:

```powershell
pnpm.cmd greenops carbon evidence-template .tmp/carbon-reviewed-plan.json .tmp/carbon-receipt.json --output .tmp/carbon-evidence.json
# Fill the worksheet from public/open/synthetic evidence; never include secrets or personal/customer data.
pnpm.cmd greenops carbon verify .tmp/carbon-reviewed-plan.json .tmp/carbon-receipt.json .tmp/carbon-evidence.json --output .tmp/carbon-verification.json
```

The worksheet intentionally leaves measurements blank; no forecast is copied into an observed result. Its [typed evidence contract](packages/agents/src/carbon-verification.ts) requires a historical baseline job and the dispatched job, the same input digest, boundary, allocation method, functional unit, successful-work quantity and passing quality criterion. Supply contiguous measured energy intervals (including transfer energy), actual grid factors in `gCO2/kWh`, source references and explicit energy/intensity uncertainty percentages. Baseline must precede dispatch; after-change evidence must match the receipt's target UID/region, completed execution window and deadline. Forecasts, missing readings, gaps, mismatched work, failed quality, unfinished jobs or simulated receipts cannot verify real savings.

For real receipts, the completed Job must expose valid Kubernetes `startTime` and `completionTime`. The after-change measurement intervals must cover that **entire observed execution window**, not merely a supplied sub-window or the planned duration. Missing timestamps, partial runtime coverage, future completion and completion beyond the deadline prevent verification. A genuinely faster job can pass if its complete observed runtime is covered. Up to 60 seconds of receipt/API timing skew is allowed before the recorded dispatch response; this never permits dropping part of the observed runtime.

`carbon verify` is read-only against Kubernetes. It exports a content-hashed report and appends a verification audit event. Outcomes distinguish `not-verified`, `no-reduction`, `inconclusive`, `synthetic-comparison`, and `verified-from-supplied-evidence`. For real evidence, a positive reduction must remain positive using baseline lower bounds and after-change upper bounds derived from the supplied uncertainty. Source documents, measurement allocation and quality attestations remain **user-supplied, not independently authenticated**. This is an electricity-generation CO2 comparison, not SCI/lifecycle certification, causal avoided-grid emissions, offsets or net savings after agent overhead. Automatic telemetry collection, enterprise identity, a durable scheduler and live AKS validation remain separate integration work.

Unused output-token allowance is recorded as a `tokens.headroom` configuration opportunity. It is not converted into avoided tokens, energy, carbon, or verified savings without metered evidence.

### Digital Waste: inventory, review and synthetic remediation

The existing fixture scan remains unchanged as an entry point. The new `greenops waste` path adds opt-in **read-only namespace-scoped Kubernetes/AKS discovery** and evidence-backed CPU-request/storage-release plans. There is **no live apply, patch or delete command** in this adapter. Approval records a local plan decision only; it cannot enable real cleanup.

```powershell
# Offline demonstration: two independent synthetic scenarios, no model or cloud calls.
pnpm.cmd greenops waste demo --simulate

# Export fresh synthetic inputs for manual plan/review testing (new filenames only).
pnpm.cmd greenops waste demo --inventory-output .tmp/waste-inventory.json --usage-output .tmp/waste-usage.json
pnpm.cmd greenops waste plan .tmp/waste-inventory.json --usage .tmp/waste-usage.json --output .tmp/waste-plan.json

# Copy a ready-for-review finding ID from the plan. This is not a deployment authorization.
pnpm.cmd greenops waste review .tmp/waste-plan.json --finding <finding-id> --decision approve --reviewer <reviewer-label> --reason "Reviewed synthetic evidence" --output .tmp/waste-decision.json
pnpm.cmd greenops waste simulate .tmp/waste-plan.json .tmp/waste-decision.json .tmp/waste-inventory.json --output .tmp/waste-simulation.json

# Optional later test against an explicitly selected non-production namespace, read-only:
pnpm.cmd greenops waste discover --context <aks-context> --namespace <test-namespace> --output .tmp/waste-discovered.json
```

Discovery uses six bounded, non-retrying `kubectl get` queries: Deployments, Pods, PVCs, ReplicaSets, HPAs and the namespace pod-metrics endpoint. It exports only resource identities, versions, CPU quantities, claim capacity and current pod-reference status. Environment variables, secrets, annotations, logs and full manifests are not persisted. Partial/RBAC-denied/oversized or incomplete lists are marked unavailable; absent metrics remain unknown. Use only public/open/synthetic or non-sensitive test data for the hackathon; scoped metadata can still contain sensitive resource names.

The [inventory and historical-usage contract](packages/agents/src/waste-inventory.ts) supports separately supplied usage evidence tied to workload UID, resourceVersion and container. CPU sizing requires seven representative days, at least 168 samples, 95% coverage and a window ending within 24 hours. The proposed request preserves the greater of p95 plus 50%, peak plus 20%, and 100 millicores, with a minimum 10% reduction. Active/unknown HPA ownership, incomplete inventory and protected namespaces block approval. VPA, custom controllers and GitOps ownership require manual confirmation. The Kubernetes [resource metrics pipeline](https://kubernetes.io/docs/tasks/debug/debug-cluster/resource-metrics-pipeline/) supplies current observations, not the historical evidence needed by this planner.

Storage candidates require confirmed bound capacity, no observed current pod reference, owner confirmation, a tested backup, retention clearance and at least 30 days since last use. These checks rely on supplied evidence; no pod reference alone never authorizes deletion. Dormant workload references, external consumers and the underlying disk still need manual review, including the [PV reclaim policy](https://kubernetes.io/docs/concepts/storage/persistent-volumes/). The demo's attestations and prices are explicitly synthetic.

Plans include sources, blockers, risk, manual steps and potential resource-capacity impact. CPU reservations are **not measured energy or guaranteed cost savings**. Storage cost is estimated only with a supplied per-GiB monthly rate and source; otherwise unknown. Carbon savings always remain unknown in this path. Plan fingerprints are checked by recomputing recommendations, decisions expire after five minutes for simulation, and changed resource snapshots are rejected. Reviewer labels and evidence are self-declared, not authenticated attestations. Simulation changes a copy of synthetic inventory only, reports zero cloud changes, and never records verified savings; exported after-state rejects replay against that changed snapshot.

**Still outside this implementation:** Azure subscription/managed-disk discovery, registry image-size analysis, live log-retention discovery, automatic historical telemetry ingestion, VPA/custom-controller discovery, real cleanup/resizing, authenticated approval and measured post-change verification. The dashboard includes the isolated synthetic workflow described below, not live cluster discovery. Existing fixture-based image/log findings remain available through the agent fleet.

### Shared operational orchestration and accounting

Carbon planning and Digital Waste discovery/planning now delegate through `OrchestratorAgent.runOperational()`. The legacy fixture-based `run()` remains unchanged; a normal fleet scan does not implicitly query a cluster or dispatch anything. Carbon execution still uses its separate interactive approval gate, and Digital Waste has no live write adapter.

The Carbon/Waste commands record operational outcomes in the **same ledger format** under the optional `operationalOutcomes` collection. Each has a unique operation run ID, related plan ID where applicable, agent/operation/mode, completion/failure status, tool trace, elapsed duration and shared `SelfAccountant` counters. Failed adapter calls are counted even when a planner handles the failure and returns a blocked plan or partial inventory. A completed operation does not mean an approved change or verified savings. Adapter invocations include cache lookups and are not HTTP-request counts. These deterministic paths use zero model requests/tokens; physical energy/carbon and workload savings remain `null`, not invented from wall-clock time. Planning and local review can legitimately have zero external tool calls.

The CLI prints an `operationRun` summary and persists the full accounting record alongside stage events. Sequential outcome recording reloads the ledger after stage writes so it retains those events. Each ledger save replaces the file atomically (temp file, fsync, rename), so a crash or a concurrent dashboard read sees either the previous or the new complete ledger. It does **not** add concurrent-writer safety, cryptographic immutability or a durable scheduler. Operational records intentionally remain separate from legacy applied-savings outcomes; the dashboard has not yet been updated to render this new collection. Baseline/quality evidence and reviewer identity remain user-supplied.

### Run AI Efficiency with a local OpenAI model (Ollama)

Install [Ollama](https://ollama.com/download/windows), then download OpenAI's open-weight model:

```powershell
ollama pull gpt-oss:20b
ollama list
```

For local-only operation, quit an already-running Ollama tray app and start the server in a separate PowerShell terminal with cloud access disabled:

```powershell
$env:OLLAMA_NO_CLOUD = "1"
$env:OLLAMA_CONTEXT_LENGTH = "4096"
$env:OLLAMA_NUM_PARALLEL = "1"
ollama serve
```

These are Ollama **server** settings; putting them only in GreenOps' `.env` does not reconfigure a running Ollama server. Add these non-secret client settings to the repository-root `.env`:

```dotenv
GREENOPS_LLM_PROVIDER=ollama
OLLAMA_BASE_URL=http://127.0.0.1:11434/v1
OLLAMA_MODEL=gpt-oss:20b
OLLAMA_TIMEOUT_MS=120000
```

From the **repository root**, generate a new ledger:

```powershell
pnpm.cmd greenops run .\fixtures\greenops-mock --fleet --provider ollama --ledger .\greenops-fleet-ledger.json
```

`--provider` overrides the environment for one run. Ollama uses its local Chat Completions endpoint and a dummy SDK key; your OpenAI key is not sent. The local provider accepts loopback addresses only and rejects known cloud model tags. Keep cloud disabled in the Ollama server as above, since a custom model alias could conceal a remote model. Explicit provider selection never silently switches to the OpenAI API. Change `OLLAMA_MODEL` only to a local model you have installed. Run `--provider offline` for a quick deterministic demo without loading a model.

Select **Refresh results**, then open the relevant agent and its recommendation to inspect the recorded source and evidence. Full provider/model/usage diagnostics remain in the ledger; Agent Activity exposes curated lifecycle events and whole-run usage, while detailed provider diagnostics remain in the ledger. Merely configuring a model does not mean it ran. The ledger's `investigate` entries include `analysis.provider`, `analysis.model`, `analysis.status`, and `tokensUsed`; fallback entries explain the failure. A missing server/model, timeout, or invalid response continues with clearly labelled rules. Unavailable local services are not repeatedly called for every finding in the same run; rerun after fixing the service.

The model is free to download, but needs disk space, RAM, compute and electricity. OpenAI's [local-model guide](https://developers.openai.com/cookbook/articles/gpt-oss/run-locally-ollama) recommends at least 16 GB VRAM or unified memory for `gpt-oss-20b`. CPU offload is slower; a 16 GB Windows laptop running other applications may not have enough usable memory. Token-based energy/carbon accounting remains an estimate, not a measurement of the local GPU/CPU's electricity. Fleet fixtures are synthetic, and model-generated recommendations are not verified savings or automatically applied operational changes.

After the demo, `ollama stop gpt-oss:20b` unloads the model to release memory; it does not delete the downloaded model.

Token accounting includes usage returned by the model service. A timeout or connection failure can end before usage is returned, so an entry with zero reported tokens does not prove that the failed attempt consumed no compute.

### Open the dashboard

After generating the fleet ledger, start the website in a second terminal:

```powershell
cd apps/CodeVitals-MCP/website
npm.cmd ci
npm.cmd run dev
```

Open <http://127.0.0.1:3000/dashboard>. The website is separate from the root pnpm workspace. It binds to loopback; do not expose the ledger or demo APIs publicly without access controls.

The website's `predev` and `prebuild` scripts compile the shared agents/ledger packages with the root TypeScript installation. Install the root pnpm dependencies first; use `npm.cmd run dev` or `npm.cmd run build` rather than invoking Next directly, so the workflow does not use stale backend output.

#### Digital Waste end-to-end sandbox

Open **Digital Waste Agent** (`/dashboard?tab=waste`) and select **Open sandbox → Start waste workflow**. This calls the shared backend orchestrator/planner with a fresh synthetic inventory, not hard-coded frontend recommendations. Choose `api-gateway`, inspect its evidence, enter a non-personal reviewer alias/reason, acknowledge simulation scope, and choose **Approve simulation → Simulate approved change → Check simulation result**. The CPU request changes from 2 to 0.6 cores per replica in an isolated copy. The storage example can also be reviewed in a separate scenario. Missing evidence blocks approval; rejection, plan expiry (15 minutes), approval expiry (5 minutes), stale tabs and duplicate simulation are enforced server-side.

Saved decisions replace the approval form; **Revise decision** explicitly reopens it before simulation. **Export evidence** downloads the plan, decision history, before/after inventory, synthetic checks and shared operational accounting. The local, single-process session and historical snapshots are under the website's ignored `.tmp/digital-waste-workflow/` directory. Refresh restores the session (cookie lifetime: one day); export before starting another scenario. JSON history is not authenticated or tamper-proof.

This sandbox accepts same-origin loopback requests only and cannot invoke kubectl, live cleanup, a model or a cloud account. It does not import arbitrary inventory. All findings are synthetic; capacity and illustrative cost estimates are not achieved savings. Result checks validate only the synthetic state transition, not service quality, energy, billing or production outcomes. Accounting shows model/token/tool counters and elapsed processing time, with physical footprint unmeasured. Its run is separate from fleet counts, global filters and Human Approvals; it does not change the recorded analysis or its ledger. CLI `operationalOutcomes` are still not automatically imported into the fleet dashboard.

#### Navigation and review workflow

The sidebar contains **twelve destinations**, grouped into Workspace, Specialists and Evidence. Findings open a dedicated full-page review, not a slide-out panel or a form underneath the inventory. URLs preserve the selected run, theme and time range.

| Group             | Destination        | URL                             |
| ----------------- | ------------------ | ------------------------------- |
| Workspace         | Overview           | `/dashboard?tab=overview`       |
| Workspace         | Investigations     | `/dashboard?tab=investigations` |
| Workspace         | Approvals          | `/dashboard?tab=approval`       |
| Specialist Agents | Carbon Efficiency  | `/dashboard?tab=carbon`         |
| Specialist Agents | Digital Waste      | `/dashboard?tab=waste`          |
| Specialist Agents | AI Efficiency      | `/dashboard?tab=ai`             |
| Specialist Agents | Architecture       | `/dashboard?tab=arch`           |
| Specialist Agents | Disaster Recovery  | `/dashboard?tab=dr`             |
| Specialist Agents | Collaboration      | `/dashboard?tab=collab`         |
| Specialist Agents | Pipeline Efficiency | `/dashboard?tab=pipeline`       |
| Evidence          | Results & Evidence | `/dashboard?tab=results`        |
| Evidence          | Agent Activity     | `/dashboard?tab=activity`       |

Every specialist has **Findings, Recommendations, Results and Activity** sections (`section=findings|recommendations|results|activity`). Global search opens a filtered Investigations list. **Open sandbox** (`sandbox=1`) is available only for the separate AI Efficiency and Digital Waste workflows. Domain measurements and source inventory remain expandable; comparisons use compatible recorded numeric facts, not invented telemetry.

**Results & Evidence** compares available baseline/application/check evidence and exports the selected finding scope as JSON, including decision history and whole-run resource accounting. **Agent Activity** exposes the curated lifecycle ledger with search, status filters and evidence expansion. Raw internal model reasoning is not displayed. CLI `operationalOutcomes` and separate sandbox sessions are not merged into these fleet views.

Executive Overview shows findings awaiting review, specialist coverage and recorded verification. A three-item queue links directly to finding reviews, with starting points across agents prioritized by revision and disclosed risk. Seven compact workspace links open the existing agent pages. The lifecycle strip is an explanatory guide, not current run progress; the Digital Waste sandbox card is a separate synthetic example, not a claimed result. Each agent page shows its inventory, observations and recommendations. Open a recommendation to inspect evidence, confidence, risk, manual guidance and decision history, then approve the **plan**, reject it, or request revision. Human Approvals collects these same reviews in one searchable queue.

Expand **Resources used by GreenOps** on the overview for whole-run reported tokens, model requests, tool calls, retries, elapsed duration and requests with missing usage. Coverage and measurement limits remain available inside this collapsed disclosure. Finding filters do not prorate these totals; sample mode does not invent analysis consumption. These are agent overhead, not workload savings or measured carbon.

Each full-page review includes **Before & after verification**: recorded source and detected amount, run approval, application, subsequent change check and observed resource reduction when available. Missing evidence stays explicit. A passed change check does not establish equivalent task quality or metered energy savings; quality checks are currently not recorded in fleet finding ledgers. Saved plan decisions show a summary and explicit **Revise decision** action; no approval is preselected.

Approval is not application. A browser-local plan decision does not execute cloud cleanup, rerouting, infrastructure deployment or disaster recovery. A finding becomes verified only when the ledger contains a successful application followed by confirmed verification. The isolated AI cache demo below is a separate implemented execution path.

Carbon Efficiency is the display name for the underlying `carbon-incident` agent. The environment selector (All Envs / Prod / Staging) is intentionally absent.

#### Recorded analysis versus sample scenarios

- **Recorded analysis** is the default: selected-run ledger facts, with missing observations left unknown. Financial ROI and monthly carbon savings are not invented from generic estimates.
- **Sample scenarios** (`?data=sample`) is an explicit synthetic UI demonstration across all seven specialist workspaces. Pipeline Efficiency intentionally has no illustrated sample scenario until a pipeline inventory is supplied. Its illustrated costs, charts and decisions are not live infrastructure results or evidence of successful LLM inference.
- The 24h / 7d / 30d / 1y range is relative to the selected analysis or sample timestamp, not a live feed. The sample catalog has 30 scenarios; its default 30-day view includes 24.
- The dashboard sample catalog is separate from the CLI fleet fixtures, which produce 34 findings. Counts need not match.
- Static code-analysis findings outside the seven specialist categories currently do **not** appear in these agent inventories or the approval queue. Use CLI output/ledger for that demo.

#### Human approvals and notifications

Recorded reviews require a self-declared reviewer name, reason, decision and scope acknowledgment. They are stored in this browser's local storage, bound to the run, finding and exact proposal fingerprint. Changed proposals require a new review. Browser locks serialize saves; unavailable storage/locking disables saving. Sample decisions are temporary and reset on reload.

These records are not authenticated, shared or tamper-proof enterprise approval evidence. They do not modify the source ledger or override its safety policy. The current queue does not expose the older review-history export control.

The header notification bell shows pending/revision work, recorded fallback warnings, loaded-analysis status and load failures. Clicking an actionable notification opens the corresponding agent finding. Mark-all-read and dismissal work locally; read state resets on reload. Notifications are derived from the current data, not a live service-health check.

#### Loading results

**Refresh results** reads saved analysis; it never starts a scan, calls an LLM, retries failed inference or verifies a change. **Import results** parses a ledger in the browser and retains the snapshot in session storage when available. It is not uploaded to a remote service. Refresh leaves imported-snapshot mode.

The server checks `greenops-ledger.json`, `greenops-fleet-ledger.json`, `ledger-auto.json` and `ledger-fleet-safe.json` in the repository root and website folder, selecting the newest valid file. To pin another file, set `GREENOPS_LEDGER_PATH` in the terminal starting the website. Relative paths resolve from the website directory. An explicit invalid path or an unavailable selected run produces an error, not a silent dataset switch. Ledger files are limited to 20 MiB.

Legacy agent links resolve to their specialist; findings resolve to Investigations, trace/audit routes to Agent Activity and reports/improvements to Results & Evidence. Finding IDs still open the owning review when available. The activity page shows curated recorded events, not a live infrastructure trace.

#### Unknown usage is not zero

Fleet accounting preserves missing/invalid reported model usage as unknown. An attempted model request is distinct from an offline or circuit-breaker skip. Known subtotals do not establish a complete token total; incomplete usage blocks complete agent-energy/net estimates. Older ledgers can have unconfirmed accounting coverage. Even complete API-token accounting is not metered electricity.

For online analysis, generate a **new** CLI ledger with an explicitly selected provider and server-side credentials, then refresh. A configured key/model is not proof of successful inference. Failed requests can consume compute without returning usage. Never put keys in browser code or exported evidence. The root `.env` is currently committed to this private repository as a documented temporary exception; rotate its key before access is widened.

#### Interactive AI Efficiency demonstration

Open **AI Efficiency Agent → Open sandbox**, or use the auxiliary route <http://localhost:3000/dashboard/ai-efficiency-demo>. This is a separate, working **baseline → recommendation → explicit decision → sandbox application → replay verification** workflow. Existing fleet ledgers and real applications are never modified.

1. Choose **Fixture replay** and select **Run baseline and find waste**.
2. Review eight synthetic FAQ requests: six public requests repeat two questions; two account-specific requests must bypass the shared cache.
3. Enter a demo reviewer label and acknowledge the scope. **Approve sandbox change** records the exact evidence/recommendation digest and timestamp. **Reject change** records a rejection without applying anything.
4. Select **Apply to sandbox**. This enables a per-run cache configuration only; no generated code is executed and no cloud resource is changed.
5. Select **Replay and verify**. The actual cache implementation serves the same eight requests with **four fixture-provider calls rather than eight**. All eight expected answers, baseline/replay equivalence, and private-response isolation must pass.
6. Inspect the comparison and decision history, **Download evidence**, or **Roll back sandbox change**. Refreshing the page restores the browser session's recorded result.

Fixture mode uses deterministic responses and illustrative token units (**340 before, 180 after**). These are **not real API tokens or measured energy savings**, and the rule recommendation is not labelled as an LLM result.

**Optional live Gemini test:** select **Live Gemini**, then explicitly confirm API usage. It uses the same synthetic workload with the configured `GEMINI_API_KEY` / `GEMINI_MODEL`. Only those settings are read, server-side, from process environment first, then website `.env.local` / `.env`, then repository `.env.local` / `.env`. No key is returned to the browser, saved in demo evidence, or included in exports. Live availability means a key is configured, not that quota/model access was verified. The provider uses Google's fixed [OpenAI-compatible Gemini endpoint](https://ai.google.dev/gemini-api/docs/openai), with no custom endpoints or user-supplied prompts.

- One completed live run is bounded to **13 requests** (8 baseline + 1 recommendation + 4 cached replay), each with a 15-second timeout and 1,024-token output limit. No automatic retries. Starting another run starts a new budget; provider charges may apply.
- Live workload failures stop the run without substituting fixture answers. Advice failures are explicitly labelled rule-based fallback and retain known reported usage. Unknown usage stays unknown. Output-quality failures do not produce a verified outcome.
- Live token changes use provider-reported consumed tokens, not output-limit headroom. Differences can be negative: fewer calls does not guarantee fewer tokens. Verification proves request reduction and these fixture answer checks, not general production quality.
- New demo runs do not convert tokens into energy/carbon using a generic coefficient. Their exported SCI assessment records observed workload/quality evidence and missing energy, regional electricity and hardware data. Older saved runs retain their explicitly labelled legacy illustrative estimates, not SCI results. Benchmark and recommendation usage remain separate; running the benchmark does not itself create net environmental savings.
- Session records and versioned evidence are stored under the website's ignored `.tmp/ai-efficiency-demo/`. New runs preserve previous records. The session cookie lasts one day; export evidence for a portable record. No cross-run cache persists. Interrupted actions are not automatically replayed, and usage lost during a process crash is explicitly unknown.

**Local demo safety:** website `dev` and `start` bind to `127.0.0.1`. Restart an older dev process to pick up that binding. The API requires a same-origin JSON action, an explicit action header, a session cookie and matching run version. This is a **single-process local demonstration**, not an authenticated approval product: reviewer names are self-declared and local JSON is not tamper-proof. Do not expose it through a tunnel, reverse proxy, shared network binding or public deployment without authentication, authorization, durable transactional storage and rate controls. Host/Origin checks are not a substitute for network isolation.

---

## Sample data

All bundled demo inputs are synthetic. No customer account, private repository or personal meeting recording is required. Use a non-personal demo reviewer alias in exports.

| Source                               | Used by                                 | Scope                                                                                             |
| ------------------------------------ | --------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `fixtures/greenops-sample/`          | CLI code-analysis demo                  | Deliberately wasteful source code; supported fix is sandboxed                                     |
| `fixtures/greenops-mock/`            | Seven-specialist fleet                  | Synthetic operational JSON for six domains; Pipeline Efficiency returns zero without pipeline inventory; current expected total 34 findings |
| `packages/agents/src/carbon-demo.ts` | `carbon demo --simulate`                | Synthetic UK forecast, workload and Kubernetes API; times generated per run                       |
| `packages/agents/src/waste-demo.ts`  | CLI and dashboard Digital Waste sandbox | Synthetic inventory, eight-day CPU history, owner/retention attestations and illustrative pricing |
| Dashboard Sample scenarios           | `?data=sample`                          | Separate 30-scenario UI catalog; default 30-day filter shows 24                                   |
| AI Efficiency Fixture replay         | Embedded cache demo                     | Eight synthetic FAQ requests, deterministic responses and illustrative token units                |
| SCI worksheet synthetic example      | `/dashboard/measurement`                | Worked calculation only, not measured emissions                                                   |

Only the opt-in Carbon `--live-forecast` path fetches public grid data; that does not make its demo workload real. Attribution and coverage limits are in [Carbon-aware scheduling](#carbon-aware-kubernetes--aks-batch-scheduling). Generated `.tmp/` ledgers/exports are local evidence, not committed sample datasets.

`./fixtures/greenops-sample` is a small, self-contained project that deliberately contains each class of Sustainability Bug (dead code, duplicate imports, a redundant/uncached call in a loop). It is generic — no customer code, no confidential data, no client branding. You can also point GreenOps at any repository:

```bash
pnpm greenops run /path/to/any/repo
```

`./fixtures/greenops-mock` contains synthetic AI usage, cloud inventory, carbon time-series, IaC, disaster-recovery, and collaboration data for the complete seven-specialist fleet demo. It deliberately has no pipeline inventory, so Pipeline Efficiency records zero findings rather than inventing them:

```bash
pnpm greenops run ./fixtures/greenops-mock --fleet --provider offline --ledger ./greenops-fleet-ledger.json
```

---

## How it works

| Stage           | What it does                                                                       | Backed by                                                                 |
| :-------------- | :--------------------------------------------------------------------------------- | :------------------------------------------------------------------------ |
| **Detect**      | Finds Sustainability Bugs from real AST/symbol/reference analysis                  | `@greenops/detect` on the bundled repository engine                       |
| **Investigate** | Root-causes each bug                                                               | Gemini, local Ollama or OpenAI where supported; explicit offline fallback |
| **Compare**     | Enumerates candidate fixes with expected reduction & risk                          | Strategy catalog                                                          |
| **Simulate**    | Estimates energy/carbon saving **before** acting, with baseline + assumptions      | `@greenops/measure`                                                       |
| **Approve**     | Withholds by default; explicit terminal review or configured safe automatic policy | `TerminalApprover` / `PolicyApprover`                                     |
| **Improve**     | Applies the approved fix (reversible-first)                                        | `applyFix` seam                                                           |
| **Verify**      | Re-checks the result and records the actual delta                                  | feedback into Detect                                                      |

The **net-savings** figure = estimated savings − GreenOps' own estimated energy cost. Reported tokens and execution metrics support the estimate; neither side is a power-meter reading. Both sides are traceable in the ledger.

### The Sustainability Ledger

`greenops-ledger.json` records, for every bug: what was detected, why it happened, which solutions were considered, what the agent recommended, what the human approved, what changed, what was saved, and what did not work and why. It is append-only and every number carries its **baseline, assumptions and evidence**.

---

## Measurement & assumptions

Legacy fleet estimates use overridable `DEFAULT_ASSUMPTIONS` in `@greenops/measure`. These are **rough illustrative assumptions**, not metered values or validated provider-specific factors; generic references are not evidence of accuracy. They are not SCI scores. New output-limit findings no longer convert unused allowance into avoided requests or energy, but historical ledgers are not rewritten. Other fleet estimates can still overlap or use different horizons.

### SCI-based carbon measurement

Open the auxiliary worksheet directly at <http://127.0.0.1:3000/dashboard/measurement>. This is a separate assessment, not an automatic conversion of fleet estimates or proof that a recommendation was applied.

1. Define the workload boundary, successful functional unit, quality checks and shared calculation method.
2. Supply before/after electricity, location-based grid intensity, and hardware-allocation evidence. Include significant supporting systems, reserved capacity, and relevant agent overhead.
3. Review missing or invalid inputs. Blank fields remain unknown, not zero. An incomplete assessment does not receive an SCI score.
4. Use **Load synthetic example** to inspect a worked calculation, explicitly separate from live results. Export the assessment for its inputs, sources, assumptions and result; worksheet edits stay in this browser page and are not saved to the fleet ledger.

The dependency-free `assessSci` API in `packages/measure/src/sci.ts` implements **(E × I + M) / R**, with component-level energy, time/resource-share hardware allocation, and consistent baseline comparison. Facility-inclusive energy cannot receive an extra PUE multiplier. Missing components, significant exclusions, failed quality checks and mismatched workloads block a complete comparison; increases remain negative reductions. Sources and measured/modeled/synthetic labels travel with the input evidence. See the [Green Software Foundation SCI specification](https://sci.greensoftware.foundation/) and [ISO/IEC 21031:2024](https://www.iso.org/standard/86612.html).

**Standards status:** SCI-based calculation and evidence capture are implemented; this is not certification or an independent validation of submitted evidence. The AI demo currently lacks the electricity, location and hardware data needed for a complete SCI result. The synthetic example validates arithmetic, not real environmental savings. GHG Protocol inventories and ESRS/ISSB disclosure mappings are **not implemented**; do not present these outputs as corporate compliance reports.

---

## Known limitations (honest disclosure)

See the [submission status](docs/SUBMISSION.md) and [architecture](docs/architecture/overview.md). The current implementation is a local prototype, not a production cloud-management service.

- **Improve is deliberately narrow in the PoC.** Duplicate-import findings are fixed for real in a retained temporary sandbox, then re-detected to prove the finding disappeared. The target repository is never edited. Other strategies are recorded as not applied until they have an equally safe implementation.
- **Observed and estimated results are separated.** Resource reduction for the implemented fix is observed by before/after static analysis; its kWh and carbon conversion remains an estimate based on the disclosed assumptions below.
- **Energy/carbon are estimates.** Legacy fleet figures use disclosed, overridable illustrative assumptions, not calibrated live metering or SCI evidence.
- **Coverage is bounded.** Source-code detection is static; fleet assessment reads supplied records. Digital Waste additionally supports explicit read-only Kubernetes discovery and supplied CPU history, but not automatic historical telemetry collection, live cleanup or resizing. Carbon supports public GB forecasts and a restricted approval-gated batch-Job dispatch adapter; real AKS execution has not been validated. Fleet runs do not invoke either live adapter implicitly.
- **Verification differs by path.** Code re-detection and cache replay check their supported sandbox changes. Digital Waste checks a synthetic inventory transition only. Carbon completion alone does not verify emissions; its separate evidence verifier requires compatible user-supplied measurements and quality checks.
- **Audit and UI gaps remain.** JSON ledgers are append-only by application convention, not cryptographically immutable or concurrent-writer-safe. CLI `operationalOutcomes` are not rendered in the fleet dashboard. Generic code findings remain outside the current specialist mapping. Agent Activity exposes curated historical events; the overview and activity page expose reported agent-resource usage.
- **Selectable reasoner.** AI Efficiency investigation and comparison support Google Gemini (code default `gemini-3.8-flash`; the committed `.env` selects `gemini-3.5-flash`), local Ollama (`gpt-oss:20b`), OpenAI (`gpt-5`), or deterministic rules. Model inputs use structured evidence, and concrete code remediations are generated alongside root-cause analysis. Non-AI agents and failed model calls use the deterministic reasoner; the ledger records fallback status and token usage. Raw secrets and credentials are never passed to model prompts.

---

## Monorepo packages

| Package                                  | Role                                                                                             |
| :--------------------------------------- | :----------------------------------------------------------------------------------------------- |
| `@greenops/measure`                      | Energy/carbon model with cited assumptions & evidence                                            |
| `@greenops/detect`                       | Sustainability-bug rule engine (Detect stage)                                                    |
| `@greenops/ledger`                       | Append-only (by convention) Sustainability Ledger with atomic saves + agent self-accounting      |
| `@greenops/agent`                        | The 7-stage loop orchestrator, reasoners and approval policy                                     |
| `@greenops/agents`                       | Seven specialist agents, the fleet orchestrator and Carbon/Waste planners                        |
| `@codevitals/*`                          | Underlying repository-intelligence engine (AST, symbols, graph, git, review, GitHub App webhook) |
| `apps/cli` (`codevitals`)                | `greenops` and legacy `codevitals` CLI binaries                                                  |
| `apps/CodeVitals-MCP` (`codevitals-mcp`) | stdio MCP repository-health server (`codevitals-mcp` binary, Jest tests)                         |
| `apps/CodeVitals-MCP/website`            | Next.js dashboard (separate npm install)                                                         |

The interactive ledger dashboard lives at `apps/CodeVitals-MCP/website/src/app/dashboard`. The full command list is in the [CLI reference](docs/cli/README.md).

## Development & Versioning

GreenOps runs locally: the CLI from the repository root and the dashboard from `apps/CodeVitals-MCP/website`. There is no supported container or hosted deployment; the earlier unvalidated Docker/API-server stack was removed.

- **Review workflow**: Keep proposed changes on a separate review branch and merge into `greenops-init` only after review. Repository protection settings must be checked on the hosting service; this document does not establish that they are enabled.
- **Commit Format**: We adhere to [Conventional Commits](https://www.conventionalcommits.org/) (`feat:`, `fix:`, `perf:`, etc.).
- **Tests**: `pnpm test` runs the Vitest suites; `pnpm test:all` also runs the `codevitals-mcp` Jest suite, matching CI (frozen install, website `npm ci`, security-patch check, version check, lint, build, Vitest, MCP Jest). The website production build and lint are not part of CI.
- **Versioning**: Monorepo versions follow SemVer and can be checked or bumped via `pnpm version:check` and `pnpm version:bump`.
- For detailed instructions, see the [Contributing & Versioning Guide](CONTRIBUTING.md).

---

## Component origin and compatibility

GreenOps is one project: its dashboard, sustainability agents, repository analysis, CLI and MCP tools are included in this repository. The repository-analysis and MCP foundation was previously named **CodeVitals**; renaming the user-facing product does not erase that origin or constitute newly authored functionality.

- Primary CLI: `pnpm greenops run`, `pnpm greenops review`, and `pnpm greenops code-review` (semantic code review).
- Existing `pnpm codevitals ...` commands remain compatible; this is the legacy CLI, not the MCP server, whose binary is now `codevitals-mcp`. Internal `@codevitals/*` imports, workspace identifiers and the `apps/CodeVitals-MCP` directory are retained to avoid breaking checkouts and integrations; they are not external services.
- Configuration prefers `.greenopsrc` / `.greenopsrc.json`, then falls back to `.codevitalsrc` / `.codevitalsrc.json` when no GreenOps-named file exists.
- Third-party dependencies include Next.js, React, TypeScript, the MCP SDK and the packages listed in the manifests/lockfiles. Their licenses and notices remain applicable.
- GreenOps maintains a local bounded-recursion patch for the upstream `braces` 3.0.3 dependency in both installs. This is a project mitigation, not an upstream fixed release; see [security status and installation requirements](SECURITY.md).
- Before submission, the team must confirm the exact pre-hackathon baseline and identify work completed during the event. This branding change does not certify the authorship or dates of earlier work.
