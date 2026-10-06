import { ASTNode } from './types.js';

export interface MinimalTreeSitterNode {
  type: string;
  startPosition: { row: number; column: number };
  endPosition: { row: number; column: number };
  text?: string;
  startIndex?: number;
  endIndex?: number;
  isNamed?: boolean;
  childCount: number;
  child: (index: number) => MinimalTreeSitterNode | null;
}

export function createASTNode(params: {
  type: string;
  startLine: number;
  startColumn: number;
  endLine: number;
  endColumn: number;
  text?: string;
  children?: ASTNode[];
  parent?: ASTNode;
  sourceRange?: { start: number; end: number };
  language?: string;
  semanticType?: string;
  isNamed?: boolean;
}): ASTNode {
  const node: ASTNode = {
    type: params.type,
    startLine: params.startLine,
    startColumn: params.startColumn,
    endLine: params.endLine,
    endColumn: params.endColumn,
    text: params.text,
    children: params.children || [],
    parent: params.parent,
    sourceRange: params.sourceRange,
    language: params.language,
    semanticType: params.semanticType,
    isNamed: params.isNamed ?? true,
  };

  for (const child of node.children) {
    child.parent = node;
  }

  return node;
}

export function fromTreeSitterNode(
  tsNode: MinimalTreeSitterNode,
  language?: string,
  parent?: ASTNode
): ASTNode {
  const node: ASTNode = {
    type: tsNode.type,
    startLine: tsNode.startPosition.row + 1,
    startColumn: tsNode.startPosition.column + 1,
    endLine: tsNode.endPosition.row + 1,
    endColumn: tsNode.endPosition.column + 1,
    text: tsNode.text,
    children: [],
    parent,
    sourceRange: {
      start: tsNode.startIndex ?? 0,
      end: tsNode.endIndex ?? 0,
    },
    language,
    isNamed: tsNode.isNamed,
  };

  const children: ASTNode[] = [];
  for (let i = 0; i < tsNode.childCount; i++) {
    const childTsNode = tsNode.child(i);
    if (childTsNode) {
      children.push(fromTreeSitterNode(childTsNode, language, node));
    }
  }

  node.children = children;
  return node;
}
