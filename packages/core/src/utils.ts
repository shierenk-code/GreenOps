export function pathMatchesPattern(path: string, patterns: string[]): boolean {
  const normalizedPath = path.toLowerCase().replace(/\\/g, '/');
  const parts = normalizedPath.split('/');

  for (const pattern of patterns) {
    const cleanPattern = pattern.toLowerCase();

    // Directory component check e.g. **/tests/** or **/dist/**
    if (cleanPattern.startsWith('**/') && cleanPattern.endsWith('/**')) {
      const dirName = cleanPattern.slice(3, -3);
      if (parts.includes(dirName)) {
        return true;
      }
    }

    // Glob pattern check e.g. **/*.test.* or **/*.min.js
    if (cleanPattern.startsWith('**/')) {
      const glob = cleanPattern.slice(3);
      const regexStr = '^' + glob
        .replace(/\./g, '\\.')
        .replace(/\*\*/g, '.*')
        .replace(/\*/g, '[^/]*') + '$';

      const regex = new RegExp(regexStr);

      // Check full path or filename match
      if (regex.test(normalizedPath) || parts.some((part) => regex.test(part))) {
        return true;
      }
    } else {
      const regexStr = '^' + cleanPattern
        .replace(/\./g, '\\.')
        .replace(/\*\*/g, '.*')
        .replace(/\*/g, '[^/]*') + '$';
      const regex = new RegExp(regexStr);
      if (regex.test(normalizedPath)) {
        return true;
      }
    }
  }

  return false;
}
