export interface Cycle {
  path: string[];
}

export interface ModuleMetrics {
  file: string;
  fanIn: number;
  fanOut: number;
  instability: number; // fanOut / (fanOut + fanIn)
}

export class DependencyGraph {
  private adj = new Map<string, Set<string>>();
  private inEdges = new Map<string, Set<string>>();

  addNode(node: string): void {
    if (!this.adj.has(node)) {
      this.adj.set(node, new Set());
    }
    if (!this.inEdges.has(node)) {
      this.inEdges.set(node, new Set());
    }
  }

  addEdge(from: string, to: string): void {
    this.addNode(from);
    this.addNode(to);
    this.adj.get(from)!.add(to);
    this.inEdges.get(to)!.add(from);
  }

  findCycles(): Cycle[] {
    const cycles: Cycle[] = [];
    const visited = new Set<string>();
    const recStack = new Set<string>();

    const dfs = (node: string, currentPath: string[]) => {
      visited.add(node);
      recStack.add(node);
      currentPath.push(node);

      const neighbors = this.adj.get(node) || new Set();
      for (const neighbor of neighbors) {
        if (!visited.has(neighbor)) {
          dfs(neighbor, [...currentPath]);
        } else if (recStack.has(neighbor)) {
          const cycleStartIndex = currentPath.indexOf(neighbor);
          if (cycleStartIndex !== -1) {
            cycles.push({ path: currentPath.slice(cycleStartIndex).concat(neighbor) });
          }
        }
      }

      recStack.delete(node);
    };

    for (const node of this.adj.keys()) {
      if (!visited.has(node)) {
        dfs(node, []);
      }
    }

    return cycles;
  }

  getMetrics(node: string): ModuleMetrics {
    const fanOut = this.adj.get(node)?.size || 0;
    const fanIn = this.inEdges.get(node)?.size || 0;
    const instability = fanOut + fanIn > 0 ? fanOut / (fanOut + fanIn) : 0;

    return { file: node, fanIn, fanOut, instability };
  }

  getAllNodes(): string[] {
    return Array.from(this.adj.keys());
  }
}
