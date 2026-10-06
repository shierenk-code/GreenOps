# Historical validation records

Preserved from earlier implementation reviews. These results describe their dated revisions, not the current checkout or current hosted CI. See [submission status](../SUBMISSION.md#validation-record) for the latest scoped checks.

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
