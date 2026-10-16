// @oktis-works/core - Diretórios de extensões do projeto

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

type ExtensionKind = 'plugin' | 'theme';

/**
 * Resolve os diretórios reais do projeto. O diretório pode ser sobrescrito
 * por ambiente; caso contrário, respeita okcms.config.json e os defaults.
 *
 * Contrato único de env por tipo (o web runtime consome ESTA função — não
 * inventa outro nome de variável):
 *   - tema:    `OKCMS_THEMES_DIR` (canônico) ou `THEMES_DIR` (alias usado
 *              pelo web runtime e pelos scripts e2e)
 *   - plugin:  `OKCMS_PLUGINS_DIR`
 */
export function resolveExtensionDirectory(kind: ExtensionKind, cwd = process.cwd()): string {
  const envKey = kind === 'plugin' ? 'OKCMS_PLUGINS_DIR' : 'OKCMS_THEMES_DIR';
  // Alias aceito para o mesmo diretório (evita dois nomes de env divergindo
  // entre apps: o web runtime e o e2e usavam THEMES_DIR, a API OKCMS_THEMES_DIR).
  const aliasKey = kind === 'plugin' ? null : 'THEMES_DIR';
  const fallback = kind === 'plugin' ? 'plugins' : 'themes';
  const configured = process.env[envKey] ?? (aliasKey ? process.env[aliasKey] : undefined);

  if (configured) return resolve(cwd, configured);

  const configPath = resolve(cwd, 'okcms.config.json');
  if (existsSync(configPath)) {
    try {
      const config = JSON.parse(readFileSync(configPath, 'utf8')) as Record<string, unknown>;
      const value = config[kind === 'plugin' ? 'pluginsDir' : 'themesDir'];
      if (typeof value === 'string' && value.trim()) return resolve(cwd, value);
    } catch {
      // O carregamento da aplicação valida o config; a descoberta não deve
      // impedir a API de subir por causa de um arquivo opcional inválido.
    }
  }

  return resolve(cwd, fallback);
}
