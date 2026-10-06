# Setup and testing

Start with the [README quick start](../../README.md#quick-start). This guide covers optional setup and common failures. Commands use PowerShell and assume the repository root unless stated otherwise.

## Requirements

Use Node.js 22.12+ (22.x recommended), npm and pnpm 11.17.0. Install root dependencies with `pnpm.cmd install --frozen-lockfile`; the nested website separately needs `npm.cmd ci`. Keep installation scripts enabled: they apply dependency security patches.

Only public, open or synthetic data belongs in hackathon runs. Do not commit private environment files, generated ledgers or session exports.

## Choose a dashboard mode

| Need                                   | Configuration                                                                                      |
| -------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Judge walkthrough without MongoDB      | Leave account-mode settings unset; pin a generated ledger with `GREENOPS_LEDGER_PATH`              |
| Signed-in workspace with saved history | Configure MongoDB, create/sign into an account, connect the CLI and sync the same synthetic ledger |
| Browse illustrative UI examples        | Choose **Sample scenarios**; these are separate from both recorded datasets                        |

Account mode is enabled by any of `MONGODB_URI`, `WEBSITE_HOSTNAME`, or an HTTPS `GREENOPS_PUBLIC_URL`. Merely setting a ledger path does not override account mode.

For a no-database walkthrough on an existing installation, remove those settings from that terminal and its environment-file configuration, then restart. Keep the private values securely for restoring your connected setup. A fresh checkout should contain no real credentials.

## Run or rebuild the dashboard

From the website folder:

```powershell
cd apps/CodeVitals-MCP/website
npm.cmd ci
$env:GREENOPS_LEDGER_PATH = "../../../.tmp/judge-baseline.json"
npm.cmd run dev -- --port 3003
```

Open [127.0.0.1:3003/dashboard](http://127.0.0.1:3003/dashboard).

For a production preview, stop your own dev server before building:

```powershell
npm.cmd run build
npm.cmd run start -- --port 3003
```

The website scripts compile shared packages first. Root `pnpm.cmd build` does not build the nested website. Do not rebuild into the same output while a preview is running.

## Google Gemini

The deterministic judge path uses `--provider offline`. For model-assisted analysis, place these values in an ignored root `.env.local`:

```dotenv
GREENOPS_LLM_PROVIDER=gemini
GEMINI_API_KEY=<your private API key>
GEMINI_MODEL=<model enabled for your API project>
```

The current setup template names `gemini-3.5-flash`; that is configuration, not a promise of API availability. A consumer Gemini subscription is not an API credential. Do not publish keys or use a browser-exposed `NEXT_PUBLIC_` variable.

From the repository root:

```powershell
pnpm.cmd greenops run ./fixtures/azure-baseline --fleet --provider gemini --ledger ./.tmp/azure-baseline-gemini-review.json
```

Check the investigation records for provider, model, status and usage. A successful CLI exit can still contain rule-based fallback. The last recorded local generation check on 6 October returned HTTP 503; it did not establish a successful live benchmark.

The dashboard also offers **AI Efficiency → Open sandbox → Live Gemini**. This separately requests explicit API-use confirmation. **Assess live readings with Gemini** needs fresh counters from a connected `pnpm.cmd greenops monitor` process; a static Azure fixture does not supply live machine telemetry.

## Connect and sync with MongoDB

Follow the [connected workspace guide](../cloud-dashboard.md) to configure storage and sign in. Select **Connect terminal**, then run this from the repository root:

```powershell
pnpm.cmd greenops connect '<URL copied from the dashboard>'
pnpm.cmd greenops sync --ledger ./.tmp/judge-baseline.json --project greenops-demo
```

Paste only the URL inside the quotes, not a second `greenops connect` command. Links are single-use credentials; regenerate expired links and never share them. No global CLI installation is required for these repository-root commands.

MongoDB stores the uploaded evidence; it does not generate findings. The same synthetic ledger can drive both local-file mode and account mode.

## Extra terminal demos

```powershell
pnpm.cmd greenops carbon demo --simulate --ledger ./.tmp/judge-carbon.json
pnpm.cmd greenops waste demo --simulate --ledger ./.tmp/judge-waste.json
pnpm.cmd greenops run ./fixtures/greenops-sample --provider offline --approve --ledger ./.tmp/judge-code.json
```

Carbon/Waste simulation reports zero real cloud changes. The code-demo approval applies only its supported fix in a temporary sandbox, not the original fixture. Review proposals before entering approval. Full [operational instructions](../operational-workflows.md) cover optional public forecasts and cluster prerequisites.

## Troubleshooting

| Symptom                              | Check                                                                                                     |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------- |
| Repository unavailable               | Confirm access and the exact submitted branch/commit; do not share credentials                            |
| `greenops` not recognized            | Return to the repository root and use `pnpm.cmd greenops`                                                 |
| PowerShell script blocked            | Use `pnpm.cmd` / `npm.cmd`, not a weaker execution policy                                                 |
| Native parser installation fails     | Check Node version and install output; a fallback native build may need C++ tools/Python                  |
| Dependency/security-policy rejection | Keep lockfiles and guards; resolve the specific installation issue rather than disabling policy           |
| Port 3003 already used               | Stop your own server with Ctrl+C, or use `--port 3004`                                                    |
| Storage unavailable at login         | Check private MongoDB URI, credentials, Atlas network access and database permissions                     |
| No data after login                  | Connect the CLI and sync the ledger to that account; a local file is not automatically uploaded           |
| Empty local dashboard                | Check the pinned ledger path and remove a stale `run=` parameter; reload the intended dataset             |
| Date filter looks unchanged          | Same-day findings fit several presets; use Custom dates or Sample scenarios to exercise different windows |
| Plan approved but not applied        | Normal approval records a decision only; use the separate supported sandbox to demonstrate application    |
| Old UI after editing                 | Check the port and checkout; restart your own server and reload                                           |
| Gemini fails                         | Inspect recorded fallback/error; use offline or Fixture replay for a no-key demonstration                 |
| Waste plan/decision expired          | Start a fresh scenario and review its new evidence                                                        |
| Output file already exists           | Use a fresh evidence-output filename; do not overwrite a previous result                                  |

## Validation commands

From the repository root, after both dependency installations:

```powershell
pnpm.cmd build
pnpm.cmd test:all
pnpm.cmd version:check
pnpm.cmd exec vitest run tests/control-plane-dashboard.test.ts tests/control-plane-data.test.ts tests/dashboard-approval-render.test.ts tests/carbon-atlas-data.test.ts
```

From the website directory: `npm.cmd run lint` and `npm.cmd run build`.

These are procedures, not a claim they all passed today. See [dated results](../SUBMISSION.md#validation-record). MongoDB integration tests are opt-in and use a disposable database, not Atlas; one CLI file-permission assertion is currently platform-sensitive on Windows.

## Working agreement

Make changes on a local review branch. Push only after explicit approval to the intended remote branch; do not assume old `greenops-init` workflow triggers apply to `develop`. Do not rewrite shared history.

Update the relevant guide when behavior changes. Keep the README short; put technical detail here, in architecture, or in a focused reference. Record only checks actually performed.
