import { DependencyEngine } from "../../../src/engines/dependency-engine.js";

describe("DependencyEngine", () => {
  it("initializes dependency engine with proper name and dimension", () => {
    const engine = new DependencyEngine();
    expect(engine.name).toBe("Dependency Health");
    expect(engine.dimension).toBe("dependencies");
  });

  it("handles missing package.json gracefully without throwing", async () => {
    const engine = new DependencyEngine();
    const findings = await engine.analyze([], "/non_existent_dir_123");
    expect(findings).toBeDefined();
    expect(Array.isArray(findings)).toBe(true);
  });
});
