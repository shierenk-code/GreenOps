import { CodeSecurityOptions } from "../types/mcp-tools.js";
import { handleCodeHealth } from "./code_health.js";

export async function handleCodeSecurity(options: CodeSecurityOptions = { path: "./" }) {
  const targetPath = options?.path || "./";
  const res = await handleCodeHealth({
    path: targetPath,
    include_security: true,
    include_dependencies: options?.include_dependencies ?? true,
    include_bugs: false,
    include_deprecations: false,
    include_architecture: false,
    include_quality: false,
  });
  return res.report.findings.filter((f) => f.dimension === "security" || f.dimension === "dependencies");
}
