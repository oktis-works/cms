// @oktis-works/plugin-runtime - Single source of truth for reading plugin manifests
//
// Historically:
//   - the admin sync and the CLI read only `manifest.json`;
//   - npm plugins could skip it and live off `package.json` (fields then came
//     from the database — invisible in the admin). Everything now goes through
//     `readPluginManifest`:
//
//   - **precedence**: `manifest.json` (the OkCMS canonical) wins over
//     `package.json` (npm format); fields missing from `manifest.json` are
//     filled from npm;
//   - **validation**: `name`/`version` required; an explicit `type` other than
//     'plugin' is rejected (e.g. a theme.json/manifest inside plugins/);
//   - `strict` (sync/install) demands more than `main` and returns `issues`.
//     para o chamador decidir; o loader usa `strict = false` (leniente).

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { PluginManifest } from '@oktis-works/plugin-sdk';
import { validatePermissions } from '@oktis-works/plugin-sdk';

export type ManifestSource = 'manifest.json' | 'package.json';

export interface ReadManifestResult {
  manifest: PluginManifest | null;
  source: ManifestSource | null;
  /** Found issues (the rejection reason when `manifest` is null). */
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
 * valid). Returns the found issues; empty = valid.
 */
export function validateManifestV2(merged: Record<string, unknown>): string[] {
  const issues: string[] = [];

  const manifestVersion = merged['manifestVersion'];
  if (manifestVersion !== undefined && manifestVersion !== 1 && manifestVersion !== 2) {
    issues.push(`manifestVersion "${String(manifestVersion)}" invalid (expected 1 or 2)`);
  }

  // Permissions: unknown ones are rejected (the plugin-sdk catalog).
  const permissions = merged['permissions'];
  if (Array.isArray(permissions)) {
    for (const unknown of validatePermissions(permissions.filter(isString))) {
      issues.push(`unknown permission "${unknown}"`);
    }
  }

  const blocks = merged['blocks'];
  if (Array.isArray(blocks)) {
    for (const block of blocks) {
      if (!isRecord(block) || !isString(block['type']) || !isString(block['label']) || !isString(block['icon']) || !isString(block['adminComponentPath'])) {
        issues.push('block missing valid type/label/icon/adminComponentPath');
      }
    }
  }

  const patterns = merged['patterns'];
  if (Array.isArray(patterns)) {
    for (const pattern of patterns) {
      if (!isRecord(pattern) || !isString(pattern['name']) || !isString(pattern['label']) || !isString(pattern['content']) || (pattern['content'] as string).length === 0) {
        issues.push('pattern missing valid name/label/content');
      }
    }
  }

  const locales = merged['locales'];
  if (locales !== undefined) {
    if (!Array.isArray(locales) || !locales.every(isString)) {
      issues.push('locales must be an array of file paths');
    } else if (locales.some((path) => path.includes('..') || path.startsWith('/'))) {
      issues.push('locales with paths outside the plugin directory');
    }
  }

  const postTypes = merged['postTypes'];
  if (Array.isArray(postTypes)) {
    for (const postType of postTypes) {
      if (!isRecord(postType) || !isString(postType['key']) || !isString(postType['label'])) {
        issues.push('postType missing valid key/label');
      }
    }
  }

  const taxonomies = merged['taxonomies'];
  if (Array.isArray(taxonomies)) {
    for (const taxonomy of taxonomies) {
      if (!isRecord(taxonomy) || !isString(taxonomy['key']) || !isString(taxonomy['label']) || !Array.isArray(taxonomy['postTypes'])) {
        issues.push('taxonomy missing valid key/label/postTypes');
      }
    }
  }

  const scheduleJobs = merged['scheduleJobs'];
  if (Array.isArray(scheduleJobs)) {
    for (const job of scheduleJobs) {
      if (!isRecord(job) || !isString(job['name'])) {
        issues.push('scheduleJob missing a name');
        continue;
      }
      const hasEvery = typeof job['every'] === 'number' && (job['every'] as number) > 0;
      const hasCron = isString(job['cron']);
      if (hasEvery === hasCron) {
        issues.push(`scheduleJob "${job['name']}" requires exactly one of: every | cron`);
      }
    }
  }

  const httpPolicy = merged['httpPolicy'];
  if (httpPolicy !== undefined) {
    if (!isRecord(httpPolicy)) {
      issues.push('httpPolicy invalid');
    } else if (httpPolicy['allowHosts'] !== undefined && !Array.isArray(httpPolicy['allowHosts'])) {
      issues.push('httpPolicy.allowHosts must be an array of hosts');
    }
  }

  const rateLimit = merged['rateLimit'];
  if (rateLimit !== undefined) {
    if (!isRecord(rateLimit)) {
      issues.push('rateLimit invalid');
    } else if (rateLimit['rpm'] !== undefined && !(typeof rateLimit['rpm'] === 'number' && (rateLimit['rpm'] as number) > 0)) {
      issues.push('rateLimit.rpm must be a positive number');
    }
  }

  const migrations = merged['migrations'];
  if (migrations !== undefined) {
    if (!Array.isArray(migrations) || !migrations.every(isString)) {
      issues.push('migrations must be an array of valid SQL paths');
    } else if (migrations.some((path) => path.includes('..') || path.startsWith('/'))) {
      issues.push('migrations with paths outside the plugin directory');
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
 * Reads a plugin directory's manifest with a single precedence rule.
 *
 * @param dir the plugin directory
 * @param options.strict exige `main` e valida `type === 'plugin'` quando
 *        declared (used by sync/install/CLI)
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
    issues.push(`type "${String(type)}" is not "plugin"`);
  }

  const main = merged['main'];
  if (options.strict && typeof main !== 'string') {
    issues.push('manifest sem "main" (entrypoint)');
  }

  // v2 schema fields: in strict mode (sync/install) they block; in the
  // loader (runtime) they only warn — a plugin with a malformed v2 field
  // must not prevent the other plugins from booting.
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
 * Normalizes the manifest for database storage (keeps only known fields,
 * preserving the author's legitimate extra fields).
 */
export function normalizePluginManifest(manifest: PluginManifest): Record<string, unknown> {
  return manifest as unknown as Record<string, unknown>;
}
