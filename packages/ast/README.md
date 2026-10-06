# `@codevitals/ast`

> Normalized AST Representation & Traversal Utilities

## Overview

`@codevitals/ast` defines the language-agnostic `ASTNode` data structure and visitor-pattern traversal functions (`walkAST`, `findNodesByType`, `findAncestors`).

## ASTNode Model

```typescript
interface ASTNode {
  type: string;
  startLine: number;
  startColumn: number;
  endLine: number;
  endColumn: number;
  text?: string;
  children: ASTNode[];
  parent?: ASTNode;
  sourceRange?: { start: number; end: number };
  language?: string;
}
```

## Usage

```typescript
import { walkAST, findNodesByType } from '@codevitals/ast';

const classes = findNodesByType(rootNode, 'class_declaration');
```
