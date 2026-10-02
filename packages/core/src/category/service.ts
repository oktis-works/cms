import { randomUUID } from 'node:crypto';
import { getConnection } from '@oktis-works/database';
import type { Category } from '@oktis-works/types';

export class CategoryService {
  async list(): Promise<Category[]> {
    const sql = getConnection();
    const result = await sql.unsafe('SELECT * FROM categories ORDER BY name ASC');
    return result as unknown as Category[];
  }

  async getById(id: string): Promise<Category | null> {
    const sql = getConnection();
    const result = await sql.unsafe('SELECT * FROM categories WHERE id = $1', [id]);
    return (result[0] as unknown as Category) ?? null;
  }

  async getBySlug(slug: string): Promise<Category | null> {
    const sql = getConnection();
    const result = await sql.unsafe('SELECT * FROM categories WHERE slug = $1', [slug]);
    return (result[0] as unknown as Category) ?? null;
  }

  async create(input: {
    name: string;
    slug: string;
    description?: string;
    parentId?: string;
  }): Promise<Category> {
    const sql = getConnection();
    const id = randomUUID();

    const result = await sql.unsafe(
      `INSERT INTO categories (id, name, slug, description, parent_id)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [id, input.name, input.slug, input.description ?? null, input.parentId ?? null]
    );

    return result[0] as unknown as Category;
  }

  async update(
    id: string,
    input: {
      name?: string;
      slug?: string;
      description?: string;
      parentId?: string;
    }
  ): Promise<Category | null> {
    const sql = getConnection();

    const existing = await this.getById(id);
    if (!existing) return null;

    const setClauses: string[] = [];
    const setParams: string[] = [];

    if (input.name !== undefined) {
      setClauses.push(`name = $${setParams.length + 1}`);
      setParams.push(input.name);
    }
    if (input.slug !== undefined) {
      setClauses.push(`slug = $${setParams.length + 1}`);
      setParams.push(input.slug);
    }
    if (input.description !== undefined) {
      setClauses.push(`description = $${setParams.length + 1}`);
      setParams.push(input.description);
    }
    if (input.parentId !== undefined) {
      setClauses.push(`parent_id = $${setParams.length + 1}`);
      setParams.push(input.parentId);
    }

    if (setClauses.length === 0) return existing;

    setClauses.push(`updated_at = NOW()`);
    setParams.push(id);

    const result = await sql.unsafe(
      `UPDATE categories SET ${setClauses.join(', ')} WHERE id = $${setParams.length} RETURNING *`,
      setParams
    );

    return (result[0] as unknown as Category) ?? null;
  }

  async delete(id: string): Promise<boolean> {
    const sql = getConnection();

    const existing = await this.getById(id);
    if (!existing) return false;

    await sql.unsafe('DELETE FROM categories WHERE id = $1', [id]);

    return true;
  }
}

export const categoryService = new CategoryService();
