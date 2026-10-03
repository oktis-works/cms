import { randomUUID } from 'node:crypto';
import { getConnection } from '@oktis-works/database';
import type { Menu } from '@oktis-works/types';

export class MenuService {
  async list(): Promise<Menu[]> {
    const sql = getConnection();
    const result = await sql.unsafe('SELECT * FROM menus ORDER BY created_at DESC');
    return result as unknown as Menu[];
  }

  async getById(id: string): Promise<Menu | null> {
    const sql = getConnection();
    const result = await sql.unsafe('SELECT * FROM menus WHERE id = $1', [id]);
    return (result[0] as unknown as Menu) ?? null;
  }

  async getBySlug(slug: string): Promise<Menu | null> {
    const sql = getConnection();
    const result = await sql.unsafe('SELECT * FROM menus WHERE slug = $1', [slug]);
    return (result[0] as unknown as Menu) ?? null;
  }

  async create(input: {
    name: string;
    slug: string;
    items?: Record<string, unknown>;
  }): Promise<Menu> {
    const sql = getConnection();
    const id = randomUUID();
    const itemsJson = input.items ?? null;

    const result = await sql.unsafe(
      `INSERT INTO menus (id, name, slug, items)
       VALUES ($1, $2, $3, $4::jsonb)
       RETURNING *`,
      [id, input.name, input.slug, itemsJson]
    );

    return result[0] as unknown as Menu;
  }

  async update(
    id: string,
    input: {
      name?: string;
      slug?: string;
      items?: Record<string, unknown>;
    }
  ): Promise<Menu | null> {
    const sql = getConnection();

    const existing = await this.getById(id);
    if (!existing) return null;

    const setClauses: string[] = [];
    const setParams: unknown[] = [];

    if (input.name !== undefined) {
      setClauses.push(`name = $${setParams.length + 1}`);
      setParams.push(input.name);
    }
    if (input.slug !== undefined) {
      setClauses.push(`slug = $${setParams.length + 1}`);
      setParams.push(input.slug);
    }
    if (input.items !== undefined) {
      setClauses.push(`items = $${setParams.length + 1}::jsonb`);
      setParams.push(input.items);
    }

    if (setClauses.length === 0) return existing;

    setClauses.push(`updated_at = NOW()`);
    setParams.push(id);

    const result = await sql.unsafe(
      `UPDATE menus SET ${setClauses.join(', ')} WHERE id = $${setParams.length} RETURNING *`,
      setParams
    );

    return (result[0] as unknown as Menu) ?? null;
  }

  async delete(id: string): Promise<boolean> {
    const sql = getConnection();

    const existing = await this.getById(id);
    if (!existing) return false;

    await sql.unsafe('DELETE FROM menus WHERE id = $1', [id]);

    return true;
  }
}

export const menuService = new MenuService();
