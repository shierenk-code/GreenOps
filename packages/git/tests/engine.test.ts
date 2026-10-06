import { describe, it, expect } from 'vitest';
import { GitEngine, parseUnifiedDiff } from '../src/index.js';
import { resolve } from 'node:path';

describe('Git Engine & Diff Parser', () => {
  it('parses unified diff hunks correctly', () => {
    const rawDiff = `
diff --git a/src/user.ts b/src/user.ts
index 1234567..89abcdef 100644
--- a/src/user.ts
+++ b/src/user.ts
@@ -1,5 +1,6 @@
 import { UserRepository } from "./repository";

+export function helper() {}
 function getUser() {}
`;
    const parsed = parseUnifiedDiff(rawDiff);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].path).toBe('src/user.ts');
    expect(parsed[0].hunks).toHaveLength(1);
    expect(parsed[0].additions).toBe(1);
  });

  it('detects git repository and checks git status', () => {
    const isRepo = GitEngine.isGitRepository(process.cwd());
    expect(isRepo).toBe(true);

    const engine = new GitEngine();
    const status = engine.getStatus(process.cwd());
    expect(status.branch).toBeDefined();
  });
});
