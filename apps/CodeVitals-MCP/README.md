# GreenOps MCP — Repository Analysis

The GreenOps MCP server provides the project's bundled repository-health tools. It is part of the same GreenOps repository, not a separate product or remotely hosted CodeVitals dependency. Code-health tools complement the sustainability engine; they do not execute dashboard approvals.

The `codevitals-mcp` workspace identifier and `apps/CodeVitals-MCP` directory remain compatibility names. Component origin is disclosed in the [root README](../../README.md#component-origin-and-compatibility).

## Current implementation

The local stdio server exposes eight tools: code_health, code_health_diff, code_security, code_dependencies, code_deprecations, code_bugs, code_architecture and code_fix_plan.

Six active analysis engines cover bugs, dependencies, security, deprecations, architecture and quality. Test-health, performance and version flags remain schema placeholders rather than implemented engines. One pass is bounded to 500 files and 250 returned findings; partial failures are reported through metadata warnings.

From the repository root:

```powershell
pnpm.cmd install
pnpm.cmd --filter codevitals-mcp build
pnpm.cmd --filter codevitals-mcp test
pnpm.cmd --filter codevitals-mcp start
```

The optional standalone CLI is exposed as the `codevitals-mcp` binary (`dist/bin/codevitals.js`); the primary project CLI is `greenops`.

Configure your MCP client to launch the built entry point (`dist/src/index.js`) for **your checkout**. Do not copy another developer's absolute filesystem path. The stdio server is not an HTTP endpoint.

## GreenOps entry points

- [Project overview](../../README.md)
- [Development setup](../../docs/development/getting-started.md)
- [Website and dashboard](website/README.md)
- [Current architecture](../../docs/architecture/overview.md)

Earlier planning and prompt documents were removed; they remain available in Git history before this cleanup.
