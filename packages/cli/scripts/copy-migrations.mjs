// Copia migrations/*.sql (raiz do monorepo) para dentro do pacote CLI,
// de onde `okcms update` as entrega em ./migrations do projeto do usuário.
// Roda no build (tsc && node scripts/copy-migrations.mjs) e no prepack.
import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
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
for (const file of readdirSync(source)) {
  if (!file.endsWith('.sql')) continue;
  copyFileSync(join(source, file), join(target, file));
  count += 1;
}

console.log(`✓ ${count} migration(s) copied into the package`);
