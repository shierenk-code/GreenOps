import { defineConfig } from 'vitest/config';
import * as path from 'node:path';

export default defineConfig({
  test: {
    globals: true,
    testTimeout: 30000,
    include: ['tests/**/*.test.ts', 'packages/**/*.test.ts'],
    exclude: ['fixtures/**', '**/node_modules/**', '**/dist/**'],
    alias: {
      '@codevitals/core': path.resolve(__dirname, './packages/core/src/index.ts'),
      '@codevitals/errors': path.resolve(__dirname, './packages/errors/src/index.ts'),
      '@codevitals/logger': path.resolve(__dirname, './packages/logger/src/index.ts'),
      '@codevitals/config': path.resolve(__dirname, './packages/config/src/index.ts'),
      '@codevitals/filesystem': path.resolve(__dirname, './packages/filesystem/src/index.ts'),
      '@codevitals/git': path.resolve(__dirname, './packages/git/src/index.ts'),
      '@codevitals/ast': path.resolve(__dirname, './packages/ast/src/index.ts'),
      '@codevitals/parser': path.resolve(__dirname, './packages/parser/src/index.ts'),
      '@codevitals/symbols': path.resolve(__dirname, './packages/symbols/src/index.ts'),
      '@codevitals/references': path.resolve(__dirname, './packages/references/src/index.ts'),
      '@codevitals/graph': path.resolve(__dirname, './packages/graph/src/index.ts'),
      '@codevitals/repository': path.resolve(__dirname, './packages/repository/src/index.ts'),
      '@codevitals/review': path.resolve(__dirname, './packages/review/src/index.ts'),
      '@codevitals/connectors': path.resolve(__dirname, './packages/connectors/src/index.ts'),
      '@codevitals/github-app': path.resolve(__dirname, './packages/github-app/src/index.ts'),
      '@greenops/measure': path.resolve(__dirname, './packages/measure/src/index.ts'),
      '@greenops/ledger': path.resolve(__dirname, './packages/ledger/src/index.ts'),
      '@greenops/detect': path.resolve(__dirname, './packages/detect/src/index.ts'),
      '@greenops/agent': path.resolve(__dirname, './packages/agent/src/index.ts'),
      '@greenops/agents': path.resolve(__dirname, './packages/agents/src/index.ts'),
    },
  },
});
