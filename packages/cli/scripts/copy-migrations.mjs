// Copia migrations/*.sql (raiz do monorepo) para dentro do pacote CLI,
// de onde `okcms update` as entrega em ./migrations do projeto do usuário.
// Roda no build (tsc && node scripts/copy-migrations.mjs) e no prepack.
import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const pkgRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const source = join(dirname(pkgRoot), '..', 'migrations');
const target = join(pkgRoot, 'migrations');

if (!existsSync(source)) {
  console.error(`✗ migrations source not found: ${source}`);
  process.exit(1);
}

rmSync(target, { recursive: true, force: true });
mkdirSync(target, { recursive: true });

let count = 0;
function copyTree(from, to) {
  mkdirSync(to, { recursive: true });
  for (const file of readdirSync(from)) {
    const sourcePath = join(from, file);
    const targetPath = join(to, file);
    if (statSync(sourcePath).isDirectory()) {
      copyTree(sourcePath, targetPath);
    } else if (file.endsWith('.sql')) {
      copyFileSync(sourcePath, targetPath);
      count += 1;
    }
  }
}
copyTree(source, target);

console.log(`✓ ${count} migration(s) copied into the package`);
