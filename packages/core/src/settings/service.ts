import { randomUUID } from 'node:crypto';
import { getConnection, runInTransaction } from '@oktis-works/database';
import type { Setting } from '@oktis-works/types';
import { getCurrentTenantIdSync } from '../tenant/context.js';
import {
  normalizeSettingValue,
  normalizeStoredSetting,
  resolveSettingVisibility,
  type SettingVisibility,
} from './contract.js';

type SettingInput = {
  key: string;
  value: unknown;
  group: string;
  type: string;
  visibility?: SettingVisibility | string;
};

function requireSettingTenant(tenantId?: string): string {
  return tenantId ?? getCurrentTenantIdSync();
}

function validateSettingInput(input: SettingInput): void {
  if (!input.key.trim()) throw new Error('Setting key is required');
  if (!input.group.trim()) throw new Error('Setting group is required');
  if (!input.type.trim()) throw new Error('Setting type is required');
}

function settingScopePredicate(tenantParam: number): string {
  return `(tenant_id = $${tenantParam} OR tenant_id IS NULL)`;
}

function tenantFirstOrder(tenantParam: number): string {
  return `CASE WHEN tenant_id = $${tenantParam} THEN 0 ELSE 1 END`;
}

export class SettingsService {
  async get(group?: string, tenantId?: string): Promise<Setting[]> {
    const sql = getConnection();
    const currentTenantId = requireSettingTenant(tenantId);
    const params: unknown[] = [currentTenantId];
    const where = [settingScopePredicate(1)];

    if (group) {
      where.push('"group" = $2');
      params.push(group);
    }

    const result = await sql.unsafe(
      `SELECT * FROM settings
       WHERE ${where.join(' AND ')}
       ORDER BY ${tenantFirstOrder(1)}, "group", key`,
      params
    );
    const effective = new Map<string, Setting>();
    for (const row of result as unknown as Setting[]) {
      const normalized = normalizeStoredSetting(row);
      if (!effective.has(normalized.key)) effective.set(normalized.key, normalized as Setting);
    }
    return [...effective.values()].sort((left, right) => `${left.group}:${left.key}`.localeCompare(`${right.group}:${right.key}`));
  }

  async getByKey(key: string, tenantId?: string): Promise<Setting | null> {
    const sql = getConnection();
    const currentTenantId = requireSettingTenant(tenantId);
    const result = await sql.unsafe(
      `SELECT * FROM settings
       WHERE key = $1 AND ${settingScopePredicate(2)}
       ORDER BY ${tenantFirstOrder(2)}
       LIMIT 1`,
      [key, currentTenantId]
    );
    return result[0] ? normalizeStoredSetting(result[0] as unknown as Setting) as Setting : null;
  }

  async set(
    key: string,
    value: unknown,
    group: string,
    type: string,
    tenantId?: string,
    requestedVisibility?: SettingVisibility | string,
  ): Promise<Setting> {
    const sql = getConnection();
    const currentTenantId = requireSettingTenant(tenantId);
    const input = { key, value, group, type, visibility: requestedVisibility } satisfies SettingInput;
    validateSettingInput(input);
    const normalized = normalizeSettingValue(key, value, type);
    const visibility = resolveSettingVisibility(key, input.visibility);

    // The driver serializes strings, objects, arrays, and numbers directly to
    // jsonb/json. Native booleans need an explicit JSON expression on Postgres.
    const isBool = typeof normalized.value === 'boolean';
    const valueExpression = isBool
      ? "CASE WHEN $4 THEN 'true'::jsonb ELSE 'false'::jsonb END"
      : '$4::jsonb';
    const id = randomUUID();
    const result = await sql.unsafe(
      `INSERT INTO settings (id, tenant_id, key, value, "group", type, visibility)
       VALUES ($1, $2, $3, ${valueExpression}, $5, $6, $7)
       ON CONFLICT (key, tenant_id) DO UPDATE SET
         value = ${valueExpression},
         "group" = $5,
         type = $6,
         visibility = $7,
         updated_at = NOW()
       RETURNING *`,
      [id, currentTenantId, key, normalized.value, group, normalized.type, visibility]
    );

    if (result[0]) return normalizeStoredSetting(result[0] as unknown as Setting) as Setting;

    // MySQL/MariaDB strip RETURNING in the provider adapter. Fetch the row
    // explicitly so all providers expose the same service contract.
    const persisted = await sql.unsafe(
      'SELECT * FROM settings WHERE key = $1 AND tenant_id = $2 LIMIT 1',
      [key, currentTenantId]
    );
    if (!persisted[0]) throw new Error(`Setting "${key}" was not persisted`);
    return normalizeStoredSetting(persisted[0] as unknown as Setting) as Setting;
  }

  async setGlobal(key: string, value: unknown, group: string, type: string, visibility?: SettingVisibility | string): Promise<Setting> {
    return runInTransaction(async () => {
      const sql = getConnection();
      const input = { key, value, group, type, visibility } satisfies SettingInput;
      validateSettingInput(input);
      const normalized = normalizeSettingValue(key, value, type);
      const effectiveVisibility = resolveSettingVisibility(key, visibility);
      const isBool = typeof normalized.value === 'boolean';
      const valueExpression = isBool
        ? "CASE WHEN $2 THEN 'true'::jsonb ELSE 'false'::jsonb END"
        : '$2::jsonb';
      const update = async (): Promise<Setting | null> => {
        const updated = await sql.unsafe(
          `UPDATE settings
           SET value = ${valueExpression}, "group" = $3, type = $4, visibility = $5, updated_at = NOW()
           WHERE key = $1 AND tenant_id IS NULL
           RETURNING *`,
          [key, normalized.value, group, normalized.type, effectiveVisibility]
        );
        return updated[0] ? normalizeStoredSetting(updated[0] as unknown as Setting) as Setting : null;
      };
      const existing = await update();
      if (existing) return existing;
      try {
        const inserted = await sql.unsafe(
          `INSERT INTO settings (id, tenant_id, key, value, "group", type, visibility)
           VALUES ($1, NULL, $2, ${isBool ? "CASE WHEN $3 THEN 'true'::jsonb ELSE 'false'::jsonb END" : '$3::jsonb'}, $4, $5, $6)
           RETURNING *`,
          [randomUUID(), key, normalized.value, group, normalized.type, effectiveVisibility]
        );
        if (inserted[0]) return normalizeStoredSetting(inserted[0] as unknown as Setting) as Setting;
      } catch {
        const raced = await update();
        if (raced) return raced;
        throw new Error(`Global setting "${key}" was not persisted`);
      }
      const persisted = await sql.unsafe('SELECT * FROM settings WHERE key = $1 AND tenant_id IS NULL LIMIT 1', [key]);
      if (!persisted[0]) throw new Error(`Global setting "${key}" was not persisted`);
      return normalizeStoredSetting(persisted[0] as unknown as Setting) as Setting;
    });
  }

  async setMany(
    settings: SettingInput[],
    tenantId?: string
  ): Promise<Setting[]> {
    settings.forEach(validateSettingInput);
    const currentTenantId = requireSettingTenant(tenantId);
    return runInTransaction(async () => {
      const result: Setting[] = [];
      for (const setting of settings) {
        result.push(await this.set(setting.key, setting.value, setting.group, setting.type, currentTenantId, setting.visibility));
      }
      return result as unknown as Setting[];
    });
  }

  async delete(key: string, tenantId?: string): Promise<boolean> {
    const sql = getConnection();
    const currentTenantId = requireSettingTenant(tenantId);
    const existing = await sql.unsafe(
      'SELECT id FROM settings WHERE key = $1 AND tenant_id = $2 LIMIT 1',
      [key, currentTenantId]
    );
    if (existing.length === 0) return false;

    await sql.unsafe('DELETE FROM settings WHERE key = $1 AND tenant_id = $2', [key, currentTenantId]);

    return true;
  }

  async getGroup(group: string, tenantId?: string): Promise<Setting[]> {
    return this.get(group, tenantId);
  }
}

export const settingsService = new SettingsService();
