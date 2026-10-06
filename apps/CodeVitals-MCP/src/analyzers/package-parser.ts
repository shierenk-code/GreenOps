import fs from "fs";
import path from "path";

export interface ParsedDependencies {
  ecosystem: "npm" | "pip" | "gomod" | "cargo" | "composer" | "unknown";
  dependencies: Record<string, string>;
}

export interface ParsedPackageJson {
  name?: string;
  version?: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
}

export interface ParsedLockfile {
  type: "npm" | "yarn" | "pnpm" | "none";
  packages: Record<string, string>; // name -> version
}

export class PackageParser {
  static parsePackageJson(dirPath: string): ParsedPackageJson | null {
    const pPath = path.join(dirPath, "package.json");
    if (!fs.existsSync(pPath)) {
      return null;
    }
    try {
      const content = fs.readFileSync(pPath, "utf-8");
      return JSON.parse(content);
    } catch {
      return null;
    }
  }

  static parseAllEcosystemDependencies(dirPath: string): ParsedDependencies {
    // 1. Node.js (package.json)
    const pkg = this.parsePackageJson(dirPath);
    if (pkg) {
      return {
        ecosystem: "npm",
        dependencies: {
          ...(pkg.dependencies || {}),
          ...(pkg.devDependencies || {}),
        },
      };
    }

    // 2. Python (requirements.txt)
    const reqPath = path.join(dirPath, "requirements.txt");
    if (fs.existsSync(reqPath)) {
      const deps: Record<string, string> = {};
      try {
        const lines = fs.readFileSync(reqPath, "utf-8").split("\n");
        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed && !trimmed.startsWith("#")) {
            const match = trimmed.match(/^([A-Za-z0-9_\-\.]+)(?:[==~><]+([A-Za-z0-9_\-\.]+))?/);
            if (match) {
              deps[match[1]] = match[2] || "latest";
            }
          }
        }
        return { ecosystem: "pip", dependencies: deps };
      } catch {
        // Fallthrough
      }
    }

    // 3. Go (go.mod)
    const goModPath = path.join(dirPath, "go.mod");
    if (fs.existsSync(goModPath)) {
      const deps: Record<string, string> = {};
      try {
        const lines = fs.readFileSync(goModPath, "utf-8").split("\n");
        for (const line of lines) {
          const trimmed = line.trim();
          const match = trimmed.match(/^([A-Za-z0-9_\-\.\/]+)\s+(v[0-9\.]+)/);
          if (match) {
            deps[match[1]] = match[2];
          }
        }
        return { ecosystem: "gomod", dependencies: deps };
      } catch {
        // Fallthrough
      }
    }

    // 4. Rust (Cargo.toml)
    const cargoPath = path.join(dirPath, "Cargo.toml");
    if (fs.existsSync(cargoPath)) {
      const deps: Record<string, string> = {};
      try {
        const lines = fs.readFileSync(cargoPath, "utf-8").split("\n");
        let inDeps = false;
        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed.startsWith("[dependencies]")) {
            inDeps = true;
            continue;
          }
          if (trimmed.startsWith("[")) {
            inDeps = false;
          }
          if (inDeps) {
            const match = trimmed.match(/^([A-Za-z0-9_\-]+)\s*=\s*["']([^"']+)["']/);
            if (match) {
              deps[match[1]] = match[2];
            }
          }
        }
        return { ecosystem: "cargo", dependencies: deps };
      } catch {
        // Fallthrough
      }
    }

    return { ecosystem: "unknown", dependencies: {} };
  }

  static parseLockfile(dirPath: string): ParsedLockfile {
    const npmLock = path.join(dirPath, "package-lock.json");
    if (fs.existsSync(npmLock)) {
      try {
        const content = JSON.parse(fs.readFileSync(npmLock, "utf-8"));
        const packages: Record<string, string> = {};

        if (content.packages) {
          for (const [pkgPath, pkgObj] of Object.entries<any>(content.packages)) {
            if (pkgPath && pkgObj.version) {
              const cleanName = pkgPath.replace(/^node_modules\//, "");
              packages[cleanName] = pkgObj.version;
            }
          }
        }
        return { type: "npm", packages };
      } catch {
        return { type: "npm", packages: {} };
      }
    }

    return { type: "none", packages: {} };
  }
}
