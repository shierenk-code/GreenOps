import { handleCodeHealth } from "../src/tools/code_health.js";
import { handleCodeHealthDiff } from "../src/tools/code_health_diff.js";
import { OutputFormat, AnalysisDepth } from "../src/types/config.js";

export async function runCLI(args: string[]) {
  let targetPath = "./";
  let depth: AnalysisDepth = "medium";
  let outputFormat: OutputFormat = "summary";
  let diffRef: string | undefined;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--depth" && args[i + 1]) {
      depth = args[++i] as AnalysisDepth;
    } else if (arg === "--output" && args[i + 1]) {
      outputFormat = args[++i] as OutputFormat;
    } else if (arg === "--diff") {
      diffRef = args[i + 1] && !args[i + 1].startsWith("-") ? args[++i] : "HEAD";
    } else if (!arg.startsWith("-")) {
      targetPath = arg;
    }
  }

  if (diffRef) {
    const diffReport = await handleCodeHealthDiff({
      path: targetPath,
      against: diffRef,
    });
    console.log(JSON.stringify(diffReport, null, 2));
  } else {
    const { formattedOutput, report } = await handleCodeHealth({
      path: targetPath,
      depth,
      output_format: outputFormat,
    });
    console.log(formattedOutput);

    if (report.summary.criticalCount > 0) {
      process.exitCode = 1;
    }
  }
}
