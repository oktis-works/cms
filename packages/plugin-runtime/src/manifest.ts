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
import { validatePermissions } from '@oktis-works/plugin-sdk';

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

function isString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

/**
 * Valida os campos do schema v2 (tudo opcional — um manifesto v1 continua
 * válido). Retorna as issues encontradas; vazio = válido.
 */
export function validateManifestV2(merged: Record<string, unknown>): string[] {
  const issues: string[] = [];

  const manifestVersion = merged['manifestVersion'];
  if (manifestVersion !== undefined && manifestVersion !== 1 && manifestVersion !== 2) {
    issues.push(`manifestVersion "${String(manifestVersion)}" inválida (esperado 1 ou 2)`);
  }

  // Permissões: desconhecidas são rejeitadas (catálogo do plugin-sdk).
  const permissions = merged['permissions'];
  if (Array.isArray(permissions)) {
    for (const unknown of validatePermissions(permissions.filter(isString))) {
      issues.push(`permissão desconhecida "${unknown}"`);
    }
  }

  const blocks = merged['blocks'];
  if (Array.isArray(blocks)) {
    for (const block of blocks) {
      if (!isRecord(block) || !isString(block['type']) || !isString(block['label']) || !isString(block['icon']) || !isString(block['adminComponentPath'])) {
        issues.push('block sem type/label/icon/adminComponentPath válidos');
      }
    }
  }

  const postTypes = merged['postTypes'];
  if (Array.isArray(postTypes)) {
    for (const postType of postTypes) {
      if (!isRecord(postType) || !isString(postType['key']) || !isString(postType['label'])) {
        issues.push('postType sem key/label válidos');
      }
    }
  }

  const taxonomies = merged['taxonomies'];
  if (Array.isArray(taxonomies)) {
    for (const taxonomy of taxonomies) {
      if (!isRecord(taxonomy) || !isString(taxonomy['key']) || !isString(taxonomy['label']) || !Array.isArray(taxonomy['postTypes'])) {
        issues.push('taxonomy sem key/label/postTypes válidos');
      }
    }
  }

  const scheduleJobs = merged['scheduleJobs'];
  if (Array.isArray(scheduleJobs)) {
    for (const job of scheduleJobs) {
      if (!isRecord(job) || !isString(job['name'])) {
        issues.push('scheduleJob sem nome');
        continue;
      }
      const hasEvery = typeof job['every'] === 'number' && (job['every'] as number) > 0;
      const hasCron = isString(job['cron']);
      if (hasEvery === hasCron) {
        issues.push(`scheduleJob "${job['name']}" precisa de exatamente um de: every | cron`);
      }
    }
  }

  const httpPolicy = merged['httpPolicy'];
  if (httpPolicy !== undefined) {
    if (!isRecord(httpPolicy)) {
      issues.push('httpPolicy inválida');
    } else if (httpPolicy['allowHosts'] !== undefined && !Array.isArray(httpPolicy['allowHosts'])) {
      issues.push('httpPolicy.allowHosts deve ser array de hosts');
    }
  }

  const rateLimit = merged['rateLimit'];
  if (rateLimit !== undefined) {
    if (!isRecord(rateLimit)) {
      issues.push('rateLimit inválido');
    } else if (rateLimit['rpm'] !== undefined && !(typeof rateLimit['rpm'] === 'number' && (rateLimit['rpm'] as number) > 0)) {
      issues.push('rateLimit.rpm deve ser número positivo');
    }
  }

  const migrations = merged['migrations'];
  if (migrations !== undefined) {
    if (!Array.isArray(migrations) || !migrations.every(isString)) {
      issues.push('migrations deve ser array de caminhos SQL válidos');
    } else if (migrations.some((path) => path.includes('..') || path.startsWith('/'))) {
      issues.push('migrations com caminho fora do diretório do plugin');
    }
  }

  // Declarative admin UI slots (FEAT-098 / DECI-027): identity is mandatory,
  // capability is mandatory on menus (slot-level capability gating) and
  // metaBoxes need a non-empty screens array. context/priority/render/mode,
  // when present, must be known values (the endpoint merge applies defaults).
  const admin = merged['admin'];
  if (admin !== undefined) {
    if (!isRecord(admin)) {
      issues.push('admin must be an object');
    } else {
      const checkList = (key: string, fields: string[]): void => {
        const list = admin[key];
        if (list === undefined) return;
        if (!Array.isArray(list)) {
          issues.push(`admin.${key} must be an array`);
          return;
        }
        list.forEach((entry, index) => {
          if (!isRecord(entry) || fields.some((field) => !isString(entry[field]) || (entry[field] as string).length === 0)) {
            issues.push(`admin.${key}[${index}] missing valid ${fields.join('/')}`);
          }
        });
      };
      checkList('menuPages', ['slug', 'label', 'capability']);
      checkList('submenuPages', ['parentSlug', 'slug', 'label', 'capability']);
      checkList('dashboardWidgets', ['id', 'title', 'componentId']);
      checkList('metaBoxes', ['id', 'title', 'componentId']);
      checkList('columns', ['contentType', 'key', 'label']);
      checkList('columnRenderers', ['contentType', 'key', 'componentId']);
      checkList('actionLinks', ['label', 'url']);
      checkList('editors', ['id', 'componentId', 'mode']);

      const notices = admin['notices'];
      if (notices !== undefined) {
        if (!Array.isArray(notices)) {
          issues.push('admin.notices must be an array');
        } else {
          notices.forEach((entry, index) => {
            if (!isRecord(entry) || !isString(entry['message'])) {
              issues.push(`admin.notices[${index}] missing message`);
            } else if (!['info', 'success', 'warning', 'error'].includes(String(entry['level']))) {
              issues.push(`admin.notices[${index}].level invalid`);
            }
          });
        }
      }

      const metaBoxes = admin['metaBoxes'];
      if (Array.isArray(metaBoxes)) {
        metaBoxes.forEach((entry, index) => {
          if (!isRecord(entry)) return;
          const screens = entry['screens'];
          if (!Array.isArray(screens) || screens.length === 0 || !screens.every(isString)) {
            issues.push(`admin.metaBoxes[${index}].screens must be a non-empty array of strings`);
          }
          if (entry['context'] !== undefined && !['normal', 'side', 'advanced'].includes(String(entry['context']))) {
            issues.push(`admin.metaBoxes[${index}].context invalid`);
          }
          if (entry['priority'] !== undefined && !['high', 'default', 'low'].includes(String(entry['priority']))) {
            issues.push(`admin.metaBoxes[${index}].priority invalid`);
          }
        });
      }

      const widgets = admin['dashboardWidgets'];
      if (Array.isArray(widgets)) {
        widgets.forEach((entry, index) => {
          if (isRecord(entry) && entry['render'] !== undefined && entry['render'] !== 'component') {
            issues.push(`admin.dashboardWidgets[${index}].render invalid (expected "component")`);
          }
        });
      }

      const editors = admin['editors'];
      if (Array.isArray(editors)) {
        editors.forEach((entry, index) => {
          if (!isRecord(entry)) return;
          const screens = entry['screens'];
          if (!Array.isArray(screens) || screens.length === 0 || !screens.every(isString)) {
            issues.push(`admin.editors[${index}].screens must be a non-empty array of strings`);
          }
          if (entry['mode'] !== undefined && !['replace-body', 'below'].includes(String(entry['mode']))) {
            issues.push(`admin.editors[${index}].mode invalid (expected "replace-body" or "below")`);
          }
          if (entry['priority'] !== undefined && !(typeof entry['priority'] === 'number')) {
            issues.push(`admin.editors[${index}].priority must be a number`);
          }
        });
      }
    }
  }

  return issues;
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

  // Campos do schema v2: em strict (sync/instalação) bloqueiam; no loader
  // (runtime) apenas avisam — um plugin com campo v2 malformado não pode
  // impedir o boot dos demais.
  const v2Issues = validateManifestV2(merged);
  if (options.strict) {
    issues.push(...v2Issues);
  } else {
    for (const issue of v2Issues) {
      console.warn(`[manifest] ${merged['name'] ?? '?'}: ${issue}`);
    }
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
