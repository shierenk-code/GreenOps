import { ASTNode, walkAST } from '@codevitals/ast';
import { SymbolModel } from '@codevitals/symbols';
import { ReferenceModel } from './types.js';

export class ReferenceExtractor {
  public extractReferences(
    rootNode: ASTNode,
    filePath: string,
    symbols: SymbolModel[] = []
  ): ReferenceModel[] {
    const references: ReferenceModel[] = [];

    const getSurroundingSymbolId = (node: ASTNode): string | undefined => {
      const matchingSymbols = symbols.filter(
        (s) => s.startLine <= node.startLine && s.endLine >= node.endLine
      );
      if (matchingSymbols.length === 0) return undefined;
      // Sort by range size (endLine - startLine) ascending to pick the innermost symbol
      matchingSymbols.sort((a, b) => (a.endLine - a.startLine) - (b.endLine - b.startLine));
      const match = matchingSymbols[0];
      return match ? match.id : undefined;
    };

    walkAST(rootNode, (node) => {
      // Call expressions (service.getUser(...) or createService(...))
      if (node.type === 'call_expression' || node.type === 'call' || node.type === 'method_invocation') {
        const expression = node.children[0];
        let targetName = '';

        if (expression) {
          if (expression.type === 'member_expression' || expression.type === 'attribute') {
            const property = expression.children.find(
              (c) => c.type === 'property_identifier' || c.type === 'identifier' || c.type === 'field_identifier'
            );
            targetName = property?.text || expression.text || '';
          } else if (expression.type === 'identifier' || expression.type === 'field_identifier') {
            targetName = expression.text || '';
          } else {
            targetName = expression.text || '';
          }
        }

        if (targetName && targetName !== 'require' && targetName !== 'import') {
          const sourceSymbolId = getSurroundingSymbolId(node);
          references.push({
            fileId: filePath,
            sourceSymbolId,
            targetName,
            kind: 'call',
            startLine: node.startLine,
            endLine: node.endLine,
          });
        }
      }

      // New expressions (new UserService(...))
      if (node.type === 'new_expression') {
        const constructorNode = node.children.find(
          (c) => c.type === 'identifier' || c.type === 'type_identifier'
        );
        if (constructorNode?.text) {
          const sourceSymbolId = getSurroundingSymbolId(node);
          references.push({
            fileId: filePath,
            sourceSymbolId,
            targetName: constructorNode.text,
            kind: 'call',
            startLine: node.startLine,
            endLine: node.endLine,
          });
        }
      }

      // Type annotations / extends / implements
      if (node.type === 'extends_clause' || node.type === 'implements_clause' || node.type === 'type_identifier') {
        const name = node.text || '';
        if (name) {
          const sourceSymbolId = getSurroundingSymbolId(node);
          references.push({
            fileId: filePath,
            sourceSymbolId,
            targetName: name,
            kind: node.type.includes('extends') ? 'extend' : node.type.includes('implements') ? 'implement' : 'type',
            startLine: node.startLine,
            endLine: node.endLine,
          });
        }
      }
    });

    return references;
  }
}
