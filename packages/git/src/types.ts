export interface GitBranch {
  name: string;
  isCurrent: boolean;
  commitHash?: string;
}

export interface GitCommit {
  hash: string;
  shortHash: string;
  author: string;
  email: string;
  date: string;
  message: string;
}

export type GitFileStatus = 'added' | 'modified' | 'deleted' | 'renamed' | 'untracked';

export interface GitFileChange {
  path: string;
  oldPath?: string;
  status: GitFileStatus;
  additions: number;
  deletions: number;
}

export interface GitDiffLine {
  type: 'add' | 'delete' | 'context';
  oldLine?: number;
  newLine?: number;
  content: string;
}

export interface GitDiffHunk {
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  header: string;
  lines: GitDiffLine[];
}

export interface GitDiffFile {
  path: string;
  oldPath?: string;
  status: GitFileStatus;
  hunks: GitDiffHunk[];
  additions: number;
  deletions: number;
}

export interface GitBlameLine {
  line: number;
  commitHash: string;
  author: string;
  date: string;
  content: string;
}

export interface GitStatusResult {
  branch: string;
  isClean: boolean;
  ahead: number;
  behind: number;
  files: GitFileChange[];
}

export interface GitCompareResult {
  base: string;
  head: string;
  mergeBase: string;
  changedFiles: GitFileChange[];
  diffFiles: GitDiffFile[];
  commits: GitCommit[];
}
