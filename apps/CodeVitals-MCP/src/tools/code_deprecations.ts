import { CodeDeprecationsOptions } from "../types/mcp-tools.js";
import { handleCodeHealth } from "./code_health.js";

export async function handleCodeDeprecations(options: CodeDeprecationsOptions = { path: "./" }) {
  const targetPath = options?.path || "./";
  const res = await handleCodeHealth({
    path: targetPath,
    include_deprecations: true,
    include_bugs: false,
    include_security: false,
    include_dependencies: false,
    include_architecture: false,
    include_quality: false,
  });
  return res.report.findings.filter((f) => f.dimension === "deprecations");
}
