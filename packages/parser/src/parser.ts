import { LanguageRegistry } from './language-registry.js';
import { ParserCache } from './cache.js';
import { ParseResult } from './types.js';

export class EngineParser {
  private registry: LanguageRegistry;
  private cache: ParserCache;

  constructor(registry?: LanguageRegistry, cache?: ParserCache) {
    this.registry = registry || new LanguageRegistry();
    this.cache = cache || new ParserCache();
  }

  public getRegistry(): LanguageRegistry {
    return this.registry;
  }

  public getCache(): ParserCache {
    return this.cache;
  }

  public parse(source: string, languageOrExt: string): ParseResult | undefined {
    const parser = this.registry.getParser(languageOrExt);
    if (!parser) {
      return undefined;
    }

    const cached = this.cache.get(source, parser.language);
    if (cached) {
      return cached;
    }

    const result = parser.parse(source);
    this.cache.set(source, parser.language, result);
    return result;
  }
}
