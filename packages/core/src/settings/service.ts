import { randomUUID } from 'node:crypto';
import { getConnection } from '@oktis-works/database';
import type { Setting } from '@oktis-works/types';

export class SettingsService {
  async get(group?: string): Promise<Setting[]> {
    const sql = getConnection();

    if (group) {
      const result = await sql.unsafe('SELECT * FROM settings WHERE "group" = $1 ORDER BY key', [group]);
      return result as unknown as Setting[];
    }

    const result = await sql.unsafe('SELECT * FROM settings ORDER BY "group", key');
    return result as unknown as Setting[];
  }

  async getByKey(key: string): Promise<Setting | null> {
    const sql = getConnection();
    const result = await sql.unsafe('SELECT * FROM settings WHERE key = $1', [key]);
    return (result[0] as unknown as Setting) ?? null;
  }

  async set(
    key: string,
    value: unknown,
    group?: string,
    type?: string
  ): Promise<Setting> {
    const sql = getConnection();

    // O driver serializa string/object/array/number direto para jsonb, mas
    // boolean nativo não tem cast para jsonb (boolean::jsonb não existe).
    // Nesse caso o valor vira literal jsonb via CASE WHEN — o param continua
    // boolean puro e cada variante tem seu próprio texto de prepared stmt.
    const isBool = typeof value === 'boolean';
    const jsonbExpr = (n: number): string =>
      isBool
        ? `CASE WHEN $${n} THEN 'true'::jsonb ELSE 'false'::jsonb END`
        : `$${n}::jsonb`;

    const existing = await this.getByKey(key);

    if (existing) {
      const setClauses: string[] = [`value = ${jsonbExpr(1)}`];
      const setParams: unknown[] = [value];

      if (group !== undefined) {
        setClauses.push(`"group" = $${setParams.length + 1}`);
        setParams.push(group);
      }
      if (type !== undefined) {
        setClauses.push(`type = $${setParams.length + 1}`);
        setParams.push(type);
      }

      setClauses.push(`updated_at = NOW()`);
      setParams.push(key);

      const result = await sql.unsafe(
        `UPDATE settings SET ${setClauses.join(', ')} WHERE key = $${setParams.length} RETURNING *`,
        setParams
      );

      return result[0] as unknown as Setting;
    }

    const id = randomUUID();

    const result = await sql.unsafe(
      `INSERT INTO settings (id, key, value, "group", type)
       VALUES ($1, $2, ${jsonbExpr(3)}, $4, $5)
       RETURNING *`,
      [id, key, value, group ?? null, type ?? null]
    );

    return result[0] as unknown as Setting;
  }

  async setMany(
    settings: Array<{
      key: string;
      value: unknown;
      group?: string;
      type?: string;
    }>
  ): Promise<void> {
    for (const setting of settings) {
      await this.set(setting.key, setting.value, setting.group, setting.type);
    }
  }

  async delete(key: string): Promise<boolean> {
    const sql = getConnection();

    const existing = await this.getByKey(key);
    if (!existing) return false;

    await sql.unsafe('DELETE FROM settings WHERE key = $1', [key]);

    return true;
  }

  async getGroup(group: string): Promise<Setting[]> {
    const sql = getConnection();
    const result = await sql.unsafe('SELECT * FROM settings WHERE "group" = $1 ORDER BY key', [group]);
    return result as unknown as Setting[];
  }
}

export const settingsService = new SettingsService();
