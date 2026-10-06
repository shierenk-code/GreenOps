import { DependencyGraph } from './graph.js';
import { GraphNode } from './types.js';

export class GraphTraversal {
  constructor(private graph: DependencyGraph) {}

  public findCallers(symbolNameOrId: string): GraphNode[] {
    const targetNodes = this.resolveSymbolNodes(symbolNameOrId);
    const callers: Map<string, GraphNode> = new Map();

    for (const node of targetNodes) {
      const incoming = this.graph.getIncomingEdges(node.id, 'calls');
      for (const edge of incoming) {
        const callerNode = this.graph.getNode(edge.source);
        if (callerNode) callers.set(callerNode.id, callerNode);
      }
    }

    return Array.from(callers.values());
  }

  public findTransitiveCallers(symbolNameOrId: string, maxDepth = 5): GraphNode[] {
    const targetNodes = this.resolveSymbolNodes(symbolNameOrId);
    const visited: Set<string> = new Set(targetNodes.map((n) => n.id));
    const callersMap: Map<string, GraphNode> = new Map();

    let currentLevel = targetNodes.map((n) => n.id);
    let depth = 0;

    while (currentLevel.length > 0 && depth < maxDepth) {
      const nextLevel: string[] = [];
      for (const id of currentLevel) {
        const incoming = this.graph.getIncomingEdges(id, 'calls');
        for (const edge of incoming) {
          if (!visited.has(edge.source)) {
            visited.add(edge.source);
            nextLevel.push(edge.source);
            const node = this.graph.getNode(edge.source);
            if (node) callersMap.set(node.id, node);
          }
        }
      }
      currentLevel = nextLevel;
      depth++;
    }

    return Array.from(callersMap.values());
  }

  public findCallees(symbolNameOrId: string): GraphNode[] {
    const sourceNodes = this.resolveSymbolNodes(symbolNameOrId);
    const callees: Map<string, GraphNode> = new Map();

    for (const node of sourceNodes) {
      const outgoing = this.graph.getOutgoingEdges(node.id, 'calls');
      for (const edge of outgoing) {
        const calleeNode = this.graph.getNode(edge.target);
        if (calleeNode) callees.set(calleeNode.id, calleeNode);
      }
    }

    return Array.from(callees.values());
  }

  public findReferences(symbolNameOrId: string): GraphNode[] {
    const targetNodes = this.resolveSymbolNodes(symbolNameOrId);
    const refs: Map<string, GraphNode> = new Map();

    for (const node of targetNodes) {
      const incoming = this.graph.getIncomingEdges(node.id);
      for (const edge of incoming) {
        if (edge.type === 'references' || edge.type === 'calls' || edge.type === 'imports') {
          const refNode = this.graph.getNode(edge.source);
          if (refNode) refs.set(refNode.id, refNode);
        }
      }
    }

    return Array.from(refs.values());
  }

  public findAffectedTests(symbolNameOrId: string): GraphNode[] {
    const callers = this.findTransitiveCallers(symbolNameOrId);
    const targetNodes = this.resolveSymbolNodes(symbolNameOrId);
    const allRelevantNodes = [...targetNodes, ...callers];

    const testNodes: Map<string, GraphNode> = new Map();

    for (const node of allRelevantNodes) {
      const incoming = this.graph.getIncomingEdges(node.id);
      for (const edge of incoming) {
        const src = this.graph.getNode(edge.source);
        if (src && (src.type === 'test' || src.name.includes('.test.') || src.name.includes('.spec.') || src.name.includes('_test.'))) {
          testNodes.set(src.id, src);
        }
      }

      if (node.type === 'test' || node.name.includes('.test.') || node.name.includes('.spec.') || node.name.includes('_test.')) {
        testNodes.set(node.id, node);
      }
    }

    return Array.from(testNodes.values());
  }

  public findDependents(filePathOrId: string): GraphNode[] {
    const targetNode = this.graph.getNode(filePathOrId) || this.graph.findNodesByName(filePathOrId)[0];
    if (!targetNode) return [];

    const incoming = this.graph.getIncomingEdges(targetNode.id, 'imports');
    return incoming
      .map((edge) => this.graph.getNode(edge.source)!)
      .filter(Boolean);
  }

  public findDependencies(filePathOrId: string): GraphNode[] {
    const targetNode = this.graph.getNode(filePathOrId) || this.graph.findNodesByName(filePathOrId)[0];
    if (!targetNode) return [];

    const outgoing = this.graph.getOutgoingEdges(targetNode.id, 'imports');
    return outgoing
      .map((edge) => this.graph.getNode(edge.target)!)
      .filter(Boolean);
  }

  private resolveSymbolNodes(symbolNameOrId: string): GraphNode[] {
    const directNode = this.graph.getNode(symbolNameOrId);
    if (directNode) return [directNode];

    let nodes = this.graph.findNodesByName(symbolNameOrId);
    if (nodes.length === 0) {
      const queryLower = symbolNameOrId.toLowerCase();
      const simpleNameLower = queryLower.includes('.') ? queryLower.split('.').pop()! : queryLower;

      nodes = this.graph.getAllNodes().filter((n) => {
        const nameLower = n.name.toLowerCase();
        const qNameLower = String(n.data?.qualifiedName || '').toLowerCase();
        return (
          nameLower === queryLower ||
          qNameLower === queryLower ||
          qNameLower.endsWith(`.${queryLower}`) ||
          nameLower === simpleNameLower ||
          qNameLower.endsWith(`.${simpleNameLower}`)
        );
      });
    }

    return nodes;
  }
}
