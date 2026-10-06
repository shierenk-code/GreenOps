import ts from "typescript";
import path from "path";
import { ParsedFile } from "./ast-analyzer.js";

export interface ImportedModule {
  specifier: string;
  resolvedPath?: string;
  isRelative: boolean;
}

export class ImportParser {
  static extractImports(file: ParsedFile): ImportedModule[] {
    const imports: ImportedModule[] = [];

    if (file.sourceFile && ["typescript", "javascript"].includes(file.language)) {
      const visit = (node: ts.Node) => {
        if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
          const specifier = node.moduleSpecifier.text;
          const isRelative = specifier.startsWith(".");
          let resolvedPath: string | undefined;

          if (isRelative) {
            resolvedPath = path.resolve(path.dirname(file.filePath), specifier);
          }

          imports.push({ specifier, resolvedPath, isRelative });
        }
        ts.forEachChild(node, visit);
      };

      visit(file.sourceFile);
      return imports;
    }

    // Multi-language import parser regex
    const lines = file.content.split("\n");
    for (const line of lines) {
      const trimmed = line.trim();

      // Python imports: import foo / from .foo import bar
      if (file.language === "python") {
        const pyMatch = trimmed.match(/^(?:from|import)\s+(\.?\.?[\w\.]+)/);
        if (pyMatch) {
          const spec = pyMatch[1];
          const isRel = spec.startsWith(".");
          imports.push({
            specifier: spec,
            isRelative: isRel,
            resolvedPath: isRel ? path.resolve(path.dirname(file.filePath), spec.replace(/^\.+/, "")) : undefined,
          });
        }
      }

      // Go imports: import "foo/bar" or import "./local"
      if (file.language === "go") {
        const goMatch = trimmed.match(/^import\s+["']([^"']+)["']/);
        if (goMatch) {
          const spec = goMatch[1];
          const isRel = spec.startsWith(".");
          imports.push({ specifier: spec, isRelative: isRel });
        }
      }

      // C / C++ includes: #include "myheader.h"
      if (["c", "cpp"].includes(file.language)) {
        const cMatch = trimmed.match(/^#include\s+["']([^"']+)["']/);
        if (cMatch) {
          const spec = cMatch[1];
          imports.push({
            specifier: spec,
            isRelative: true,
            resolvedPath: path.resolve(path.dirname(file.filePath), spec),
          });
        }
      }

      // Java / Kotlin / C# / Ruby / PHP
      if (["java", "csharp", "kotlin", "ruby", "php"].includes(file.language)) {
        const genMatch = trimmed.match(/^(?:import|using|require_relative|require|use)\s+['"]?([A-Za-z0-9_\-\.\/]+)/);
        if (genMatch) {
          const spec = genMatch[1];
          const isRel = spec.startsWith(".") || spec.includes("/");
          imports.push({ specifier: spec, isRelative: isRel });
        }
      }
    }

    return imports;
  }
}
