import { GraphNode, GraphEdge, GraphEdgeType } from './types.js';

export class DependencyGraph {
  private nodes: Map<string, GraphNode> = new Map();
  private edges: Map<string, GraphEdge> = new Map();
  private outgoing: Map<string, Set<string>> = new Map();
  private incoming: Map<string, Set<string>> = new Map();
  private nameIndex: Map<string, string[]> = new Map();

  public addNode(node: GraphNode): void {
    this.nodes.set(node.id, node);
    if (!this.outgoing.has(node.id)) this.outgoing.set(node.id, new Set());
    if (!this.incoming.has(node.id)) this.incoming.set(node.id, new Set());

    const names = [node.name];
    if (node.data?.qualifiedName) names.push(String(node.data.qualifiedName));
    for (const name of names) {
      const list = this.nameIndex.get(name) || [];
      if (!list.includes(node.id)) list.push(node.id);
      this.nameIndex.set(name, list);
    }
  }

  public addEdge(edge: GraphEdge): void {
    if (!this.nodes.has(edge.source) || !this.nodes.has(edge.target)) {
      return;
    }
    this.edges.set(edge.id, edge);

    this.outgoing.get(edge.source)?.add(edge.id);
    this.incoming.get(edge.target)?.add(edge.id);
  }

  public getNode(id: string): GraphNode | undefined {
    return this.nodes.get(id);
  }

  public findNodesByName(name: string): GraphNode[] {
    const ids = this.nameIndex.get(name) || [];
    return ids.map((id) => this.nodes.get(id)!).filter(Boolean);
  }

  public getAllNodes(): GraphNode[] {
    return Array.from(this.nodes.values());
  }

  public getAllEdges(): GraphEdge[] {
    return Array.from(this.edges.values());
  }

  public getOutgoingEdges(nodeId: string, edgeType?: GraphEdgeType): GraphEdge[] {
    const edgeIds = this.outgoing.get(nodeId);
    if (!edgeIds) return [];
    const list: GraphEdge[] = [];
    for (const id of edgeIds) {
      const edge = this.edges.get(id);
      if (edge && (!edgeType || edge.type === edgeType)) {
        list.push(edge);
      }
    }
    return list;
  }

  public getIncomingEdges(nodeId: string, edgeType?: GraphEdgeType): GraphEdge[] {
    const edgeIds = this.incoming.get(nodeId);
    if (!edgeIds) return [];
    const list: GraphEdge[] = [];
    for (const id of edgeIds) {
      const edge = this.edges.get(id);
      if (edge && (!edgeType || edge.type === edgeType)) {
        list.push(edge);
      }
    }
    return list;
  }

  public getNodeCount(): number {
    return this.nodes.size;
  }

  public getEdgeCount(): number {
    return this.edges.size;
  }
}
