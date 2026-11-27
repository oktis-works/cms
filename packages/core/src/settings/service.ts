import { randomUUID } from 'node:crypto';
import { getConnection, runInTransaction } from '@oktis-works/database';
import type { Setting } from '@oktis-works/types';
import { getCurrentTenantIdSync } from '../tenant/context.js';

type SettingInput = {
  key: string;
  value: unknown;
  group: string;
  type: string;
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
       ORDER BY "group", key, ${tenantFirstOrder(1)}`,
      params
    );
    return result as unknown as Setting[];
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
    return (result[0] as unknown as Setting) ?? null;
  }

  async set(
    key: string,
    value: unknown,
    group: string,
    type: string,
    tenantId?: string
  ): Promise<Setting> {
    const sql = getConnection();
    const currentTenantId = requireSettingTenant(tenantId);
    const input = { key, value, group, type } satisfies SettingInput;
    validateSettingInput(input);

    // The driver serializes strings, objects, arrays, and numbers directly to
    // jsonb/json. Native booleans need an explicit JSON expression on Postgres.
    const isBool = typeof value === 'boolean';
    const valueExpression = isBool
      ? "CASE WHEN $4 THEN 'true'::jsonb ELSE 'false'::jsonb END"
      : '$4::jsonb';
    const id = randomUUID();
    const result = await sql.unsafe(
      `INSERT INTO settings (id, tenant_id, key, value, "group", type)
       VALUES ($1, $2, $3, ${valueExpression}, $5, $6)
       ON CONFLICT (key, tenant_id) DO UPDATE SET
         value = ${valueExpression},
         "group" = $5,
         type = $6,
         updated_at = NOW()
       RETURNING *`,
      [id, currentTenantId, key, value, group, type]
    );

    if (result[0]) return result[0] as unknown as Setting;

    // MySQL/MariaDB strip RETURNING in the provider adapter. Fetch the row
    // explicitly so all providers expose the same service contract.
    const persisted = await sql.unsafe(
      'SELECT * FROM settings WHERE key = $1 AND tenant_id = $2 LIMIT 1',
      [key, currentTenantId]
    );
    if (!persisted[0]) throw new Error(`Setting "${key}" was not persisted`);
    return persisted[0] as unknown as Setting;
  }

  async setGlobal(key: string, value: unknown, group: string, type: string): Promise<Setting> {
    const sql = getConnection();
    const input = { key, value, group, type } satisfies SettingInput;
    validateSettingInput(input);
    const isBool = typeof value === 'boolean';
    const valueExpression = isBool
      ? "CASE WHEN $2 THEN 'true'::jsonb ELSE 'false'::jsonb END"
      : '$2::jsonb';
    const existing = await sql.unsafe('SELECT id FROM settings WHERE key = $1 AND tenant_id IS NULL LIMIT 1', [key]);
    if (existing[0]) {
      const result = await sql.unsafe(
        `UPDATE settings
         SET value = ${valueExpression}, "group" = $3, type = $4, updated_at = NOW()
         WHERE key = $1 AND tenant_id IS NULL
         RETURNING *`,
        [key, value, group, type]
      );
      return result[0] as unknown as Setting;
    }
    const result = await sql.unsafe(
      `INSERT INTO settings (id, tenant_id, key, value, "group", type)
       VALUES ($1, NULL, $2, ${isBool ? "CASE WHEN $3 THEN 'true'::jsonb ELSE 'false'::jsonb END" : '$3::jsonb'}, $4, $5)
       RETURNING *`,
      [randomUUID(), key, value, group, type]
    );
    return result[0] as unknown as Setting;
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
        result.push(await this.set(setting.key, setting.value, setting.group, setting.type, currentTenantId));
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
