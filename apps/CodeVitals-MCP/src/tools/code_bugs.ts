import { CodeBugsOptions } from "../types/mcp-tools.js";
import { handleCodeHealth } from "./code_health.js";

export async function handleCodeBugs(options: CodeBugsOptions = { path: "./" }) {
  const targetPath = options?.path || "./";
  const res = await handleCodeHealth({
    path: targetPath,
    include_bugs: true,
    include_security: false,
    include_dependencies: false,
    include_deprecations: false,
    include_architecture: false,
    include_quality: false,
  });
  return res.report.findings.filter((f) => f.dimension === "bugs");
}
