# `@codevitals/repository`

> Repository Scanner & Code Intelligence Pipeline Orchestrator

## Overview

`@codevitals/repository` houses `RepositoryScanner` (filesystem-level scanning) and `RepositoryAnalyzer` (code-level analysis pipeline).

## Analysis Pipeline Architecture

```text
RepositoryScanner ──> LanguageDetector ──> EngineParser ──> AST ──> Symbol/Reference Extractors ──> DependencyGraph
```

## Usage

```typescript
import { RepositoryAnalyzer } from '@codevitals/repository';

const analyzer = new RepositoryAnalyzer();
const { result, graph, traversal } = analyzer.analyze('/path/to/repo');
```
