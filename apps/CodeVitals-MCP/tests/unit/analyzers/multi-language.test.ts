import { ASTAnalyzer } from "../../../src/analyzers/ast-analyzer.js";
import { BugCheckerEngine } from "../../../src/engines/bug-checker.js";
import { SecurityEngine } from "../../../src/engines/security-engine.js";

describe("Multi-Language Support", () => {
  let analyzer: ASTAnalyzer;

  beforeEach(() => {
    analyzer = new ASTAnalyzer();
  });

  it("detects Python functions, classes, and bare except bugs", async () => {
    const pyCode = `
def process_data(item):
    try:
        val = item.data
    except:
        pass

class DataHandler:
    def save(self):
        pass
    `;
    const parsed = {
      filePath: "app.py",
      relativePath: "app.py",
      language: "python",
      content: pyCode,
      loc: pyCode.split("\n").filter((l) => l.trim().length > 0).length,
      functionsCount: 2,
      classesCount: 1,
      importsCount: 0,
    };

    const bugEngine = new BugCheckerEngine();
    const findings = await bugEngine.analyze([parsed], "./");

    expect(findings.some((f) => f.category === "error_handling")).toBe(true);
  });

  it("detects Python unsafe pickle deserialization security threat", async () => {
    const pyCode = `
import pickle
data = pickle.loads(user_input)
    `;
    const parsed = {
      filePath: "service.py",
      relativePath: "service.py",
      language: "python",
      content: pyCode,
      loc: 3,
      functionsCount: 0,
      classesCount: 0,
      importsCount: 1,
    };

    const secEngine = new SecurityEngine();
    const findings = await secEngine.analyze([parsed], "./");

    expect(findings.some((f) => f.category === "unsafe_deserialization")).toBe(true);
  });

  it("detects Go command execution security threat", async () => {
    const goCode = `
package main
import "os/exec"
func main() {
    exec.Command("sh", "-c", userInput)
}
    `;
    const parsed = {
      filePath: "main.go",
      relativePath: "main.go",
      language: "go",
      content: goCode,
      loc: 6,
      functionsCount: 1,
      classesCount: 0,
      importsCount: 1,
    };

    const secEngine = new SecurityEngine();
    const findings = await secEngine.analyze([parsed], "./");

    expect(findings.some((f) => f.category === "command_injection")).toBe(true);
  });

  it("detects C/C++ unsafe gets function call", async () => {
    const cCode = `
#include <stdio.h>
int main() {
    char buf[100];
    gets(buf);
    return 0;
}
    `;
    const parsed = {
      filePath: "main.c",
      relativePath: "main.c",
      language: "c",
      content: cCode,
      loc: 6,
      functionsCount: 1,
      classesCount: 0,
      importsCount: 1,
    };

    const bugEngine = new BugCheckerEngine();
    const findings = await bugEngine.analyze([parsed], "./");

    expect(findings.some((f) => f.category === "logic_error")).toBe(true);
  });
});
