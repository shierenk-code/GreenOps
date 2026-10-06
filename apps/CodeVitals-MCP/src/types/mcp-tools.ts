import { AnalysisDepth, OutputFormat } from "./config.js";

export interface CodeHealthOptions {
  path: string;
  depth?: AnalysisDepth;
  include_bugs?: boolean;
  include_dependencies?: boolean;
  include_security?: boolean;
  include_deprecations?: boolean;
  include_versions?: boolean;
  include_architecture?: boolean;
  include_quality?: boolean;
  include_tests?: boolean;
  include_performance?: boolean;
  exclude_patterns?: string[];
  output_format?: OutputFormat;
}

export interface CodeHealthDiffOptions {
  path?: string;
  against?: string;
  include_all_engines?: boolean;
  exclude_patterns?: string[];
}

export interface CodeSecurityOptions {
  path: string;
  include_secrets?: boolean;
  include_injection?: boolean;
  include_insecure_api?: boolean;
  include_crypto?: boolean;
  include_dependencies?: boolean;
}

export interface CodeDependenciesOptions {
  path: string;
  include_outdated?: boolean;
  include_vulnerable?: boolean;
  include_abandoned?: boolean;
  depth?: "direct" | "transitive" | "all";
}

export interface CodeDeprecationsOptions {
  path: string;
  include_api_deprecations?: boolean;
  include_method_deprecations?: boolean;
  include_library_deprecations?: boolean;
}

export interface CodeBugsOptions {
  path: string;
  include_null_risks?: boolean;
  include_logic_errors?: boolean;
  include_race_conditions?: boolean;
  include_error_handling?: boolean;
}

export interface CodeArchitectureOptions {
  path: string;
  include_circular_deps?: boolean;
  include_coupling?: boolean;
  include_layering?: boolean;
  module_size_threshold?: number;
}

export interface CodeFixPlanOptions {
  path: string;
  group_by?: "severity" | "category" | "file" | "root_cause";
  focus_area?: "security" | "performance" | "maintainability" | "stability" | "all";
  max_steps?: number;
}
