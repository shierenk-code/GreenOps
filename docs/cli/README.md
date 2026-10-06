# GreenOps CLI reference

Run from the repository root after `pnpm install --frozen-lockfile` and `pnpm build`. On Windows PowerShell use `pnpm.cmd`. Every command supports `--help`.

```powershell
pnpm greenops <command> [options]
```

**Model provider:** the committed root `.env` selects Gemini. Commands that use a model (`review`, `run`, and the GitHub listener) call Gemini unless you pass `--provider offline` to `run` or set `GREENOPS_LLM_PROVIDER=offline` in the shell. `carbon` and `waste` never call a model.

## Sustainability workflow

| Command                                                                   | Purpose                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `review [path]`                                                           | Report Sustainability Bugs without changing files. `--diff` limits to locally changed files; `--format text\|json\|markdown`; `--verbose` shows full findings; `--ledger <path>` (default `./greenops-ledger.json`) records the review; `--fix` runs the approval-gated workflow. No `--provider` flag; uses the environment.                                                                                                                                   |
| `run [path]`                                                              | Detect → Investigate → Compare → Simulate → Approve → Improve → Verify, written to `--ledger` (default `./greenops-ledger.json`). `--fleet` runs the six specialist agents over fixtures (`--mock-dir`, default `[path]`); `--approve` prompts for human approval of supported sandbox fixes; `--auto` applies only trivial reversible fixes and only when repository policy allows it; `--provider gemini\|openai\|ollama\|offline` overrides the environment. |
| `carbon demo\|forecast\|plan\|execute\|status\|evidence-template\|verify` | Carbon-aware batch scheduling. `demo --simulate` never touches a cluster. `execute` requires interactive approval. Default ledgers are under `./.tmp/` (`carbon-ledger.json`, demo `carbon-demo-ledger.json`).                                                                                                                                                                                                                                                  |
| `waste demo\|discover\|plan\|review\|simulate`                            | Digital Waste inventory and right-sizing plans. Read-only; there is no live apply command. Default ledgers are under `./.tmp/` (`waste-ledger.json`, demo `waste-demo-ledger.json`).                                                                                                                                                                                                                                                                            |

## Repository intelligence

| Command                                                                            | Purpose                                                                                                                                                                                 |
| ---------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `scan [path]`                                                                      | File, language and repository summary (`--format text\|json`, `--verbose`, `--quiet`).                                                                                                  |
| `analyze [path]`                                                                   | AST, symbols, imports/exports, references and dependency graph statistics (`--format text\|json`).                                                                                      |
| `code-review [path]`                                                               | Semantic diff, blast radius and risk score (`--diff <spec>` default `HEAD~1`, `--base`, `--head` default `HEAD`, `--format text\|json`).                                                |
| `git status [path]` / `git diff [path]`                                            | Parsed working-tree status and unified diff (`git diff` accepts `--base` default `HEAD~1`, `--head` default `HEAD`, `--format text\|json`).                                             |
| `graph [path]` / `graph callers <symbol> [path]` / `graph callees <symbol> [path]` | Graph overview (`--format text\|json`) and dependency-graph queries.                                                                                                                    |
| `serve`                                                                            | GitHub App webhook listener (`--port`, default `3000`; use another port such as `3002` alongside the dashboard; `--secret`, `--token`; see [GitHub App setup](../github-app-setup.md)). |

## Legacy `codevitals` entry point

`pnpm codevitals ...` remains for compatibility. It exposes the same repository-intelligence commands (with `review` instead of `code-review`) and nests the sustainability commands under `codevitals greenops ...`. It is not the MCP server; that binary is `codevitals-mcp`.
