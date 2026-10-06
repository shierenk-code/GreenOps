import { describe, it, expect } from 'vitest';
import { createASTNode, walkAST, findNodesByType, findAncestors } from '../src/index.js';

describe('AST Traversal', () => {
  it('correctly constructs parent pointers and traverses nodes', () => {
    const root = createASTNode({
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
            createASTNode({
              type: 'method_definition',
              startLine: 4,
              startColumn: 3,
              endLine: 6,
              endColumn: 3,
            }),
          ],
        }),
      ],
    });

    const classes = findNodesByType(root, 'class_declaration');
    expect(classes).toHaveLength(1);
    expect(classes[0].type).toBe('class_declaration');

    const methods = findNodesByType(root, 'method_definition');
    expect(methods).toHaveLength(1);

    const ancestors = findAncestors(methods[0], (n) => n.type === 'class_declaration');
    expect(ancestors).toHaveLength(1);
    expect(ancestors[0].type).toBe('class_declaration');
  });
});
