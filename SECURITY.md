# GreenOps Security Policy

## Support status

GreenOps is an actively developed local prototype. No long-term-supported release series, security certification, or response-time guarantee is established. Reports should identify the affected branch/commit and, where possible, reproduce against the current reviewed code.

## Report privately

Do not include credentials, personal data, customer code, or exploitable details in a public issue or pull request.

Use the repository's private vulnerability reporting option if the maintainers have enabled it. Otherwise contact a repository maintainer through your existing private team channel and ask for a secure reporting route before sharing details. This repository does not currently publish a dedicated security mailbox or guaranteed response timeline.

Include:

- Affected commit and component.
- Minimal reproduction using synthetic data.
- Expected and actual behavior, impact and prerequisites.
- Sanitized logs; never include keys, cookies, tokens or confidential ledgers.

If a credential has been exposed, revoke/rotate it through the relevant provider and notify the responsible owner privately. Removing it from a file alone does not invalidate it.

## Prototype trust boundaries

- The dashboard and isolated AI demo are intended for loopback-only local use. Do not publish them through a tunnel or shared network binding without authentication, authorization, protected durable storage and rate controls.
- Human Approvals records browser-local plan reviews. Reviewer names are self-declared; records are not authenticated, shared or tamper-proof and do not authorize cloud execution.
- Model credentials remain server-side in environment files (see the temporary root `.env` exception below). Do not use browser-exposed environment variables for secrets.
- Imported ledgers and model output are untrusted input. Preserve validation, file-size limits, safe rendering and evidence allowlists.
- The isolated cache demo uses built-in synthetic prompts and version-bound actions. Fixture mode requires no paid inference; live mode is an explicit opt-in.
- The GitHub webhook service is a separate network service, not the dashboard. Configure a webhook secret and appropriately scoped credentials before connecting it. Requests are rejected when the secret is missing or the signature is invalid; still do not expose the listener without scoped credentials and network restrictions.
- Do not run untrusted repositories or PR content in a privileged environment with production credentials. Sandbox fixes and tests are not an enterprise isolation boundary.

## Dependency audit status — 5 October 2026

The root workspace uses `pnpm-lock.yaml`; the nested dashboard uses `apps/CodeVitals-MCP/website/package-lock.json`. Audit both, because the dashboard is not part of the root workspace install.

- Updated Vitest and its mocker dependency from 3.2.6 to 4.1.11 for [GHSA-82fw-gwwq-j7x9](https://github.com/advisories/GHSA-82fw-gwwq-j7x9).
- Aligned the dashboard installation with its pinned Next.js 16.3.6 and React/React DOM 19.2.8. The Next lint configuration is also 16.3.6; ESLint 9.39.5 satisfies the plugins' peer ranges (ESLint 10 does not). ESLint 9 is deprecated upstream and needs a follow-up upgrade when the plugins support the next major.
- `pnpm audit --prod` and dashboard `npm audit --omit=dev` each reported **zero known vulnerabilities**. This is a dependency audit result, not a security certification.
- **Locally mitigated; upstream advisory remains open:** [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) affects `braces` 3.0.3, reached through Jest in the workspace and Next's ESLint/fast-glob/micromatch chain in the dashboard. The registry still has no published 3.0.4. GreenOps now applies a bounded-recursion patch to parsing (both braces and parentheses), compilation, expansion and stringification. Excessive nesting throws a controlled `SyntaxError` before stack exhaustion. Callers must still handle invalid-input errors; this does not make untrusted glob expansion safe against every resource-exhaustion pattern.

The workspace installs `patches/braces@3.0.3.patch` through pnpm's `patchedDependencies`. The shared `scripts/patch-braces.cjs` script applies nesting guards to installed copies, including the dashboard, during postinstall. The equivalent npm patch is retained as a regression reference. If installation scripts are disabled, explicitly run `npm run postinstall` in the dashboard before using development tools, then run `tests/braces-security.test.ts` to verify the guards.

`tests/braces-security.test.ts` exercises the actual Jest and Next ESLint dependency chains: malicious nested brace/parenthesis patterns, caller-supplied deep ASTs, normal glob behavior, and identical npm/pnpm patch contents. CI installs the nested dashboard and runs these checks explicitly. Keep the two patch formats synchronized and remove them only after validating an upstream fixed release.

Version-based scanners still flag the unchanged upstream version: the full workspace audit reports one high finding; the dashboard reports seven affected packages for the same advisory (including the patch tool's dependency path). No advisory is ignored or dismissed. This local mitigation does **not** mean a clean full dependency audit or an upstream-supported fix.

Do not expose development/test servers or accept untrusted glob patterns in developer tooling. Run untrusted PR checks without production credentials and in an isolated environment. Install only production dependencies in runtime deployments.

Recheck the advisory and both lockfiles when a fix is released. Do not use `npm audit fix --force` to downgrade Next's lint stack to an incompatible major. GitHub alerts on the default branch will not be cleared merely by changing a local checkout or another branch.

Validation after the recursion mitigation (5 October 2026): **954 root tests**, **31 MCP tests**, and the Next.js 16.3.6 production build passed. An isolated clean dashboard `npm ci` applied the patch and passed a deep-pattern regression check; a subsequent production-only install succeeded without `braces` or patch tooling and reported zero advisories. Both workspace/dashboard production audits reported zero known vulnerabilities. The first concurrent full-suite run hit three integration-test timeouts; the full rerun with two workers and unchanged timeouts passed. The dashboard was restarted on loopback port 3003 and returned HTTP 200. A clean full-workspace installation on another machine, hosted CI run and whole-application penetration test were not performed.

## Data and disclosure

Use public, open or synthetic demonstration data. Keep .env files, local result ledgers, session records and exported evidence out of commits. Review staged files before pushing.

**Temporary exception:** the root `.env` (Gemini settings) is currently committed to this private repository during development. Treat its key as exposed to everyone with repository access. Before sharing access more widely or making the repository public, rotate the key, then remove the file with `git rm --cached .env` (it stays ignored by `.gitignore`). Removing it does not erase it from Git history; rotation is the only real fix.

See [architecture](docs/architecture/overview.md) and [submission status](docs/SUBMISSION.md) for current limits. Security reports and remediation changes should be reviewed before merging into greenops-init.
