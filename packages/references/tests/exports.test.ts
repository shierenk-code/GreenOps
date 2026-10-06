import { describe, it, expect } from 'vitest';
import { ExportExtractor } from '../src/exports.js';
import { createASTNode } from '@codevitals/ast';

describe('Export Extraction', () => {
  it('extracts named export functions', () => {
    const ast = createASTNode({
      type: 'program',
      startLine: 1,
      startColumn: 1,
      endLine: 5,
      endColumn: 1,
      children: [
        createASTNode({
          type: 'export_statement',
          startLine: 1,
          startColumn: 1,
          endLine: 3,
          endColumn: 1,
          children: [
            createASTNode({
              type: 'function_declaration',
              startLine: 1,
              startColumn: 8,
              endLine: 3,
              endColumn: 1,
              children: [
                createASTNode({ type: 'identifier', text: 'createService', startLine: 1, startColumn: 17, endLine: 1, endColumn: 30 }),
              ],
            }),
          ],
        }),
      ],
    });

    const extractor = new ExportExtractor();
    const exports = extractor.extractExports(ast, 'src/service.ts');

    expect(exports).toHaveLength(1);
    expect(exports[0].name).toBe('createService');
    expect(exports[0].kind).toBe('named');
  });
});
