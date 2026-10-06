import { GitDiffFile, GitDiffHunk, GitDiffLine } from './types.js';

export function parseUnifiedDiff(rawDiff: string): GitDiffFile[] {
  if (!rawDiff || !rawDiff.trim()) {
    return [];
  }

  const files: GitDiffFile[] = [];
  const lines = rawDiff.split(/\r?\n/);

  let currentFile: GitDiffFile | undefined = undefined;
  let currentHunk: GitDiffHunk | undefined = undefined;

  let oldLineCounter = 0;
  let newLineCounter = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line === undefined) continue;

    if (line.startsWith('diff --git')) {
      if (currentFile) {
        if (currentHunk) currentFile.hunks.push(currentHunk);
        files.push(currentFile);
      }

      const parts = line.split(' ');
      const rawPathA = (parts[2] || '').replace(/^a\//, '');
      const rawPathB = (parts[3] || '').replace(/^b\//, '');

      currentFile = {
        path: rawPathB || rawPathA,
        oldPath: rawPathA !== rawPathB ? rawPathA : undefined,
        status: 'modified',
        hunks: [],
        additions: 0,
        deletions: 0,
      };
      currentHunk = undefined;
      continue;
    }

    if (!currentFile) continue;

    if (line.startsWith('new file mode')) {
      currentFile.status = 'added';
    } else if (line.startsWith('deleted file mode')) {
      currentFile.status = 'deleted';
    } else if (line.startsWith('rename from')) {
      currentFile.status = 'renamed';
      currentFile.oldPath = line.replace('rename from ', '').trim();
    } else if (line.startsWith('rename to')) {
      currentFile.path = line.replace('rename to ', '').trim();
    } else if (line.startsWith('@@')) {
      if (currentHunk) {
        currentFile.hunks.push(currentHunk);
      }

      const match = line.match(/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/);
      if (match) {
        const oldStart = parseInt(match[1] || '1', 10);
        const oldLines = match[2] !== undefined ? parseInt(match[2], 10) : 1;
        const newStart = parseInt(match[3] || '1', 10);
        const newLines = match[4] !== undefined ? parseInt(match[4], 10) : 1;

        oldLineCounter = oldStart;
        newLineCounter = newStart;

        currentHunk = {
          oldStart,
          oldLines,
          newStart,
          newLines,
          header: line,
          lines: [],
        };
      }
    } else if (currentHunk) {
      if (line.startsWith('+') && !line.startsWith('+++')) {
        const diffLine: GitDiffLine = {
          type: 'add',
          newLine: newLineCounter++,
          content: line.slice(1),
        };
        currentHunk.lines.push(diffLine);
        currentFile.additions++;
      } else if (line.startsWith('-') && !line.startsWith('---')) {
        const diffLine: GitDiffLine = {
          type: 'delete',
          oldLine: oldLineCounter++,
          content: line.slice(1),
        };
        currentHunk.lines.push(diffLine);
        currentFile.deletions++;
      } else if (line.startsWith(' ') || line === '') {
        const diffLine: GitDiffLine = {
          type: 'context',
          oldLine: oldLineCounter++,
          newLine: newLineCounter++,
          content: line.startsWith(' ') ? line.slice(1) : line,
        };
        currentHunk.lines.push(diffLine);
      }
    }
  }

  if (currentFile) {
    if (currentHunk) currentFile.hunks.push(currentHunk);
    files.push(currentFile);
  }

  return files;
}
