import { describe, it, expect } from 'vitest';
import { generateSymbolId } from '../src/id.js';
import { SymbolExtractor } from '../src/extractor.js';
import { createASTNode } from '@codevitals/ast';

describe('Symbol Extraction & Identity', () => {
  it('generates deterministic symbol IDs', () => {
    const id1 = generateSymbolId({
      repoIdentifier: 'repo_a',
      filePath: 'src/user.ts',
      qualifiedName: 'UserService.getUser',
      kind: 'method',
    });
    const id2 = generateSymbolId({
      repoIdentifier: 'repo_a',
      filePath: 'src/user.ts',
      qualifiedName: 'UserService.getUser',
      kind: 'method',
    });
    expect(id1).toBe(id2);
    expect(id1).toMatch(/^sym_[a-f0-9]{16}$/);
  });

  it('extracts nested symbols with correct hierarchy', () => {
    const ast = createASTNode({
      type: 'program',
      startLine: 1,
      startColumn: 1,
      endLine: 10,
      endColumn: 1,
      children: [
        createASTNode({
          type: 'class_declaration',
          startLine: 2,
          startColumn: 1,
          endLine: 8,
          endColumn: 1,
          children: [
            createASTNode({ type: 'identifier', text: 'UserService', startLine: 2, startColumn: 7, endLine: 2, endColumn: 18 }),
            createASTNode({
              type: 'method_definition',
              startLine: 4,
              startColumn: 3,
              endLine: 6,
              endColumn: 3,
              children: [
                createASTNode({ type: 'property_identifier', text: 'getUser', startLine: 4, startColumn: 3, endLine: 4, endColumn: 10 }),
                createASTNode({
                  type: 'function_declaration',
                  startLine: 5,
                  startColumn: 5,
                  endLine: 5,
                  endColumn: 30,
                  children: [
                    createASTNode({ type: 'identifier', text: 'normalize', startLine: 5, startColumn: 14, endLine: 5, endColumn: 23 }),
                  ],
                }),
              ],
            }),
          ],
        }),
      ],
    });

    const extractor = new SymbolExtractor();
    const symbols = extractor.extractSymbols(ast, 'src/user.ts');

    expect(symbols).toHaveLength(3);
    const cls = symbols.find((s) => s.name === 'UserService');
    const mtd = symbols.find((s) => s.name === 'getUser');
    const fn = symbols.find((s) => s.name === 'normalize');

    expect(cls).toBeDefined();
    expect(mtd).toBeDefined();
    expect(fn).toBeDefined();

    expect(mtd?.qualifiedName).toBe('UserService.getUser');
    expect(mtd?.parentId).toBe(cls?.id);
    expect(cls?.children).toContain(mtd?.id);

    expect(fn?.qualifiedName).toBe('UserService.getUser.normalize');
    expect(fn?.parentId).toBe(mtd?.id);
  });
});
