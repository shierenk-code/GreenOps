# Review your architecture or Azure test subscription

## Browser form (no commands)

Open **Review your architecture / connect Azure**, then **Review resource configuration · browser form**. Add resource names, known CPU sizing, grid intensity and autoscaling status, and select **Review configuration**. Unknown values remain unknown. Results appear immediately below the form and are temporary: they are not saved to MongoDB or merged into the selected run. This is a limited three-rule configuration review, not image/PDF interpretation or a full architecture assessment. The advanced CLI path below produces persistent ledgers.

Select **Review your architecture / connect Azure** in the dashboard. Run these commands from the repository root after [setup](getting-started.md). These assessments use deterministic checks, not Gemini, and never change infrastructure.

## Architecture JSON

Download the dashboard template or use [the synthetic example](../../fixtures/architecture-review/architecture.json). Supply structured resource records—not diagrams, screenshots, raw Terraform or Bicep. Required fields: `name`, `type`, `region`, `gridIntensityKgPerKwh`, `instanceCores`, `neededCores`, boolean `autoscale`. Use evidenced numbers. Limits: 500 resources, 1 MiB.

```powershell
pnpm.cmd greenops architecture assess ./fixtures/architecture-review/architecture.json --ledger ./.tmp/architecture-review.json
```

The example produces three findings. Recommendations are not verified savings.

## Azure: read-only configuration assessment

Install Azure CLI and use Reader access to an explicitly permitted non-sensitive test subscription. Do not scan customer resources for the hackathon.

```powershell
az login
pnpm.cmd greenops azure scan --subscription <your-subscription-UUID> --ledger ./.tmp/azure-readonly-review.json
```

Coverage: **VM scale sets and Azure Monitor autoscale settings only**. Missing or disabled autoscaling produces a review prompt; external controllers or intentional fixed capacity may make it unnecessary. This is not browser OAuth, a full subscription baseline or a seven-agent scan. No utilization, billing or grid-carbon measurements are collected. Other agents stay empty without their own evidence.

The CLI obtains an Azure CLI access token, makes GET requests and persists only selected finding fields, not the token. Failed, malformed, oversized or unsafe paginated responses stop the assessment rather than reporting a healthy subscription. Live Azure validation remains outstanding; HTTP behavior is tested with mocked responses.

## Display results

- Without account mode: **Import results**, then select the generated ledger.
- Signed in with MongoDB: choose **Connect terminal**, copy only its URL into `pnpm.cmd greenops connect '<URL>'`, then sync:

```powershell
pnpm.cmd greenops sync --ledger ./.tmp/architecture-review.json --project architecture
# For Azure instead:
pnpm.cmd greenops sync --ledger ./.tmp/azure-readonly-review.json --project azure-review
```

Select the new **Run history** entry, **Recorded analysis**, then **Architecture**. MongoDB stores the assessment; it does not connect to Azure. Check run, dates and filters before interpreting an empty page.

## Tabs and status

- Findings: detected problems and resources.
- Recommendations: proposed changes, benefits, risks and review actions.
- Results: application and verification evidence.
- Activity: analysis stages and decisions.

Approval updates **Plan approved**, not **Applied** or **Check passed**. Separate recorded verification is required. A passed configuration check is not proof of measured carbon savings. The isolated AI sandbox demonstrates approval, application and replay checks without deploying into Azure.
