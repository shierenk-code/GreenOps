import { SymbolModel } from '@codevitals/symbols';
import { ImportModel, ExportModel, ReferenceModel } from '@codevitals/references';
import { GraphNode, GraphEdge } from '@codevitals/graph';

export interface AnalysisStatistics {
  files: {
    analyzed: number;
    skipped: number;
    failed: number;
  };
  languages: Record<string, number>;
  symbols: {
    functions: number;
    classes: number;
    interfaces: number;
    types: number;
    methods: number;
    enums: number;
    variables: number;
    constants: number;
    constructors: number;
    total: number;
  };
  imports: {
    total: number;
  };
  exports: {
    total: number;
  };
  references: {
    total: number;
  };
  ast: {
    parsed: number;
    failed: number;
    skipped: number;
  };
  graph: {
    nodes: number;
    edges: number;
  };
}

export interface AnalysisResult {
  repository: {
    path: string;
  };
  files: Array<{
    id: string;
    path: string;
    language: string;
    status: 'analyzed' | 'skipped' | 'failed';
    parseErrorCount: number;
  }>;
  symbols: SymbolModel[];
  imports: ImportModel[];
  exports: ExportModel[];
  references: ReferenceModel[];
  graph: {
    nodes: GraphNode[];
    edges: GraphEdge[];
  };
  statistics: AnalysisStatistics;
}
