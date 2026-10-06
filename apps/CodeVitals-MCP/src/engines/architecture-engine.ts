import { BaseEngine } from "./base-engine.js";
import { Finding } from "../types/findings.js";
import { ParsedFile } from "../analyzers/ast-analyzer.js";
import { ImportParser } from "../analyzers/import-parser.js";
import { DependencyGraph } from "../analyzers/dependency-graph.js";
import { LayerAnalyzer } from "../analyzers/layer-analyzer.js";

export class ArchitectureEngine extends BaseEngine {
  name = "Architecture Checker";
  dimension: "architecture" = "architecture";

  async analyze(files: ParsedFile[], rootPath: string): Promise<Finding[]> {
    const findings: Finding[] = [];
    const graph = new DependencyGraph();

    // 1. Build Dependency Graph
    for (const file of files) {
      graph.addNode(file.relativePath);
      const imports = ImportParser.extractImports(file);

      for (const imp of imports) {
        if (imp.isRelative && imp.resolvedPath) {
          const targetFile = files.find(
            (f) => f.filePath === imp.resolvedPath || f.filePath.startsWith(imp.resolvedPath!)
          );
          if (targetFile) {
            graph.addEdge(file.relativePath, targetFile.relativePath);

            // Layer violation check
            if (LayerAnalyzer.isLayerViolation(file.relativePath, targetFile.relativePath)) {
              findings.push(
                this.createFinding({
                  id: `arch-layer-violation-${file.relativePath}-${targetFile.relativePath}`,
                  severity: "medium",
                  category: "bad_layering",
                  file: file.relativePath,
                  line: 1,
                  column: 1,
                  message: `Architectural layer violation: '${file.relativePath}' direct dependency on '${targetFile.relativePath}'`,
                  confidence: 0.8,
                })
              );
            }
          }
        }

        // Deep import check
        if (imp.specifier.startsWith("../../../")) {
          findings.push(
            this.createFinding({
              id: `arch-deep-import-${file.relativePath}-${imp.specifier}`,
              severity: "low",
              category: "deep_import",
              file: file.relativePath,
              line: 1,
              column: 1,
              message: `Deep relative import path '${imp.specifier}'. Consider path aliases.`,
              confidence: 0.9,
            })
          );
        }
      }

      // Check module size
      if (file.loc > 1000) {
        findings.push(
          this.createFinding({
            id: `arch-module-size-${file.relativePath}`,
            severity: "medium",
            category: "module_size",
            file: file.relativePath,
            line: 1,
            column: 1,
            message: `Oversized module file (${file.loc} LOC > 1000 LOC threshold). Consider splitting module into smaller components.`,
            confidence: 0.95,
          })
        );
      }
    }

    // 2. Check Circular Dependencies
    const cycles = graph.findCycles();
    for (const cycle of cycles) {
      const cycleStr = cycle.path.join(" -> ");
      findings.push(
        this.createFinding({
          id: `arch-circular-${cycle.path[0]}`,
          severity: "high",
          category: "circular_dependency",
          file: cycle.path[0],
          line: 1,
          column: 1,
          message: `Circular dependency detected: ${cycleStr}`,
          confidence: 0.99,
        })
      );
    }

    // 3. Check Excessive Coupling
    for (const node of graph.getAllNodes()) {
      const metrics = graph.getMetrics(node);
      if (metrics.fanOut > 12) {
        findings.push(
          this.createFinding({
            id: `arch-coupling-${node}`,
            severity: "medium",
            category: "excessive_coupling",
            file: node,
            line: 1,
            column: 1,
            message: `High efferent coupling (${metrics.fanOut} outgoing dependencies > threshold 12)`,
            confidence: 0.85,
          })
        );
      }
    }

    return findings;
  }
}
