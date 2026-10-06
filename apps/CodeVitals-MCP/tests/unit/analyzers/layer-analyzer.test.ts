import { LayerAnalyzer } from "../../../src/analyzers/layer-analyzer.js";

describe("LayerAnalyzer", () => {
  it("infers architectural layers from file paths", () => {
    expect(LayerAnalyzer.getLayer("src/components/Button.tsx")).toBe("presentation");
    expect(LayerAnalyzer.getLayer("src/services/UserService.ts")).toBe("business");
    expect(LayerAnalyzer.getLayer("src/database/UserRepo.ts")).toBe("data");
    expect(LayerAnalyzer.getLayer("src/utils/logger.ts")).toBe("utils");
  });

  it("detects cross-layer architectural violations", () => {
    // Presentation calling data directly is a violation
    expect(LayerAnalyzer.isLayerViolation("src/components/Button.tsx", "src/database/UserRepo.ts")).toBe(true);

    // Data calling presentation is a violation
    expect(LayerAnalyzer.isLayerViolation("src/database/UserRepo.ts", "src/components/Button.tsx")).toBe(true);

    // Presentation calling business layer is NOT a violation
    expect(LayerAnalyzer.isLayerViolation("src/components/Button.tsx", "src/services/UserService.ts")).toBe(false);
  });
});
