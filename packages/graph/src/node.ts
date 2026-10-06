import { GraphNode, GraphNodeType } from './types.js';

export function createGraphNode(params: {
  id: string;
  name: string;
  type: GraphNodeType;
  data?: Record<string, unknown>;
}): GraphNode {
  return {
    id: params.id,
    name: params.name,
    type: params.type,
    data: params.data,
  };
}
