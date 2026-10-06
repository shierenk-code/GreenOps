export interface ImportModel {
  fileId: string;
  source: string;
  resolvedFile?: string;
  symbols: string[];
  isDefault?: boolean;
  isNamespace?: boolean;
  startLine: number;
  endLine: number;
}

export interface ExportModel {
  fileId: string;
  symbolId?: string;
  name: string;
  kind: 'named' | 'default' | 're-export';
  source?: string;
  startLine: number;
  endLine: number;
}

export interface ReferenceModel {
  fileId: string;
  sourceSymbolId?: string;
  targetName: string;
  targetSymbolId?: string;
  kind: 'call' | 'usage' | 'type' | 'extend' | 'implement';
  startLine: number;
  endLine: number;
}
