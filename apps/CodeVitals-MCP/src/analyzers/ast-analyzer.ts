import ts from "typescript";
import { FileSystem } from "../utils/file-system.js";

export interface ParsedFile {
  filePath: string;
  relativePath: string;
  sourceFile?: ts.SourceFile;
  language: string;
  content: string;
  loc: number;
  functionsCount: number;
  classesCount: number;
  importsCount: number;
}

export interface ASTMetrics {
  totalFiles: number;
  totalLoc: number;
  totalFunctions: number;
  totalClasses: number;
  totalImports: number;
}

export class ASTAnalyzer {
  private parsedCache = new Map<string, ParsedFile>();

  detectLanguage(filePath: string): string {
    const ext = filePath.split(".").pop()?.toLowerCase() || "";
    switch (ext) {
      case "ts":
      case "tsx":
        return "typescript";
      case "js":
      case "jsx":
      case "mjs":
      case "cjs":
        return "javascript";
      case "py":
        return "python";
      case "go":
        return "go";
      case "rs":
        return "rust";
      case "java":
        return "java";
      case "c":
      case "h":
        return "c";
      case "cpp":
      case "hpp":
      case "cc":
        return "cpp";
      case "cs":
        return "csharp";
      case "rb":
        return "ruby";
      case "php":
        return "php";
      case "kt":
        return "kotlin";
      case "swift":
        return "swift";
      case "sh":
      case "bash":
        return "shell";
      case "sql":
        return "sql";
      case "yaml":
      case "yml":
        return "yaml";
      case "json":
        return "json";
      default:
        return "generic";
    }
  }

  parseFile(filePath: string, relativePath: string = filePath): ParsedFile | null {
    if (this.parsedCache.has(filePath)) {
      return this.parsedCache.get(filePath)!;
    }

    try {
      const content = FileSystem.readFileContent(filePath);
      if (content === null) {
        return null;
      }

      const language = this.detectLanguage(filePath);
      const lines = content.split("\n");
      const loc = lines.filter((l) => l.trim().length > 0).length;

      let functionsCount = 0;
      let classesCount = 0;
      let importsCount = 0;
      let sourceFile: ts.SourceFile | undefined;

      if (["typescript", "javascript"].includes(language)) {
        sourceFile = ts.createSourceFile(
          filePath,
          content,
          ts.ScriptTarget.Latest,
          true,
          filePath.endsWith(".tsx") || filePath.endsWith(".jsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS
        );

        const visit = (node: ts.Node) => {
          if (
            ts.isFunctionDeclaration(node) ||
            ts.isMethodDeclaration(node) ||
            ts.isArrowFunction(node) ||
            ts.isFunctionExpression(node)
          ) {
            functionsCount++;
          } else if (ts.isClassDeclaration(node)) {
            classesCount++;
          } else if (ts.isImportDeclaration(node)) {
            importsCount++;
          }
          ts.forEachChild(node, visit);
        };

        visit(sourceFile);
      } else {
        // Multi-language declaration regex parsers
        switch (language) {
          case "python":
            functionsCount = (content.match(/^\s*def\s+\w+/gm) || []).length;
            classesCount = (content.match(/^\s*class\s+\w+/gm) || []).length;
            importsCount = (content.match(/^\s*(from|import)\s+/gm) || []).length;
            break;
          case "go":
            functionsCount = (content.match(/^\s*func\s+/gm) || []).length;
            classesCount = (content.match(/^\s*type\s+\w+\s+struct/gm) || []).length;
            importsCount = (content.match(/^\s*import\s+/gm) || []).length;
            break;
          case "rust":
            functionsCount = (content.match(/^\s*(pub\s+)?fn\s+\w+/gm) || []).length;
            classesCount = (content.match(/^\s*(pub\s+)?(struct|enum|trait)\s+\w+/gm) || []).length;
            importsCount = (content.match(/^\s*use\s+/gm) || []).length;
            break;
          case "java":
          case "csharp":
          case "kotlin":
            functionsCount = (content.match(/\b(public|private|protected|static|override|fun|void|int|String)\s+\w+\s*\(/g) || []).length;
            classesCount = (content.match(/\b(class|interface|enum)\s+\w+/g) || []).length;
            importsCount = (content.match(/^\s*(import|using)\s+/gm) || []).length;
            break;
          case "c":
          case "cpp":
            functionsCount = (content.match(/^\w[\w\*\s]+\s+\w+\s*\([^;]*\)\s*\{/gm) || []).length;
            classesCount = (content.match(/\b(class|struct)\s+\w+/g) || []).length;
            importsCount = (content.match(/^\s*#include\s+/gm) || []).length;
            break;
          case "ruby":
            functionsCount = (content.match(/^\s*def\s+\w+/gm) || []).length;
            classesCount = (content.match(/^\s*class\s+\w+/gm) || []).length;
            importsCount = (content.match(/^\s*require(_relative)?\s+/gm) || []).length;
            break;
          case "php":
            functionsCount = (content.match(/\bfunction\s+\w+/g) || []).length;
            classesCount = (content.match(/\bclass\s+\w+/g) || []).length;
            importsCount = (content.match(/\b(use|require|include)(_once)?\s+/g) || []).length;
            break;
          default:
            break;
        }
      }

      const parsed: ParsedFile = {
        filePath,
        relativePath,
        sourceFile,
        language,
        content,
        loc,
        functionsCount,
        classesCount,
        importsCount,
      };

      this.parsedCache.set(filePath, parsed);
      return parsed;
    } catch {
      return null;
    }
  }

  getMetrics(files: ParsedFile[]): ASTMetrics {
    return {
      totalFiles: files.length,
      totalLoc: files.reduce((acc, f) => acc + f.loc, 0),
      totalFunctions: files.reduce((acc, f) => acc + f.functionsCount, 0),
      totalClasses: files.reduce((acc, f) => acc + f.classesCount, 0),
      totalImports: files.reduce((acc, f) => acc + f.importsCount, 0),
    };
  }

  traverse(sourceFile: ts.SourceFile, visitor: (node: ts.Node) => void): void {
    const walk = (node: ts.Node) => {
      visitor(node);
      ts.forEachChild(node, walk);
    };
    walk(sourceFile);
  }

  clearCache(): void {
    this.parsedCache.clear();
  }
}
