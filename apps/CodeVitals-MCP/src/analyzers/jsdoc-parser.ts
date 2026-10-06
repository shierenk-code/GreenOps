import ts from "typescript";

export interface JSDocDeprecation {
  isDeprecated: boolean;
  message?: string;
}

export class JSDocParser {
  static checkDeprecation(node: ts.Node): JSDocDeprecation {
    const jsDocTags = ts.getJSDocTags(node);
    for (const tag of jsDocTags) {
      if (tag.tagName.text === "deprecated") {
        const comment = typeof tag.comment === "string" ? tag.comment : tag.comment?.map((c) => c.text).join("");
        return {
          isDeprecated: true,
          message: comment || "Symbol is marked as @deprecated.",
        };
      }
    }
    return { isDeprecated: false };
  }
}
