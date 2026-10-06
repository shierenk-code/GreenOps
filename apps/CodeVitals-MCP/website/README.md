# GreenOps Website and Dashboard

This Next.js application contains the public site and a **local** sustainability-control-plane prototype. See the [root README](../../../README.md) and [architecture](../../../docs/architecture/overview.md) for the analysis engine.

The homepage introduces one GreenOps product with recorded/sample workspace links, six agents, Human Approvals, the cache demo and the SCI worksheet. Repository analysis is presented as an integrated capability. Component origin and legacy compatibility names are disclosed in the root README, not as separate-product branding in the UI.

Documentation last reviewed against `greenops-init` on 6 October 2026. For a judge-ready clone/install/run sequence, use the [root quick start](../../../README.md#judge-quick-start-run-the-proof-of-concept).

## Interaction and motion

The header offers five appearance-only themes, preserving the selected run and navigation: **Clean Enterprise Light** (sage/lime), **Charcoal & Olive** (default; second option; dark sidebar, white panels and forest/olive accents), **Dark Cyber**, **Sustainable Forest**, and **High Contrast**. Preview: `/dashboard?tab=overview`.

The Overview uses three evidence-derived summary cards, a short cross-agent review queue with finding deep links, a clearly separate Digital Waste sandbox entry point, a lifecycle guide and six specialist workspace links. The lifecycle guide is not run progress. Agent resource usage is collapsed by default; specialist pages use consistent sections, and the existing execution workflows remain unchanged.

Dashboard navigation keeps the shell stable and fades the selected view over 180 ms. Notification and full-page-review entrances use a short, 4 px transition; controls use 120 ms feedback. The refresh icon rotates only while an actual refresh is pending. Reduced-motion preferences disable animation and transitions, and printed content is not animated. Theme changes preserve the open review and its draft; changing the dataset or range closes the review to avoid using stale evidence.

The approach draws on [Azure DevOps navigation](https://learn.microsoft.com/en-us/azure/devops/project/navigation/?view=azure-devops) and [Microsoft Fluent motion](https://fluent2.microsoft.design/motion); it is not a pixel-for-pixel copy or Microsoft affiliation.

## Start locally

First, from the repository root:

```powershell
pnpm.cmd install
pnpm.cmd build
pnpm.cmd greenops run .\fixtures\greenops-mock --fleet --provider offline --ledger .\greenops-fleet-ledger.json
```

Then, in a second terminal starting at the root:

```powershell
cd apps/CodeVitals-MCP/website
npm.cmd ci
$env:GREENOPS_LEDGER_PATH = "../../../greenops-fleet-ledger.json"
npm.cmd run dev
```

Open <http://127.0.0.1:3000/dashboard>. The website is not included in the root pnpm workspace; it has its own package-lock.json and install/build. Its `predev`/`prebuild` scripts compile the shared agents and ledger with the root TypeScript installation, so install root dependencies first and invoke the npm scripts instead of Next directly. Latest local production build passed with Next.js 16.3.6; a fresh-machine installation remains unverified. Keep security-patch install scripts enabled.

For a production preview, stop your own dev server, run `npm.cmd run build`, then `npm.cmd run start -- --port 3003` and open `http://127.0.0.1:3003/dashboard`. If occupied, choose port 3004 instead; do not kill unrelated processes. Stop a production preview before rebuilding to avoid stale assets. More [troubleshooting](../../../docs/development/getting-started.md#troubleshooting).

## Current navigation

| Section           | Page               | Query               |
| ----------------- | ------------------ | ------------------- |
| Workspace         | Overview           | ?tab=overview       |
| Workspace         | Investigations     | ?tab=investigations |
| Workspace         | Approvals          | ?tab=approval       |
| Specialist Agents | Carbon Efficiency  | ?tab=carbon         |
| Specialist Agents | Digital Waste      | ?tab=waste          |
| Specialist Agents | AI Efficiency      | ?tab=ai             |
| Specialist Agents | Architecture       | ?tab=arch           |
| Specialist Agents | Disaster Recovery  | ?tab=dr             |
| Specialist Agents | Collaboration      | ?tab=collab         |
| Evidence          | Results & Evidence | ?tab=results        |
| Evidence          | Agent Activity     | ?tab=activity       |

All queries are appended to /dashboard. Findings open a full-page evidence/recommendation/decision view with the existing proposal-bound safety checks. Each specialist uses `section=findings|recommendations|results|activity`. The header search opens Investigations; AI and Waste **Open sandbox** links use `sandbox=1` for the isolated workflows. The sidebar has no environment filter. Notifications remain a dropdown.

Auxiliary routes remain:

- /dashboard/ai-efficiency-demo — also embedded under AI Efficiency Agent → Open sandbox.
- /dashboard/measurement — SCI evidence worksheet, currently direct-link only.

Older agent/finding/approval URLs map to current tabs where possible. Trace/audit routes open Agent Activity; reports/improvements open Results & Evidence. The results export includes selected findings, decision history and whole-run resource accounting, not separate sandbox sessions or CLI operational outcomes.

## What the controls mean

- **Recorded analysis:** selected-run evidence. Missing observations remain unknown; no fabricated financial ROI or verified carbon benefit.
- **Sample scenarios:** explicitly synthetic dashboard examples. Separate from CLI fleet fixtures; decisions reset on reload.
- **Range:** relative to the dataset timestamp, not a live monitoring window.
- **Refresh results:** reads saved results, not a scan or model call.
- **Import results:** browser-local JSON parsing with a session-storage snapshot; no remote upload. Refresh returns to server results.
- **Human Approvals:** local plan reviews, not execution authorization. Recorded reviews persist in browser local storage, bound to proposal fingerprints; unsupported storage/locking disables saves.
- **Notifications:** derived pending work, recorded fallback and load status, not live provider health. Read state resets on reload.

The loader respects an explicit GREENOPS_LEDGER_PATH. Otherwise it searches four known ledger filenames in the root and website directories and selects the newest valid file. Invalid explicit paths and missing selected runs fail visibly; files over 20 MiB are rejected.

## Executable Digital Waste sandbox

Open Digital Waste Agent → **Open sandbox → Start waste workflow**. Select `api-gateway`, inspect sources and manual steps, enter a demo reviewer alias and reason, acknowledge simulation scope, and choose **Approve simulation → Simulate approved change → Check simulation result**. Inspect CPU requests of 2 → 0.6 cores per replica and select **Export evidence**. The result must say real savings are not verified.

This uses the shared backend planner with synthetic inventory, not live cloud discovery. Four findings include two ready for review and two blocked for missing evidence. No model, kubectl or Azure calls are available through this API. Plans expire after 15 minutes; simulation approval after five minutes. Refresh restores the local session; **Start new scenario** creates a new one, so export first. Historical snapshots remain under ignored `.tmp/digital-waste-workflow/`.

This workflow is independent of the selected fleet ledger, filters and central Human Approvals. Simulation checks validate the copy-only inventory transition, not service quality, actual energy or billing. Decisions are self-declared and local, not authenticated enterprise approvals.

The overview's **Resources used by GreenOps** summarizes the selected fleet run's reported usage and gaps. Agent Activity exposes curated lifecycle events, not raw reasoning or live telemetry. CLI Carbon/Waste `operationalOutcomes` are not yet rendered there; use their ledgers or the Waste workflow's own evidence export.

## Source map

- src/app/dashboard/control-plane/ — active shell, overview, agent pages, approvals, notifications and dataset adapters.
- src/app/dashboard/ledger-loader.ts — server-side ledger selection and bounded reading.
- src/app/dashboard/approval-inbox.tsx — existing browser-local approval store reused by the new UI.
- src/app/dashboard/ai-efficiency-demo/ — isolated synthetic/live cache demonstration.
- src/app/dashboard/measurement/ — SCI worksheet.
- src/app/dashboard/digital-waste/ — isolated synthetic workflow, versioned local session, same-origin API and shared backend adapter.

Some older dashboard components remain for compatibility/tests. Their presence does not mean they are exposed by the current navigation.

## Validation and limits

```powershell
# From this directory
npm.cmd run lint
npm.cmd run build
```

The root [development guide](../../../docs/development/getting-started.md) provides regression-test commands. The [submission status](../../../docs/SUBMISSION.md) records actual checks and important gaps.

This is loopback-only, single-process demo software. It lacks enterprise identities, shared protected approvals, live cloud execution and verified energy metering. Do not deploy publicly or tunnel it without additional controls. Credentials stay server-side and must never be exposed in the browser or committed.


## Frontend design

The default **GreenOps Studio** workspace follows the live Mistral reference: a neutral
canvas, oversized sans-serif typography, thin ruled sections, square controls, full-width
navigation, and original orange pixel illustrations. The existing `sunset` URL theme key
is retained for compatibility. Alternative themes remain selectable. The supplied
`DESIGN.md` describes an earlier editorial direction; the landing page and workspace now
follow the current live reference.

`workspace-motion.tsx` uses the already-installed Framer Motion package for scroll-linked
geometry and section reveals. Content renders visibly on the server; reduced-motion
preferences disable movement. Illustrations are local SVG and CSS, with no proprietary
font or third-party asset dependency. Desktop specialist/evidence menus support keyboard
navigation and Escape; mobile uses the existing focus-managed drawer.

The landing page uses `home-motion.tsx` for scroll-linked hero geometry, moving signal
rows, section entrances and accessible specialist tabs (arrow keys, Home and End).
`home-illustrations.tsx` contains original pixel SVGs for cloud, servers, AI chips,
evidence and review. Mobile navigation closes on selection and Escape. Illustrations
are decorative, and animation is disabled for reduced-motion preferences.

Validation: `npx eslint src/app` and `npm run build -- --webpack`. Webpack is a supported
fallback if the default Turbopack build stalls in a restricted environment. The full lint
command also checks the existing CommonJS security patch script, which currently reports
three `@typescript-eslint/no-require-imports` errors.

### Interactive workspace

The overview now includes a carbon atlas, agent finding charts, and a selectable decision
breakdown. Carbon and architecture specialists also expose geographic evidence. The
default workspace uses horizontal navigation on desktop and a keyboard-accessible drawer
on mobile; alternative themes retain the collapsible sidebar.
Appearance controls preserve the existing alternative themes.

The atlas uses the bundled Natural Earth land illustration in `public/maps` with no map
service, API key, or runtime network dependency. Pins are approximate regional centroids.
Sample observations are derived from the existing scenario inventory. Recorded observations
require an explicit supported region; intensity requires explicit units. Unknown values
remain unknown, unsupported locations are counted, and no live grid feed is implied.
Current/candidate ranges are observation ranges, not regional averages.

Charts support area/bar switching, keyboard/touch point inspection, and exact-value tables.
Series with matching units share a scale; different-unit series retain labelled separate
axes. Missing secondary observations are gaps, not zeros. Page, chart and control motion
respects the system reduced-motion preference.

Focused regression checks:

```sh
# From the repository root
pnpm exec vitest run tests/carbon-atlas-data.test.ts tests/workspace-chart.test.ts tests/executive-overview-design.test.ts tests/control-plane-dashboard.test.ts tests/control-plane-data.test.ts tests/control-plane-agent-pages.test.ts tests/control-plane-audit-pages.test.ts
```
