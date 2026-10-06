import { DependencyGraph, GraphTraversal, GraphNode } from '@codevitals/graph';
import { ChangedSymbol, BlastRadiusResult } from './types.js';
import { dirname } from 'node:path';

export class BlastRadiusEngine {
  public computeBlastRadius(
    changedSymbols: ChangedSymbol[],
    graph: DependencyGraph,
  ): BlastRadiusResult {
    const traversal = new GraphTraversal(graph);

    const affectedCallersMap: Map<string, GraphNode> = new Map();
    const affectedCalleesMap: Map<string, GraphNode> = new Map();
    const affectedTestsMap: Map<string, GraphNode> = new Map();
    const affectedModulesSet: Set<string> = new Set();
    const dependencyImpactSet: Set<string> = new Set();
    const changedIds = new Set(
      changedSymbols.map((symbol) => symbol.symbolId).filter((id): id is string => Boolean(id)),
    );
    const changedNames = new Set(changedSymbols.map((symbol) => symbol.name));

    for (const sym of changedSymbols) {
      const queryName = sym.symbolId || sym.qualifiedName || sym.name;

      // 1. Transitive callers
      const callers = traversal.findTransitiveCallers(queryName);
      for (const caller of callers) {
        if (!changedIds.has(caller.id) && !changedNames.has(caller.name)) {
          affectedCallersMap.set(caller.id, caller);
        }
      }

      // 2. Direct callees
      const callees = traversal.findCallees(queryName);
      for (const callee of callees) {
        affectedCalleesMap.set(callee.id, callee);
      }

      // 3. Affected tests
      const tests = traversal.findAffectedTests(queryName);
      for (const test of tests) {
        affectedTestsMap.set(test.id, test);
      }

      // 4. Affected modules
      const modDir = dirname(sym.filePath);
      if (modDir && modDir !== '.') {
        affectedModulesSet.add(modDir);
      }

      // 5. Dependency impact
      const dependencies = traversal.findDependencies(sym.filePath);
      for (const dep of dependencies) {
        dependencyImpactSet.add(dep.name);
      }
    }

    const affectedCallers = Array.from(affectedCallersMap.values());
    const affectedCallees = Array.from(affectedCalleesMap.values());
    const affectedTests = Array.from(affectedTestsMap.values());
    const affectedModules = Array.from(affectedModulesSet);
    const dependencyImpact = Array.from(dependencyImpactSet);

    const totalImpactedNodesCount =
      affectedCallers.length + affectedCallees.length + affectedTests.length;

    return {
      affectedCallers,
      affectedCallees,
      affectedTests,
      affectedModules,
      dependencyImpact,
      totalImpactedNodesCount,
    };
  }
}
