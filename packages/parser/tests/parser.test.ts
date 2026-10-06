import { describe, it, expect } from 'vitest';
import { EngineParser, LanguageRegistry, ParserCache } from '../src/index.js';

describe('Parser Engine & Language Registry', () => {
  it('detects and parses TypeScript source correctly', () => {
    const parser = new EngineParser();
    const tsCode = `
      interface User { id: string; }
      function getUser(id: string): User { return { id }; }
    `;
    const result = parser.parse(tsCode, 'typescript');
    expect(result).toBeDefined();
    expect(result?.hasErrors).toBe(false);
    expect(result?.rootNode.type).toBe('program');
  });

  it('handles unknown languages gracefully without crashing', () => {
    const parser = new EngineParser();
    const result = parser.parse('print("hello")', 'unknown_language');
    expect(result).toBeUndefined();
  });

  it('uses parser cache and invalidates on content change', () => {
    const cache = new ParserCache();
    const parser = new EngineParser(new LanguageRegistry(), cache);
    const code = 'function test() {}';

    const res1 = parser.parse(code, 'typescript');
    expect(cache.getStats().misses).toBe(1);
    expect(cache.getStats().hits).toBe(0);

    const res2 = parser.parse(code, 'typescript');
    expect(cache.getStats().hits).toBe(1);
    expect(res1).toBe(res2);

    const modifiedCode = 'function test() { console.log(1); }';
    parser.parse(modifiedCode, 'typescript');
    expect(cache.getStats().misses).toBe(2);
    expect(cache.getStats().hits).toBe(1);
  });
});
