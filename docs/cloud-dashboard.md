# Connected workspace: MongoDB, terminal sync and optional hosting

For the no-database judge walkthrough, use the [README](../README.md#quick-start). This is the optional account-connected path; MongoDB is not required to view bundled sample results.

The website serves the frontend and authenticated API together. MongoDB Atlas stores accounts,
hashed sessions, single-use terminal links, run snapshots and account review decisions.
Open registration is enabled. Each person creates their own email/password at `/login`.

## Local development

Keep secrets in ignored `apps/CodeVitals-MCP/website/.env.local`:

```dotenv
MONGODB_URI=<your rotated Atlas connection string>
MONGODB_DB=greenops
GREENOPS_PUBLIC_URL=http://127.0.0.1:3003
GREENOPS_REGISTRATION=open
```

Allow your development IP in Atlas Network Access, then run:

```sh
cd apps/CodeVitals-MCP/website
npm ci
npm run dev -- --port 3003
```

Visit `http://127.0.0.1:3003/login`, create an account, and choose **Connect terminal**.
The private link expires after ten minutes
and works only once. It contains a login credential: do not share it or commit it.

On Windows, from the GreenOps repository root (no global installation required):

```powershell
pnpm.cmd greenops connect '<URL only, copied from the dashboard>'
pnpm.cmd greenops sync --ledger ./.tmp/judge-baseline.json --project greenops-demo
```

Generate that ledger using the README first. The same synthetic JSON works in local-file and MongoDB modes; creating an account does not generate data. Paste only the link, not another command, inside the quotes. Account mode loads uploaded records, not `GREENOPS_LEDGER_PATH`.

## Use GreenOps in any codebase

Install the local checkout's command once on macOS/Linux:

```sh
cd /path/to/GreenOps
pnpm greenops:install
```

The installer builds the CLI and creates `~/.local/bin/greenops`. If that directory is not on
your PATH, it prints the shell-profile line to add. Keep this checkout in place and rerun the
installer after updating it. The command uses the directory of the terminal where you run it.
Other machines need their own checkout, dependencies, installation and terminal connection.

Then, in your other project's terminal, use `greenops` directly (without `pnpm`):

```sh
cd /path/to/your/other-project
greenops connect '<complete link from your dashboard>'
greenops scan .
greenops review .
# Or run the existing agent workflow:
greenops run .
# Upload existing evidence or retry after a connection interruption:
greenops sync --ledger ./greenops-ledger.json --project my-project
# Keep watching an existing ledger:
greenops sync --ledger ./greenops-ledger.json --watch
greenops disconnect
```

Connect once per OS user/machine; subsequent codebase terminals share that account connection.
`scan` produces a local repository summary; `review` and `run` sync their sustainability ledgers.
Each project's default ledger is stored in that project's working directory. Add
`greenops-ledger.json` to its `.gitignore` if it should not be committed. While the dashboard
uses `127.0.0.1`, it must be running on the same machine as the CLI. Remote machines require
the deployed HTTPS URL. A copied dashboard command beginning with `pnpm greenops` can be
used from an external project by removing the initial `pnpm`.

### Gemini reviews

Set `GREENOPS_LLM_PROVIDER=gemini`, `GEMINI_MODEL=gemini-3.5-flash`, and your private
`GEMINI_API_KEY` in the ignored GreenOps checkout `.env` (or `.env.local`). The installed CLI
uses these provider defaults from any codebase. Explicit shell/project values take precedence;
`greenops review . --provider gemini` overrides provider selection. Shared defaults only load
model configuration, never the checkout's MongoDB or GitHub credentials.

Static detection identifies candidates; Gemini receives finding evidence and bounded source
snippets to explain causes and propose remedies. The CLI reports model-generated and fallback
investigation counts, including safe reasons for provider failures. Fallback findings are not
presented as Gemini output. Review records include provider, model, status and reported tokens.
The dashboard totals recorded request usage, preserving unknown usage on failed calls, and
shows modeled opportunities separately from verified changes. A source review alone cannot
measure your production power, cloud bill, location, or realized carbon savings.

The normal scanner configuration and safety gates still apply. Connecting enables future
run/review ledger uploads, including finding evidence and file paths. Review your evidence for
sensitive information before connecting. Local scans continue if cloud sync fails; retry with
`sync`. Tokens are stored in `~/.config/greenops/credentials.json` with owner-only permissions.
Run history and review decisions are restricted to the authenticated user. Access tokens expire
after 15 minutes; refresh tokens rotate, with an absolute 30-day session lifetime. Revoke a
terminal from **Connected sessions**. The website polls every ten seconds; stale terminal
heartbeats are shown as offline after one minute.

## Azure resource setup

1. In Azure Portal, create **Web App**, select your subscription, and create resource group
   `greenops-rg`. Choose an available app name, **Code**, **Node 24 LTS**, **Linux**, and a region
   near Atlas. Select **Free F1** for initial testing if available; Basic B1 costs money and
   supports Always On. Review the portal's price before creating. Leave deployment integration off.
2. Copy the exact HTTPS default domain from Overview. Add these Environment variables:
   `MONGODB_URI` (secret), `MONGODB_DB=greenops`, `GREENOPS_PUBLIC_URL=https://<actual-domain>`,
   `GREENOPS_REGISTRATION=open`, `NODE_ENV=production`, `HOSTNAME=0.0.0.0`.
   Never use a `NEXT_PUBLIC_` prefix for credentials.
3. Enable HTTPS Only. In Properties, copy all Outbound IP Addresses and allow them individually
   in Atlas Network Access. Recheck this list if you change the plan. Use an Atlas database user
   with read/write permissions on the `greenops` database.
4. Under Configuration → General settings, set the startup command to
   `node apps/CodeVitals-MCP/website/server.js`. Use Always On if your paid tier supports it.

## Build and deploy

The **Build GreenOps web deployment** GitHub workflow builds a Linux standalone Next.js package,
runs MongoDB integration tests, and uploads `greenops-web-linux`. It does not deploy automatically.
Run it manually on the intended branch. Its current automatic push trigger targets `greenops-init`, not `develop`; confirm branch coverage before relying on automation.
Download the artifact and extract its outer archive to obtain `greenops-web.zip`.

With Azure CLI installed and signed into the correct subscription:

```sh
az login
az account set --subscription '<subscription ID>'
az webapp deploy --resource-group greenops-rg --name '<app name>' --src-path ./greenops-web.zip --type zip
```

The archive contains prebuilt code. Do not enable App Service remote build for this package.
The build script removes dotenv files from the package; supply secrets only through Azure.
Do not deploy a macOS build to Linux, because native dependencies can differ.

After deployment, verify `/api/cloud/health` returns `{"status":"ok"}`, register at `/login`,
connect a terminal using the deployed domain, scan a fixture, and confirm that the run appears.
Register a separate account and confirm its history is empty. These hosted checks still need
to be performed against the actual Azure app.

## Metrics and scope

The server validates ledger structure, prevents rewriting previously uploaded entries, derives
finding/verification counts, sums the latest confirmed verification estimates per finding, and
calculates net savings after recorded scan cost. Unknown scanner cost remains unknown. Physical
figures are scanner-reported estimates, not independently metered electricity or carbon savings.
The dashboard's explicit sample mode remains illustrative and separate from account evidence.
Geography and carbon views can only show measurements/location data present in the ledger.

Account plan approvals use the signed-in identity and bind to the proposal's evidence fingerprint.
They do not execute infrastructure changes or verify savings. Forgotten-password recovery and
email verification are not implemented; account ownership currently relies on knowing the password.
No administrator or shared default login is created.

## Validation

```sh
GREENOPS_RUN_DB_TESTS=1 pnpm exec vitest run tests/cloud-backend.integration.test.ts
pnpm exec vitest run tests/control-plane-dashboard.test.ts tests/dashboard-ledger-loader.test.ts tests/cli.test.ts
```

Integration tests use disposable MongoDB and a loopback HTTP server, never your Atlas database.

References: [Node App Service setup](https://learn.microsoft.com/en-us/azure/app-service/quickstart-nodejs),
[App settings](https://learn.microsoft.com/en-us/azure/app-service/configure-common),
[outbound IPs](https://learn.microsoft.com/en-us/azure/app-service/overview-inbound-outbound-ips),
[ZIP deployment](https://learn.microsoft.com/en-us/azure/app-service/deploy-zip).

### Live system counters and public grid

From any linked repository, run `greenops monitor`. Leave the command running to
stream OS CPU utilization, memory, core count and GreenOps process RSS every five
seconds. Stop with Ctrl+C. `review` and `run` collect the same counters while active.
No administrator permissions or background daemon are needed. Counters are stored
under the signed-in account for 24 hours; the dashboard displays up to one hour.
They do not measure power or prove energy savings.

The overview's Connected Sources section includes device selection, CPU/memory
charts and an explicit **Assess live readings with Gemini** button. This sends
recent counters (not source files) and grid context to the configured model. It
requires fresh telemetry, uses the server's `GEMINI_API_KEY` and `GEMINI_MODEL`, and
limits assessments to three per five minutes per account. CLI reviews load provider
settings from the project first, then the GreenOps checkout's `.env.local`, website
`.env.local`, and root `.env`; process/project values retain priority.

Public Great Britain grid data comes from the NESO Carbon Intensity API (CC BY 4.0).
It is independent of repository findings. Actual and forecast values are labeled;
stale or failed values remain unavailable. For an operator-configured local map
pin, add these non-secret settings to the website `.env.local` or host environment:

```dotenv
GREENOPS_LOCAL_NAME="Ahmedabad, Gujarat, India"
GREENOPS_LOCAL_LAT=23.0225
GREENOPS_LOCAL_LON=72.5714
```

For local grid intensity, privately configure `ELECTRICITY_MAPS_API_TOKEN` with
coverage for those coordinates. Gemini is not a grid-data provider. Without a grid
token, the local pin is visible but its intensity is unavailable. This location is
an operator configuration shared by this deployment; it is not automatic device
geolocation. Public grid context is never added to measured machine emissions.

The seven specialist views show evidence actually collected. Repository review feeds
Architecture, recorded model requests feed usage metrics, and available grid data
feeds public context. Cloud waste needs resource inventory, disaster recovery needs
recovery-test evidence, and collaboration needs workflow evidence; neither mock
fleet fixtures nor AI guesses are presented as connected live sources.
