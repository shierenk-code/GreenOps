import ts from "typescript";

export class InjectionDetector {
  static isUnsafeInnerHTML(node: ts.PropertyAccessExpression): boolean {
    return node.name.text === "innerHTML";
  }

  static isEvalCall(node: ts.CallExpression, sourceFile: ts.SourceFile): boolean {
    return node.expression.getText(sourceFile) === "eval";
  }
}
