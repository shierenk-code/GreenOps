import { GraphNode } from '@codevitals/graph';

export type ChangeType = 'added' | 'removed' | 'modified' | 'renamed';

export interface ChangedSymbol {
  symbolId?: string;
  name: string;
  qualifiedName: string;
  kind: string;
  filePath: string;
  changeType: ChangeType;
  startLine: number;
  endLine: number;
  exported: boolean;
}

export interface SemanticDiffResult {
  changedFiles: Array<{
    path: string;
    oldPath?: string;
    status: ChangeType;
    additions: number;
    deletions: number;
  }>;
  changedSymbols: ChangedSymbol[];
  addedSymbolsCount: number;
  removedSymbolsCount: number;
  modifiedSymbolsCount: number;
}

export interface BlastRadiusResult {
  affectedCallers: GraphNode[];
  affectedCallees: GraphNode[];
  affectedTests: GraphNode[];
  affectedModules: string[];
  dependencyImpact: string[];
  totalImpactedNodesCount: number;
}

export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';

export interface RiskAnalysisResult {
  score: number;
  level: RiskLevel;
  factors: string[];
  recommendations: string[];
}

export interface PRReviewResult {
  repositoryPath: string;
  diffSpec: string;
  semanticDiff: SemanticDiffResult;
  blastRadius: BlastRadiusResult;
  riskAnalysis: RiskAnalysisResult;
  status: string;
}
