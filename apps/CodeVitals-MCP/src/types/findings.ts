export type Severity = 'critical' | 'high' | 'medium' | 'low';

export type FindingCategory =
  | 'null_risk'
  | 'unhandled_promise'
  | 'error_handling'
  | 'race_condition'
  | 'logic_error'
  | 'type_mismatch'
  | 'outdated_dependency'
  | 'vulnerable_dependency'
  | 'abandoned_dependency'
  | 'transitive_vulnerability'
  | 'license_issue'
  | 'duplicate_dependency'
  | 'secret_leak'
  | 'sql_injection'
  | 'xss_injection'
  | 'command_injection'
  | 'insecure_crypto'
  | 'unsafe_deserialization'
  | 'cors_security'
  | 'path_traversal'
  | 'api_deprecation'
  | 'framework_deprecation'
  | 'library_deprecation'
  | 'circular_dependency'
  | 'excessive_coupling'
  | 'bad_layering'
  | 'module_size'
  | 'deep_import'
  | 'dead_module'
  | 'code_duplication'
  | 'dead_code'
  | 'cyclomatic_complexity'
  | 'cognitive_complexity'
  | 'naming_issue'
  | 'oversized_function'
  | 'oversized_file'
  | 'uncovered_path'
  | 'performance_antipattern';

export interface Finding {
  id: string;
  severity: Severity;
  category: FindingCategory;
  dimension:
    | 'bugs'
    | 'dependencies'
    | 'security'
    | 'deprecations'
    | 'versions'
    | 'architecture'
    | 'quality'
    | 'tests'
    | 'performance';
  file: string;
  line: number;
  column: number;
  message: string;
  codeSnippet?: string;
  symbol?: string;
  replacement?: string;
  suggestion?: string;
  autofixAvailable: boolean;
  confidence: number; // 0-1
}

export interface DimensionScores {
  bugs: number;
  dependencies: number;
  security: number;
  deprecations: number;
  versions: number;
  architecture: number;
  quality: number;
  tests: number;
  performance: number;
}

export interface RemediationStep {
  priority: number;
  description: string;
  category: FindingCategory;
  affectedFiles: string[];
  autofixCount: number;
  manualCount: number;
  estimatedEffort: 'quick' | 'medium' | 'complex';
}

export interface CodeHealthReport {
  healthScore: number; // 0-100
  scoresByDimension: DimensionScores;
  summary: {
    criticalCount: number;
    highCount: number;
    mediumCount: number;
    lowCount: number;
    totalFindings: number;
  };
  findings: Finding[];
  remediationPlan: RemediationStep[];
  metadata: {
    analyzedFiles: number;
    totalLoc: number;
    analysisTimeMs: number;
    timestamp: string;
    warnings: string[];
  };
}

export interface CodeHealthDiffReport {
  prHealthScore: number; // -100 to +100
  newIssues: Record<Severity, number>;
  fixedIssues: Record<Severity, number>;
  unchangedIssues: Record<Severity, number>;
  changedFiles: Array<{
    file: string;
    newFindings: Finding[];
    fixedFindings: Finding[];
  }>;
  recommendation: string;
}
