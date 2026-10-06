import { execSync } from "child_process";

export interface GitDiffHunk {
  file: string;
  addedLines: number[];
}

export class GitAnalyzer {
  static getDiffChangedFiles(against: string = "HEAD", rootPath: string = "."): string[] {
    try {
      const output = execSync(`git diff --name-only ${against}`, { cwd: rootPath, encoding: "utf-8" });
      return output
        .split("\n")
        .map((f) => f.trim())
        .filter((f) => f.length > 0);
    } catch {
      return [];
    }
  }
}
