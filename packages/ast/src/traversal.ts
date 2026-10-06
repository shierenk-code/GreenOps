import { ASTNode, ASTVisitor } from './types.js';

export function walkAST(node: ASTNode, visitor: ASTVisitor, parent?: ASTNode): void {
  const result = visitor(node, parent);
  if (result === false) {
    return;
  }

  for (const child of node.children) {
    walkAST(child, visitor, node);
  }
}

export function findNodes(node: ASTNode, predicate: (node: ASTNode) => boolean): ASTNode[] {
  const results: ASTNode[] = [];
  walkAST(node, (n) => {
    if (predicate(n)) {
      results.push(n);
    }
  });
  return results;
}

export function findNodesByType(node: ASTNode, types: string | string[]): ASTNode[] {
  const typeSet = new Set(Array.isArray(types) ? types : [types]);
  return findNodes(node, (n) => typeSet.has(n.type));
}

export function findAncestors(node: ASTNode, predicate: (n: ASTNode) => boolean): ASTNode[] {
  const ancestors: ASTNode[] = [];
  let curr = node.parent;
  while (curr) {
    if (predicate(curr)) {
      ancestors.push(curr);
    }
    curr = curr.parent;
  }
  return ancestors;
}

export function getFirstChildText(node: ASTNode, type: string): string | undefined {
  const child = node.children.find((c) => c.type === type);
  return child?.text;
}
