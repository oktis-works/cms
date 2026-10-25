import { randomUUID } from 'node:crypto';
import { existsSync, realpathSync } from 'node:fs';
import { readdir, readFile, rm } from 'node:fs/promises';
import { join, resolve, sep } from 'node:path';
import { getConnection, runInTransaction } from '@oktis-works/database';
import type { Theme, ThemeSettingField } from '@oktis-works/types';
import { checkExtensionCompatibility } from '@oktis-works/validation';
import { resolveExtensionDirectory } from '../extensions/project-directories.js';

const SAFE_NAME_RE = /^[a-z0-9][a-z0-9_-]*$/i;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Resultado da validação de config de tema. */
interface ThemeConfigValidationResult {
  valid: boolean;
  errors: string[];
  sanitized: Record<string, unknown>;
}

/**
 * Valida e sanitiza o config do tema contra o schema do manifesto.
 * - Rejeita chaves não declaradas no manifest.settings
 * - Valida required, type, min/max, minLength/maxLength, pattern, enum (select)
 * - Sanitiza HTML em wysiwyg/textarea (strip tags perigosos)
 * - Para repeater/flexible_content/group: valida recursivamente subFields
 */
function validateThemeConfig(
  config: Record<string, unknown>,
  manifestSettings: unknown[],
  allowExtraKeys = false
): ThemeConfigValidationResult {
  const errors: string[] = [];
  const sanitized: Record<string, unknown> = {};
  const allowedKeys = new Set<string>();

  // Build allowed keys set from manifest
  const declaredSettings = Array.isArray(manifestSettings) ? manifestSettings : [];
  for (const field of declaredSettings) {
    if (!field || typeof field !== 'object') continue;
    const record = field as Record<string, unknown>;
    const name = record['name'];
    if (typeof name === 'string' && name) {
      allowedKeys.add(name);
    }
  }

  // Validate each key in config
  for (const [key, value] of Object.entries(config)) {
    if (!allowedKeys.has(key)) {
      if (!allowExtraKeys) {
        errors.push(`Setting "${key}" is not declared in theme manifest.settings`);
        continue; // Skip undeclared keys
      }
      // In allowExtraKeys mode, accept the value as-is
      sanitized[key] = value;
      continue;
    }

    // Find field definition
    const fieldDef = declaredSettings.find((f) => {
      if (!f || typeof f !== 'object') return false;
      return (f as Record<string, unknown>)['name'] === key;
    }) as ThemeSettingField | undefined;

    if (!fieldDef) {
      // Should not happen since allowedKeys check passed
      continue;
    }

    // Validate required
    if (fieldDef.required && (value === undefined || value === null || value === '')) {
      errors.push(`Setting "${key}" is required`);
      continue;
    }

    // If value is empty and not required, skip further validation
    if (value === undefined || value === null || value === '') {
      sanitized[key] = fieldDef.default ?? '';
      continue;
    }

    // Type-specific validation
    const validation = validateFieldValue(key, value, fieldDef);
    if (!validation.valid) {
      errors.push(...validation.errors);
      continue;
    }
    sanitized[key] = validation.sanitized;
  }

  return { valid: errors.length === 0, errors, sanitized };
}

/** Valida um valor individual contra a definição do campo. */
function validateFieldValue(
  key: string,
  value: unknown,
  field: ThemeSettingField
): { valid: boolean; errors: string[]; sanitized: unknown } {
  const errors: string[] = [];
  let sanitized: unknown = value;
  const type = field.type ?? 'text';

  switch (type) {
    case 'text':
    case 'textarea':
    case 'wysiwyg': {
      if (typeof value !== 'string') {
        errors.push(`Setting "${key}" must be a string`);
        break;
      }
      if (field.minLength !== undefined && value.length < field.minLength) {
        errors.push(`Setting "${key}" must be at least ${field.minLength} characters`);
      }
      if (field.maxLength !== undefined && value.length > field.maxLength) {
        errors.push(`Setting "${key}" must be at most ${field.maxLength} characters`);
      }
      if (field.pattern && typeof field.pattern === 'string') {
        try {
          const re = new RegExp(field.pattern);
          if (!re.test(value)) {
            errors.push(`Setting "${key}" does not match required pattern`);
          }
        } catch {
          errors.push(`Setting "${key}" has invalid pattern regex`);
        }
      }
      // Sanitize HTML for wysiwyg/textarea
      if ((type === 'wysiwyg' || type === 'textarea') && value.includes('<')) {
        sanitized = sanitizeHtml(value);
      }
      break;
    }

    case 'select': {
      if (typeof value !== 'string') {
        errors.push(`Setting "${key}" must be a string`);
        break;
      }
      const options = field.options ?? [];
      const validValues = options.map((o) => (typeof o === 'string' ? o : o.value));
      if (options.length > 0 && !validValues.includes(value)) {
        errors.push(`Setting "${key}" must be one of: ${validValues.join(', ')}`);
      }
      break;
    }

    case 'checkbox': {
      if (typeof value !== 'boolean') {
        errors.push(`Setting "${key}" must be a boolean`);
      } else {
        sanitized = value;
      }
      break;
    }

    case 'color': {
      if (typeof value !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(value)) {
        errors.push(`Setting "${key}" must be a valid hex color (e.g., #ff0000)`);
      }
      break;
    }

    case 'number': {
      const num = Number(value);
      if (!Number.isFinite(num)) {
        errors.push(`Setting "${key}" must be a number`);
        break;
      }
      if (field.min !== undefined && num < field.min) {
        errors.push(`Setting "${key}" must be at least ${field.min}`);
      }
      if (field.max !== undefined && num > field.max) {
        errors.push(`Setting "${key}" must be at most ${field.max}`);
      }
      sanitized = num;
      break;
    }

    case 'date_picker':
    case 'date_time_picker':
    case 'time_picker': {
      if (typeof value !== 'string') {
        errors.push(`Setting "${key}" must be a string`);
        break;
      }
      // Basic format validation (YYYY-MM-DD, YYYY-MM-DDTHH:mm, HH:mm)
      const patterns = {
        date_picker: /^\d{4}-\d{2}-\d{2}$/,
        date_time_picker: /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/,
        time_picker: /^\d{2}:\d{2}$/,
      };
      if (!patterns[type].test(value)) {
        errors.push(`Setting "${key}" has invalid format`);
      } else if (type === 'date_picker' || type === 'date_time_picker') {
        const parsed = new Date(value);
        if (Number.isNaN(parsed.getTime())) errors.push(`Setting "${key}" has an invalid date`);
      } else {
        const [hours = 0, minutes = 0] = value.split(':').map(Number);
        if (hours > 23 || minutes > 59) errors.push(`Setting "${key}" has an invalid time`);
      }
      break;
    }

    case 'google_map': {
      if (!isPlainObject(value)) {
        errors.push(`Setting "${key}" must be an object with address, lat, lng`);
        break;
      }
      const map = value as Record<string, unknown>;
      if (typeof map['address'] !== 'string' || typeof map['lat'] !== 'number' || typeof map['lng'] !== 'number') {
        errors.push(`Setting "${key}" must have address (string), lat (number), lng (number)`);
      }
      const lat = map['lat'] as number | undefined;
      const lng = map['lng'] as number | undefined;
      if (lat !== undefined && (lat < -90 || lat > 90)) {
        errors.push(`Setting "${key}" latitude must be between -90 and 90`);
      }
      if (lng !== undefined && (lng < -180 || lng > 180)) {
        errors.push(`Setting "${key}" longitude must be between -180 and 180`);
      }
      break;
    }

    case 'link': {
      if (!isPlainObject(value)) {
        errors.push(`Setting "${key}" must be an object with url and target`);
        break;
      }
      const link = value as Record<string, unknown>;
      if (typeof link['url'] !== 'string' || !link['url']) {
        errors.push(`Setting "${key}" must have a url`);
      } else if (!/^(?:https?:|mailto:|tel:|\/|#)/i.test(link['url'])) {
        errors.push(`Setting "${key}" has an unsafe url protocol`);
      }
      if (link['target'] !== undefined && !['_self', '_blank'].includes(link['target'] as string)) {
        errors.push(`Setting "${key}" target must be _self or _blank`);
      }
      break;
    }

    case 'relationship':
    case 'post_object': {
      // Value can be string (single) or string[] (multiple)
      if ((!Array.isArray(value) && typeof value !== 'string') || (Array.isArray(value) && value.some((item) => typeof item !== 'string'))) {
        errors.push(`Setting "${key}" must be a string or array of strings`);
      }
      break;
    }

    case 'taxonomy':
    case 'user': {
      if ((!Array.isArray(value) && typeof value !== 'string') || (Array.isArray(value) && value.some((item) => typeof item !== 'string'))) {
        errors.push(`Setting "${key}" must be a string or array of strings`);
      }
      break;
    }

    case 'repeater': {
      if (!Array.isArray(value)) {
        errors.push(`Setting "${key}" must be an array`);
        break;
      }
      const subFields = field.subFields ?? [];
      if (subFields.length > 0) {
        const sanitizedRows: Record<string, unknown>[] = [];
        for (let i = 0; i < value.length; i++) {
          const row = value[i];
          if (!isPlainObject(row)) {
            errors.push(`Setting "${key}[${i}]" must be an object`);
            continue;
          }
          const rowResult = validateThemeConfig(row, subFields);
          if (!rowResult.valid) {
            errors.push(...rowResult.errors.map((e) => `${key}[${i}]: ${e}`));
          }
          sanitizedRows.push(rowResult.sanitized);
        }
        sanitized = sanitizedRows;
      } else {
        sanitized = value;
      }
      break;
    }

    case 'flexible_content': {
      if (!Array.isArray(value)) {
        errors.push(`Setting "${key}" must be an array`);
        break;
      }
      const layouts = field.layouts ?? [];
      const sanitizedRows: Record<string, unknown>[] = [];
      for (let i = 0; i < value.length; i++) {
        const row = value[i];
        if (!isPlainObject(row)) {
          errors.push(`Setting "${key}[${i}]" must be an object`);
          continue;
        }
        const rowRecord = row as Record<string, unknown>;
        const layoutName = rowRecord['fc_layout'] as string;
        const layoutDef = layouts.find((l) => l.name === layoutName);
        if (!layoutDef) {
          errors.push(`Setting "${key}[${i}]" has unknown layout "${layoutName}"`);
          continue;
        }
        const subFields = layoutDef.subFields ?? [];
        if (subFields.length > 0) {
          const rowData = { ...row };
          delete rowData['fc_layout'];
          const rowResult = validateThemeConfig(rowData, subFields);
          if (!rowResult.valid) {
            errors.push(...rowResult.errors.map((e) => `${key}[${i}]: ${e}`));
          }
          sanitizedRows.push({ fc_layout: layoutName, ...rowResult.sanitized });
        } else {
          sanitizedRows.push({ ...rowRecord });
        }
      }
      sanitized = sanitizedRows;
      break;
    }

    case 'group': {
      if (!isPlainObject(value)) {
        errors.push(`Setting "${key}" must be an object`);
        break;
      }
      const subFields = field.subFields ?? [];
      if (subFields.length > 0) {
        const groupResult = validateThemeConfig(value as Record<string, unknown>, subFields);
        if (!groupResult.valid) {
          errors.push(...groupResult.errors.map((e) => `${key}: ${e}`));
        }
        sanitized = groupResult.sanitized;
      }
      break;
    }

    case 'image':
    case 'file':
    case 'gallery': {
      const values = type === 'gallery' || Array.isArray(value) ? (Array.isArray(value) ? value : [value]) : [value];
      if (values.some((item) => typeof item !== 'string' && typeof item !== 'number')) {
        errors.push(`Setting "${key}" must contain media identifiers`);
      } else {
        sanitized = type === 'gallery' || Array.isArray(value) ? values : values[0];
      }
      break;
    }

    default:
      // Unknown type - accept as-is but warn
      break;
  }

  return { valid: errors.length === 0, errors, sanitized };
}

/** Sanitização básica de HTML para prevenir XSS em campos wysiwyg/textarea. */
function sanitizeHtml(html: string): string {
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '') // Remove script tags
    .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '') // Remove iframe tags
    .replace(/<(?:object|embed|applet)\b[^>]*>/gi, '')
    .replace(/on\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/(?:javascript|vbscript|data):/gi, '');
}

export class ThemeService {
  /**
   * Descobre temas presentes no diretório configurado do projeto e faz upsert
   * por nome. Só `theme.json` (nome canônico — o legado `manifest.json` é
   * unificado pelos entry points do CLI, ver theme-migrate.ts). A listagem
   * retornada é o estado do banco COMPLETO: temas removidos do disco continuam
   * visíveis para desinstalação.
   */
  async syncFromDirectory(): Promise<Theme[]> {
    const directory = resolveExtensionDirectory('theme');
    let entries;
    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch {
      // Sem diretório/sem permissão: devolve o que já está registrado.
      return this.list();
    }

    const sql = getConnection();

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const manifest = await this.readManifest(join(directory, entry.name));
      if (!manifest) continue;

      const name = typeof manifest['name'] === 'string' ? manifest['name'].trim() : '';
      const version = typeof manifest['version'] === 'string' ? manifest['version'].trim() : '';
      if (!SAFE_NAME_RE.test(name) || !version) continue;

      const compatibilityIssues = checkExtensionCompatibility('theme', { ...manifest, name, version });
      if (compatibilityIssues.length > 0) continue;

      const existing = await this.getByName(name);
      if (existing) {
        const status = existing.status === 'INACTIVE' || existing.status === 'ACTIVE' ? existing.status : 'INSTALLED';
        await sql.unsafe(
          `UPDATE themes SET version = $1, manifest = $2::jsonb, status = $3, updated_at = NOW() WHERE id = $4`,
          [version, manifest, status, existing.id]
        );
      } else {
        await sql.unsafe(
          `INSERT INTO themes (id, name, version, status, manifest, config, installed_at, updated_at)
           VALUES ($1, $2, $3, 'INSTALLED', $4::jsonb, $5::jsonb, NOW(), NOW())`,
          [randomUUID(), name, version, manifest, {}]
        );
      }
    }

    return this.list();
  }

  /** Lê o theme.json (nome canônico) do diretório do tema. */
  private async readManifest(themeDir: string): Promise<Record<string, unknown> | null> {
    try {
      const raw = await readFile(join(themeDir, 'theme.json'), 'utf8');
      const manifest = JSON.parse(raw) as unknown;
      if (isPlainObject(manifest)) return manifest;
    } catch {
      // ausente/inválido: tema não descoberto até a migração do CLI rodar
    }
    return null;
  }

  async list(): Promise<Theme[]> {
    const sql = getConnection();
    const result = await sql.unsafe('SELECT * FROM themes ORDER BY name ASC');
    return result as unknown as Theme[];
  }

  async getById(id: string): Promise<Theme | null> {
    const sql = getConnection();
    const result = await sql.unsafe('SELECT * FROM themes WHERE id = $1', [id]);
    return (result[0] as unknown as Theme) ?? null;
  }

  async getByName(name: string): Promise<Theme | null> {
    const sql = getConnection();
    const result = await sql.unsafe('SELECT * FROM themes WHERE name = $1', [name]);
    return (result[0] as unknown as Theme) ?? null;
  }

  /**
   * Registra um tema enviado via API (instalação explícita). O manifesto
   * precisa do contrato BUSI-022 completo (name, version, type, compatibility).
   */
  async install(input: {
    name: string;
    version: string;
    manifest: Record<string, unknown>;
    config?: Record<string, unknown>;
  }): Promise<Theme> {
    const name = typeof input.name === 'string' ? input.name.trim() : '';
    if (!SAFE_NAME_RE.test(name) || name.includes('..') || name.length > 100) {
      throw new Error(`Invalid theme name: "${input.name}" (use [a-z0-9-_], max 100 chars)`);
    }

    const version = typeof input.version === 'string' ? input.version.trim() : '';
    if (!version) throw new Error('Theme version is required');

    if (!isPlainObject(input.manifest)) {
      throw new Error('Theme manifest must be an object');
    }

    // BUSI-022: o manifesto precisa declarar type: "theme" e compatibility.okcms.
    const issues = checkExtensionCompatibility('theme', { ...input.manifest, name, version });
    if (issues.length > 0) {
      throw new Error(`Invalid theme manifest: ${issues.map((issue) => issue.message).join('; ')}`);
    }

    const installConfig = input.config ?? {};
    if (!isPlainObject(installConfig)) throw new Error('Theme config must be an object');
    const configValidation = validateThemeConfig(
      installConfig,
      Array.isArray(input.manifest['settings']) ? input.manifest['settings'] : []
    );
    if (!configValidation.valid) {
      throw new Error(`Theme config validation failed: ${configValidation.errors.join('; ')}`);
    }

    const duplicate = await this.getByName(name);
    if (duplicate) {
      throw new Error(`Theme "${name}" is already installed (id ${duplicate.id})`);
    }

    const sql = getConnection();
    const id = randomUUID();

    const result = await sql.unsafe(
      `INSERT INTO themes (id, name, version, status, manifest, config, installed_at, created_at, updated_at)
       VALUES ($1, $2, $3, 'INSTALLED', $4::jsonb, $5::jsonb, NOW(), NOW(), NOW())
       RETURNING *`,
      [id, name, version, { ...input.manifest, name, version }, configValidation.sanitized]
    );

    return result[0] as unknown as Theme;
  }

  /**
   * Ativa um tema DESATIVANDO os demais (invariante: um único ACTIVE por
   * tenant, garantida também pelo índice parcial idx_themes_single_active).
   */
  async activate(id: string): Promise<Theme | null> {
    return runInTransaction(async () => {
      const sql = getConnection();
      const selected = await sql.unsafe('SELECT * FROM themes WHERE id = $1 FOR UPDATE', [id]);
      const existing = (selected[0] as unknown as Theme & { tenant_id?: string | null }) ?? null;
      if (!existing) return null;
      const themeDir = join(resolveExtensionDirectory('theme'), existing.name);
      if (!existsSync(join(themeDir, 'theme.json'))) {
        throw new Error(`Theme files are missing for "${existing.name}"`);
      }

      await sql.unsafe(
        `UPDATE themes SET status = 'INACTIVE', updated_at = NOW()
         WHERE status = 'ACTIVE' AND id <> $1 AND tenant_id IS NOT DISTINCT FROM $2`,
        [id, existing.tenant_id ?? null]
      );

      const result = await sql.unsafe(
        `UPDATE themes
         SET status = 'ACTIVE', activated_at = NOW(), updated_at = NOW()
         WHERE id = $1
         RETURNING *`,
        [id]
      );

      return (result[0] as unknown as Theme) ?? null;
    });
  }

  /**
   * Deactivates a theme. Invariant: the site must always keep an active
   * theme — deactivation is refused while it is the only registered theme;
   * with multiple themes the admin re-activates one of the others.
   */
  async deactivate(id: string): Promise<Theme | null> {
    return runInTransaction(async () => {
      const sql = getConnection();
      const selected = await sql.unsafe('SELECT * FROM themes WHERE id = $1 FOR UPDATE', [id]);
      const existing = (selected[0] as unknown as Theme & { tenant_id?: string | null }) ?? null;
      if (!existing) return null;

      if (existing.status === 'ACTIVE') {
        const countResult = await sql.unsafe(
          `SELECT COUNT(*)::int AS count FROM themes
           WHERE status = 'ACTIVE' AND tenant_id IS NOT DISTINCT FROM $1`,
          [existing.tenant_id ?? null]
        );
        const activeCount = Number((countResult[0] as { count?: number | string } | undefined)?.count ?? 0);
        if (activeCount <= 1) {
          throw new Error('Cannot deactivate the only active theme in this scope');
        }
      }

      const result = await sql.unsafe(
        `UPDATE themes
         SET status = 'INACTIVE', updated_at = NOW()
         WHERE id = $1
         RETURNING *`,
        [id]
      );

      return (result[0] as unknown as Theme) ?? null;
    });
  }

  /** Tema ativo atual (fonte única lida pelo app web na renderização). */
  async getActive(): Promise<Theme | null> {
    const sql = getConnection();
    const result = await sql.unsafe(
      `SELECT * FROM themes WHERE status = 'ACTIVE'
       ORDER BY (tenant_id IS NULL), activated_at DESC NULLS LAST, created_at DESC
       LIMIT 1`
    );
    return (result[0] as unknown as Theme) ?? null;
  }

  /** Atualiza o config (customizador) do tema — validado contra manifest.settings. */
  async updateConfig(id: string, config: unknown, userId?: string, allowExtraKeys?: boolean): Promise<Theme | null> {
    if (!isPlainObject(config)) {
      throw new Error('Theme config must be an object');
    }

    return runInTransaction(async () => {
      const sql = getConnection();
      const selected = await sql.unsafe('SELECT * FROM themes WHERE id = $1 FOR UPDATE', [id]);
      const existing = (selected[0] as unknown as Theme) ?? null;
      if (!existing) return null;

      const manifest = existing.manifest as { settings?: unknown[] } | null;
      const manifestSettings = manifest?.settings ?? [];
      const validation = validateThemeConfig(config as Record<string, unknown>, manifestSettings, allowExtraKeys);

      if (!validation.valid) {
        throw new Error(`Theme config validation failed: ${validation.errors.join('; ')}`);
      }

      await sql.unsafe(
        `INSERT INTO theme_config_versions (theme_id, config, user_id, change_summary)
         VALUES ($1, $2::jsonb, $3, $4)`,
        [id, existing.config ?? {}, userId ?? null, 'Config updated via API']
      );

      const result = await sql.unsafe(
        `UPDATE themes SET config = $1::jsonb, updated_at = NOW() WHERE id = $2 RETURNING *`,
        [allowExtraKeys ? config : validation.sanitized, id]
      );

      return (result[0] as unknown as Theme) ?? null;
    });
  }

  async uninstall(id: string): Promise<boolean> {
    const existing = await this.getById(id);
    if (!existing) return false;
    if (existing.status === 'ACTIVE') {
      throw new Error('Cannot uninstall the active theme; activate another theme first');
    }

    const sql = getConnection();
    await sql.unsafe('DELETE FROM themes WHERE id = $1', [id]);

    const themesRoot = resolveExtensionDirectory('theme');
    const root = resolve(themesRoot);
    const themeDir = resolve(root, existing.name);
    if (themeDir.startsWith(root + sep) && existsSync(themeDir)) {
      const realRoot = realpathSync(root);
      const realThemeDir = realpathSync(themeDir);
      if (realThemeDir.startsWith(realRoot + sep)) {
        await rm(realThemeDir, { recursive: true, force: true });
      }
    }

    return true;
  }

  /** Export theme config as JSON. */
  async exportConfig(id: string): Promise<{ config: Record<string, unknown>; manifest: Record<string, unknown>; exportedAt: string } | null> {
    const theme = await this.getById(id);
    if (!theme) return null;

    return {
      config: theme.config ?? {},
      manifest: theme.manifest as unknown as Record<string, unknown>,
      exportedAt: new Date().toISOString(),
    };
  }

  /** Import theme config from JSON, validating against manifest. */
  async importConfig(id: string, config: Record<string, unknown>, options?: { mode?: 'merge' | 'replace' }): Promise<Theme | null> {
    const existing = await this.getById(id);
    if (!existing) return null;

    const mode = options?.mode ?? 'merge';
    const manifest = existing.manifest as { settings?: any[] } | null;
    const manifestSettings = manifest?.settings ?? [];

    // In replace mode, we allow any keys (full config replacement)
    // In merge mode, we validate against manifest
    let validation;
    if (mode === 'replace') {
      // In replace mode, we accept any config but still sanitize known fields
      validation = validateThemeConfig(config, manifestSettings, true);
    } else {
      validation = validateThemeConfig(config, manifestSettings);
    }
    if (!validation.valid) {
      throw new Error(`Theme config validation failed: ${validation.errors.join('; ')}`);
    }

    let newConfig: Record<string, unknown>;
    if (mode === 'replace') {
      // In replace mode, use the full config (not just sanitized)
      newConfig = config;
    } else {
      newConfig = { ...(existing.config ?? {}), ...validation.sanitized };
    }

    return this.updateConfig(id, newConfig, undefined, mode === 'replace');
  }

  /** Get config version history for a theme. */
  async getConfigHistory(id: string, limit = 50, offset = 0): Promise<Array<{ id: string; config: Record<string, unknown>; userId: string | null; changeSummary: string | null; createdAt: Date }>> {
    const sql = getConnection();
    const rows = await sql.unsafe(
      `SELECT id, config, user_id, change_summary, created_at
       FROM theme_config_versions
       WHERE theme_id = $1
       ORDER BY created_at DESC
       LIMIT $2 OFFSET $3`,
      [id, limit, offset]
    );
    return rows as unknown as Array<{ id: string; config: Record<string, unknown>; userId: string | null; changeSummary: string | null; createdAt: Date }>;
  }

  /** Restore a previous config version. */
  async restoreConfigVersion(themeId: string, versionId: string, userId: string | null): Promise<Theme | null> {
    const sql = getConnection();
    const version = await sql.unsafe(
      `SELECT config FROM theme_config_versions WHERE id = $1 AND theme_id = $2`,
      [versionId, themeId]
    );
    if (!version[0]) return null;

    const config = version[0]['config'] as Record<string, unknown>;
    return this.updateConfig(themeId, config, userId ?? undefined);
  }
}

export const themeService = new ThemeService();
