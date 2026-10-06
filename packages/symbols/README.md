# `@codevitals/symbols`

> Symbol Extraction & Deterministic Identity Engine

## Overview

`@codevitals/symbols` extracts functions, methods, classes, interfaces, types, enums, variables, constants, and constructors from normalized ASTs while deriving stable, deterministic symbol IDs (`sym_<sha256>`).

## Symbol Identity Algorithm

$$\text{id} = \text{"sym\_"} + \text{SHA256}(\text{repo} + \text{filePath} + \text{qualifiedName} + \text{kind})[0:16]$$

## Usage

```typescript
import { SymbolExtractor } from '@codevitals/symbols';

const extractor = new SymbolExtractor();
const symbols = extractor.extractSymbols(rootASTNode, 'src/user.ts');
```
