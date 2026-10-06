# GreenOps

A sustainability control plane that finds digital waste, explains recommendations, records human decisions and checks supported sandbox changes.

**Challenge:** avoidable AI calls, idle infrastructure and inefficient workloads consume energy and cloud resources. GreenOps combines seven specialist checks with optional Google Gemini reasoning and an evidence trail.

**Track:** carbon and ESG intelligence; forecasting, scheduling and dispatch.

## Hackathon submission

- **Architecture documents:** [Target architecture and executive overview — PDF and PNG](docs/architecture/README.md). These describe the target design; [current implementation](docs/architecture/overview.md) documents prototype capabilities and limitations.

- **Code:** [develop branch](https://github.com/shierenk-code/GreenOps/tree/develop).
- **Pitch deck (10 slides):** [Download from the repository](docs/pitch-deck/Greenops.pptx) · [Open in SharePoint](https://nagarro-my.sharepoint.com/:p:/r/personal/shieren_khan_nagarro_com/_layouts/15/Doc.aspx?sourcedoc=%7B4E98484E-76A2-4179-AF45-EB7E98F22743%7D&file=Greenops.pptx&action=edit&mobileredirect=true&wdwpf=t). Confirm judge access to the shared link.
- **Demo video:** [Greenops - Flo hackathon shared folder](https://nagarro-my.sharepoint.com/my?id=%2Fpersonal%2Fshieren%5Fkhan%5Fnagarro%5Fcom%2FDocuments%2FGreenops%20%2D%20Flo%20hackathon&viewid=49969cbc%2D7e25%2D4e29%2Db4a1%2D05b80f4e1c51).
- **AI usage documentation:** [Augmentation log](docs/augmentation-log.md). See [submission assets checklist](docs/submission-assets.md) for remaining deliverables.

## Try the hosted dashboard

Open [GreenOps hosted demo](https://greenops-ewawfqghfeahc4hs.westus3-01.azurewebsites.net/).

1. Click **Workspace**. Sign in, or choose **Create an account** if you are new. Use a unique password of at least 12 characters.
2. After signing in, choose **Data → Sample scenarios** to explore without installing anything. A new account may have no recorded runs; other users' saved runs are not automatically shared with you.
3. To view your own CLI assessment, connect your terminal using the optional steps below, sync its ledger, then select the uploaded run in **Run history → Recorded analysis**.

### Optional: connect your terminal to the hosted workspace

Browser sign-in and terminal connection are separate. After completing local installation and generating the sample ledger in step 1 below, run these commands from the **repository root**, not the website folder. No local dashboard server is required for hosted sync.

In the signed-in hosted dashboard, click **Connect terminal** to generate a fresh connection URL. Paste only that URL—not an entire command—inside the quotes:

```powershell
pnpm.cmd greenops connect 'PASTE_FRESH_CONNECTION_URL_HERE'
pnpm.cmd greenops sync --ledger ./.tmp/judge-baseline.json --project greenops-demo
```

Wait for the connection to succeed before syncing. Keep the connection URL private. If sync reports an expired/revoked refresh token, generate a fresh link and repeat `connect`, then retry `sync`; the assessment does not need to be rerun. Azure CLI login is separate from this GreenOps account connection.

## Quick start

Use this local setup as an alternative to the hosted dashboard, or complete step 1 to generate a ledger for hosted sync.

Requires **Git, Node.js 22.12+ (22.x recommended), npm and pnpm 11.17.0**. Commands below use Windows PowerShell; on macOS/Linux use `pnpm` and `npm` instead of `pnpm.cmd` and `npm.cmd`.

### 1. Install and generate sample results

Use the branch or commit supplied with the submission in [shierenk-code/GreenOps](https://github.com/shierenk-code/GreenOps). Judges need repository access if it is private.

```powershell
git clone --branch develop https://github.com/shierenk-code/GreenOps.git
cd GreenOps
npm.cmd install --global pnpm@11.17.0
pnpm.cmd install --frozen-lockfile
pnpm.cmd build

pnpm.cmd greenops run ./fixtures/azure-baseline --fleet --provider offline --ledger ./.tmp/judge-baseline.json
```

Expected: **31 findings across seven specialists**, a synthetic subscription baseline and no applied cloud changes. This deterministic walkthrough needs no Gemini key, MongoDB or Azure account.

### 2. Open the dashboard

Continue in the **same terminal** after step 1 finishes. You should still be inside the `GreenOps` repository folder; do not open a second terminal for this step.

```powershell
cd apps/CodeVitals-MCP/website
npm.cmd ci
$env:GREENOPS_LEDGER_PATH = "../../../.tmp/judge-baseline.json"
npm.cmd run dev -- --port 3003
```

Open [the dashboard](http://127.0.0.1:3003/dashboard). Keep this terminal running while using the dashboard. If a dashboard is already running on port 3003, use that instance or stop it with `Ctrl+C` in its terminal before starting another.

For this no-database path, leave `MONGODB_URI`, `WEBSITE_HOSTNAME` and an HTTPS `GREENOPS_PUBLIC_URL` unset. Existing MongoDB configuration selects account mode instead; see [setup and troubleshooting](docs/development/getting-started.md).

### 3. Try one complete workflow

1. **Overview:** inspect the subscription baseline, findings and GreenOps resource usage.
2. **AI Efficiency → Open sandbox → Fixture replay:** run the baseline, review and approve the sandbox change, apply it, then replay and verify.
3. Expected: **8 → 4 provider calls**, with answer-equivalence and private-response-isolation checks. Export the evidence.

This verifies the synthetic cache workflow—not production carbon savings. Normal **Approvals** record a plan decision; they do not deploy it.

## What is included?

| Specialist          | Looks for                                                            |
| ------------------- | -------------------------------------------------------------------- |
| Carbon Efficiency   | Energy spikes and lower-intensity scheduling options                 |
| Digital Waste       | Idle compute, oversized resources, unused storage and excessive logs |
| AI Efficiency       | Repeated calls, retry storms and oversized model/output settings     |
| Architecture        | Inefficient sizing, missing autoscaling and region choices           |
| Disaster Recovery   | Excess standby capacity, replicas and recovery-target mismatches     |
| Collaboration       | Duplicate recordings and excessive retention                         |
| Pipeline Efficiency | Cache misses, duplicate CI runs and oversized artifacts              |

The shared workflow detects, investigates, compares options, estimates impact, requests approval and verifies **supported** changes. See [architecture and execution boundaries](docs/architecture/overview.md).

## Data and model

To assess your own architecture or a permitted Azure test subscription, use [Bring your own data](docs/development/bring-your-own-data.md). Azure coverage currently checks VM scale-set autoscale configuration only—not a full subscription baseline.

- **Main dataset:** [Azure subscription fixtures](fixtures/azure-baseline), an explicitly synthetic subscription with teams, resources and factors. Expected counts: Waste 13, AI 5, Pipeline 4, DR 3, Carbon 2, Architecture 2, Collaboration 2.
- **Other samples:** [source-code demo](fixtures/greenops-sample), [legacy fleet fixtures](fixtures/greenops-mock), dashboard Sample scenarios and isolated cache/Waste demos. These are separate datasets.
- **Google Gemini:** optional model-assisted analysis. Configure a private key/model, then use `--provider gemini`; see [Gemini setup](docs/development/getting-started.md#google-gemini). Provider failure is labelled fallback, not successful AI output.
- Use only **public, open or synthetic data**. Never commit credentials or customer/personal data.

## Important limitations

- Fleet recommendations do **not** automatically resize, delete, migrate or deploy resources.
- Account reviews are stored in MongoDB; no-database reviews are browser-local. Neither authorizes infrastructure execution.
- Supported cache and Waste demos change isolated sandbox state. Carbon has a separate restricted, approval-gated Kubernetes adapter; live AKS validation remains outstanding.
- Token/tool counters are not measured electricity. Carbon opportunities and baseline rollups are estimates; unknown usage stays unknown.
- JSON ledgers are append-only by application convention, **not cryptographically immutable**.
- Authentication and sync are implemented, but password recovery/email verification and production-readiness validation remain incomplete.

## Documentation

| Need                                             | Read                                                                           |
| ------------------------------------------------ | ------------------------------------------------------------------------------ |
| Install, run, Gemini, common errors              | [Setup guide](docs/development/getting-started.md)                             |
| Components, seven agents, approval and data flow | [Architecture](docs/architecture/overview.md)                                  |
| Dashboard controls, filters and reviews          | [Dashboard guide](apps/CodeVitals-MCP/website/README.md)                       |
| MongoDB login, terminal sync and hosting         | [Connected workspace](docs/cloud-dashboard.md)                                 |
| Carbon/Waste commands and safeguards             | [Operational workflows](docs/operational-workflows.md)                         |
| Agent overhead, SCI and evidence limits          | [Measurement](docs/measurement.md)                                             |
| CLI commands / GitHub integration                | [CLI reference](docs/cli/README.md) · [GitHub setup](docs/github-app-setup.md) |
| Verified checks and submission gaps              | [Submission status](docs/SUBMISSION.md)                                        |
| Dependency mitigations and secrets               | [Security](SECURITY.md)                                                        |
