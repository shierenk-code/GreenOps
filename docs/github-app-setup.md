# GreenOps GitHub Review Integration

GreenOps sustainability review and integrated semantic-risk review share the GitHub integration. This is a separate webhook service within the same project; starting it does **not** start the dashboard.

## Prerequisites and local listener

Use Node.js 22 and pnpm 11.17.0, install/build from the repository root, and provide `GITHUB_WEBHOOK_SECRET` plus an appropriately scoped `GITHUB_TOKEN` through a private server-side environment. Do not paste credentials into documentation, shell-history examples or a PR.

```powershell
# Repository root; secrets already supplied privately
$env:GREENOPS_LLM_PROVIDER = "offline"
pnpm.cmd greenops serve --port 3002
```

The endpoint is `POST /api/webhooks/github`; `GET /health` reports listener health. Port 3002 avoids the dashboard's usual 3000. The listener's network binding is separate from the dashboard's loopback-only configuration.

**Security boundary:** webhook verification fails closed when the secret is missing or the signature is invalid. Uploads are limited to 1 MiB with a 15-second inactivity timeout. PR staging rejects unsafe paths, case-colliding filenames, more than 100 files, files over 1 MiB, and total staged content over 8 MiB. These are input controls, not CPU/memory isolation. GitHub response downloads still need bounded fetching, and delivery replay protection and a durable job queue remain unfinished. Do not expose the listener without scoped credentials, network restrictions and isolated analysis workers. See [security policy](../SECURITY.md).

## GitHub application configuration

Configure the application's webhook URL to reach the protected listener endpoint, with the same webhook secret. The integration needs repository-content read access and permissions to publish PR comments/reviews and Check Runs. Subscribe to pull-request events and issue-comment events if comment commands are needed.

Credential issuance, installation-token renewal and infrastructure access controls are deployment responsibilities; starting the CLI does not provision them. Verify permissions and organization policy with the repository owner before enabling external access.

The current server handles opened, reopened and synchronize PR events. It runs sustainability analysis and records commit/PR evidence in `GREENOPS_LEDGER_PATH` (default `greenops-ledger.json`), then publishes a GreenOps check, summary and applicable inline findings. Repository risk review remains part of the integration.

## Repository policy

The root README documents the `greenops` configuration object in `.greenopsrc` or `.greenopsrc.json`, including local/PR enablement, review thresholds and fix policy. Legacy `.codevitalsrc` names are supported when no GreenOps-named file exists. Review those settings before connecting a repository.

Comment commands implemented by the bot include:

- `/greenops review` or `@greenops-bot review`: request a sustainability re-review.
- `/greenops help`: show command guidance.
- `/greenops fix`: return guidance, **not an implemented remote remediation commit**.

Comment handling also recognizes the older /codevitals prefix. Do not claim that approving a Check Run or writing a comment implements a cloud action or bypasses approval/execution policy.

## Local and CI validation

```powershell
# Deterministic read-only sustainability analysis
$env:GREENOPS_LLM_PROVIDER = "offline"
pnpm.cmd greenops review . --format markdown
```

Local CLI output alone does not post a GitHub review. Posting is handled by the integration with explicit credentials and event context.

The repository's [CI workflow](../.github/workflows/ci.yml) uses Node.js 22 and pnpm 11.17.0. It runs a frozen-lockfile root install, the website `npm ci` with security-patch checks, version check, lint, build, Vitest and the MCP Jest suite; the website production build and lint are not yet in CI. See [submission status](SUBMISSION.md). Unit/integration tests with mocked GitHub responses are not proof of a successful live installation.
