# `@codevitals/references`

> Import, Export & Reference Extractor

## Overview

`@codevitals/references` analyzes ASTs to extract named, default, namespace imports, exports, re-exports, and lexical reference/call expressions.

## Extractors

- `ImportExtractor`: Parses import statements across TS, JS, Python, Go, Java.
- `ExportExtractor`: Extracts exported symbols and re-exports.
- `ReferenceExtractor`: Identifies function call expressions, member accesses, and type references.

## Usage

```typescript
import { ImportExtractor, ExportExtractor, ReferenceExtractor } from '@codevitals/references';

const imports = new ImportExtractor().extractImports(rootASTNode, 'src/user.ts');
```
