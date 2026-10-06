import { ASTNode, walkAST, findNodes } from '@codevitals/ast';
import { ImportModel } from './types.js';

export class ImportExtractor {
  public extractImports(rootNode: ASTNode, filePath: string): ImportModel[] {
    const imports: ImportModel[] = [];

    walkAST(rootNode, (node) => {
      // TS / JS ESM imports
      if (node.type === 'import_statement') {
        const sourceNode = node.children.find((c) => c.type === 'string');
        const source = sourceNode?.text ? sourceNode.text.replace(/['"]/g, '') : '';

        const importedSymbols: string[] = [];
        let isDefault = false;
        let isNamespace = false;

        const importClause = node.children.find(
          (c) => c.type === 'import_clause' || c.type === 'named_imports'
        );

        if (importClause) {
          const namedImports = findNodes(importClause, (n) => n.type === 'import_specifier');
          for (const spec of namedImports) {
            const idNode = spec.children.find((c) => c.type === 'identifier');
            if (idNode?.text) importedSymbols.push(idNode.text);
          }

          const defaultId = importClause.children.find((c) => c.type === 'identifier');
          if (defaultId?.text) {
            importedSymbols.push(defaultId.text);
            isDefault = true;
          }

          const nsImport = importClause.children.find((c) => c.type === 'namespace_import');
          if (nsImport) {
            const alias = nsImport.children.find((c) => c.type === 'identifier');
            if (alias?.text) importedSymbols.push(alias.text);
            isNamespace = true;
          }
        }

        if (source) {
          imports.push({
            fileId: filePath,
            source,
            symbols: importedSymbols,
            isDefault,
            isNamespace,
            startLine: node.startLine,
            endLine: node.endLine,
          });
        }
      }

      // JS CJS require(...) call expression
      if (node.type === 'call_expression') {
        const fnNode = node.children.find((c) => c.type === 'identifier' && c.text === 'require');
        if (fnNode) {
          const args = node.children.find((c) => c.type === 'arguments');
          const argString = args?.children.find((c) => c.type === 'string');
          if (argString?.text) {
            const source = argString.text.replace(/['"]/g, '');
            imports.push({
              fileId: filePath,
              source,
              symbols: [],
              startLine: node.startLine,
              endLine: node.endLine,
            });
          }
        }
      }

      // Python import_statement & import_from_statement
      if (node.type === 'import_statement' && rootNode.language === 'python') {
        const names = findNodes(node, (n) => n.type === 'dotted_name' || n.type === 'identifier');
        for (const n of names) {
          if (n.text) {
            imports.push({
              fileId: filePath,
              source: n.text,
              symbols: [n.text],
              startLine: node.startLine,
              endLine: node.endLine,
            });
          }
        }
      }
      if (node.type === 'import_from_statement') {
        const moduleName = node.children.find(
          (c) => c.type === 'dotted_name' || c.type === 'relative_import' || c.type === 'identifier'
        );
        const source = moduleName?.text || '';
        const importedSymbols: string[] = [];
        const importNames = findNodes(
          node,
          (n) => n.type === 'import_specifier' || (n.type === 'identifier' && n !== moduleName)
        );
        for (const n of importNames) {
          if (n.text) importedSymbols.push(n.text);
        }
        if (source) {
          imports.push({
            fileId: filePath,
            source,
            symbols: importedSymbols,
            startLine: node.startLine,
            endLine: node.endLine,
          });
        }
      }

      // Go import_declaration
      if (node.type === 'import_declaration') {
        const specs = findNodes(node, (n) => n.type === 'import_spec' || n.type === 'interpreted_string_literal');
        for (const spec of specs) {
          const strNode = spec.type === 'interpreted_string_literal' ? spec : spec.children.find((c) => c.type === 'interpreted_string_literal');
          if (strNode?.text) {
            const source = strNode.text.replace(/['"]/g, '');
            imports.push({
              fileId: filePath,
              source,
              symbols: [],
              startLine: node.startLine,
              endLine: node.endLine,
            });
          }
        }
      }

      // Java import_declaration
      if (node.type === 'import_declaration' && rootNode.language === 'java') {
        const nameNode = node.children.find((c) => c.type === 'scoped_identifier' || c.type === 'identifier');
        if (nameNode?.text) {
          imports.push({
            fileId: filePath,
            source: nameNode.text,
            symbols: [nameNode.text.split('.').pop() || nameNode.text],
            startLine: node.startLine,
            endLine: node.endLine,
          });
        }
      }
    });

    return imports;
  }
}
