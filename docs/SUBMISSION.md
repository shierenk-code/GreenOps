# Submission readiness

Reviewed against the local checkout on **6 October 2026**. This is an implementation/status record, not a production certification or confirmation that changes are pushed.

Repository: [shierenk-code/GreenOps](https://github.com/shierenk-code/GreenOps). Submit the exact reviewed branch/commit and confirm judge access if private.

Submission branch: [develop](https://github.com/shierenk-code/GreenOps/tree/develop). The [augmentation log](augmentation-log.md) documents AI assistance, revisions and verification limits. The [assets checklist](submission-assets.md) links the shared folder for the pitch deck and demo video; both uploads are pending confirmation.

## What a judge can run

Start with the [README](../README.md#quick-start).

| Demonstration           | Expected evidence                                                   | Boundary                                                           |
| ----------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------ |
| Azure baseline fleet    | 31 findings across seven specialists; synthetic subscription rollup | Recommendations only; no cloud mutation                            |
| AI cache Fixture replay | 8 requests; provider calls 8 → 4; answer and isolation checks       | Synthetic/provider-response benchmark, not measured carbon savings |
| Digital Waste sandbox   | Review, approved simulation and before/after inventory              | Copy-only change; no cloud cleanup                                 |
| Carbon CLI simulation   | Constrained scheduling proposal and simulated dispatch receipt      | Forecast estimate; no verified savings                             |
| Source-code sandbox     | Supported duplicate-import fix and re-detection                     | Original repository unchanged                                      |

The legacy `greenops-mock` fixture still has six populated input domains and 34 expected findings. The seventh specialist is registered but has no pipeline records there. Do not confuse it with the 31-finding Azure dataset.

## Implemented, with limits

- Seven-specialist orchestration, deterministic detection, optional Gemini investigation, stage traces and error/fallback accounting.
- Dashboard filtering, compact specialist pages, regional evidence, proposal-bound human reviews and evidence exports.
- MongoDB account/session support, terminal connection, account-scoped run sync and reviews.
- Separate supported sandbox workflows and a restricted Carbon Kubernetes adapter.
- Agent request/token/tool/retry/duration accounting, missing-usage indicators and SCI-based evidence validation.

Still incomplete: general fleet execution, live Azure-wide discovery, automatic measured energy collection, independent carbon assurance, password recovery/email verification and production deployment validation. CLI operational outcomes and sandbox sessions are not included in fleet UI result counts.

A dashboard approval is not application. A passed sandbox check is not proof of measured energy, financial or carbon savings.

## Validation record

Latest scoped local checks on 6 October 2026:

- Dashboard TypeScript check passed.
- Final pre-push rerun: **151 tests passed across five dashboard/data/review/map suites**. This overlaps the earlier scoped runs below; do not add the counts together.
- **131 tests passed** across control-plane dashboard/data, approval rendering and carbon-map data.
- Browser checks confirmed compact/View all findings, regional selection, and the separated review/demo layout at desktop and narrow widths.
- Follow-up review-action placement: TypeScript and **112 tests across three review/dashboard suites passed**. The save action is now immediately below the decision form, not below history or the prototype demo.
- Earlier account-integration checks used disposable MongoDB. A Unix file-permission assertion fails on Windows; the targeted rerun excluding that assertion passed. Do not describe that as an unqualified full integration-suite pass.
- The last recorded Gemini generation probe returned HTTP 503; the resulting 31-finding run used labelled rule-based fallback, not successful model-generated analysis.

These are not fresh-machine installation, full-suite, live AKS or hosted CI certifications. Previous dated checks are preserved in [validation history](development/validation-history.md).

The main CI and website-artifact workflow definitions still include historical `greenops-init` branch triggers. Confirm/update intended branch coverage before relying on a push to `develop`; this documentation change does not modify CI.

## Before submitting

1. Rehearse from the exact clean checkout/commit supplied to judges.
2. Confirm private-repository access and preserve the component-origin declaration.
3. Export one full baseline → human decision → sandbox change → verification run.
4. Include GreenOps' own sustainability figures with method, uncertainty and missing evidence; tokens alone are not physical energy.
5. Confirm the team list, hackathon dates, pitch deck and video. Their completion is not established by this code review.
6. Use public/open/synthetic data only; remove credentials and personal identifiers from recorded evidence.

See [architecture](architecture/overview.md), [measurement](measurement.md), [security](../SECURITY.md) and [setup](development/getting-started.md).
