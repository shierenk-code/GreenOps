export interface FileModel {
  id: string;
  path: string;
  relativePath: string;

  extension?: string;
  language?: string;

  size: number;
  lines?: number;

  hash: string;

  generated: boolean;
  binary: boolean;
  ignored: boolean;

  testFile: boolean;
}

export interface FileTypeSummary {
  total: number;
  source: number;
  tests: number;
  generated: number;
  binary: number;
  ignored: number;
}

export interface LanguageSummary {
  name: string;
  filesCount: number;
  linesCount: number;
  percentage: number;
}

export interface ScanResult {
  repository: {
    path: string;
  };
  files: FileTypeSummary;
  languages: Record<string, number>;
  languageBreakdown: LanguageSummary[];
  fileList: FileModel[];
  scanner: {
    durationMs: number;
    durationSeconds: string;
    cache: string;
  };
  status: string;
}
