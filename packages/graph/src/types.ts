export type GraphNodeType =
  | 'repository'
  | 'file'
  | 'module'
  | 'class'
  | 'function'
  | 'method'
  | 'interface'
  | 'type'
  | 'test'
  | 'dependency';

export type GraphEdgeType =
  | 'contains'
  | 'imports'
  | 'exports'
  | 'calls'
  | 'references'
  | 'extends'
  | 'implements'
  | 'tests'
  | 'depends_on';

export interface GraphNode {
  id: string;
  name: string;
  type: GraphNodeType;
  data?: Record<string, unknown>;
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  type: GraphEdgeType;
  data?: Record<string, unknown>;
}
