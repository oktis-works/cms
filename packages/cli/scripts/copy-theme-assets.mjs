// @oktis-works/cli - Copia os arquivos reais do tema default para dist/
// Garante que `okcms init` (via bunx/pacote publicado) copie o tema idêntico
// ao monorepo, em vez de strings hardcoded que ficam desatualizadas.

import { copyFile, mkdir, readdir, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
// packages/cli/scripts/ → packages/cli/ → packages/ → monorepo root
const MONOREPO_ROOT = join(__dirname, '..', '..', '..');
const THEME_SRC = join(MONOREPO_ROOT, 'themes', 'default');
const THEME_DIST = join(__dirname, '..', 'dist', 'themes', 'default');

async function copyDir(src, dest) {
  const entries = await readdir(src, { withFileTypes: true });
  await mkdir(dest, { recursive: true });
  for (const entry of entries) {
    const srcPath = join(src, entry.name);
    const destPath = join(dest, entry.name);
    // Use stat to correctly identify directories, including symlinks to directories
    const entryStat = await stat(srcPath);
    if (entryStat.isDirectory()) {
      // Skip node_modules directory - it is not part of the theme source
      if (entry.name === 'node_modules') {
        continue;
      }
      // For dist directory, only copy theme.css (the built stylesheet)
      if (entry.name === 'dist') {
        const distThemeCss = join(srcPath, 'theme.css');
        try {
          const distStat = await stat(distThemeCss);
          if (distStat.isFile()) {
            await mkdir(dirname(destPath), { recursive: true });
            await copyFile(distThemeCss, join(destPath, 'theme.css'));
          }
        } catch {
          // dist/theme.css doesn't exist, skip
        }
        continue;
      }
      await copyDir(srcPath, destPath);
    } else {
      await mkdir(dirname(destPath), { recursive: true });
      await copyFile(srcPath, destPath);
    }
  }
}

async function main() {
  try {
    await stat(THEME_SRC);
  } catch {
    // themes/default não existe (ex.: build fora do monorepo) — ignora
    return;
  }
  await copyDir(THEME_SRC, THEME_DIST);
  console.log('[cli build] copied themes/default → dist/themes/default');
}

main().catch((error) => {
  console.error('[cli build] failed to copy theme assets:', error);
  process.exit(1);
});
