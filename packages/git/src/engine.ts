import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  GitBranch,
  GitCommit,
  GitFileChange,
  GitDiffFile,
  GitBlameLine,
  GitStatusResult,
  GitCompareResult,
  GitFileStatus,
} from './types.js';
import { parseUnifiedDiff } from './diff-parser.js';

export class GitEngine {
  public static isGitRepository(repoPath: string): boolean {
    const resolved = resolve(repoPath);
    try {
      const output = execFileSync('git', ['rev-parse', '--is-inside-work-tree'], {
        cwd: resolved,
        encoding: 'utf-8',
        stdio: ['ignore', 'pipe', 'ignore'],
      });
      return output.trim() === 'true';
    } catch {
      return existsSync(resolve(resolved, '.git'));
    }
  }

  private execGit(repoPath: string, args: string[]): string {
    const resolved = resolve(repoPath);
    try {
      return execFileSync('git', args, {
        cwd: resolved,
        encoding: 'utf-8',
        maxBuffer: 10 * 1024 * 1024,
      }).trim();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`Git command failed [git ${args.join(' ')}]: ${msg}`);
    }
  }

  public getStatus(repoPath: string): GitStatusResult {
    if (!GitEngine.isGitRepository(repoPath)) {
      return { branch: 'HEAD', isClean: true, ahead: 0, behind: 0, files: [] };
    }

    let branch = 'HEAD';
    try {
      branch = this.execGit(repoPath, ['rev-parse', '--abbrev-ref', 'HEAD']);
    } catch {
      // ignore
    }

    let rawStatus = '';
    try {
      rawStatus = this.execGit(repoPath, ['status', '--porcelain']);
    } catch {
      // ignore
    }
    const files: GitFileChange[] = [];

    if (rawStatus) {
      const lines = rawStatus.split(/\r?\n/);
      for (const line of lines) {
        if (!line.trim()) continue;
        const statusCode = line.slice(0, 2);
        const pathPart = line.slice(3).trim();

        let status: GitFileStatus = 'modified';
        if (statusCode.includes('?') || statusCode.includes('A')) {
          status = 'added';
        } else if (statusCode.includes('D')) {
          status = 'deleted';
        } else if (statusCode.includes('R')) {
          status = 'renamed';
        }

        files.push({
          path: pathPart,
          status,
          additions: 0,
          deletions: 0,
        });
      }
    }

    return {
      branch,
      isClean: files.length === 0,
      ahead: 0,
      behind: 0,
      files,
    };
  }

  public getBranches(repoPath: string): GitBranch[] {
    if (!GitEngine.isGitRepository(repoPath)) return [];
    let output = '';
    try {
      output = this.execGit(repoPath, ['branch', '-a', '--verbose', '--no-color']);
    } catch {
      return [];
    }
    const branches: GitBranch[] = [];

    for (const line of output.split(/\r?\n/)) {
      if (!line.trim()) continue;
      const isCurrent = line.startsWith('*');
      const cleanLine = line.replace('*', '').trim();
      const parts = cleanLine.split(/\s+/);
      const name = parts[0] || '';
      const hash = parts[1] || '';

      if (name) {
        branches.push({
          name,
          isCurrent,
          commitHash: hash,
        });
      }
    }

    return branches;
  }

  public getCommits(repoPath: string, count = 20, filePath?: string): GitCommit[] {
    if (!GitEngine.isGitRepository(repoPath)) return [];
    const args = ['log', `-n`, String(count), `--pretty=format:%H|%h|%an|%ae|%aI|%s`];
    if (filePath) {
      args.push('--', filePath);
    }

    let output = '';
    try {
      output = this.execGit(repoPath, args);
    } catch {
      return [];
    }
    if (!output) return [];

    const commits: GitCommit[] = [];
    for (const line of output.split(/\r?\n/)) {
      if (!line.trim()) continue;
      const [hash, shortHash, author, email, date, message] = line.split('|');
      commits.push({
        hash: hash || '',
        shortHash: shortHash || '',
        author: author || '',
        email: email || '',
        date: date || '',
        message: message || '',
      });
    }

    return commits;
  }

  public getChangedFiles(repoPath: string, base = 'HEAD~1', head = 'HEAD'): GitFileChange[] {
    if (!GitEngine.isGitRepository(repoPath)) return [];
    let output = '';
    try {
      output = this.execGit(repoPath, ['diff', '--numstat', `${base}..${head}`]);
    } catch {
      try {
        output = this.execGit(repoPath, ['diff', '--numstat']);
      } catch {
        return [];
      }
    }

    const changes: GitFileChange[] = [];
    for (const line of output.split(/\r?\n/)) {
      if (!line.trim()) continue;
      const [addStr, delStr, pathStr] = line.split(/\t/);
      if (!pathStr) continue;

      const additions = addStr === '-' ? 0 : parseInt(addStr || '0', 10) || 0;
      const deletions = delStr === '-' ? 0 : parseInt(delStr || '0', 10) || 0;

      let status: GitFileStatus = 'modified';
      if (additions > 0 && deletions === 0) status = 'added';
      if (deletions > 0 && additions === 0) status = 'deleted';

      changes.push({
        path: pathStr,
        status,
        additions,
        deletions,
      });
    }

    return changes;
  }

  public getDiff(repoPath: string, base?: string, head?: string, filePath?: string): GitDiffFile[] {
    if (!GitEngine.isGitRepository(repoPath)) return [];
    const args = ['diff'];
    if (base && head) {
      args.push(`${base}..${head}`);
    } else if (base) {
      args.push(base);
    }
    if (filePath) {
      args.push('--', filePath);
    }

    let rawDiff = '';
    try {
      rawDiff = this.execGit(repoPath, args);
    } catch {
      return [];
    }

    return parseUnifiedDiff(rawDiff);
  }

  public getBlame(repoPath: string, filePath: string): GitBlameLine[] {
    if (!GitEngine.isGitRepository(repoPath)) return [];
    let output = '';
    try {
      output = this.execGit(repoPath, ['blame', '--line-porcelain', filePath]);
    } catch {
      return [];
    }

    const blameLines: GitBlameLine[] = [];
    const lines = output.split(/\r?\n/);

    let currentHash = '';
    let currentAuthor = '';
    let currentDate = '';
    let currentLineNum = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line === undefined) continue;

      if (/^[0-9a-f]{40}/.test(line)) {
        const parts = line.split(' ');
        currentHash = parts[0] || '';
        currentLineNum = parseInt(parts[2] || '0', 10) || 0;
      } else if (line.startsWith('author ')) {
        currentAuthor = line.replace('author ', '');
      } else if (line.startsWith('author-time ')) {
        const timeSec = parseInt(line.replace('author-time ', ''), 10);
        currentDate = new Date(timeSec * 1000).toISOString();
      } else if (line.startsWith('\t')) {
        blameLines.push({
          line: currentLineNum,
          commitHash: currentHash,
          author: currentAuthor,
          date: currentDate,
          content: line.slice(1),
        });
      }
    }

    return blameLines;
  }

  public getMergeBase(repoPath: string, base: string, head: string): string {
    if (!GitEngine.isGitRepository(repoPath)) return '';
    try {
      return this.execGit(repoPath, ['merge-base', base, head]);
    } catch {
      return '';
    }
  }

  public compareBaseHead(repoPath: string, base: string, head: string): GitCompareResult {
    const mergeBase = this.getMergeBase(repoPath, base, head) || base;
    const changedFiles = this.getChangedFiles(repoPath, mergeBase, head);
    const diffFiles = this.getDiff(repoPath, mergeBase, head);
    const commits = this.getCommits(repoPath, 50);

    return {
      base,
      head,
      mergeBase,
      changedFiles,
      diffFiles,
      commits,
    };
  }
}
