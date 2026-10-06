import { describe, it, expect } from 'vitest';
import { ImportExtractor } from '../src/imports.js';
import { createASTNode } from '@codevitals/ast';

describe('Import Extraction', () => {
  it('extracts named and default TypeScript imports correctly', () => {
    const ast = createASTNode({
      type: 'program',
      startLine: 1,
      startColumn: 1,
      endLine: 10,
      endColumn: 1,
      children: [
        createASTNode({
          type: 'import_statement',
          startLine: 1,
          startColumn: 1,
          endLine: 1,
          endColumn: 46,
          children: [
            createASTNode({
              type: 'import_clause',
              startLine: 1,
              startColumn: 8,
              endLine: 1,
              endColumn: 26,
              children: [
                createASTNode({
                  type: 'import_specifier',
                  startLine: 1,
                  startColumn: 10,
                  endLine: 1,
                  endColumn: 24,
                  children: [
                    createASTNode({ type: 'identifier', text: 'UserRepository', startLine: 1, startColumn: 10, endLine: 1, endColumn: 24 }),
                  ],
                }),
              ],
            }),
            createASTNode({ type: 'string', text: '"./repository"', startLine: 1, startColumn: 32, endLine: 1, endColumn: 45 }),
          ],
        }),
      ],
    });

    const extractor = new ImportExtractor();
    const imports = extractor.extractImports(ast, 'src/service.ts');

    expect(imports).toHaveLength(1);
    expect(imports[0].source).toBe('./repository');
    expect(imports[0].symbols).toContain('UserRepository');
  });
});
