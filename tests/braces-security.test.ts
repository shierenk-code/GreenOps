import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(__dirname, '..');
const website = createRequire(resolve(root, 'apps/CodeVitals-MCP/website/package.json'));
let jestConsumer = createRequire(resolve(root, 'apps/CodeVitals-MCP/package.json'));
for (const dependency of ['jest', 'jest-cli', '@jest/core', 'jest-config', 'micromatch']) {
  jestConsumer = createRequire(jestConsumer.resolve(dependency));
}
const nextPlugin = createRequire(website.resolve('@next/eslint-plugin-next'));
const fastGlob = createRequire(nextPlugin.resolve('fast-glob'));
const dashboardConsumer = createRequire(fastGlob.resolve('micromatch'));

for (const [name, consumer] of [
  ['Jest', jestConsumer],
  ['dashboard lint', dashboardConsumer],
] as const) {
  describe(`${name} braces recursion mitigation`, () => {
    const braces = consumer('braces');
    for (const method of ['parse', 'compile', 'expand', 'stringify'] as const) {
      it(`${method} rejects deeply nested braces and parentheses without stack exhaustion`, () => {
        for (const [open, close] of [
          ['{', '}'],
          ['(', ')'],
          ['{(', ')}'],
        ]) {
          const pattern = open.repeat(2000) + 'a' + close.repeat(2000);
          expect(() => braces[method](pattern)).toThrow(SyntaxError);
          expect(() => braces[method](pattern)).toThrow('maximum nesting depth');
        }
      });
    }
    for (const method of ['compile', 'expand', 'stringify'] as const) {
      it(`${method} also limits caller-supplied AST depth`, () => {
        const ast: any = { type: 'root', nodes: [] };
        let parent = ast;
        for (let i = 0; i < 2000; i++) {
          const child: any = {
            type: 'brace',
            nodes: [],
            parent,
            open: true,
            close: true,
            commas: 1,
          };
          parent.nodes.push(child);
          parent = child;
        }
        parent.nodes.push({ type: 'text', value: 'a', parent });
        expect(() => braces[method](ast)).toThrow('maximum nesting depth');
      });
    }
    it('preserves ordinary glob alternatives, ranges, nesting and escaped literals', () => {
      expect(braces.expand('src/{a,b}/{1..3}.ts')).toEqual([
        'src/a/1.ts',
        'src/a/2.ts',
        'src/a/3.ts',
        'src/b/1.ts',
        'src/b/2.ts',
        'src/b/3.ts',
      ]);
      expect(braces.compile('src/{a,b}.ts')).toBe('src/(a|b).ts');
      expect(braces.expand('{a,{b,c}}')).toEqual(['a', 'b', 'c']);
      expect(braces.stringify(braces.parse('src/{a,b}.ts'))).toBe('src/{a,b}.ts');
      expect(braces.expand('\\{literal\\}')).toEqual(['{literal}']);
      expect(() => braces.compile('{'.repeat(64) + 'a' + '}'.repeat(64))).not.toThrow();
    });
  });
}

it('keeps npm and pnpm mitigations identical', () => {
  const pnpm = readFileSync(resolve(root, 'patches/braces@3.0.3.patch'), 'utf8');
  const npm = readFileSync(
    resolve(root, 'apps/CodeVitals-MCP/website/patches/braces+3.0.3.patch'),
    'utf8',
  );
  const normalize = (text: string) =>
    text.replaceAll('node_modules/braces/', '').replaceAll('\r\n', '\n').trim();
  expect(normalize(npm)).toBe(normalize(pnpm));
});
