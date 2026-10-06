export type AnalysisDepth = "shallow" | "medium" | "full";
export type OutputFormat = "summary" | "detailed" | "json" | "github_annotations";

export interface ServerConfig {
  name: string;
  version: string;
  timeoutMs: number;
  maxFileSizeBytes: number;
  maxRecursionDepth: number;
}

export interface CodeVitalsConfig {
  depth: AnalysisDepth;
  excludePatterns: string[];
  rules?: Record<string, { enabled: boolean; severity?: string }>;
  thresholds?: {
    complexity?: number;
    maxLineLength?: number;
    maxFileLines?: number;
    maxFunctionLines?: number;
    duplicationLines?: number;
  };
}

export interface SecureContext {
  allowedPermissions: string[];
  sandboxPath: string;
  maxFileSize: number;
  maxDepth: number;
  timeout: number;
}
