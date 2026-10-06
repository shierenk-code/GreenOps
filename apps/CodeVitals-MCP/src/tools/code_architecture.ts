import { CodeArchitectureOptions } from "../types/mcp-tools.js";
import { handleCodeHealth } from "./code_health.js";

export async function handleCodeArchitecture(options: CodeArchitectureOptions = { path: "./" }) {
  const targetPath = options?.path || "./";
  const res = await handleCodeHealth({
    path: targetPath,
    include_architecture: true,
    include_bugs: false,
    include_security: false,
    include_dependencies: false,
    include_deprecations: false,
    include_quality: false,
  });
  return res.report.findings.filter((f) => f.dimension === "architecture");
}
