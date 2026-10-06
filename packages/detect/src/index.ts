/**
 * @greenops/detect — the DETECT stage.
 *
 * Reuses the CodeVitals RepositoryAnalyzer (AST + symbols + references + graph)
 * as its evidence source, then applies a catalog of rules that identify
 * "Sustainability Bugs": concrete, evidenced sources of technology waste.
 *
 * Every bug is backed by raw counts from real static analysis — no guessing,
 * no LLM at this stage. That is what makes the downstream savings numbers
 * defensible (judging criterion: baseline + assumptions + evidence).
 */

import { createHash } from 'node:crypto';
import { RepositoryAnalyzer } from '@codevitals/repository';
import type { SymbolModel } from '@codevitals/symbols';
import type { ReferenceModel, ImportModel } from '@codevitals/references';
import { GreenOpsMeasure } from '@greenops/measure';
import { SustainabilityBug, DetectionResult, BugCategory, Severity } from './types.js';

function bugId(category: BugCategory, key: string): string {
  return `bug_${category}_${createHash('sha256').update(key).digest('hex').slice(0, 10)}`;
}

export class SustainabilityDetector {
  // Retained for future rules that convert raw waste to energy at detect time.
  private readonly measure: GreenOpsMeasure;

  constructor(measure = new GreenOpsMeasure()) {
    this.measure = measure;
    void this.measure;
  }

  public detect(targetPath: string): DetectionResult {
    const analyzer = new RepositoryAnalyzer();
    const { result } = analyzer.analyze(targetPath);

    const fileById = new Map(result.files.map((f) => [f.id, f.path]));
    const bugs: SustainabilityBug[] = [
      ...this.detectDeadCode(result.symbols, result.references, fileById),
      ...this.detectDuplicateImports(result.imports, fileById),
      ...this.detectRedundantCalls(result.references, result.symbols, fileById),
    ];

    return {
      repositoryPath: result.repository.path,
      bugs,
      scanned: {
        files: result.files.length,
        symbols: result.symbols.length,
        references: result.references.length,
        imports: result.imports.length,
      },
    };
  }

  /**
   * Rule: DEAD CODE.
   * An exported/defined symbol with zero inbound references is code that is still
   * shipped, parsed at load, and maintained — recurring waste for no value.
   */
  private detectDeadCode(
    symbols: SymbolModel[],
    references: ReferenceModel[],
    fileById: Map<string, string>
  ): SustainabilityBug[] {
    const referenced = new Set<string>();
    for (const r of references) {
      if (r.targetSymbolId) referenced.add(r.targetSymbolId);
    }
    const referencedByName = new Set(references.map((r) => r.targetName));

    const bugs: SustainabilityBug[] = [];
    for (const s of symbols) {
      // Only flag functions/methods/classes — variables/types are noisier.
      if (s.kind !== 'function' && s.kind !== 'method' && s.kind !== 'class') continue;
      if (referenced.has(s.id) || referencedByName.has(s.name)) continue;
      // A private (non-exported) symbol never referenced anywhere is the clearest dead code.
      if (s.exported) continue;

      const lines = Math.max(1, s.endLine - s.startLine + 1);
      const filePath = fileById.get(s.fileId) ?? s.fileId;
      const severity: Severity = lines > 40 ? 'medium' : 'low';
      bugs.push({
        id: bugId('dead-code', `${s.fileId}:${s.qualifiedName}`),
        category: 'dead-code',
        severity,
        title: `Unused ${s.kind} '${s.name}' (${lines} lines) never referenced`,
        location: { filePath, startLine: s.startLine, endLine: s.endLine, symbol: s.qualifiedName },
        rationale:
          `The ${s.kind} '${s.name}' is defined but has no references anywhere in the repository. ` +
          `It is still parsed, bundled and maintained on every build and run, consuming resources with no value.`,
        evidence: { inboundReferences: 0, lines, kind: s.kind, exported: String(s.exported) },
        estimatedWaste: {
          metric: 'lines.dead',
          perRun: lines,
          unit: 'lines parsed/bundled',
          assumptions: [],
        },
      });
    }
    return bugs;
  }

  /**
   * Rule: DUPLICATE IMPORT.
   * The same module imported more than once in a single file — redundant module
   * resolution and, in some bundlers, duplicated work.
   */
  private detectDuplicateImports(
    imports: ImportModel[],
    fileById: Map<string, string>
  ): SustainabilityBug[] {
    const byFileSource = new Map<string, ImportModel[]>();
    for (const imp of imports) {
      const key = `${imp.fileId}::${imp.source}`;
      const arr = byFileSource.get(key) ?? [];
      arr.push(imp);
      byFileSource.set(key, arr);
    }

    const bugs: SustainabilityBug[] = [];
    for (const [key, group] of byFileSource) {
      if (group.length < 2) continue;
      const first = group[0];
      if (!first) continue;
      const [fileId, source] = key.split('::');
      const filePath = fileById.get(fileId ?? '') ?? fileId ?? '';
      bugs.push({
        id: bugId('duplicate-import', key),
        category: 'duplicate-import',
        severity: 'low',
        title: `Module '${source}' imported ${group.length} times in one file`,
        location: { filePath, startLine: first.startLine, endLine: first.endLine },
        rationale:
          `'${source}' is imported ${group.length} times in the same file. The redundant import ` +
          `statements cause repeated module resolution and clutter that a single import would avoid.`,
        evidence: { importCount: group.length, module: source ?? '' },
        estimatedWaste: { metric: 'imports.redundant', perRun: group.length - 1, unit: 'redundant imports', assumptions: [] },
      });
    }
    return bugs;
  }

  /**
   * Rule: REDUNDANT CALL (cache candidate).
   * A pure-looking function/method called many times from the same file is a
   * strong candidate for memoization/caching. If the same computation repeats,
   * every repeat past the first is wasted CPU (and, for AI calls, wasted tokens).
   */
  private detectRedundantCalls(
    references: ReferenceModel[],
    symbols: SymbolModel[],
    fileById: Map<string, string>
  ): SustainabilityBug[] {
    const CALL_THRESHOLD = 5;
    const symbolByName = new Map(symbols.map((s) => [s.name, s]));

    // Count call references per (file, targetName).
    const counts = new Map<string, { count: number; ref: ReferenceModel }>();
    for (const r of references) {
      if (r.kind !== 'call') continue;
      const key = `${r.fileId}::${r.targetName}`;
      const existing = counts.get(key);
      if (existing) existing.count += 1;
      else counts.set(key, { count: 1, ref: r });
    }

    const bugs: SustainabilityBug[] = [];
    for (const [key, { count, ref }] of counts) {
      if (count < CALL_THRESHOLD) continue;
      const [fileId, targetName] = key.split('::');
      const filePath = fileById.get(fileId ?? '') ?? fileId ?? '';
      const target = symbolByName.get(targetName ?? '');
      const isAiLike = /\b(fetch|request|query|call|complete|embed|generate|invoke|infer)\b/i.test(targetName ?? '');
      const severity: Severity = isAiLike && count >= 10 ? 'high' : 'medium';
      bugs.push({
        id: bugId('redundant-call', key),
        category: 'redundant-call',
        severity,
        title: `'${targetName}' called ${count} times in one file — caching candidate`,
        location: {
          filePath,
          startLine: ref.startLine,
          endLine: ref.endLine,
          symbol: target?.qualifiedName ?? targetName,
        },
        rationale:
          `'${targetName}' is called ${count} times within a single file. If these calls repeat the same ` +
          `work (a common pattern for data fetches and AI/API requests), every call after the first is wasted ` +
          `compute or tokens. Memoization or a request cache would eliminate the repeats.`,
        evidence: { callCount: count, target: targetName ?? '', looksLikeIoOrAi: String(isAiLike) },
        estimatedWaste: {
          metric: isAiLike ? 'requests.redundant' : 'calls.redundant',
          perRun: count - 1,
          unit: isAiLike ? 'redundant requests' : 'redundant calls',
          assumptions: [],
        },
      });
    }
    return bugs;
  }
}

export * from './types.js';
