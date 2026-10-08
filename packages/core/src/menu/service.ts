import { randomUUID } from 'node:crypto';
import { getConnection } from '@oktis-works/database';
import type { Menu, MenuItem, MenuItemType, MenuSettings } from '@oktis-works/types';

type MenuItemInput = Partial<MenuItem> & { children?: unknown[] };

function itemType(value: unknown): MenuItemType {
  return ['custom', 'home', 'page', 'post', 'content', 'archive', 'taxonomy'].includes(String(value))
    ? value as MenuItemType
    : 'custom';
}

function normalizeItems(value: unknown): MenuItem[] {
  const source = Array.isArray(value) ? value : [];
  const result: MenuItem[] = [];
  const append = (entries: unknown[], parentId: string | null): void => {
    entries.forEach((entry, index) => {
      if (!entry || typeof entry !== 'object') return;
      const raw = entry as MenuItemInput;
      const id = typeof raw.id === 'string' && raw.id.length > 0 ? raw.id : randomUUID();
      const label = String(raw.label ?? '').trim();
      if (!label) throw new Error('Every menu item must have a label');
      result.push({
        id,
        type: itemType(raw.type),
        label,
        url: raw.url ? String(raw.url) : undefined,
        objectId: raw.objectId ?? raw.contentId,
        objectType: raw.objectType ? String(raw.objectType) : undefined,
        contentId: raw.contentId,
        parentId: parentId ?? raw.parentId ?? null,
        order: Number.isFinite(Number(raw.order)) ? Number(raw.order) : index,
        target: raw.target === '_blank' ? '_blank' : '_self',
        attrTitle: raw.attrTitle ? String(raw.attrTitle) : undefined,
        cssClasses: raw.cssClasses ? String(raw.cssClasses) : undefined,
        xfn: raw.xfn ? String(raw.xfn) : undefined,
        description: raw.description ? String(raw.description) : undefined,
        metadata: raw.metadata,
      });
      if (Array.isArray(raw.children)) append(raw.children, id);
    });
  };
  append(source, null);
  return result.map((item, index) => ({ ...item, order: index }));
}

function normalizeSettings(value: unknown): MenuSettings {
  if (!value || typeof value !== 'object') return {};
  const raw = value as MenuSettings;
  return {
    autoAddNewPages: raw.autoAddNewPages === true,
    locations: raw.locations && typeof raw.locations === 'object' ? raw.locations : {},
  };
}

export class MenuService {
  async list(): Promise<Menu[]> {
    const sql = getConnection();
    const result = await sql.unsafe('SELECT * FROM menus ORDER BY created_at DESC');
    return (result as unknown as Array<Record<string, unknown>>).map((row) => ({
      ...row,
      items: normalizeItems(row['items']),
      settings: normalizeSettings(row['settings']),
    })) as unknown as Menu[];
  }

  async getById(id: string): Promise<Menu | null> {
    const sql = getConnection();
    const result = await sql.unsafe('SELECT * FROM menus WHERE id = $1', [id]);
    const row = result[0] as Record<string, unknown> | undefined;
    return row ? { ...row, items: normalizeItems(row['items']), settings: normalizeSettings(row['settings']) } as unknown as Menu : null;
  }

  async getBySlug(slug: string): Promise<Menu | null> {
    const sql = getConnection();
    const result = await sql.unsafe('SELECT * FROM menus WHERE slug = $1', [slug]);
    const row = result[0] as Record<string, unknown> | undefined;
    return row ? { ...row, items: normalizeItems(row['items']), settings: normalizeSettings(row['settings']) } as unknown as Menu : null;
  }

  async create(input: {
    name: string;
    slug: string;
    items?: unknown[];
    settings?: MenuSettings;
  }): Promise<Menu> {
    const sql = getConnection();
    const id = randomUUID();
    const itemsJson = normalizeItems(input.items);
    const settingsJson = normalizeSettings(input.settings);

    const result = await sql.unsafe(
      `INSERT INTO menus (id, name, slug, items, settings)
       VALUES ($1, $2, $3, $4::jsonb, $5::jsonb)
       RETURNING *`,
      [id, input.name, input.slug, JSON.stringify(itemsJson), JSON.stringify(settingsJson)]
    );

    return result[0] as unknown as Menu;
  }

  async update(
    id: string,
    input: {
      name?: string;
      slug?: string;
      items?: unknown[];
      settings?: MenuSettings;
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
      setParams.push(JSON.stringify(normalizeItems(input.items)));
    }
    if (input.settings !== undefined) {
      setClauses.push(`settings = $${setParams.length + 1}::jsonb`);
      setParams.push(JSON.stringify(normalizeSettings(input.settings)));
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
