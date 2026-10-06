import fs from "fs";
import path from "path";
import { glob } from "glob";
import { DEFAULT_CODEVITALS_CONFIG, DEFAULT_SERVER_CONFIG } from "../config/defaults.js";

export interface FileEntry {
  path: string;
  relativePath: string;
  size: number;
  content?: string;
}

export class FileSystem {
  static async collectFiles(
    targetPath: string,
    excludePatterns: string[] = DEFAULT_CODEVITALS_CONFIG.excludePatterns,
    maxFileSize: number = DEFAULT_SERVER_CONFIG.maxFileSizeBytes
  ): Promise<FileEntry[]> {
    let absolutePath = path.resolve(targetPath);
    if (!fs.existsSync(absolutePath)) {
      // Fallback to process.cwd() if non-existent virtual path like /home/claude was passed
      const cwdPath = process.cwd();
      if (fs.existsSync(cwdPath)) {
        absolutePath = cwdPath;
      } else {
        throw new Error(`Target path does not exist: ${targetPath}`);
      }
    }

    const stat = fs.statSync(absolutePath);
    if (stat.isFile()) {
      if (stat.size > maxFileSize) {
        return [];
      }
      return [
        {
          path: absolutePath,
          relativePath: path.basename(absolutePath),
          size: stat.size,
        },
      ];
    }

    const files = await glob("**/*.{ts,js,tsx,jsx,py,go,rs,java,c,cpp,h,hpp,cs,rb,php,kt,swift,sh,bash,yaml,yml,json,html,css,sql,mjs,cjs,toml,env}", {
      cwd: absolutePath,
      ignore: excludePatterns,
      nodir: true,
      absolute: true,
    });

    const entries: FileEntry[] = [];
    for (const filePath of files) {
      try {
        const fileStat = fs.statSync(filePath);
        if (fileStat.size <= maxFileSize) {
          entries.push({
            path: filePath,
            relativePath: path.relative(absolutePath, filePath),
            size: fileStat.size,
          });
        }
      } catch {
        // Ignore unreadable files
      }
    }

    return entries;
  }

  static readFileContent(filePath: string): string | null {
    try {
      return fs.readFileSync(filePath, "utf-8");
    } catch {
      return null;
    }
  }

  static isBinaryFile(filePath: string): boolean {
    const ext = path.extname(filePath).toLowerCase();
    const binaryExts = [".png", ".jpg", ".jpeg", ".gif", ".pdf", ".zip", ".tar", ".gz", ".exe", ".dll", ".so", ".dylib", ".ico"];
    return binaryExts.includes(ext);
  }
}
