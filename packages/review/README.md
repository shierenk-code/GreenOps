# `@codevitals/review`

> PR / Diff Intelligence, Blast-Radius Calculation & Risk Analysis Engine for CodeVitals

`@codevitals/review` is the core semantic review engine that analyzes code diffs against AST symbol tables and dependency graphs to produce automated code reviews and quantitative risk assessments.

## Features

- **Semantic Diff**: Maps raw line diff hunks directly to AST nodes and symbols (added, removed, modified, renamed).
- **Blast Radius Calculation**: Computes downstream impacted callers, callees, test suites, and module dependencies.
- **Automated Risk Scoring**: 0–100 risk score based on change volume, export breaking changes, caller centrality, and test coverage.
- **Actionable Recommendations**: Produces clear recommendations for PR submitters and code reviewers.

## Usage

```typescript
import { PRReviewer } from '@codevitals/review';

const reviewer = new PRReviewer();
const result = reviewer.review('.', { diffSpec: 'HEAD~1' });

console.log(`Risk Level: ${result.riskAnalysis.level}`);
console.log(`Score: ${result.riskAnalysis.score}/100`);
```
