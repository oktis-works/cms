// @oktis-works/cms - Sincronização das migrations empacotadas → projeto
//
// O pacote @oktis-works/cms embute todas as `migrations/*.sql` do repositório
// (copiadas no build). `okcms update` as copia para `./migrations` do projeto,
// que é de onde o `db:migrate` (deploy blue/green, simple e PM2) lê.
//
// Regras — nunca destrutivas:
//   • arquivo inexistente no projeto  → copiado (added);
//   • idêntico (byte a byte)          → pulado (unchanged);
//   • diferente                       → o arquivo LOCAL é mantido e o caso é
//                                       reportado (conflict) para o operador
//                                       decidir — edits locais não se perdem.

import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export interface MigrationsSyncResult {
  /** SQL copiados agora (novos no projeto). */
  added: string[];
  /** Já presentes e idênticos — nada a fazer. */
  unchanged: string[];
  /** Existentes no projeto com conteúdo diferente — o local foi mantido. */
  conflicts: string[];
  /** false = o pacote não embute migrations (ex.: execução fora do publish). */
  bundled: boolean;
}

/**
 * Dir embutido no pacote publicado: `<pkg>/migrations` (irmão de `dist/`).
 * Na árvore de desenvolvimento também existe (gerado pelo build do CLI).
 */
export function bundledMigrationsDir(): string {
  return join(dirname(fileURLToPath(import.meta.url)), '..', 'migrations');
}

/**
 * Copia as migrations empacotadas para `cwd/migrations`. Segura para rodar
 * em qualquer `okcms update`: só cria arquivos que faltam.
 */
export function syncMigrations(
  cwd: string,
  opts: { sourceDir?: string; log?: (message: string) => void } = {}
): MigrationsSyncResult {
  const source = opts.sourceDir ?? bundledMigrationsDir();
  const log = opts.log ?? ((message: string) => console.log(message));
  const target = join(cwd, 'migrations');

  const result: MigrationsSyncResult = {
    added: [],
    unchanged: [],
    conflicts: [],
    bundled: existsSync(source),
  };
  if (!result.bundled) {
    log('  • bundled migrations not found in this package — skipped');
    return result;
  }

  mkdirSync(target, { recursive: true });

  const files = readdirSync(source)
    .filter((file) => file.endsWith('.sql'))
    .sort();

  for (const file of files) {
    const from = join(source, file);
    const to = join(target, file);

    if (!existsSync(to)) {
      copyFileSync(from, to);
      result.added.push(file);
      continue;
    }

    const identical = readFileSync(from).equals(readFileSync(to));
    if (identical) {
      result.unchanged.push(file);
    } else {
      result.conflicts.push(file);
    }
  }

  for (const file of result.added) log(`  + migrations/${file}`);
  for (const file of result.conflicts) {
    log(`  ! migrations/${file} differs from the bundled one — local file kept`);
  }
  if (result.added.length === 0 && result.conflicts.length === 0) {
    log(`  ✓ migrations are up to date (${result.unchanged.length} file(s))`);
  }

  return result;
}
