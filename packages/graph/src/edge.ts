import { GraphEdge, GraphEdgeType } from './types.js';

export function createGraphEdge(params: {
  source: string;
  target: string;
  type: GraphEdgeType;
  data?: Record<string, unknown>;
}): GraphEdge {
  return {
    id: `${params.source}->${params.type}->${params.target}`,
    source: params.source,
    target: params.target,
    type: params.type,
    data: params.data,
  };
}
