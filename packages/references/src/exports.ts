import { ASTNode, walkAST, findNodes } from '@codevitals/ast';
import { SymbolModel } from '@codevitals/symbols';
import { ExportModel } from './types.js';

export class ExportExtractor {
  public extractExports(
    rootNode: ASTNode,
    filePath: string,
    symbols: SymbolModel[] = []
  ): ExportModel[] {
    const exports: ExportModel[] = [];

    walkAST(rootNode, (node) => {
      if (node.type === 'export_statement') {
        const isDefault = node.children.some((c) => c.type === 'default' || c.text === 'default');

        const sourceNode = node.children.find((c) => c.type === 'string');
        const source = sourceNode?.text ? sourceNode.text.replace(/['"]/g, '') : undefined;

        const exportClause = node.children.find((c) => c.type === 'export_clause');

        if (exportClause) {
          const specifiers = findNodes(exportClause, (n) => n.type === 'export_specifier');
          for (const spec of specifiers) {
            const nameNode = spec.children.find((c) => c.type === 'identifier');
            if (nameNode?.text) {
              const sym = symbols.find((s) => s.name === nameNode.text);
              exports.push({
                fileId: filePath,
                symbolId: sym?.id,
                name: nameNode.text,
                kind: source ? 're-export' : 'named',
                source,
                startLine: node.startLine,
                endLine: node.endLine,
              });
            }
          }
        } else {
          // Export declaration (export function/class/interface)
          const declNode = node.children.find(
            (c) =>
              c.type.includes('declaration') ||
              c.type.includes('definition') ||
              c.type === 'identifier'
          );

          if (declNode) {
            const nameNode =
              declNode.children.find((c) => c.type === 'identifier' || c.type === 'property_identifier') ||
              declNode;
            const name = nameNode.text || (isDefault ? 'default' : 'anonymous');
            const sym = symbols.find((s) => s.name === name);

            exports.push({
              fileId: filePath,
              symbolId: sym?.id,
              name,
              kind: isDefault ? 'default' : 'named',
              source,
              startLine: node.startLine,
              endLine: node.endLine,
            });
          }
        }
      }
    });

    // Also include symbols marked exported by symbol extractor
    for (const sym of symbols) {
      if (sym.exported && !exports.some((e) => e.name === sym.name || e.symbolId === sym.id)) {
        exports.push({
          fileId: filePath,
          symbolId: sym.id,
          name: sym.name,
          kind: 'named',
          startLine: sym.startLine,
          endLine: sym.endLine,
        });
      }
    }

    return exports;
  }
}
