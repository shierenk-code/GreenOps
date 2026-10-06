import { ASTNode } from '@codevitals/ast';
import { SymbolModel, SymbolKind } from './types.js';
import { generateSymbolId } from './id.js';

export class SymbolExtractor {
  public extractSymbols(
    rootNode: ASTNode,
    filePath: string,
    repoIdentifier = 'default_repo'
  ): SymbolModel[] {
    const symbols: SymbolModel[] = [];

    const stack: { node: ASTNode; symbol?: SymbolModel }[] = [];

    const processNode = (node: ASTNode) => {
      const parentSymbol = this.findParentSymbol(stack);
      const symbol = this.tryExtractSymbol(node, filePath, repoIdentifier, parentSymbol);

      if (symbol) {
        symbols.push(symbol);
        if (parentSymbol) {
          symbol.parentId = parentSymbol.id;
          parentSymbol.children.push(symbol.id);
        }
      }

      stack.push({ node, symbol: symbol || parentSymbol });
      for (const child of node.children) {
        processNode(child);
      }
      stack.pop();
    };

    processNode(rootNode);

    return symbols;
  }

  private findParentSymbol(
    stack: { node: ASTNode; symbol?: SymbolModel }[]
  ): SymbolModel | undefined {
    for (let i = stack.length - 1; i >= 0; i--) {
      const item = stack[i];
      if (item && item.symbol) {
        return item.symbol;
      }
    }
    return undefined;
  }

  private tryExtractSymbol(
    node: ASTNode,
    filePath: string,
    repoIdentifier: string,
    parentSymbol?: SymbolModel
  ): SymbolModel | undefined {
    const kindAndName = this.detectKindAndName(node);
    if (!kindAndName) return undefined;

    const { kind, name, exported } = kindAndName;
    const qualifiedName = parentSymbol ? `${parentSymbol.qualifiedName}.${name}` : name;

    const id = generateSymbolId({
      repoIdentifier,
      filePath,
      qualifiedName,
      kind,
    });

    return {
      id,
      name,
      qualifiedName,
      kind,
      fileId: filePath,
      startLine: node.startLine,
      endLine: node.endLine,
      exported,
      parentId: parentSymbol?.id,
      children: [],
    };
  }

  private detectKindAndName(node: ASTNode): { kind: SymbolKind; name: string; exported: boolean } | undefined {
    const isExported = this.isNodeExported(node);

    if (node.type === 'function_declaration' || node.type === 'generator_function_declaration') {
      const nameNode = node.children.find((c) => c.type === 'identifier');
      if (nameNode?.text) {
        const isGoExported = /^[A-Z]/.test(nameNode.text);
        return { kind: 'function', name: nameNode.text, exported: isExported || isGoExported };
      }
    }

    if (node.type === 'class_declaration' || node.type === 'abstract_class_declaration') {
      const nameNode = node.children.find((c) => c.type === 'type_identifier' || c.type === 'identifier');
      if (nameNode?.text) {
        return { kind: 'class', name: nameNode.text, exported: isExported };
      }
    }

    if (node.type === 'method_definition' || node.type === 'method_declaration') {
      const nameNode = node.children.find(
        (c) => c.type === 'property_identifier' || c.type === 'field_identifier' || c.type === 'identifier'
      );
      const name = nameNode?.text || 'anonymousMethod';
      const kind: SymbolKind = name === 'constructor' ? 'constructor' : 'method';
      const isGoExported = /^[A-Z]/.test(name);
      return { kind, name, exported: isExported || isGoExported };
    }

    if (node.type === 'variable_declarator') {
      const nameNode = node.children.find((c) => c.type === 'identifier');
      if (nameNode?.text) {
        const hasFnInit = node.children.some(
          (c) => c.type === 'arrow_function' || c.type === 'function' || c.type === 'function_expression'
        );
        if (hasFnInit) {
          return { kind: 'function', name: nameNode.text, exported: isExported };
        }
      }
    }

    if (node.type === 'interface_declaration') {
      const nameNode = node.children.find((c) => c.type === 'type_identifier' || c.type === 'identifier');
      if (nameNode?.text) {
        return { kind: 'interface', name: nameNode.text, exported: isExported };
      }
    }

    if (node.type === 'type_alias_declaration') {
      const nameNode = node.children.find((c) => c.type === 'type_identifier' || c.type === 'identifier');
      if (nameNode?.text) {
        return { kind: 'type', name: nameNode.text, exported: isExported };
      }
    }

    if (node.type === 'enum_declaration') {
      const nameNode = node.children.find((c) => c.type === 'identifier');
      if (nameNode?.text) {
        return { kind: 'enum', name: nameNode.text, exported: isExported };
      }
    }

    if (node.type === 'function_definition') {
      const nameNode = node.children.find((c) => c.type === 'identifier');
      if (nameNode?.text) {
        return { kind: 'function', name: nameNode.text, exported: true };
      }
    }

    if (node.type === 'class_definition') {
      const nameNode = node.children.find((c) => c.type === 'identifier');
      if (nameNode?.text) {
        return { kind: 'class', name: nameNode.text, exported: true };
      }
    }

    if (node.type === 'type_declaration') {
      const spec = node.children.find((c) => c.type === 'type_spec');
      const nameNode = spec?.children.find((c) => c.type === 'type_identifier' || c.type === 'identifier');
      if (nameNode?.text) {
        const isGoExported = /^[A-Z]/.test(nameNode.text);
        return { kind: 'type', name: nameNode.text, exported: isGoExported };
      }
    }

    if (node.type === 'constructor_declaration') {
      const nameNode = node.children.find((c) => c.type === 'identifier');
      if (nameNode?.text) {
        return { kind: 'constructor', name: nameNode.text, exported: isExported };
      }
    }

    return undefined;
  }

  private isNodeExported(node: ASTNode): boolean {
    if (node.parent?.type === 'export_statement' || node.parent?.type === 'export_specifier') {
      return true;
    }
    const hasExportKeyword = node.children.some(
      (c) => c.type === 'export' || c.text === 'export' || c.text === 'public'
    );
    return hasExportKeyword;
  }
}
