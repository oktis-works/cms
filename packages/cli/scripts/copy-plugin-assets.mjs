// @oktis-works/cli - Copies the bundled example plugin into the CLI package.

import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const pkgRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const monorepoRoot = join(pkgRoot, '..', '..');
const source = join(monorepoRoot, 'plugins', 'mermaid-field');
const target = join(pkgRoot, 'dist', 'plugins', 'mermaid-field');

if (!existsSync(source)) {
  console.error(`✗ bundled plugin source not found: ${source}`);
  process.exit(1);
}

rmSync(target, { recursive: true, force: true });

function copyTree(from, to) {
  mkdirSync(to, { recursive: true });
  for (const entry of readdirSync(from)) {
    const sourcePath = join(from, entry);
    const targetPath = join(to, entry);
    if (statSync(sourcePath).isDirectory()) {
      copyTree(sourcePath, targetPath);
    } else {
      mkdirSync(dirname(targetPath), { recursive: true });
      copyFileSync(sourcePath, targetPath);
    }
  }
}

copyTree(source, target);
console.log('✓ copied plugins/mermaid-field into the CLI package');
