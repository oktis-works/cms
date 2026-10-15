import { randomUUID } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { getConnection } from '@oktis-works/database';
import type { Theme } from '@oktis-works/types';
import { checkExtensionCompatibility } from '@oktis-works/validation';
import { resolveExtensionDirectory } from '../extensions/project-directories.js';

/** Nomes de manifesto aceitos na descoberta (manifest.json = legado do tema default). */
const MANIFEST_FILENAMES = ['theme.json', 'manifest.json'] as const;

const SAFE_NAME_RE = /^[a-z0-9][a-z0-9_-]*$/i;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export class ThemeService {
  /**
   * Descobre temas presentes no diretório configurado do projeto e faz upsert
   * por nome. aceita theme.json (atual) e manifest.json (legado — é o que o
   * tema default distribuído usa). A listagem retornada é o estado do banco
   * COMPLETO: temas removidos do disco continuam visíveis para desinstalação.
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
      if (!name || !version) continue;

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

  /** Lê theme.json ou (fallback legado) manifest.json do diretório do tema. */
  private async readManifest(themeDir: string): Promise<Record<string, unknown> | null> {
    for (const filename of MANIFEST_FILENAMES) {
      try {
        const raw = await readFile(join(themeDir, filename), 'utf8');
        const manifest = JSON.parse(raw) as unknown;
        if (isPlainObject(manifest)) return manifest;
      } catch {
        // tenta o próximo nome candidato
      }
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
      [id, name, version, { ...input.manifest, name, version }, input.config ?? {}]
    );

    return result[0] as unknown as Theme;
  }

  /**
   * Ativa um tema DESATIVANDO os demais (invariante: um único ACTIVE por
   * tenant, garantida também pelo índice parcial idx_themes_single_active).
   */
  async activate(id: string): Promise<Theme | null> {
    const existing = await this.getById(id);
    if (!existing) return null;

    const sql = getConnection();
    await sql.unsafe(
      `UPDATE themes SET status = 'INACTIVE', updated_at = NOW()
       WHERE status = 'ACTIVE' AND id <> $1`,
      [id]
    );

    const result = await sql.unsafe(
      `UPDATE themes
       SET status = 'ACTIVE', activated_at = NOW(), updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [id]
    );

    return (result[0] as unknown as Theme) ?? null;
  }

  async deactivate(id: string): Promise<Theme | null> {
    const existing = await this.getById(id);
    if (!existing) return null;

    const sql = getConnection();
    const result = await sql.unsafe(
      `UPDATE themes
       SET status = 'INACTIVE', updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [id]
    );

    return (result[0] as unknown as Theme) ?? null;
  }

  /** Tema ativo atual (fonte única lida pelo app web na renderização). */
  async getActive(): Promise<Theme | null> {
    const sql = getConnection();
    const result = await sql.unsafe(
      `SELECT * FROM themes WHERE status = 'ACTIVE'
       ORDER BY activated_at DESC NULLS LAST, created_at DESC
       LIMIT 1`
    );
    return (result[0] as unknown as Theme) ?? null;
  }

  /** Atualiza o config (customizador) do tema — validado como objeto simples. */
  async updateConfig(id: string, config: unknown): Promise<Theme | null> {
    if (!isPlainObject(config)) {
      throw new Error('Theme config must be an object');
    }

    const existing = await this.getById(id);
    if (!existing) return null;

    const sql = getConnection();
    const result = await sql.unsafe(
      `UPDATE themes SET config = $1::jsonb, updated_at = NOW() WHERE id = $2 RETURNING *`,
      [config, id]
    );

    return (result[0] as unknown as Theme) ?? null;
  }

  async uninstall(id: string): Promise<boolean> {
    const existing = await this.getById(id);
    if (!existing) return false;

    const sql = getConnection();
    await sql.unsafe('DELETE FROM themes WHERE id = $1', [id]);

    return true;
  }
}

export const themeService = new ThemeService();
