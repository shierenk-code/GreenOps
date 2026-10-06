export const CODE_HEALTH_TOOL_DEF = {
  name: "code_health",
  description: "Comprehensive code health analysis across 9 dimensions (bugs, security, dependencies, etc.)",
  inputSchema: {
    type: "object" as const,
    properties: {
      path: { type: "string", description: "Root directory to analyze" },
      depth: { type: "string", enum: ["shallow", "medium", "full"], description: "Analysis depth" },
      include_bugs: { type: "boolean", default: true },
      include_dependencies: { type: "boolean", default: true },
      include_security: { type: "boolean", default: true },
      include_deprecations: { type: "boolean", default: true },
      include_versions: { type: "boolean", default: true },
      include_architecture: { type: "boolean", default: false },
      include_quality: { type: "boolean", default: false },
      include_tests: { type: "boolean", default: false },
      include_performance: { type: "boolean", default: false },
      exclude_patterns: { type: "array", items: { type: "string" } },
      output_format: { type: "string", enum: ["summary", "detailed", "json", "github_annotations"], default: "summary" },
    },
    required: ["path"],
  },
};

export const CODE_HEALTH_DIFF_TOOL_DEF = {
  name: "code_health_diff",
  description: "Analyze code health of only the changes in current Git diff",
  inputSchema: {
    type: "object" as const,
    properties: {
      path: { type: "string", default: "./" },
      against: { type: "string", default: "HEAD" },
      include_all_engines: { type: "boolean", default: true },
    },
    required: ["path"],
  },
};

export const CODE_SECURITY_TOOL_DEF = {
  name: "code_security",
  description: "Security-focused analysis: secrets, injection, insecure APIs",
  inputSchema: {
    type: "object" as const,
    properties: {
      path: { type: "string" },
      include_secrets: { type: "boolean", default: true },
      include_injection: { type: "boolean", default: true },
      include_insecure_api: { type: "boolean", default: true },
      include_crypto: { type: "boolean", default: true },
      include_dependencies: { type: "boolean", default: true },
    },
    required: ["path"],
  },
};

export const CODE_DEPENDENCIES_TOOL_DEF = {
  name: "code_dependencies",
  description: "Dependency health: outdated, vulnerable, abandoned packages",
  inputSchema: {
    type: "object" as const,
    properties: {
      path: { type: "string" },
      include_outdated: { type: "boolean", default: true },
      include_vulnerable: { type: "boolean", default: true },
      include_abandoned: { type: "boolean", default: true },
      depth: { type: "string", enum: ["direct", "transitive", "all"], default: "all" },
    },
    required: ["path"],
  },
};

export const CODE_DEPRECATIONS_TOOL_DEF = {
  name: "code_deprecations",
  description: "Detect deprecated APIs, methods, and framework features",
  inputSchema: {
    type: "object" as const,
    properties: {
      path: { type: "string" },
      include_api_deprecations: { type: "boolean", default: true },
      include_method_deprecations: { type: "boolean", default: true },
      include_library_deprecations: { type: "boolean", default: true },
    },
    required: ["path"],
  },
};

export const CODE_BUGS_TOOL_DEF = {
  name: "code_bugs",
  description: "Detect logic bugs, null/undefined risks, race conditions",
  inputSchema: {
    type: "object" as const,
    properties: {
      path: { type: "string" },
      include_null_risks: { type: "boolean", default: true },
      include_logic_errors: { type: "boolean", default: true },
      include_race_conditions: { type: "boolean", default: true },
      include_error_handling: { type: "boolean", default: true },
    },
    required: ["path"],
  },
};

export const CODE_ARCHITECTURE_TOOL_DEF = {
  name: "code_architecture",
  description: "Analyze circular dependencies, coupling, layering issues",
  inputSchema: {
    type: "object" as const,
    properties: {
      path: { type: "string" },
      include_circular_deps: { type: "boolean", default: true },
      include_coupling: { type: "boolean", default: true },
      include_layering: { type: "boolean", default: true },
      module_size_threshold: { type: "number", default: 1000 },
    },
    required: ["path"],
  },
};

export const CODE_FIX_PLAN_TOOL_DEF = {
  name: "code_fix_plan",
  description: "Generate prioritized remediation plan for all findings",
  inputSchema: {
    type: "object" as const,
    properties: {
      path: { type: "string" },
      group_by: { type: "string", enum: ["severity", "category", "file", "root_cause"], default: "root_cause" },
      focus_area: { type: "string", enum: ["security", "performance", "maintainability", "stability", "all"], default: "all" },
      max_steps: { type: "number", default: 10 },
    },
    required: ["path"],
  },
};

export const ALL_TOOLS_DEFS = [
  CODE_HEALTH_TOOL_DEF,
  CODE_HEALTH_DIFF_TOOL_DEF,
  CODE_SECURITY_TOOL_DEF,
  CODE_DEPENDENCIES_TOOL_DEF,
  CODE_DEPRECATIONS_TOOL_DEF,
  CODE_BUGS_TOOL_DEF,
  CODE_ARCHITECTURE_TOOL_DEF,
  CODE_FIX_PLAN_TOOL_DEF,
];
