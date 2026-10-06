# `@codevitals/graph`

> Directed Dependency Graph & Traversal Engine

## Overview

`@codevitals/graph` maintains an in-memory indexable Directed Graph representing repository files, modules, symbols, call dependencies, and imports.

## Traversal Capabilities

- `findCallers(symbol)`
- `findCallees(symbol)`
- `findReferences(symbol)`
- `findDependents(file)`
- `findDependencies(file)`

## Usage

```typescript
import { DependencyGraph, GraphTraversal } from '@codevitals/graph';

const graph = new DependencyGraph();
// ... add nodes & edges ...

const traversal = new GraphTraversal(graph);
const callers = traversal.findCallers('UserService.getUser');
```
