# GreenOps dashboard

Next.js 16 / React 19 UI for saved analysis, human plan review and isolated demonstrations.

For installation, use the [root quick start](../../../README.md#quick-start). For MongoDB accounts and terminal sync, use the [connected workspace guide](../../../docs/cloud-dashboard.md).

## Run locally

After installing/building the root workspace and generating the sample ledger, run from this folder:

```powershell
npm.cmd ci
$env:GREENOPS_LEDGER_PATH = "../../../.tmp/judge-baseline.json"
npm.cmd run dev -- --port 3003
```

Open [the dashboard](http://127.0.0.1:3003/dashboard). The ledger path applies only in no-database mode. MongoDB account mode loads uploaded account evidence instead.

For a production preview, stop the dev server, run `npm.cmd run build`, then `npm.cmd run start -- --port 3003`.

## Find your way around

| Page                         | What to do                                                                    |
| ---------------------------- | ----------------------------------------------------------------------------- |
| Overview                     | See the subscription baseline, team opportunities and GreenOps resource usage |
| Specialists                  | Open one of seven agents; inspect summary counts, chart and next review       |
| Investigations               | Search all findings                                                           |
| Approvals / Review decisions | Record approve-plan, reject or request-revision decisions                     |
| Results & Evidence           | Inspect before/after evidence and export the selected findings                |
| Agent Activity               | Read recorded workflow events and whole-run usage                             |

Specialists share Findings, Recommendations, Results and Activity tabs. The first three findings are shown initially, with pending work first. **View all**, search and status filters expose the remainder. Detailed measurements and inventory are collapsed.

A finding opens a dedicated review. **Record decision** sits immediately below the form. It records a plan, not deployment. The separate **Open apply & verify demo** link never applies that recorded recommendation.

## Data and filters

- **Recorded analysis:** a selected saved run, whether loaded locally or from MongoDB.
- **Sample scenarios:** a separate synthetic catalog; sample decisions reset on reload.
- **Date presets:** filter finding timestamps relative to the run's snapshot, not today's clock.
- **Custom dates:** inclusive UTC calendar dates. Same-day records may look identical under several presets.
- **Subscription baseline and agent overhead:** retain their whole-run/original-period scope; they are not prorated by finding filters.
- **Refresh results:** reloads evidence; it does not run analysis or retry Gemini.

Account reviews use the signed-in identity. Local reviews use a self-declared reviewer. Both require a reason, scope acknowledgment and an evidence-bound proposal. Unchanged account refreshes preserve the open draft.

## Map and charts

**Carbon by region** shows explicit supported locations only. Selecting a pin or ranked region updates its resource links. Grid intensity (g CO₂e/kWh) is not total workload emissions. Proposed routes are optional; missing intensity remains unknown.

The map uses bundled Natural Earth data, not a paid map service. Charts include point inspection and exact-value tables. Motion respects reduced-motion preferences. The theme picker is removed; compatibility theme keys remain.

## Isolated demos

- **AI Efficiency → Open sandbox:** baseline, approval, cache application, replay verification and optional rollback. Fixture replay needs no API key; Live Gemini is explicit opt-in.
- **Digital Waste → Open sandbox:** find, review, approve simulation, simulate and check synthetic inventory.
- **/dashboard/measurement:** SCI evidence worksheet; incomplete inputs do not become a complete carbon comparison.

Demo sessions/results are separate from fleet counts and plan approvals. Neither demo proves real carbon savings.

## Developer checks

`npm.cmd run lint` and `npm.cmd run build` run from this folder. Focused tests run from the repository root; see [setup](../../../docs/development/getting-started.md#validation-commands) and [dated validation](../../../docs/SUBMISSION.md#validation-record).

The main UI lives in `src/app/dashboard/control-plane`. Keep local servers on loopback; authenticated hosting still requires deployment-specific security checks.
