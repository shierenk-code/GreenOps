const EXTENSION_TO_LANGUAGE: Record<string, string> = {
  // TypeScript
  ts: 'TypeScript',
  tsx: 'TypeScript',
  mts: 'TypeScript',
  cts: 'TypeScript',

  // JavaScript
  js: 'JavaScript',
  jsx: 'JavaScript',
  mjs: 'JavaScript',
  cjs: 'JavaScript',

  // Python
  py: 'Python',
  pyw: 'Python',

  // Java
  java: 'Java',

  // Go
  go: 'Go',

  // Rust
  rs: 'Rust',

  // C
  c: 'C',
  h: 'C',

  // C++
  cpp: 'C++',
  cc: 'C++',
  cxx: 'C++',
  hpp: 'C++',
  hh: 'C++',
  hxx: 'C++',

  // C#
  cs: 'C#',

  // PHP
  php: 'PHP',

  // Ruby
  rb: 'Ruby',
  rake: 'Ruby',

  // Kotlin
  kt: 'Kotlin',
  kts: 'Kotlin',

  // Swift
  swift: 'Swift',

  // Shell
  sh: 'Shell',
  bash: 'Shell',
  zsh: 'Shell',

  // Data / Config / Markup
  json: 'JSON',
  yaml: 'YAML',
  yml: 'YAML',
  html: 'HTML',
  htm: 'HTML',
  css: 'CSS',
  scss: 'CSS',
  sass: 'CSS',
  less: 'CSS',
  md: 'Markdown',
  markdown: 'Markdown',
  xml: 'XML',
  sql: 'SQL',
  toml: 'TOML',
};

const FILENAME_TO_LANGUAGE: Record<string, string> = {
  dockerfile: 'Shell',
  makefile: 'Shell',
  cmakelists: 'CMake',
};

export class LanguageDetector {
  public static detect(filename: string): string | undefined {
    const basename = filename.toLowerCase();

    if (FILENAME_TO_LANGUAGE[basename]) {
      return FILENAME_TO_LANGUAGE[basename];
    }

    const dotIndex = filename.lastIndexOf('.');
    if (dotIndex === -1 || dotIndex === filename.length - 1) {
      return undefined;
    }

    const ext = filename.slice(dotIndex + 1).toLowerCase();
    return EXTENSION_TO_LANGUAGE[ext];
  }
}
