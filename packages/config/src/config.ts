import * as fs from 'node:fs';
import * as path from 'node:path';
import { ConfigurationError } from '@codevitals/errors';

export interface CodeVitalsConfig {
  ignorePatterns?: string[];
  maxFileSizeBytes?: number;
  customLanguages?: Record<string, string>;
  greenops?: GreenOpsConfig;
}

export interface GreenOpsConfig {
  enabled: boolean;
  local: { enabled: boolean };
  pullRequest: {
    enabled: boolean;
    checkRun: boolean;
    inlineComments: boolean;
    summaryComment: boolean;
  };
  fixes: { enabled: boolean; autoApply: boolean; requireApproval: boolean };
  thresholds: {
    minimumSeverity: 'low' | 'medium' | 'high';
    minimumConfidence: 'low' | 'medium' | 'high';
  };
  sustainability: { reportEnergy: boolean; reportCarbon: boolean };
}

export const DEFAULT_GREENOPS_CONFIG: GreenOpsConfig = {
  enabled: true,
  local: { enabled: true },
  pullRequest: { enabled: true, checkRun: true, inlineComments: true, summaryComment: true },
  fixes: { enabled: true, autoApply: false, requireApproval: true },
  thresholds: { minimumSeverity: 'low', minimumConfidence: 'medium' },
  sustainability: { reportEnergy: true, reportCarbon: true },
};

export const DEFAULT_CONFIG: CodeVitalsConfig = {
  ignorePatterns: [
    '.git/**',
    'node_modules/**',
    'dist/**',
    'build/**',
    'coverage/**',
    '.cache/**',
    '.next/**',
    '.turbo/**',
    '.tmp/**',
  ],
  maxFileSizeBytes: 10 * 1024 * 1024, // 10MB
  greenops: DEFAULT_GREENOPS_CONFIG,
};

export class ConfigLoader {
  public static loadEnv(repoPath: string = process.cwd()): void {
    const candidateDirs = new Set<string>();

    // 1. Direct paths
    candidateDirs.add(path.resolve(repoPath));
    candidateDirs.add(path.resolve(process.cwd()));
    if (process.env.INIT_CWD) candidateDirs.add(path.resolve(process.env.INIT_CWD));

    // 2. Walk upwards to find repository root .env
    let current = path.resolve(repoPath);
    for (let i = 0; i < 6; i++) {
      candidateDirs.add(current);
      const parent = path.dirname(current);
      if (parent === current) break;
      current = parent;
    }

    current = path.resolve(process.cwd());
    for (let i = 0; i < 6; i++) {
      candidateDirs.add(current);
      const parent = path.dirname(current);
      if (parent === current) break;
      current = parent;
    }

    for (const dir of candidateDirs) {
      for (const name of ['.env', '.env.local']) {
        const envPath = path.join(dir, name);
        if (fs.existsSync(envPath)) {
          try {
            const content = fs.readFileSync(envPath, 'utf-8');
            for (const line of content.split(/\r?\n/)) {
              const trimmed = line.trim();
              if (!trimmed || trimmed.startsWith('#')) continue;
              const eqIdx = trimmed.indexOf('=');
              if (eqIdx > 0) {
                const key = trimmed.slice(0, eqIdx).trim();
                let val = trimmed.slice(eqIdx + 1).trim();
                if (
                  (val.startsWith('"') && val.endsWith('"')) ||
                  (val.startsWith("'") && val.endsWith("'"))
                ) {
                  val = val.slice(1, -1);
                }
                if (process.env[key] === undefined) {
                  // If private key path is relative, resolve against the directory where .env was found
                  if (key === 'GITHUB_APP_PRIVATE_KEY_PATH' && !path.isAbsolute(val)) {
                    val = path.resolve(dir, val);
                  }
                  process.env[key] = val;
                }
              }
            }
          } catch {
            // ignore read errors
          }
        }
      }
    }
  }

  public static load(repoPath: string): CodeVitalsConfig {
    ConfigLoader.loadEnv(repoPath);

    // Prefer the project name, while keeping existing checkouts compatible.
    const targetFile = ['.greenopsrc', '.greenopsrc.json', '.codevitalsrc', '.codevitalsrc.json']
      .map((name) => path.join(repoPath, name))
      .find((candidate) => fs.existsSync(candidate));

    if (!targetFile) {
      return { ...DEFAULT_CONFIG };
    }

    try {
      const content = fs.readFileSync(targetFile, 'utf-8');
      const parsed = JSON.parse(content) as Partial<CodeVitalsConfig>;

      return {
        ignorePatterns: [
          ...(DEFAULT_CONFIG.ignorePatterns ?? []),
          ...(parsed.ignorePatterns ?? []),
        ],
        maxFileSizeBytes: parsed.maxFileSizeBytes ?? DEFAULT_CONFIG.maxFileSizeBytes,
        customLanguages: parsed.customLanguages ?? {},
        greenops: mergeGreenOpsConfig(parsed.greenops),
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new ConfigurationError(
        `Failed to parse configuration file at ${targetFile}: ${msg}`,
        targetFile,
      );
    }
  }
}

function mergeGreenOpsConfig(config?: Partial<GreenOpsConfig>): GreenOpsConfig {
  return {
    enabled: config?.enabled ?? DEFAULT_GREENOPS_CONFIG.enabled,
    local: { ...DEFAULT_GREENOPS_CONFIG.local, ...config?.local },
    pullRequest: { ...DEFAULT_GREENOPS_CONFIG.pullRequest, ...config?.pullRequest },
    fixes: { ...DEFAULT_GREENOPS_CONFIG.fixes, ...config?.fixes },
    thresholds: { ...DEFAULT_GREENOPS_CONFIG.thresholds, ...config?.thresholds },
    sustainability: { ...DEFAULT_GREENOPS_CONFIG.sustainability, ...config?.sustainability },
  };
}
