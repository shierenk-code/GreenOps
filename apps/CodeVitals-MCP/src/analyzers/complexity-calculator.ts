import ts from "typescript";

export interface FunctionComplexity {
  name: string;
  line: number;
  cyclomaticComplexity: number;
  cognitiveComplexity: number;
}

export class ComplexityCalculator {
  static calculateFunctionComplexity(node: ts.FunctionDeclaration | ts.MethodDeclaration | ts.ArrowFunction, sourceFile: ts.SourceFile): FunctionComplexity {
    let cyclomatic = 1;
    let cognitive = 0;

    const countDecisionPoints = (n: ts.Node, depth: number) => {
      if (
        ts.isIfStatement(n) ||
        ts.isForStatement(n) ||
        ts.isForInStatement(n) ||
        ts.isForOfStatement(n) ||
        ts.isWhileStatement(n) ||
        ts.isDoStatement(n) ||
        ts.isCaseClause(n) ||
        ts.isConditionalExpression(n)
      ) {
        cyclomatic++;
        cognitive += 1 + depth;
      }
      if (ts.isBinaryExpression(n)) {
        if (
          n.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken ||
          n.operatorToken.kind === ts.SyntaxKind.BarBarToken
        ) {
          cyclomatic++;
          cognitive += 1;
        }
      }
      ts.forEachChild(n, (child) => countDecisionPoints(child, depth + (ts.isIfStatement(n) ? 1 : 0)));
    };

    if (node.body) {
      countDecisionPoints(node.body, 0);
    }

    const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart());
    const name = ts.isFunctionDeclaration(node) && node.name ? node.name.text : "anonymous";

    return {
      name,
      line: line + 1,
      cyclomaticComplexity: cyclomatic,
      cognitiveComplexity: cognitive,
    };
  }
}
