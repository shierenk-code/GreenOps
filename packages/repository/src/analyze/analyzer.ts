import { readFileSync } from 'node:fs';
import { resolve, extname } from 'node:path';
import { RepositoryScanner } from '../scanner.js';
import { EngineParser, LanguageRegistry, ParserCache } from '@codevitals/parser';
import { SymbolExtractor } from '@codevitals/symbols';
import { ImportExtractor, ExportExtractor, ReferenceExtractor } from '@codevitals/references';
import { DependencyGraph, GraphTraversal, createGraphNode, createGraphEdge } from '@codevitals/graph';
import { Logger } from '@codevitals/logger';
import { AnalysisResult, AnalysisStatistics } from './types.js';

export interface RepositoryAnalyzerOptions {
  logger?: Logger;
  parserCache?: ParserCache;
}

export class RepositoryAnalyzer {
  private scanner: RepositoryScanner;
  private parser: EngineParser;
  private symbolExtractor: SymbolExtractor;
  private importExtractor: ImportExtractor;
  private exportExtractor: ExportExtractor;
  private referenceExtractor: ReferenceExtractor;
  private logger: Logger;

  constructor(options?: RepositoryAnalyzerOptions) {
    this.logger = options?.logger || new Logger({ level: 'info' });
    this.scanner = new RepositoryScanner({ logger: this.logger });
    this.parser = new EngineParser(new LanguageRegistry(), options?.parserCache);
    this.symbolExtractor = new SymbolExtractor();
    this.importExtractor = new ImportExtractor();
    this.exportExtractor = new ExportExtractor();
    this.referenceExtractor = new ReferenceExtractor();
  }

  public analyze(targetPath: string): { result: AnalysisResult; graph: DependencyGraph; traversal: GraphTraversal } {
    const rootPath = resolve(targetPath);
    const scanResult = this.scanner.scan(rootPath);
    const graph = new DependencyGraph();

    const resultFiles: AnalysisResult['files'] = [];
    const allSymbols: AnalysisResult['symbols'] = [];
    const allImports: AnalysisResult['imports'] = [];
    const allExports: AnalysisResult['exports'] = [];
    const allReferences: AnalysisResult['references'] = [];

    const stats: AnalysisStatistics = {
      files: { analyzed: 0, skipped: 0, failed: 0 },
      languages: {},
      symbols: {
        functions: 0,
        classes: 0,
        interfaces: 0,
        types: 0,
        methods: 0,
        enums: 0,
        variables: 0,
        constants: 0,
        constructors: 0,
        total: 0,
      },
      imports: { total: 0 },
      exports: { total: 0 },
      references: { total: 0 },
      ast: { parsed: 0, failed: 0, skipped: 0 },
      graph: { nodes: 0, edges: 0 },
    };

    // Add repository node to graph
    const repoNode = createGraphNode({ id: 'repo_root', name: rootPath, type: 'repository' });
    graph.addNode(repoNode);

    const registry = this.parser.getRegistry();

    for (const fileEntry of scanResult.fileList) {
      const filePath = fileEntry.relativePath || fileEntry.path;
      const ext = extname(filePath);
      const language = registry.getLanguageForExtension(ext);

      if (!language) {
        stats.files.skipped++;
        stats.ast.skipped++;
        resultFiles.push({
          id: filePath,
          path: filePath,
          language: ext.slice(1) || 'unknown',
          status: 'skipped',
          parseErrorCount: 0,
        });
        continue;
      }

      const langNameCapitalized = language.charAt(0).toUpperCase() + language.slice(1);
      stats.languages[langNameCapitalized] = (stats.languages[langNameCapitalized] || 0) + 1;

      const fullFilePath = resolve(rootPath, filePath);
      let content = '';
      try {
        content = readFileSync(fullFilePath, 'utf-8');
      } catch {
        stats.files.failed++;
        stats.ast.failed++;
        resultFiles.push({
          id: filePath,
          path: filePath,
          language,
          status: 'failed',
          parseErrorCount: 1,
        });
        continue;
      }

      const parseResult = this.parser.parse(content, language);

      if (!parseResult) {
        stats.files.failed++;
        stats.ast.failed++;
        resultFiles.push({
          id: filePath,
          path: filePath,
          language,
          status: 'failed',
          parseErrorCount: 1,
        });
        continue;
      }

      stats.files.analyzed++;
      if (parseResult.hasErrors) {
        stats.ast.failed++;
      } else {
        stats.ast.parsed++;
      }

      resultFiles.push({
        id: filePath,
        path: filePath,
        language,
        status: 'analyzed',
        parseErrorCount: parseResult.errors.length,
      });

      // Add file node to graph
      const fileNode = createGraphNode({ id: filePath, name: filePath, type: 'file' });
      graph.addNode(fileNode);
      graph.addEdge(createGraphEdge({ source: 'repo_root', target: filePath, type: 'contains' }));

      // Extract symbols
      const symbols = this.symbolExtractor.extractSymbols(parseResult.rootNode, filePath, rootPath);
      allSymbols.push(...symbols);

      for (const sym of symbols) {
        stats.symbols.total++;
        if (sym.kind === 'function') stats.symbols.functions++;
        else if (sym.kind === 'class') stats.symbols.classes++;
        else if (sym.kind === 'interface') stats.symbols.interfaces++;
        else if (sym.kind === 'type') stats.symbols.types++;
        else if (sym.kind === 'method') stats.symbols.methods++;
        else if (sym.kind === 'enum') stats.symbols.enums++;
        else if (sym.kind === 'variable') stats.symbols.variables++;
        else if (sym.kind === 'constant') stats.symbols.constants++;
        else if (sym.kind === 'constructor') stats.symbols.constructors++;

        const nodeType = (sym.kind === 'function' || sym.kind === 'method' || sym.kind === 'class' || sym.kind === 'interface' || sym.kind === 'type')
          ? sym.kind
          : 'function';

        const symNode = createGraphNode({
          id: sym.id,
          name: sym.name,
          type: nodeType,
          data: { qualifiedName: sym.qualifiedName, fileId: sym.fileId, kind: sym.kind },
        });
        graph.addNode(symNode);
        graph.addEdge(createGraphEdge({ source: filePath, target: sym.id, type: 'contains' }));

        if (sym.parentId) {
          graph.addEdge(createGraphEdge({ source: sym.parentId, target: sym.id, type: 'contains' }));
        }
      }

      // Extract imports
      const imports = this.importExtractor.extractImports(parseResult.rootNode, filePath);
      allImports.push(...imports);
      stats.imports.total += imports.length;

      for (const imp of imports) {
        graph.addEdge(createGraphEdge({ source: filePath, target: imp.source, type: 'imports' }));
      }

      // Extract exports
      const exports = this.exportExtractor.extractExports(parseResult.rootNode, filePath, symbols);
      allExports.push(...exports);
      stats.exports.total += exports.length;

      for (const exp of exports) {
        if (exp.symbolId) {
          graph.addEdge(createGraphEdge({ source: filePath, target: exp.symbolId, type: 'exports' }));
        }
      }

      // Extract references
      const references = this.referenceExtractor.extractReferences(parseResult.rootNode, filePath, symbols);
      allReferences.push(...references);
      stats.references.total += references.length;
    }

    // Connect references and call edges in graph
    for (const ref of allReferences) {
      const sourceId = ref.sourceSymbolId || ref.fileId;
      if (sourceId) {
        let targetNodes = graph.findNodesByName(ref.targetName);

        if (targetNodes.length === 0 && ref.targetName.includes('.')) {
          const propName = ref.targetName.split('.').pop()!;
          targetNodes = graph.findNodesByName(propName);
        }

        if (targetNodes.length === 0) {
          const extId = `ext_${ref.targetName}`;
          let extNode = graph.getNode(extId);
          if (!extNode) {
            extNode = createGraphNode({
              id: extId,
              name: ref.targetName,
              type: 'function',
              data: { qualifiedName: ref.targetName, external: true },
            });
            graph.addNode(extNode);
          }
          targetNodes = [extNode];
        }

        for (const targetNode of targetNodes) {
          if (targetNode.id !== sourceId) {
            graph.addEdge(
              createGraphEdge({
                source: sourceId,
                target: targetNode.id,
                type: ref.kind === 'call' ? 'calls' : 'references',
              })
            );
          }
        }
      }
    }

    stats.graph.nodes = graph.getNodeCount();
    stats.graph.edges = graph.getEdgeCount();

    const analysisResult: AnalysisResult = {
      repository: {
        path: rootPath,
      },
      files: resultFiles,
      symbols: allSymbols,
      imports: allImports,
      exports: allExports,
      references: allReferences,
      graph: {
        nodes: graph.getAllNodes(),
        edges: graph.getAllEdges(),
      },
      statistics: stats,
    };

    const traversal = new GraphTraversal(graph);

    return { result: analysisResult, graph, traversal };
  }
}
