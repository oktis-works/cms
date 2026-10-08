import { randomUUID } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { getConnection } from '@oktis-works/database';
import type { Theme } from '@oktis-works/types';
import { resolveExtensionDirectory } from '../extensions/project-directories.js';

export class ThemeService {
  /** Descobre temas presentes no diretório configurado do projeto. */
  async syncFromDirectory(): Promise<Theme[]> {
    const directory = resolveExtensionDirectory('theme');
    let entries;
    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch {
      return [];
    }

    const discovered = new Set<string>();
    const sql = getConnection();

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      let manifest: Record<string, unknown>;
      try {
        const raw = await readFile(join(directory, entry.name, 'theme.json'), 'utf8');
        manifest = JSON.parse(raw) as Record<string, unknown>;
      } catch {
        // Um diretório sem theme.json válido não é um tema instalável.
        continue;
      }

      const name = typeof manifest['name'] === 'string' ? manifest['name'].trim() : '';
      const version = typeof manifest['version'] === 'string' ? manifest['version'].trim() : '';
      if (!name || !version) continue;

      discovered.add(name);
      const existing = await this.getByName(name);
      if (existing) {
        const status = existing.status === 'INACTIVE' || existing.status === 'ACTIVE' ? existing.status : 'INSTALLED';
        await sql.unsafe(
          `UPDATE themes SET version = $1, manifest = $2::jsonb, status = $3 WHERE id = $4`,
          [version, manifest, status, existing.id]
        );
      } else {
        await sql.unsafe(
          `INSERT INTO themes (id, name, version, status, manifest, config, installed_at)
           VALUES ($1, $2, $3, 'INSTALLED', $4::jsonb, $5::jsonb, NOW())`,
          [randomUUID(), name, version, manifest, {}]
        );
      }
    }

    if (discovered.size === 0) return [];
    const rows = await this.list();
    return rows.filter((theme) => discovered.has(theme.name));
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

  async deactivate(id: string): Promise<Theme | null> {
    const sql = getConnection();

    const existing = await this.getById(id);
    if (!existing) return null;

    const result = await sql.unsafe(
      `UPDATE themes
       SET status = $1, deactivated_at = NOW(), updated_at = NOW()
       WHERE id = $2
       RETURNING *`,
      ['INACTIVE', id]
    );

    return (result[0] as unknown as Theme) ?? null;
  }

  async getActive(): Promise<Theme | null> {
    const sql = getConnection();
    const result = await sql.unsafe('SELECT * FROM themes WHERE status = $1 LIMIT 1', ['ACTIVE']);
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
