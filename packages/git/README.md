# `@codevitals/git`

> Git Intelligence Engine & Unified Diff Parser for CodeVitals

`@codevitals/git` provides native Git command wrappers and a robust line-level unified diff parser for CodeVitals.

## Features

- **Working Tree Status**: Parses porcelain status for changed, added, deleted, and untracked files.
- **Unified Diff Parser**: Converts unified diff outputs (`diff --git`) into structured line hunks and addition/deletion counts.
- **Commit History & Branches**: Retrieves commit logs, author metadata, and branch information.
- **File History & Blame**: Line-by-line commit blame attribution.
- **Base / Head Comparison**: Calculates merge-base ancestors and branch comparisons.

## Usage

```typescript
import { GitEngine, parseUnifiedDiff } from '@codevitals/git';

const engine = new GitEngine();
const status = engine.getStatus('.');
const diffFiles = engine.getDiff('.', 'HEAD~1', 'HEAD');
```
