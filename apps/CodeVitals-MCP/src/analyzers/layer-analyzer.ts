export class LayerAnalyzer {
  static getLayer(filePath: string): "presentation" | "business" | "data" | "utils" | "unknown" {
    const lower = filePath.toLowerCase();
    if (lower.includes("component") || lower.includes("view") || lower.includes("controller") || lower.includes("ui")) {
      return "presentation";
    }
    if (lower.includes("service") || lower.includes("engine") || lower.includes("domain") || lower.includes("usecase")) {
      return "business";
    }
    if (lower.includes("db") || lower.includes("repository") || lower.includes("model") || lower.includes("database")) {
      return "data";
    }
    if (lower.includes("util") || lower.includes("helper") || lower.includes("config")) {
      return "utils";
    }
    return "unknown";
  }

  static isLayerViolation(fromFile: string, toFile: string): boolean {
    const fromLayer = this.getLayer(fromFile);
    const toLayer = this.getLayer(toFile);

    // Violation: Presentation calling data directly without business logic layer
    if (fromLayer === "presentation" && toLayer === "data") {
      return true;
    }
    // Violation: Data calling presentation layer
    if (fromLayer === "data" && (toLayer === "presentation" || toLayer === "business")) {
      return true;
    }
    return false;
  }
}
