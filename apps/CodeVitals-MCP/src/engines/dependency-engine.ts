import semver from "semver";
import { BaseEngine } from "./base-engine.js";
import { Finding } from "../types/findings.js";
import { ParsedFile } from "../analyzers/ast-analyzer.js";
import { PackageParser } from "../analyzers/package-parser.js";
import { NpmRegistryClient } from "../analyzers/npm-registry.js";
import { VulnerabilityDB } from "../analyzers/vulnerability-db.js";

export class DependencyEngine extends BaseEngine {
  name = "Dependency Health";
  dimension: "dependencies" = "dependencies";

  private registry = new NpmRegistryClient();
  private vulnDb = new VulnerabilityDB();

  async analyze(files: ParsedFile[], rootPath: string): Promise<Finding[]> {
    const findings: Finding[] = [];
    const parsedDeps = PackageParser.parseAllEcosystemDependencies(rootPath);

    if (Object.keys(parsedDeps.dependencies).length === 0) {
      return findings;
    }

    const manifestFile =
      parsedDeps.ecosystem === "pip"
        ? "requirements.txt"
        : parsedDeps.ecosystem === "gomod"
        ? "go.mod"
        : parsedDeps.ecosystem === "cargo"
        ? "Cargo.toml"
        : "package.json";

    for (const [pkgName, versionRange] of Object.entries(parsedDeps.dependencies)) {
      const cleanVer = versionRange.replace(/[\^~=><]/g, "").trim();

      // 1. Check vulnerabilities
      const vuln = this.vulnDb.checkVulnerability(pkgName, cleanVer);
      if (vuln) {
        findings.push(
          this.createFinding({
            id: `dep-vuln-${pkgName}`,
            severity: vuln.severity,
            category: "vulnerable_dependency",
            file: manifestFile,
            line: 1,
            column: 1,
            message: `Dependency '${pkgName}@${versionRange}' has known vulnerability: ${vuln.title} (${vuln.cve || "Advisory"})`,
            symbol: pkgName,
            replacement: `Upgrade ${pkgName} to non-vulnerable version`,
            autofixAvailable: true,
            confidence: 0.95,
          })
        );
      }

      // 2. Check outdated & abandoned
      const meta = await this.registry.getPackageInfo(pkgName);
      if (meta) {
        if (meta.isAbandoned) {
          findings.push(
            this.createFinding({
              id: `dep-abandoned-${pkgName}`,
              severity: "high",
              category: "abandoned_dependency",
              file: manifestFile,
              line: 1,
              column: 1,
              message: `Dependency '${pkgName}' is unmaintained/abandoned.`,
              symbol: pkgName,
              confidence: 0.85,
            })
          );
        }

        if (meta.latestVersion && semver.valid(cleanVer) && semver.gt(meta.latestVersion, cleanVer)) {
          const isMajor = semver.major(meta.latestVersion) > semver.major(cleanVer);
          findings.push(
            this.createFinding({
              id: `dep-outdated-${pkgName}`,
              severity: isMajor ? "medium" : "low",
              category: "outdated_dependency",
              file: manifestFile,
              line: 1,
              column: 1,
              message: `Dependency '${pkgName}' is outdated (${cleanVer} vs latest ${meta.latestVersion})`,
              symbol: pkgName,
              replacement: `"${pkgName}": "^${meta.latestVersion}"`,
              autofixAvailable: true,
              confidence: 0.9,
            })
          );
        }
      }
    }

    return findings;
  }
}
