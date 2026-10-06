# GreenOps Development Setup

Use an authorized checkout of [shierenk-code/GreenOps, branch develop](https://github.com/shierenk-code/GreenOps/tree/develop). For the complete clone-to-demo sequence and expected results, start with the [judge quick start](../../README.md#judge-quick-start-run-the-proof-of-concept). Commands below are PowerShell commands, starting in the repository root (the directory containing pnpm-workspace.yaml). Last reviewed against `develop` on 6 October 2026.

## Prerequisites

- Git and Node.js 22.12+ (22.x, as used in CI) or 24+, per the root `engines` field.
- pnpm 11.17.0, matching the root package-manager pin.
- npm for the separately nested website.

No API key or cloud account is needed for fixture demos. The committed root `.env` selects Gemini, so pass `--provider offline` to `run`, or set `$env:GREENOPS_LLM_PROVIDER = "offline"` before `review`, to avoid model calls. Root and website dependencies need separate installation. Do not use `--ignore-scripts`: install scripts apply dependency security patches.

## Install and generate offline results

```powershell
# Repository root
pnpm.cmd install --frozen-lockfile
pnpm.cmd build

# Deterministic fleet recommendations: no model API requests
pnpm.cmd greenops run .\fixtures\greenops-mock --fleet --provider offline --ledger .\greenops-fleet-ledger.json
```

Run the repository's `greenops` script from the repository root, not your home directory or the website directory. If it cannot be found, first return to the repository root and check installation/build output. The legacy `codevitals` script remains available for existing commands.

To review source code instead:

```powershell
$env:GREENOPS_LLM_PROVIDER = "offline"
pnpm.cmd greenops review .\fixtures\greenops-sample --ledger .\greenops-ledger.json
```

The review command uses the provider environment setting; --provider is an option on greenops run. Generic static-code findings are currently absent from the new six-agent UI, so use fleet results for the dashboard walkthrough.

## Start the website in a second terminal

```powershell
# Starting from repository root
cd apps/CodeVitals-MCP/website
npm.cmd ci

# Pin this dataset so a newer code-review ledger does not replace it
$env:GREENOPS_LEDGER_PATH = "../../../greenops-fleet-ledger.json"
npm.cmd run dev
```

Open <http://127.0.0.1:3000/dashboard>. The pnpm workspace includes apps/* and packages/*; it does not install/build this nested website. Keep its package-lock.json separate from the root pnpm lockfile.

The 6 October local website build passed using Next.js 16.3.6. This is not a fresh-machine installation or whole-website lint certification. CI explicitly installs the nested website dependencies and checks security patches, but it does not run a website production build or lint. Do not bypass dependency errors or security checks silently; see [security status](../../SECURITY.md).

The dev server and production start command bind to loopback. Keep this prototype private; approval labels and origin checks are not authentication.

## Dashboard walkthrough

1. Open Overview in Recorded analysis mode.
2. Open an agent, then one recommendation.
3. Inspect the evidence, source, risk, manual guidance and history.
4. Save a plan review or inspect the same item in Approvals. This does not execute the recommendation. Findings open full-page; each agent has Findings, Recommendations, Results and Activity sections.
5. Use the notification bell to navigate pending work and recorded fallback warnings.
6. For a synthetic operational slice, open Digital Waste Agent → Open sandbox → Start waste workflow. Select `api-gateway`, review, approve simulation, simulate and check the before/after result. Export evidence. This does not change cloud resources or fleet counts.
7. For the cache execution slice, open AI Efficiency Agent → Open sandbox and choose Fixture replay. Complete baseline, approval, sandbox application and replay verification; inspect evidence and optional rollback.
8. Inspect the overview's Resources used by GreenOps summary. Use the header theme controls to switch between sage/lime, Charcoal & Olive, dark, forest and high contrast without changing evidence.
9. Use Results & Evidence for selected-finding comparisons and JSON export; Agent Activity for curated lifecycle events. These fleet views do not import separate sandbox sessions or CLI operational outcomes.

Sample scenarios is a separate synthetic UI mode. Its counts and estimates are not the CLI run's results. Sample decisions and notification read state reset on reload.

Refresh results only loads saved analysis. After changing provider settings, run a new CLI analysis before refreshing; refreshing never retries inference or starts a scan.

## Operational terminal demos

From the root, these commands run synthetic fixtures without an LLM or cluster:

```powershell
pnpm.cmd greenops carbon demo --simulate --ledger ./.tmp/judge-carbon.json
pnpm.cmd greenops waste demo --simulate --ledger ./.tmp/judge-waste.json
```

Both report zero real cloud changes and `savingsVerified: false`. Carbon/Waste accounting is stored in the ledger's `operationalOutcomes`, which the fleet UI does not yet render. The dashboard Waste sandbox has its own server-side session and evidence export. See the README for opt-in public forecasts, read-only Kubernetes inventory and restricted real dispatch prerequisites; none is needed for the judge walkthrough.

## Troubleshooting

| Symptom                                           | What to do                                                                                                                                                                     |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Clone fails or repository returns 404             | Confirm the judge has access to the repository and selected `greenops-init`; do not share credentials                                                                          |
| `pnpm` missing / PowerShell script blocked        | Install pinned pnpm with `npm.cmd install --global pnpm@11.17.0`; use `.cmd` commands instead of changing execution policy                                                     |
| Engine or native Tree-sitter installation error   | Check Node version, preserve the lockfiles, inspect the failing install output; a native fallback build may require platform C++ build tools/Python                            |
| Package-age/security-policy install rejection     | Do not silently disable policy or change dependencies; retain the error and resolve the approved toolchain/registry issue before presenting a clean-install claim              |
| `EADDRINUSE` on port 3000 (dev) or 3003 (preview) | Stop only your own server with Ctrl+C, or pick another port: `npm.cmd run dev -- --port 3004` / `npm.cmd run start -- --port 3004`                                             |
| Production start says build missing               | Run `npm.cmd run build` inside the website first; stop your preview before rebuilding                                                                                          |
| Missing shared agent/ledger module                | Install root dependencies; invoke website `npm.cmd run dev` or `npm.cmd run build`, whose pre-scripts compile shared packages                                                  |
| Overview has zero findings / wrong dataset        | Generate a fleet ledger, pin `GREENOPS_LEDGER_PATH` in the website terminal, restart the server and open `/dashboard` without an old `run=` query; refresh exits imported mode |
| Old styles remain                                 | Confirm browser port and source checkout, stop your own preview, build, restart, then reload; changing another running checkout has no effect                                  |
| Approved but not verified                         | A plan review does not execute anything. Complete the separate cache or Waste sandbox flow; production savings still require measurement                                       |
| Waste plan/approval expired                       | Start a new scenario, inspect the fresh evidence and reapprove. Plans expire after 15 minutes, simulation approvals after 5 minutes                                            |
| Carbon/Waste output file already exists           | Use a new filename; evidence outputs intentionally refuse overwrite. Ledgers can append runs, so use fresh ledger filenames for isolated rehearsals                            |
| Gemini unavailable                                | Use explicit `--provider offline` or Fixture replay. Configure a server-side API key/model for optional live use; a consumer subscription is not an API credential             |

Never fix an empty dashboard by inventing measured values or removing synthetic/unknown labels. Keep the website on `127.0.0.1`.

## Validation commands

From the repository root:

```powershell
pnpm.cmd version:check
pnpm.cmd lint
pnpm.cmd build
pnpm.cmd test
pnpm.cmd test:all   # Vitest + MCP Jest suite, as in CI

# Focused dashboard/demo/worksheet regression suite
.\node_modules\.bin\vitest.cmd run tests/control-plane- tests/dashboard- tests/ai-efficiency-demo-render.test.ts tests/sci-dashboard.test.ts --maxWorkers=4 --reporter=dot
```

From the website directory:

```powershell
npm.cmd run lint
npm.cmd run build
# Optional production preview after build
npm.cmd run start
```

The list above is the validation procedure, not a claim all commands were rerun in the latest review. See the [current validation record](../SUBMISSION.md#validation-record).

## Review workflow and secrets

Current work targets `greenops-init`; do not assume that it is merged to `main`. Confirm the intended branch before committing or pushing. Use a separate review branch when requested; never force-push or rewrite shared history as part of a documentation update.

For every behavior change, update the root README instructions and limitations, this setup guide if commands changed, the architecture boundary if adapters/storage changed, the website README for visible controls, and SUBMISSION.md for dated verification evidence. Keep historical review results dated rather than overwriting them with new claims.

Keep API keys in server-side environment files. Do not commit new .env files, local ledgers, browser exports or private/customer data. The root `.env` is a temporary documented exception; see [SECURITY.md](../../SECURITY.md#data-and-disclosure). Loading the dashboard and running the fixture test suite do not require paid inference.
