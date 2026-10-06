# Augmentation log — AI usage documentation

Project: GreenOps. Maintainer: Shieren Khan. Updated: 6 October 2026.

## Scope and responsibility

Codex assisted with repository inspection, implementation, tests, troubleshooting, UI revisions and documentation during development. The developer supplied requirements, screenshots, constraints and feedback. This is a retrospective summary of the available development conversation and local verification records, not a complete prompt transcript or independently audited activity log. Exact dates and authorship for earlier work have not been reconstructed.

“Accepted” below means retained in the implementation or documentation at this review, not independent human certification. Human review remains required before submission and deployment. Google Gemini is the application's optional reasoning provider; it is separate from Codex's development assistance.

## Assistance across the software lifecycle

| Stage / task attempted | AI output and disposition | Review, correction or boundary |
| --- | --- | --- |
| Requirements and architecture review | Compared the implementation with the proposed control-plane architecture; retained a seven-specialist scope and documented gaps | The architecture image is a target, not evidence that every component works in production |
| Agent workflows | Assisted with detection, orchestration, baseline rollups, carbon scheduling and supported sandbox workflow work; retained in the codebase | General fleet auto-remediation and live AKS validation remain incomplete; do not present recommendations as execution |
| Provider selection | Explored multiple provider options; revised the documented/default project setup to Gemini at the user's request | Ollama alternatives were rejected for the current setup. Compatibility adapters in source are not claimed to have been removed |
| Dashboard design | Generated and implemented navigation, specialist summaries, maps and review layouts; repeatedly modified following user screenshots | Earlier text-heavy/guided layouts and theme-menu behavior were rejected or revised. The current page has compact counters, limited initial findings and expandable evidence |
| Date filtering | Added custom date bounds, selected-run-relative presets and tests | Same-day mock observations can legitimately give the same counts for multiple presets. Whole-run totals are not prorated |
| Account reviews | Assisted with reviewer identity display, draft preservation and save feedback | The signed-in account is authoritative. Saving a plan decision must not claim deployment or verified savings |
| Review usability | Separated the prototype panel from the decision form and moved the save action below the acknowledgement | Browser layout checks covered desktop/narrow widths. The user later identified that the small approved badge is still insufficiently prominent; a clearer approval summary remains a usability follow-up |
| Gemini diagnostics | Tested synthetic fleet analysis and minimal generation requests | The latest recorded generation probe returned HTTP 503. The 31-finding run used labelled rule-based fallback; this was not a successful model-generated result |
| Testing | Added/updated regression checks and ran focused TypeScript, rendering, data and browser checks | Scoped results are listed below; they are not a full-suite, fresh-install or production certification |
| Documentation | Shortened README; updated architecture, setup, CLI, measurement, operational and submission guidance; created this log | Longer validation history was retained separately. Shared presentation/video folder is linked, but uploads and judge access are not verified |
| Release preparation | Reviewed intended changes, ignored private configuration and prepared the develop-branch handoff | GitHub push status must be confirmed separately. No force-push or history rewrite is needed for this update |

## Errors identified and corrective steps

| Observed error / misleading behavior | Corrective action and outcome |
| --- | --- |
| Live Gemini assessment button appeared inert without telemetry | Made missing/stale readings explicit and pointed to monitor/demo paths instead of silently disabling the action |
| Account refresh could recreate identical evidence and reset a review draft | Stabilized unchanged ledger identity; browser check retained an unsubmitted draft through a refresh interval |
| Custom date input edits reverted before submission | Changed the date form handling to apply bounds on explicit submission; added data-filter regression coverage |
| Prototype panel overlapped the decision form | Assigned a separate layout area; checked the finding page at desktop and narrow widths |
| Record decision button was far below the form/history | Moved it immediately below the acknowledgement, preserving validation and preventing duplicate submit controls |
| New compact-findings test counted a chart table instead of the findings table | Scoped the test to the findings-table caption; the focused suite then passed |
| A Unix file-permission assertion failed on Windows | Recorded the platform limitation and reported the exclusion in the targeted rerun; did not claim an unqualified integration pass |
| Gemini availability failure | Preserved fallback provenance and missing-usage indicators; did not relabel fallback output as Gemini success |

## Recorded verification

Local checks recorded on 6 October 2026:

- Website TypeScript check passed.
- Final pre-push rerun passed all 151 tests across five dashboard/data/review/map suites; this overlaps the earlier runs below.
- 131 tests passed across four dashboard/data/approval/map suites.
- Follow-up review-action placement: 112 tests passed across three review/dashboard suites. These suites overlap; the counts must not be added as unique tests.
- Browser checks covered compact/View all findings, regional selection, non-overlapping review/demo panels, draft preservation and save-button proximity. Draft-only checks did not submit a decision or mutate infrastructure.
- Disposable MongoDB checks were used for account integration; a Windows file-permission assertion was excluded from the targeted rerun and remains a limitation.
- Live Gemini generation returned 503 during the recorded probe. No successful live-generation benchmark or physical energy saving is claimed.

See [submission status](SUBMISSION.md) and [dated validation history](development/validation-history.md) for scope and earlier records. A subsequent push does not establish that remote CI passed.

## Integrity, data and human oversight

- GreenOps includes pre-existing CodeVitals components and third-party dependencies. AI assistance or rebranding does not establish original authorship.
- Use only public/open/synthetic evaluation data. Private environment files, account credentials and temporary run evidence are not submission assets.
- Never include secrets in this log or recordings. Previously exposed credentials require rotation; deleting a displayed value is not rotation.
- A dashboard approval saves a plan decision. Separate execution safeguards and before/after checks are required for supported changes. Production mutations must not be inferred from a UI badge.
- Confirm the hackathon timeline, team contribution and pre-existing baseline manually. This log cannot certify competition eligibility.

## Maintaining this log

**7 October 2026, architecture submission packaging:** Copied the user-supplied architecture and executive overview PDFs/PNGs unchanged into `docs/architecture`, verified copy hashes, and linked them from the README. Added target-design labels and links to current implementation boundaries; the supplied artwork itself was not revised or independently certified. Included the requested same-terminal quick-start correction.

**7 October 2026, browser architecture form:** Replaced JSON-download-first onboarding with an in-browser resource configuration form and immediate rule-based results. Unknown values do not become zero; input changes invalidate old results. Explicitly separated temporary form results from saved runs and Azure scanning. Image/PDF interpretation and account persistence are not implemented by this form.

**7 October 2026, onboarding and navigation:** Added distinct recommendation cards, same-specialist scroll preservation, structured architecture validation/CLI assessment, and a limited read-only Azure VMSS/autoscale collector with dashboard setup instructions. Signed-in imports now direct users to sync. Synthetic architecture CLI execution produced three findings; 228 targeted checks and nine disposable-MongoDB integration tests passed. Corrected a POSIX permission assertion incorrectly applied on Windows; this does not validate Windows credential ACLs. Browser checks confirmed distinct tabs, preserved section scroll and invalid subscription handling. Live Azure access, full subscription discovery and production execution remain unverified or out of scope. Changes remain local; no production decisions or cloud resources were changed.

**7 October 2026, specialist tab navigation:** Corrected the shared navigation handler that forced every section click to the page top. Findings, Recommendations, Results and Activity now preserve scroll, including the recorded-results link; main-page navigation retains its reset. TypeScript and 82 dashboard regression tests passed, including explicit scroll-handler coverage. Browser scroll behavior was not rechecked in this step. Changes remain local.

**7 October 2026, specialist clarity:** Implemented AI workload metrics and a per-application token-opportunity chart, per-finding estimated benefits, explicit approval/application/check states and specialist-wide regional filtering. Avoided adding overlapping token estimates or crediting unused output allowance as savings. Updated regression tests and checked the recorded mock dashboard without submitting new decisions. Data remains finding-scoped; the overview map and separate sandbox keep their own scope.

**6 October 2026, presentation packaging:** The user supplied the completed PowerPoint and its SharePoint link. Codex copied it unchanged to `docs/pitch-deck/Greenops.pptx`, verified matching SHA-256 hashes and counted 10 slides, then updated submission links. Codex did not author or revise the supplied slides in this step. Content accuracy, visual layout and judge access were not audited. At the user's request, the demo video entry uses the real shared-folder link until a direct file link is supplied; no video availability was verified.

For subsequent work append: date, requested task, AI output, accepted/modified/rejected disposition, identified error, correction, verification performed and remaining limitation. Link the relevant commit or test evidence when available; do not invent missing evidence.
