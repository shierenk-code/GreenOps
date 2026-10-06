export type SymbolKind =
  | 'function'
  | 'method'
  | 'class'
  | 'interface'
  | 'type'
  | 'enum'
  | 'variable'
  | 'constant'
  | 'constructor';

export interface SymbolModel {
  id: string;
  name: string;
  qualifiedName: string;
  kind: SymbolKind;
  fileId: string;
  startLine: number;
  endLine: number;
  exported: boolean;
  parentId?: string;
  children: string[];
}
