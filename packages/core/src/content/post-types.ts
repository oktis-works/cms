// @oktis-works/core - Content Type Registry (Custom Post Types)

import { randomUUID } from 'node:crypto';
import { getConnection } from '@oktis-works/database';
import { getCache } from '../cache/index.js';

export interface ContentTypeDefinition {
  id?: string;
  name: string;
  slug: string;
  pluralLabel: string;
  singularLabel: string;
  source: 'CORE' | 'PLUGIN' | 'ADMIN';
  sourceId?: string | null;
  supports?: Array<'title' | 'editor' | 'thumbnail' | 'excerpt' | 'revisions'>;
  hasArchive?: boolean;
  menuIcon?: string;
  public?: boolean;
}

const CORE_TYPES: ContentTypeDefinition[] = [
  {
    name: 'post',
    slug: 'post',
    pluralLabel: 'Posts',
    singularLabel: 'Post',
    source: 'CORE',
    supports: ['title', 'editor', 'thumbnail', 'excerpt', 'revisions'],
    hasArchive: true,
    menuIcon: 'file-text',
    public: true,
  },
  {
    name: 'page',
    slug: 'page',
    pluralLabel: 'Páginas',
    singularLabel: 'Página',
    source: 'CORE',
    supports: ['title', 'editor', 'thumbnail', 'revisions'],
    hasArchive: false,
    menuIcon: 'file',
    public: true,
  },
];

export class PostTypeRegistry {
  private cacheKey = 'content-types:all';

  async list(): Promise<ContentTypeDefinition[]> {
    const sql = getConnection();
    const result = await sql.unsafe(
      'SELECT * FROM content_types ORDER BY source ASC, plural_label ASC'
    );

    const dbTypes = (result as unknown as Array<Record<string, unknown>>).map((row) =>
      this.rowToDefinition(row)
    );

    const bySlug = new Map<string, ContentTypeDefinition>();
    for (const coreType of CORE_TYPES) bySlug.set(coreType.slug, coreType);
    for (const dbType of dbTypes) bySlug.set(dbType.slug, { ...dbType, ...this.mergeCore(dbType.slug, dbType) });

    return [...bySlug.values()];
  }

  async getBySlug(slug: string): Promise<ContentTypeDefinition | null> {
    const core = CORE_TYPES.find((type) => type.slug === slug);
    const all = await this.list();
    return all.find((type) => type.slug === slug) ?? core ?? null;
  }

  async create(input: Omit<ContentTypeDefinition, 'id' | 'source'> & { source?: 'PLUGIN' | 'ADMIN'; sourceId?: string }): Promise<ContentTypeDefinition> {
    const sql = getConnection();

    const existing = await this.getBySlug(input.slug);
    if (existing) throw new Error(`Content type "${input.slug}" já existe`);

    const id = randomUUID();

    await sql.unsafe(
      `INSERT INTO content_types (id, name, slug, source, source_id, schema, plural_label, singular_label)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8)`,
      [
        id,
        input.name,
        input.slug,
        input.source ?? 'ADMIN',
        input.sourceId ?? null,
        JSON.stringify({
          supports: input.supports ?? ['title', 'editor', 'revisions'],
          hasArchive: input.hasArchive ?? false,
          menuIcon: input.menuIcon ?? 'box',
          public: input.public ?? true,
        }),
        input.pluralLabel,
        input.singularLabel,
      ]
    );

    await getCache().del(this.cacheKey);

    return (await this.getBySlug(input.slug))!;
  }

  async update(slug: string, patch: Partial<ContentTypeDefinition>): Promise<ContentTypeDefinition | null> {
    const sql = getConnection();
    const existingRow = await sql.unsafe('SELECT * FROM content_types WHERE slug = $1', [slug]);
    const row = existingRow[0] as Record<string, unknown> | undefined;

    if (!row) throw new Error(`Content type "${slug}" é do core e não pode ser alterado`);

    const current = this.rowToDefinition(row);
    const merged: ContentTypeDefinition = { ...current, ...patch, slug };

    await sql.unsafe(
      `UPDATE content_types SET schema = $1::jsonb, plural_label = $2, singular_label = $3, updated_at = NOW()
       WHERE slug = $4`,
      [
        JSON.stringify({
          supports: merged.supports ?? [],
          hasArchive: merged.hasArchive ?? false,
          menuIcon: merged.menuIcon,
          public: merged.public ?? true,
        }),
        merged.pluralLabel,
        merged.singularLabel,
        slug,
      ]
    );

    await getCache().del(this.cacheKey);
    return this.getBySlug(slug);
  }

  async delete(slug: string): Promise<boolean> {
    if (CORE_TYPES.some((type) => type.slug === slug)) {
      throw new Error(`Content type "${slug}" é do core e não pode ser removido`);
    }

    const sql = getConnection();
    const result = await sql.unsafe('DELETE FROM content_types WHERE slug = $1 RETURNING id', [slug]);
    const deleted = result.length > 0;

    if (deleted) await getCache().del(this.cacheKey);

    return deleted;
  }

  private mergeCore(_slug: string, dbType: ContentTypeDefinition): Partial<ContentTypeDefinition> {
    return dbType;
  }

  private rowToDefinition(row: Record<string, unknown>): ContentTypeDefinition {
    const schemaJson = (row['schema'] as Record<string, unknown>) ?? {};

    return {
      id: String(row['id']),
      name: String(row['name']),
      slug: String(row['slug']),
      pluralLabel: String(row['plural_label']),
      singularLabel: String(row['singular_label']),
      source: (row['source'] as ContentTypeDefinition['source']) ?? 'ADMIN',
      sourceId: (row['source_id'] as string | null) ?? null,
      supports: (schemaJson['supports'] as ContentTypeDefinition['supports']) ?? ['title', 'editor'],
      hasArchive: Boolean(schemaJson['hasArchive']),
      menuIcon: schemaJson['menuIcon'] as string | undefined,
      public: schemaJson['public'] !== false,
    };
  }
}

export const postTypeRegistry = new PostTypeRegistry();
