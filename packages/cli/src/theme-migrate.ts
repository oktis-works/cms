// @oktis-works/cms - Migração do manifesto de tema legado
//
// Projetos criados antes da unificação gravavam o manifesto do tema default
// como `manifest.json` (nome legado). O nome canônico é `theme.json` e é o
// único que runtime, service e CLI leem — sem a migração, projetos antigos
// simplesmente deixariam de ter o tema descoberto.
//
// Este módulo renomeia o legado para o canônico em cada tema que ainda não
// tenha um `theme.json`. Idempotente e nunca destrutivo: um `theme.json`
// já presente nunca é sobrescrito e o legado excedente é deixado intacto
// (dados do operador — só o rename acontece onde é necessário).
//
// Chamado pelos entry points do CLI que tocam temas — `okcms update`,
// `okcms redeploy` (execução real, nunca `--dry-run`), `okcms dev`,
// `okcms start`, `okcms theme:build` e `okcms theme:manage --info` — para
// que projetos existentes migrem sozinhos na primeira execução com o novo
// CLI.

import { existsSync, readdirSync, renameSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Renomeia `manifest.json` → `theme.json` nos diretórios de tema de
 * `themesDir` que tenham apenas o nome legado.
 *
 * @returns nomes dos temas migrados nesta chamada (`[]` = nada a fazer).
 */
export function migrateThemeManifests(themesDir: string): string[] {
  if (!existsSync(themesDir)) return [];

  let entries;
  try {
    entries = readdirSync(themesDir, { withFileTypes: true });
  } catch {
    // sem permissão/IO: próxima execução tenta de novo
    return [];
  }

  const migrated: string[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const dir = join(themesDir, entry.name);
    const legacy = join(dir, 'manifest.json');
    const canonical = join(dir, 'theme.json');
    if (!existsSync(legacy) || existsSync(canonical)) continue;
    try {
      renameSync(legacy, canonical);
      migrated.push(entry.name);
    } catch {
      // rename falhou (permissão, arquivo em uso): mantém o legado intacto
    }
  }
  return migrated;
}
