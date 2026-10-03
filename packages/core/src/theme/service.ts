import { randomUUID } from 'node:crypto';
import { getConnection } from '@oktis-works/database';
import type { Theme } from '@oktis-works/types';

export class ThemeService {
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

  async install(input: {
    name: string;
    version: string;
    manifest: Record<string, unknown>;
    config?: Record<string, unknown>;
  }): Promise<Theme> {
    const sql = getConnection();
    const id = randomUUID();
    const now = new Date().toISOString();

    const result = await sql.unsafe(
      `INSERT INTO themes (id, name, version, status, manifest, config, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7, $7)
       RETURNING *`,
      [
        id,
        input.name,
        input.version,
        'INSTALLED',
        input.manifest,
        input.config ?? {},
        now,
      ]
    );

    return result[0] as unknown as Theme;
  }

  async activate(id: string): Promise<Theme | null> {
    const sql = getConnection();

    const existing = await this.getById(id);
    if (!existing) return null;

    const result = await sql.unsafe(
      `UPDATE themes
       SET status = $1, activated_at = NOW(), updated_at = NOW()
       WHERE id = $2
       RETURNING *`,
      ['ACTIVE', id]
    );

    return (result[0] as unknown as Theme) ?? null;
  }

  async uninstall(id: string): Promise<boolean> {
    const sql = getConnection();

    const existing = await this.getById(id);
    if (!existing) return false;

    await sql.unsafe('DELETE FROM themes WHERE id = $1', [id]);

    return true;
  }
}

export const themeService = new ThemeService();
