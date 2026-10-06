import { CodeParser } from './types.js';
import { JavaScriptParser } from './languages/javascript.js';
import { TypeScriptParser } from './languages/typescript.js';
import { PythonParser } from './languages/python.js';
import { GoParser } from './languages/go.js';
import { JavaParser } from './languages/java.js';

export class LanguageRegistry {
  private parsers: Map<string, CodeParser> = new Map();
  private extensionToLanguageMap: Map<string, string> = new Map([
    ['.ts', 'typescript'],
    ['.tsx', 'typescript-tsx'],
    ['.js', 'javascript'],
    ['.jsx', 'javascript'],
    ['.py', 'python'],
    ['.go', 'go'],
    ['.java', 'java'],
  ]);

  constructor() {
    this.registerDefaults();
  }

  private registerDefaults(): void {
    try {
      this.parsers.set('javascript', new JavaScriptParser());
    } catch {
      // Gracefully continue if binding fails in an isolated environment
    }

    try {
      this.parsers.set('typescript', new TypeScriptParser(false));
      this.parsers.set('typescript-tsx', new TypeScriptParser(true));
    } catch {
      // Gracefully continue
    }

    try {
      this.parsers.set('python', new PythonParser());
    } catch {
      // Gracefully continue
    }

    try {
      this.parsers.set('go', new GoParser());
    } catch {
      // Gracefully continue
    }

    try {
      this.parsers.set('java', new JavaParser());
    } catch {
      // Gracefully continue
    }
  }

  public registerParser(language: string, parser: CodeParser, extensions: string[] = []): void {
    this.parsers.set(language.toLowerCase(), parser);
    for (const ext of extensions) {
      const formattedExt = ext.startsWith('.') ? ext.toLowerCase() : `.${ext.toLowerCase()}`;
      this.extensionToLanguageMap.set(formattedExt, language.toLowerCase());
    }
  }

  public getParser(languageOrExt: string): CodeParser | undefined {
    if (!languageOrExt) return undefined;
    const normalized = languageOrExt.toLowerCase();

    if (this.parsers.has(normalized)) {
      return this.parsers.get(normalized);
    }

    const mappedLanguage = this.extensionToLanguageMap.get(
      normalized.startsWith('.') ? normalized : `.${normalized}`
    );

    if (mappedLanguage && this.parsers.has(mappedLanguage)) {
      return this.parsers.get(mappedLanguage);
    }

    return undefined;
  }

  public getLanguageForExtension(ext: string): string | undefined {
    const formattedExt = ext.startsWith('.') ? ext.toLowerCase() : `.${ext.toLowerCase()}`;
    const lang = this.extensionToLanguageMap.get(formattedExt);
    if (lang === 'typescript-tsx') return 'typescript';
    return lang;
  }
}
