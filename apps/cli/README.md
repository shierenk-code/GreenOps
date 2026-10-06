# GreenOps CLI

The GreenOps CLI combines sustainability workflows and integrated repository analysis. Run `pnpm.cmd greenops` from the **repository root** after installation/build; no global CLI installation is required. The old `codevitals` entry point remains a compatibility alias with its original command structure.

## Sustainability workflows

```powershell
# Deterministic six-agent assessment using synthetic operational fixtures
pnpm.cmd greenops run .\fixtures\greenops-mock --fleet --provider offline --ledger .\greenops-fleet-ledger.json

# Static-code workflow with supported sandbox remediation and verification
pnpm.cmd greenops run .\fixtures\greenops-sample --provider offline --ledger .\greenops-ledger.json

# Read-only source review; no model API requests
$env:GREENOPS_LLM_PROVIDER = "offline"
pnpm.cmd greenops review .\fixtures\greenops-sample --format json
```

- `greenops review [path]`: shared sustainability review; `--diff` restricts to locally changed files; `--format text|json|markdown` selects output; `--verbose` shows full findings; `--ledger <path>` records evidence.
- `greenops review [path] --fix`: invokes the existing approval-gated workflow. Supported changes happen in a retained sandbox, not the target working tree.
- `greenops run [path]`: the staged detect/investigate/compare/simulate/approve/improve/verify workflow.
- `--fleet` selects the synthetic six-agent fixture contracts; it is not live cloud discovery.
- `--provider offline|gemini|openai|ollama` is a **run** option; review uses the provider environment configuration.
- `--auto` allows trivial reversible sandbox fixes only when repository policy permits automatic application; it cannot bypass `requireApproval: true` and does not implement unsupported fixes.
- `greenops carbon …` and `greenops waste …` provide carbon-aware scheduling and Digital Waste planning; see the [CLI reference](../../docs/cli/README.md).

The committed root `.env` selects Gemini, so `review` (which has no `--provider` flag) calls Gemini unless `GREENOPS_LLM_PROVIDER=offline` is set in the shell.

Online providers require server-side configuration and may incur cost. Explicit provider selection and ledger provenance distinguish model output from offline fallback. Dashboard refresh does not rerun a failed model request.

## Integrated repository-analysis commands

```powershell
pnpm.cmd greenops scan . --format json
pnpm.cmd greenops analyze . --format json
pnpm.cmd greenops code-review . --diff HEAD~1
pnpm.cmd greenops graph callers UserService.getUser
pnpm.cmd greenops graph callees UserService.getUser
pnpm.cmd greenops --help
pnpm.cmd greenops run --help
```

`greenops code-review` is semantic-risk review; `greenops review` is sustainability review. The old `codevitals review` and `codevitals greenops review` commands retain those respective meanings.

The `serve` command starts the separate GitHub webhook service, not the dashboard. See [GitHub integration](../../docs/github-app-setup.md). Start the dashboard with the nested website's npm script as described in [development setup](../../docs/development/getting-started.md).
