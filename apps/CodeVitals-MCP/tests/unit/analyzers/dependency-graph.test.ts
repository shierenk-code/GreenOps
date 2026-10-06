import { DependencyGraph } from "../../../src/analyzers/dependency-graph.js";

describe("DependencyGraph", () => {
  it("detects circular dependencies in directed module graph", () => {
    const graph = new DependencyGraph();

    // Cycle: A -> B -> C -> A
    graph.addEdge("A.ts", "B.ts");
    graph.addEdge("B.ts", "C.ts");
    graph.addEdge("C.ts", "A.ts");
    // Non-cycle node
    graph.addEdge("A.ts", "D.ts");

    const cycles = graph.findCycles();
    expect(cycles.length).toBeGreaterThan(0);
    expect(cycles[0].path).toContain("A.ts");
    expect(cycles[0].path).toContain("B.ts");
    expect(cycles[0].path).toContain("C.ts");
  });

  it("calculates fan-in, fan-out, and instability metrics", () => {
    const graph = new DependencyGraph();
    graph.addEdge("Controller.ts", "Service.ts");
    graph.addEdge("Controller.ts", "Logger.ts");
    graph.addEdge("Service.ts", "Logger.ts");

    const controllerMetrics = graph.getMetrics("Controller.ts");
    expect(controllerMetrics.fanOut).toBe(2);
    expect(controllerMetrics.fanIn).toBe(0);
    expect(controllerMetrics.instability).toBe(1.0);

    const loggerMetrics = graph.getMetrics("Logger.ts");
    expect(loggerMetrics.fanIn).toBe(2);
    expect(loggerMetrics.fanOut).toBe(0);
    expect(loggerMetrics.instability).toBe(0.0);
  });
});
