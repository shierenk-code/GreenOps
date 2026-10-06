import { createHash } from 'node:crypto';
import { SymbolKind } from './types.js';

export function generateSymbolId(params: {
  repoIdentifier?: string;
  filePath: string;
  qualifiedName: string;
  kind: SymbolKind;
}): string {
  const repo = params.repoIdentifier || 'default_repo';
  const rawKey = `${repo}:${params.filePath}:${params.qualifiedName}:${params.kind}`;
  const hash = createHash('sha256').update(rawKey).digest('hex').slice(0, 16);
  return `sym_${hash}`;
}
