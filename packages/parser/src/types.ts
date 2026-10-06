import { ASTNode } from '@codevitals/ast';

export interface ParseError {
  message: string;
  startLine: number;
  startColumn: number;
  endLine: number;
  endColumn: number;
}

export interface ParseResult {
  tree: unknown;
  rootNode: ASTNode;
  errors: ParseError[];
  hasErrors: boolean;
}

export interface CodeParser {
  language: string;
  parse(source: string): ParseResult;
}
