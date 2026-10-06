import { GitDiffFile, GitFileChange } from '@codevitals/git';
import { SymbolModel } from '@codevitals/symbols';
import { ChangedSymbol, SemanticDiffResult, ChangeType } from './types.js';

export class SemanticDiffEngine {
  public analyzeSemanticDiff(
    diffFiles: GitDiffFile[],
    symbols: SymbolModel[],
    fileChanges: GitFileChange[] = []
  ): SemanticDiffResult {
    const changedSymbols: ChangedSymbol[] = [];

    const fileMap = new Map<string, GitDiffFile>();
    for (const df of diffFiles) {
      fileMap.set(df.path, df);
    }

    let addedCount = 0;
    let removedCount = 0;
    let modifiedCount = 0;

    for (const sym of symbols) {
      const diffFile = fileMap.get(sym.fileId);
      if (!diffFile) continue;

      let isSymbolChanged = false;
      let symbolChangeType: ChangeType = 'modified';

      if (diffFile.status === 'added') {
        isSymbolChanged = true;
        symbolChangeType = 'added';
      } else if (diffFile.status === 'deleted') {
        isSymbolChanged = true;
        symbolChangeType = 'removed';
      } else {
        // Check if any diff hunk overlaps with [sym.startLine, sym.endLine]
        for (const hunk of diffFile.hunks) {
          for (const line of hunk.lines) {
            const lineNum = line.newLine ?? line.oldLine;
            if (lineNum !== undefined && lineNum >= sym.startLine && lineNum <= sym.endLine) {
              isSymbolChanged = true;
              break;
            }
          }
          if (isSymbolChanged) break;
        }
      }

      if (isSymbolChanged) {
        if (symbolChangeType === 'added') addedCount++;
        else if (symbolChangeType === 'removed') removedCount++;
        else modifiedCount++;

        changedSymbols.push({
          symbolId: sym.id,
          name: sym.name,
          qualifiedName: sym.qualifiedName,
          kind: sym.kind,
          filePath: sym.fileId,
          changeType: symbolChangeType,
          startLine: sym.startLine,
          endLine: sym.endLine,
          exported: sym.exported,
        });
      }
    }

    const changedFilesSummary = fileChanges.map((fc) => ({
      path: fc.path,
      oldPath: fc.oldPath,
      status: fc.status as ChangeType,
      additions: fc.additions,
      deletions: fc.deletions,
    }));

    return {
      changedFiles: changedFilesSummary,
      changedSymbols,
      addedSymbolsCount: addedCount,
      removedSymbolsCount: removedCount,
      modifiedSymbolsCount: modifiedCount,
    };
  }
}
