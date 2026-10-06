# Contributing

Work locally on a review branch. Confirm the intended remote and base branch before pushing; current work is intended for `develop`, not direct changes to `main`. Existing workflow files still include historical `greenops-init` triggers, so branch policy/CI alignment must be checked separately.

## Workflow

1. Start from the agreed baseline with a clean or understood working tree.
2. Create a `codex/<short-description>` or team-approved feature branch.
3. Implement the scoped change, preserving unrelated work and credentials.
4. Run relevant checks and update the documentation that describes the behavior.
5. Review the diff, stage only intended files, and commit.
6. Push and open a review only when authorized. Do not force-push or rewrite shared history.

Hosting-service branch protections cannot be inferred from workflow files. A maintainer must verify required reviews and checks before promotion.

## Checks

From the root:

```powershell
pnpm.cmd lint
pnpm.cmd build
pnpm.cmd test:all
pnpm.cmd version:check
pnpm.cmd format:check
```

The nested website has separate dependencies and checks: `npm.cmd ci`, `npm.cmd run lint` and `npm.cmd run build` from `apps/CodeVitals-MCP/website`.

Run focused tests while iterating; record exactly what was checked. Do not describe a targeted pass as a full suite or hosted CI pass. Keep security-patch installation scripts enabled.

## Documentation checklist

- Keep the [README](README.md) a short entry point with one runnable no-key demonstration.
- Put setup/errors in [getting started](docs/development/getting-started.md).
- Update [architecture](docs/architecture/overview.md) for changes to agents, execution, storage or trust boundaries.
- Update the [dashboard guide](apps/CodeVitals-MCP/website/README.md) for visible controls.
- Record dated validation and remaining gaps in [submission status](docs/SUBMISSION.md).
- Preserve component attribution and synthetic/estimated/verified distinctions.
- Check relative links. Never commit secrets, private data or generated session evidence.

## Commit messages and versions

Use Conventional Commits, for example:

```text
feat(dashboard): add regional evidence ranking
fix(review): keep the save action beside the form
docs: simplify judge setup and architecture
```

Use `feat` for features, `fix` for corrections, and `docs`, `test`, `refactor`, `build`, `ci` or `chore` where appropriate. Mark breaking changes explicitly with `!` or a `BREAKING CHANGE:` footer.

The root package versions are synchronized through `pnpm.cmd version:check` and the `version:bump` / `version:patch` / `version:minor` / `version:major` scripts. The nested website maintains its own package manifest/lockfile. Do not bump versions as an incidental documentation change.
