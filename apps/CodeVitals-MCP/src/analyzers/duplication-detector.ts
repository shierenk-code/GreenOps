import { ParsedFile } from "./ast-analyzer.js";

export interface DuplicationBlock {
  file: string;
  startLine: number;
  endLine: number;
  lineCount: number;
}

export interface DuplicationMatch {
  block1: DuplicationBlock;
  block2: DuplicationBlock;
}

export class DuplicationDetector {
  static findExactDuplications(files: ParsedFile[], minLines: number = 10): DuplicationMatch[] {
    const matches: DuplicationMatch[] = [];
    const blockMap = new Map<string, DuplicationBlock>();

    for (const file of files) {
      const lines = file.content.split("\n").map((l) => l.trim());
      for (let i = 0; i <= lines.length - minLines; i++) {
        const chunk = lines.slice(i, i + minLines).join("\n");
        if (chunk.length < 50) continue; // Skip tiny whitespace blocks

        const block: DuplicationBlock = {
          file: file.relativePath,
          startLine: i + 1,
          endLine: i + minLines,
          lineCount: minLines,
        };

        if (blockMap.has(chunk)) {
          const existing = blockMap.get(chunk)!;
          if (existing.file !== block.file || existing.startLine !== block.startLine) {
            matches.push({ block1: existing, block2: block });
          }
        } else {
          blockMap.set(chunk, block);
        }
      }
    }

    return matches;
  }
}
