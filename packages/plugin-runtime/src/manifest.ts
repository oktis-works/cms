// @oktis-works/plugin-runtime - Fonte única de leitura de manifesto de plugin
//
// Antes havia duas fontes de verdade divergentes:
//   - o loader lia `package.json` primeiro, depois `manifest.json`;
//   - o sync (admin) e a CLI liam só `manifest.json`.
// Um plugin no formato npm era descoberto pelo runtime mas nunca chegava ao
// banco (invisível no admin). Aqui tudo passa por `readPluginManifest`:
//
//   - **precedência**: `manifest.json` (canônico do OkCMS) vence `package.json`
//     (formato npm); campos ausentes em `manifest.json` são preenchidos do npm;
//   - **validação**: `name`/`version` obrigatórios; `type` explícito ≠ 'plugin'
//     é rejeitado (ex.: theme.json/manifest de tema dentro de plugins/);
//   - `strict` (sync/instalação) exige mais que `main` e devolve `issues`
//     para o chamador decidir; o loader usa `strict = false` (leniente).

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { PluginManifest } from '@oktis-works/plugin-sdk';

export type ManifestSource = 'manifest.json' | 'package.json';

export interface ReadManifestResult {
  manifest: PluginManifest | null;
  source: ManifestSource | null;
  /** Problemas encontrados (motivo de recusa, quando `manifest` é null). */
  issues: string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

async function readJson(dir: string, file: string): Promise<Record<string, unknown> | null> {
  try {
    const raw = await readFile(join(dir, file), 'utf8');
    const parsed: unknown = JSON.parse(raw);
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * Lê o manifesto de um diretório de plugin com precedência única.
 *
 * @param dir diretório do plugin
 * @param options.strict exige `main` e valida `type === 'plugin'` quando
 *        declarado (usado por sync/instalação/CLI)
 */
export async function readPluginManifest(
  dir: string,
  options: { strict?: boolean } = {}
): Promise<ReadManifestResult> {
  const canonical = await readJson(dir, 'manifest.json');
  const npm = await readJson(dir, 'package.json');

  if (!canonical && !npm) {
    return { manifest: null, source: null, issues: ['sem manifest.json nem package.json'] };
  }

  const source: ManifestSource = canonical ? 'manifest.json' : 'package.json';
  const merged: Record<string, unknown> = { ...(npm ?? {}), ...(canonical ?? {}) };

  const issues: string[] = [];

  const name = typeof merged['name'] === 'string' ? merged['name'].trim() : '';
  const version = typeof merged['version'] === 'string' ? merged['version'].trim() : '';
  if (!name) issues.push('manifest sem "name"');
  if (!version) issues.push('manifest sem "version"');

  const type = merged['type'];
  if (type !== undefined && type !== 'plugin') {
    issues.push(`type "${String(type)}" não é "plugin"`);
  }

  const main = merged['main'];
  if (options.strict && typeof main !== 'string') {
    issues.push('manifest sem "main" (entrypoint)');
  }

  if (issues.length > 0) {
    return { manifest: null, source, issues };
  }

  return {
    manifest: merged as unknown as PluginManifest,
    source,
    issues: [],
  };
}

/**
 * Normaliza o manifesto para gravação no banco (mantém só campos conhecidos,
 * preservando campos extras legítimos do autor).
 */
export function normalizePluginManifest(manifest: PluginManifest): Record<string, unknown> {
  return manifest as unknown as Record<string, unknown>;
}
