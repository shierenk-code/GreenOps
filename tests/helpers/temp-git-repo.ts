import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

/**
 * A small, self-contained Git repository with two commits, so review/analysis
 * tests do not parse the whole monorepo or depend on CI clone depth (HEAD~1).
 */
export interface TempGitRepo {
  path: string;
  cleanup: () => void;
}

const FILES_V1: Record<string, string> = {
  'src/math.ts': 'export function add(a: number, b: number): number {\n  return a + b;\n}\n',
  'src/calc.ts':
    "import { add } from './math';\n\nexport function total(values: number[]): number {\n  return values.reduce((sum, v) => add(sum, v), 0);\n}\n",
  'src/index.ts': "export { total } from './calc';\n",
};

const FILES_V2: Record<string, string> = {
  'src/math.ts':
    'export function add(a: number, b: number): number {\n  return a + b;\n}\n\nexport function multiply(a: number, b: number): number {\n  return a * b;\n}\n',
  'src/calc.ts':
    "import { add, multiply } from './math';\n\nexport function total(values: number[]): number {\n  return values.reduce((sum, v) => add(sum, v), 0);\n}\n\nexport function product(values: number[]): number {\n  return values.reduce((acc, v) => multiply(acc, v), 1);\n}\n",
};

function write(root: string, files: Record<string, string>): void {
  for (const [relative, content] of Object.entries(files)) {
    const target = join(root, relative);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, content, 'utf8');
  }
}

function git(cwd: string, ...args: string[]): void {
  // Identity is passed per command so no Git configuration is written anywhere.
  execFileSync(
    'git',
    [
      '-c',
      'user.name=GreenOps Test',
      '-c',
      'user.email=test@example.invalid',
      '-c',
      'commit.gpgsign=false',
      ...args,
    ],
    { cwd, stdio: 'ignore' },
  );
}

export function createTempGitRepo(): TempGitRepo {
  const path = mkdtempSync(join(tmpdir(), 'greenops-review-repo-'));
  git(path, 'init', '--quiet');
  write(path, FILES_V1);
  git(path, 'add', '.');
  git(path, 'commit', '--quiet', '-m', 'initial');
  write(path, FILES_V2);
  git(path, 'add', '.');
  git(path, 'commit', '--quiet', '-m', 'add multiply and product');
  return { path, cleanup: () => rmSync(path, { recursive: true, force: true }) };
}
