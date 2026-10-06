import Parser from 'tree-sitter';
import GoLanguage from 'tree-sitter-go';
import { fromTreeSitterNode, MinimalTreeSitterNode } from '@codevitals/ast';
import { CodeParser, ParseResult, ParseError } from '../types.js';

interface SyntaxNodeWithErrorCheck {
  hasError?: boolean | (() => boolean);
}

function checkHasError(node: Parser.SyntaxNode): boolean {
  const nodeWithCheck = node as unknown as SyntaxNodeWithErrorCheck;
  if (typeof nodeWithCheck.hasError === 'function') {
    return nodeWithCheck.hasError();
  }
  return Boolean(nodeWithCheck.hasError);
}

export class GoParser implements CodeParser {
  public readonly language = 'go';
  private parser: Parser;

  constructor() {
    this.parser = new Parser();
    const mod = GoLanguage as unknown as { default?: Parser.Language };
    const lang = mod.default || (GoLanguage as unknown as Parser.Language);
    this.parser.setLanguage(lang);
  }

  public parse(source: string): ParseResult {
    const tree = this.parser.parse(source);
    const rootNode = fromTreeSitterNode(tree.rootNode as unknown as MinimalTreeSitterNode, this.language);
    const errors: ParseError[] = [];

    this.collectErrors(tree.rootNode, errors);

    return {
      tree,
      rootNode,
      errors,
      hasErrors: errors.length > 0 || checkHasError(tree.rootNode),
    };
  }

  private collectErrors(node: Parser.SyntaxNode, errors: ParseError[]): void {
    if (node.isError || node.isMissing) {
      errors.push({
        message: node.isMissing
          ? `Missing expected token near '${node.type}'`
          : `Syntax error: unexpected node '${node.text.slice(0, 30)}'`,
        startLine: node.startPosition.row + 1,
        startColumn: node.startPosition.column + 1,
        endLine: node.endPosition.row + 1,
        endColumn: node.endPosition.column + 1,
      });
    }

    if (checkHasError(node)) {
      for (let i = 0; i < node.childCount; i++) {
        const child = node.child(i);
        if (child && checkHasError(child)) {
          this.collectErrors(child, errors);
        }
      }
    }
  }
}
