export interface SourcePosition {
  line: number;
  column: number;
}

export interface SourceRange {
  start: number;
  end: number;
}

export interface ASTNode {
  id?: string;
  type: string;
  startLine: number;
  startColumn: number;
  endLine: number;
  endColumn: number;
  text?: string;
  children: ASTNode[];
  parent?: ASTNode;
  sourceRange?: SourceRange;
  language?: string;
  semanticType?: string;
  isNamed?: boolean;
}

export type ASTVisitor = (node: ASTNode, parent?: ASTNode) => void | boolean;
