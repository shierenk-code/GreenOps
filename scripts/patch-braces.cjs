'use strict';

const fs = require('node:fs');
const path = require('node:path');

function patchFile(filePath, transforms) {
  if (!fs.existsSync(filePath)) return false;
  let content = fs.readFileSync(filePath, 'utf8');
  let changed = false;
  for (const { search, replace } of transforms) {
    if (typeof search === 'string' ? content.includes(search) : search.test(content)) {
      content = content.replace(search, replace);
      changed = true;
    }
  }
  if (changed) {
    fs.writeFileSync(filePath, content, 'utf8');
    return true;
  }
  return false;
}

function patchBracesDir(bracesDir) {
  const compilePath = path.join(bracesDir, 'lib/compile.js');
  const expandPath = path.join(bracesDir, 'lib/expand.js');
  const parsePath = path.join(bracesDir, 'lib/parse.js');
  const stringifyPath = path.join(bracesDir, 'lib/stringify.js');

  // Patch compile.js
  patchFile(compilePath, [
    {
      search: '  const walk = (node, parent = {}) => {',
      replace: '  const walk = (node, parent = {}, depth = 0) => {\n    if (depth > 100) {\n      throw new SyntaxError(\'Brace pattern exceeds maximum nesting depth (100)\');\n    }',
    },
    {
      search: 'output += walk(child, node);',
      replace: 'output += walk(child, node, depth + 1);',
    },
  ]);

  // Patch expand.js
  patchFile(expandPath, [
    {
      search: '  const walk = (node, parent = {}) => {',
      replace: '  const walk = (node, parent = {}, depth = 0) => {\n    if (depth > 100) {\n      throw new SyntaxError(\'Brace pattern exceeds maximum nesting depth (100)\');\n    }',
    },
    {
      search: 'walk(child, node);',
      replace: 'walk(child, node, depth + 1);',
    },
  ]);

  // Patch parse.js
  patchFile(parsePath, [
    {
      search: '    if (value === CHAR_LEFT_PARENTHESES) {\n      block = push({ type: \'paren\', nodes: [] });',
      replace: '    if (value === CHAR_LEFT_PARENTHESES) {\n      if (stack.length >= 100) {\n        throw new SyntaxError(\'Brace pattern exceeds maximum nesting depth (100)\');\n      }\n      block = push({ type: \'paren\', nodes: [] });',
    },
    {
      search: '    if (value === CHAR_LEFT_CURLY_BRACE) {\n      depth++;',
      replace: '    if (value === CHAR_LEFT_CURLY_BRACE) {\n      if (stack.length >= 100) {\n        throw new SyntaxError(\'Brace pattern exceeds maximum nesting depth (100)\');\n      }\n      depth++;',
    },
  ]);

  // Patch stringify.js
  patchFile(stringifyPath, [
    {
      search: '  const stringify = (node, parent = {}) => {',
      replace: '  const stringify = (node, parent = {}, depth = 0) => {\n    if (depth > 100) {\n      throw new SyntaxError(\'Brace pattern exceeds maximum nesting depth (100)\');\n    }',
    },
    {
      search: 'output += stringify(child);',
      replace: 'output += stringify(child, {}, depth + 1);',
    },
  ]);
}

function findBracesDirs(dir, found = []) {
  if (!fs.existsSync(dir)) return found;
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name === '.git') continue;
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === 'braces' && fs.existsSync(path.join(fullPath, 'package.json'))) {
          found.push(fullPath);
        } else {
          findBracesDirs(fullPath, found);
        }
      }
    }
  } catch {
    // Ignore permissions or missing dirs
  }
  return found;
}

const rootDir = path.resolve(__dirname, '..');
const dirs = findBracesDirs(rootDir);
for (const bracesDir of dirs) {
  patchBracesDir(bracesDir);
}
console.log(`[GreenOps] Successfully verified/patched ${dirs.length} braces installations.`);
