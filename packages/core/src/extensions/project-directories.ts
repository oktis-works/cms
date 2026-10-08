// @oktis-works/core - Diretórios de extensões do projeto

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

type ExtensionKind = 'plugin' | 'theme';

/**
 * Resolve os diretórios reais do projeto. O diretório pode ser sobrescrito
 * por ambiente; caso contrário, respeita okcms.config.json e os defaults.
 */
export function resolveExtensionDirectory(kind: ExtensionKind, cwd = process.cwd()): string {
  const envKey = kind === 'plugin' ? 'OKCMS_PLUGINS_DIR' : 'OKCMS_THEMES_DIR';
  const fallback = kind === 'plugin' ? 'plugins' : 'themes';
  const configured = process.env[envKey];

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
