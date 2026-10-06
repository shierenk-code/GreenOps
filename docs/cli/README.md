# CLI reference

Run commands from the repository root after installing dependencies and building. Use `pnpm.cmd` on Windows; each command supports `--help`.

```powershell
pnpm.cmd greenops <command> --help
```

## Common commands

Read-only entry points: `architecture assess <file> --ledger <file>` and `azure scan --subscription <UUID> --ledger <file>`. See [inputs, permissions and dashboard sync](../development/bring-your-own-data.md). Both withhold execution and use deterministic reasoning.

| Command                                                 | Purpose                                                                              |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `run <path> --fleet --provider offline --ledger <file>` | Seven-specialist assessment of supplied records without model calls                  |
| `run <path> --fleet --provider gemini --ledger <file>`  | Same assessment with configured Gemini investigation; fallback is disclosed          |
| `review <path>`                                         | Read-only sustainability review; supports diff/output options and provider selection |
| `review <path> --fix`                                   | Requests the approval-gated supported sandbox workflow                               |
| `run <path> --approve`                                  | Interactive human approval for supported sandbox fixes                               |
| `scan <path>` / `analyze <path>`                        | Repository summary / AST, symbols and dependency analysis                            |
| `code-review <path>`                                    | Semantic diff and change impact                                                      |
| `graph <path>`                                          | Repository graph; see help for callers/callees                                       |
| `serve`                                                 | Separate GitHub webhook listener; [setup](../github-app-setup.md)                    |
| `connect '<dashboard URL>'`                             | Link this terminal to a signed-in account                                            |
| `sync --ledger <file> --project <name>`                 | Upload existing evidence to that account; optional `--watch`                         |
| `monitor`                                               | Stream machine utilization counters while the command runs; not power measurements   |
| `disconnect`                                            | Remove the local account connection                                                  |

Use `--provider offline` for no-key rehearsals. Google Gemini is the recommended live provider; private environment configuration supplies its API key/model. Legacy provider adapters remain for compatibility.

## Operational commands

- `carbon demo|forecast|plan|execute|status|evidence-template|verify`: constrained batch scheduling. Simulation does not touch a cluster; real dispatch requires separate explicit approval.
- `waste demo|discover|plan|review|simulate`: read-only discovery and synthetic remediation. There is no live cleanup/resize command.

Read the [operational safeguards and examples](../operational-workflows.md) before using either path.

## Safety and compatibility

`--auto` does not override repository approval policy or make unsupported operations executable. Normal fleet runs and dashboard plan approvals do not deploy infrastructure.

The primary entry point is `pnpm.cmd greenops`. Legacy `codevitals` commands and internal package names remain compatible. The MCP server is separate: its binary is `codevitals-mcp`.

For installation, provider setup and errors, use the [setup guide](../development/getting-started.md).
