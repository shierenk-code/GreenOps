import { CodeVitalsConfig, ServerConfig } from '../types/config.js';

export const DEFAULT_SERVER_CONFIG: ServerConfig = {
  name: 'greenops-mcp',
  version: '1.0.0',
  timeoutMs: 60000,
  maxFileSizeBytes: 10485760, // 10MB per file max
  maxRecursionDepth: 15,
};

export const DEFAULT_CODEVITALS_CONFIG: CodeVitalsConfig = {
  depth: 'medium',
  excludePatterns: [
    '**/node_modules/**',
    '**/dist/**',
    '**/build/**',
    '**/.git/**',
    '**/coverage/**',
    '**/.next/**',
    '**/vendor/**',
    '**/*.min.js',
    '**/*.bundle.js',
    '**/*.map',
    '**/package-lock.json',
    '**/yarn.lock',
    '**/pnpm-lock.yaml',
  ],
  thresholds: {
    complexity: 15,
    maxLineLength: 120,
    maxFileLines: 1000,
    maxFunctionLines: 50,
    duplicationLines: 20,
  },
};
