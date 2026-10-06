import { CodeDependenciesOptions } from "../types/mcp-tools.js";
import { handleCodeHealth } from "./code_health.js";

export async function handleCodeDependencies(options: CodeDependenciesOptions = { path: "./" }) {
  const targetPath = options?.path || "./";
  const res = await handleCodeHealth({
    path: targetPath,
    include_dependencies: true,
    include_bugs: false,
    include_security: false,
    include_deprecations: false,
    include_architecture: false,
    include_quality: false,
  });
  return res.report.findings.filter((f) => f.dimension === "dependencies");
}
