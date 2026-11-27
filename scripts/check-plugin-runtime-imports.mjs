#!/usr/bin/env node
/**
 * scripts/check-plugin-runtime-imports.mjs
 *
 * GAP-07: Enforce that `packages/plugin-runtime` never statically imports
 * `@oktis-works/core`.
 *
 * `core` is built AFTER `plugin-runtime` in the dependency order. In a fresh
 * checkout (no `dist/`), a static `import ... from '@oktis-works/core'` inside
 * `plugin-runtime` would make `tsc` fail trying to resolve a module that does
 * not exist yet.
 *
 * Allowed pattern (non-literal dynamic import):
 *   const id = '@oktis-works/core';
 *   await import(id);
 *
 * Forbidden patterns:
 *   import ... from '@oktis-works/core';
 *   import ... from '@oktis-works/core/...';
 *   require('@oktis-works/core');
 *   require('@oktis-works/core/...');
 *   import('@oktis-works/core');  // literal specifier — tsc can resolve it
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '..');
const PLUGIN_RUNTIME_SRC = join(ROOT, 'packages', 'plugin-runtime', 'src');

// Regexes for forbidden static imports of @oktis-works/core
const STATIC_IMPORT_FROM_CORE = /import\s+(?:[\s\S]*?\s+from\s+)?['"]@oktis-works\/core(?:\/|['"])/;
const REQUIRE_CORE = /require\s*\(\s*['"]@oktis-works\/core(?:\/|['"])/;
const LITERAL_DYNAMIC_IMPORT_CORE = /import\s*\(\s*['"]@oktis-works\/core(?:\/|['"])/;

const errors = [];

function collectJsFiles(dir, out) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      collectJsFiles(full, out);
    } else if (entry.isFile() && /\.(ts|js|mjs|cjs)$/.test(entry.name)) {
      out.push(full);
    }
  }
}

const files = [];
collectJsFiles(PLUGIN_RUNTIME_SRC, files);

for (const file of files) {
  const rel = file.slice(ROOT.length + 1);
  let content;
  try {
    content = readFileSync(file, 'utf8');
  } catch {
    continue;
  }

  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;

    // Skip comment-only lines
    const trimmed = line.trim();
    if (trimmed.startsWith('//') || trimmed.startsWith('*')) continue;

    if (STATIC_IMPORT_FROM_CORE.test(line)) {
      errors.push({
        file: rel,
        line: lineNum,
        content: line.trim(),
        rule: 'static-import-from-core',
        message: `Static import from '@oktis-works/core' detected. plugin-runtime builds before core; use a non-literal dynamic import instead: const id = '@oktis-works/core'; await import(id);`,
      });
    }

    if (REQUIRE_CORE.test(line)) {
      errors.push({
        file: rel,
        line: lineNum,
        content: line.trim(),
        rule: 'require-core',
        message: `require('@oktis-works/core') detected. plugin-runtime builds before core; use a non-literal dynamic import instead: const id = '@oktis-works/core'; await import(id);`,
      });
    }

    if (LITERAL_DYNAMIC_IMPORT_CORE.test(line)) {
      errors.push({
        file: rel,
        line: lineNum,
        content: line.trim(),
        rule: 'literal-dynamic-import-core',
        message: `Literal dynamic import('@oktis-works/core') detected. TypeScript can resolve this at build time, which breaks fresh checkout. Use a non-literal dynamic import instead: const id = '@oktis-works/core'; await import(id);`,
      });
    }
  }
}

if (errors.length > 0) {
  console.error(`\n✗ GAP-07 violation: ${errors.length} static import(s) of '@oktis-works/core' found in packages/plugin-runtime/src/\n`);
  for (const e of errors) {
    console.error(`  ${e.file}:${e.line} [${e.rule}]`);
    console.error(`    ${e.content}`);
    console.error(`    ${e.message}\n`);
  }
  console.error('Resolution: Replace any static `import ... from \'@oktis-works/core\'` or `require(\'@oktis-works/core\')` with:');
  console.error('  const id = \'@oktis-works/core\';');
  console.error('  await import(id);');
  console.error('This keeps TypeScript from resolving the module at build time (core is not built yet).\n');
  process.exit(1);
}

console.log(`✓ GAP-07 check passed: no static imports of '@oktis-works/core' in ${files.length} file(s) under packages/plugin-runtime/src/`);
