import { CodeFixPlanOptions } from "../types/mcp-tools.js";
import { handleCodeHealth } from "./code_health.js";

export async function handleCodeFixPlan(options: CodeFixPlanOptions = { path: "./" }) {
  const targetPath = options?.path || "./";
  const res = await handleCodeHealth({
    path: targetPath,
    depth: "medium",
  });
  return res.report.remediationPlan;
}
