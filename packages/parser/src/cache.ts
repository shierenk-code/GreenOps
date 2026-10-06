import { createHash } from 'node:crypto';
import { ParseResult } from './types.js';

export class ParserCache {
  private cache: Map<string, ParseResult> = new Map();
  private hits = 0;
  private misses = 0;
  public readonly parserVersion = '1.0.0';

  public computeKey(content: string, language: string): string {
    const contentHash = createHash('sha256').update(content).digest('hex');
    return `${contentHash}:${language}:${this.parserVersion}`;
  }

  public get(content: string, language: string): ParseResult | undefined {
    const key = this.computeKey(content, language);
    const result = this.cache.get(key);
    if (result) {
      this.hits++;
      return result;
    }
    this.misses++;
    return undefined;
  }

  public set(content: string, language: string, result: ParseResult): void {
    const key = this.computeKey(content, language);
    this.cache.set(key, result);
  }

  public clear(): void {
    this.cache.clear();
    this.hits = 0;
    this.misses = 0;
  }

  public getStats(): { hits: number; misses: number; size: number } {
    return {
      hits: this.hits,
      misses: this.misses,
      size: this.cache.size,
    };
  }
}
