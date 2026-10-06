import ts from "typescript";

export interface ControlFlowNode {
  id: number;
  kind: string;
  isReachable: boolean;
  successors: number[];
}

export class ControlFlowAnalyzer {
  static analyzeFunction(node: ts.FunctionDeclaration | ts.MethodDeclaration | ts.ArrowFunction): {
    hasCatch: boolean;
    hasReturn: boolean;
    unreachableNodeCount: number;
  } {
    let hasCatch = false;
    let hasReturn = false;
    let unreachableNodeCount = 0;

    const walk = (n: ts.Node) => {
      if (ts.isTryStatement(n) && n.catchClause) {
        hasCatch = true;
      }
      if (ts.isReturnStatement(n)) {
        hasReturn = true;
      }
      ts.forEachChild(n, walk);
    };

    if (node.body) {
      walk(node.body);
    }

    return { hasCatch, hasReturn, unreachableNodeCount };
  }
}
