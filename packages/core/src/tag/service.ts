import { randomUUID } from 'node:crypto';
import { getConnection } from '@oktis-works/database';
import type { Tag } from '@oktis-works/types';

export class TagService {
  async list(): Promise<Tag[]> {
    const sql = getConnection();
    const result = await sql.unsafe('SELECT * FROM tags ORDER BY name ASC');
    return result as unknown as Tag[];
  }

  async getById(id: string): Promise<Tag | null> {
    const sql = getConnection();
    const result = await sql.unsafe('SELECT * FROM tags WHERE id = $1', [id]);
    return (result[0] as unknown as Tag) ?? null;
  }

  async getBySlug(slug: string): Promise<Tag | null> {
    const sql = getConnection();
    const result = await sql.unsafe('SELECT * FROM tags WHERE slug = $1', [slug]);
    return (result[0] as unknown as Tag) ?? null;
  }

  async create(input: {
    name: string;
    slug: string;
  }): Promise<Tag> {
    const sql = getConnection();
    const id = randomUUID();

    const result = await sql.unsafe(
      `INSERT INTO tags (id, name, slug)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [id, input.name, input.slug]
    );

    return result[0] as unknown as Tag;
  }

  async update(id: string, input: { name?: string; slug?: string }): Promise<Tag | null> {
    const sql = getConnection();
    const existing = await this.getById(id);
    if (!existing) return null;

    const result = await sql.unsafe(
      'UPDATE tags SET name = $1, slug = $2 WHERE id = $3 RETURNING *',
      [input.name ?? existing.name, input.slug ?? existing.slug, id]
    );
    return (result[0] as unknown as Tag) ?? null;
  }

  async delete(id: string): Promise<boolean> {
    const sql = getConnection();

    const existing = await this.getById(id);
    if (!existing) return false;

    await sql.unsafe('DELETE FROM tags WHERE id = $1', [id]);

    return true;
  }
}

export const tagService = new TagService();
