# Carbon and Digital Waste: operational reference

These optional paths are separate from the fleet assessment. For the no-cloud walkthrough, start with the [README](../README.md#quick-start). Live Kubernetes actions require the safeguards below; none is part of normal dashboard approval.

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

The worksheet intentionally leaves measurements blank; no forecast is copied into an observed result. Its [typed evidence contract](../packages/agents/src/carbon-verification.ts) requires a historical baseline job and the dispatched job, the same input digest, boundary, allocation method, functional unit, successful-work quantity and passing quality criterion. Supply contiguous measured energy intervals (including transfer energy), actual grid factors in `gCO2/kWh`, source references and explicit energy/intensity uncertainty percentages. Baseline must precede dispatch; after-change evidence must match the receipt's target UID/region, completed execution window and deadline. Forecasts, missing readings, gaps, mismatched work, failed quality, unfinished jobs or simulated receipts cannot verify real savings.

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

The [inventory and historical-usage contract](../packages/agents/src/waste-inventory.ts) supports separately supplied usage evidence tied to workload UID, resourceVersion and container. CPU sizing requires seven representative days, at least 168 samples, 95% coverage and a window ending within 24 hours. The proposed request preserves the greater of p95 plus 50%, peak plus 20%, and 100 millicores, with a minimum 10% reduction. Active/unknown HPA ownership, incomplete inventory and protected namespaces block approval. VPA, custom controllers and GitOps ownership require manual confirmation. The Kubernetes [resource metrics pipeline](https://kubernetes.io/docs/tasks/debug/debug-cluster/resource-metrics-pipeline/) supplies current observations, not the historical evidence needed by this planner.

Storage candidates require confirmed bound capacity, no observed current pod reference, owner confirmation, a tested backup, retention clearance and at least 30 days since last use. These checks rely on supplied evidence; no pod reference alone never authorizes deletion. Dormant workload references, external consumers and the underlying disk still need manual review, including the [PV reclaim policy](https://kubernetes.io/docs/concepts/storage/persistent-volumes/). The demo's attestations and prices are explicitly synthetic.

Plans include sources, blockers, risk, manual steps and potential resource-capacity impact. CPU reservations are **not measured energy or guaranteed cost savings**. Storage cost is estimated only with a supplied per-GiB monthly rate and source; otherwise unknown. Carbon savings always remain unknown in this path. Plan fingerprints are checked by recomputing recommendations, decisions expire after five minutes for simulation, and changed resource snapshots are rejected. Reviewer labels and evidence are self-declared, not authenticated attestations. Simulation changes a copy of synthetic inventory only, reports zero cloud changes, and never records verified savings; exported after-state rejects replay against that changed snapshot.

**Still outside this implementation:** Azure subscription/managed-disk discovery, registry image-size analysis, live log-retention discovery, automatic historical telemetry ingestion, VPA/custom-controller discovery, real cleanup/resizing, authenticated approval and measured post-change verification. The dashboard includes the isolated synthetic workflow described below, not live cluster discovery. Existing fixture-based image/log findings remain available through the agent fleet.

## Accounting and dashboard boundary

`OrchestratorAgent.runOperational()` delegates Carbon planning and Waste discovery/planning. Commands save tool calls, failures, duration and usage under ledger `operationalOutcomes`. The fleet dashboard does not yet render this collection. Each sandbox exports its own evidence. Deterministic operations use no model calls; their physical energy and carbon remain unknown, not zero.
