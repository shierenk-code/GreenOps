# `@codevitals/parser`

> Tree-sitter AST Parser Engine & Content-Hash Cache

## Overview

`@codevitals/parser` provides language adapter wrappers around Tree-sitter grammars (TypeScript, JavaScript, Python, Go, Java) behind an abstract `CodeParser` interface. It includes an automatic content-hash (`SHA-256`) parser cache that invalidates single files when modified.

## Features

- Abstract `CodeParser` & `ParseResult` interfaces.
- Adapters for **TypeScript**, **JavaScript**, **Python**, **Go**, and **Java**.
- Extensible `LanguageRegistry` for file extensions.
- Syntax-error resilience (incomplete files never crash parser).
- In-memory content hash `ParserCache`.

## Usage

```typescript
import { EngineParser } from '@codevitals/parser';

const parser = new EngineParser();
const result = parser.parse(sourceCode, 'typescript');

// parse() returns undefined for unsupported languages.
console.log(result?.hasErrors, result?.rootNode);
```
