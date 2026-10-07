// @oktis-works/core - Taxonomy Service (Custom Taxonomies)

import { randomUUID } from 'node:crypto';
import { getConnection } from '@oktis-works/database';
import { getEventBus } from '../events/bus.js';

export interface CustomTaxonomy {
  id: string;
  name: string;
  slug: string;
  hierarchical: boolean;
  attachTo: string[];
  labels: Record<string, string>;
  meta: Record<string, unknown>;
  source: 'CORE' | 'PLUGIN' | 'ADMIN';
}

export interface TaxonomyTerm {
  id: string;
  taxonomyId: string;
  name: string;
  slug: string;
  description?: string;
  parentId?: string | null;
  meta: Record<string, unknown>;
}

export class TaxonomyService {
  async list(): Promise<CustomTaxonomy[]> {
    const sql = getConnection();
    const rows = await sql.unsafe('SELECT * FROM taxonomies ORDER BY name ASC');

    return (rows as unknown as Array<Record<string, unknown>>).map((row) => this.rowToTaxonomy(row));
  }

  async getBySlug(slug: string): Promise<CustomTaxonomy | null> {
    const sql = getConnection();
    const rows = await sql.unsafe('SELECT * FROM taxonomies WHERE slug = $1 LIMIT 1', [slug]);
    const row = rows[0] as Record<string, unknown> | undefined;

    return row ? this.rowToTaxonomy(row) : null;
  }

  async create(input: {
    name: string;
    slug?: string;
    hierarchical?: boolean;
    attachTo?: string[];
    labels?: Record<string, string>;
    meta?: Record<string, unknown>;
    source?: 'PLUGIN' | 'ADMIN';
  }): Promise<CustomTaxonomy> {
    const sql = getConnection();
    const slug =
      input.slug ??
      input.name
        .toLowerCase()
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/(^_|_$)/g, '');

    const existing = await this.getBySlug(slug);
    if (existing) throw new Error(`Taxonomia "${slug}" já existe`);

    const id = randomUUID();

    await sql.unsafe(
      `INSERT INTO taxonomies (id, name, slug, hierarchical, attach_to, labels, meta, source)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7::jsonb, $8)
       RETURNING *`,
      [
        id,
        input.name,
        slug,
        input.hierarchical ?? false,
        input.attachTo ?? [],
        input.labels ?? {},
        input.meta ?? {},
        input.source ?? 'ADMIN',
      ]
    );

    await getEventBus().emit({
      id: randomUUID(),
      type: 'taxonomy.created',
      aggregateType: 'taxonomy',
      aggregateId: id,
      payload: { slug },
      processed: false,
      createdAt: new Date(),
    });

    return (await this.getBySlug(slug))!;
  }

  async update(slug: string, patch: Partial<CustomTaxonomy>): Promise<CustomTaxonomy | null> {
    const sql = getConnection();
    const existing = await this.getBySlug(slug);
    if (!existing) return null;

    await sql.unsafe(
      `UPDATE taxonomies SET
         name = $1,
         hierarchical = $2,
         attach_to = $3::jsonb,
         labels = $4::jsonb,
         meta = $5::jsonb,
         updated_at = NOW()
       WHERE slug = $6`,
      [
        patch.name ?? existing.name,
        patch.hierarchical ?? existing.hierarchical,
        patch.attachTo ?? existing.attachTo,
        patch.labels ?? existing.labels,
        patch.meta ?? existing.meta,
        slug,
      ]
    );

    return this.getBySlug(slug);
  }

  async delete(slug: string): Promise<boolean> {
    const sql = getConnection();
    const result = await sql.unsafe('DELETE FROM taxonomies WHERE slug = $1 RETURNING id', [slug]);
    return result.length > 0;
  }

  async attach(contentTypeSlug: string, taxonomySlug: string): Promise<void> {
    const taxonomy = await this.getBySlug(taxonomySlug);
    if (!taxonomy) throw new Error(`Taxonomia "${taxonomySlug}" não encontrada`);

    if (taxonomy.attachTo.includes(contentTypeSlug)) return;

    await this.update(taxonomySlug, {
      attachTo: [...taxonomy.attachTo, contentTypeSlug],
    });
  }

  async detach(contentTypeSlug: string, taxonomySlug: string): Promise<void> {
    const taxonomy = await this.getBySlug(taxonomySlug);
    if (!taxonomy) throw new Error(`Taxonomia "${taxonomySlug}" não encontrada`);

    await this.update(taxonomySlug, {
      attachTo: taxonomy.attachTo.filter((type) => type !== contentTypeSlug),
    });
  }

  async listTerms(taxonomySlug: string): Promise<TaxonomyTerm[]> {
    const sql = getConnection();
    const rows = await sql.unsafe(
      `SELECT t.* FROM taxonomy_terms t
       JOIN taxonomies tx ON tx.id = t.taxonomy_id
       WHERE tx.slug = $1
       ORDER BY t.name ASC`,
      [taxonomySlug]
    );

    return (rows as unknown as Array<Record<string, unknown>>).map((row) => this.rowToTerm(row));
  }

  async createTerm(
    taxonomySlug: string,
    input: { name: string; slug?: string; description?: string; parentId?: string; meta?: Record<string, unknown> }
  ): Promise<TaxonomyTerm> {
    const sql = getConnection();
    const taxonomy = await this.getBySlug(taxonomySlug);
    if (!taxonomy) throw new Error(`Taxonomia "${taxonomySlug}" não encontrada`);

    const termSlug =
      input.slug ??
      input.name
        .toLowerCase()
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '');

    const id = randomUUID();

    await sql.unsafe(
      `INSERT INTO taxonomy_terms (id, taxonomy_id, name, slug, description, parent_id, meta)
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)
       RETURNING *`,
      [id, taxonomy.id, input.name, termSlug, input.description ?? null, input.parentId ?? null, input.meta ?? {}]
    );

    const rows = await sql.unsafe('SELECT * FROM taxonomy_terms WHERE id = $1', [id]);
    return this.rowToTerm(rows[0] as Record<string, unknown>);
  }

  async updateTerm(
    taxonomySlug: string,
    termId: string,
    patch: { name?: string; slug?: string; description?: string; parentId?: string | null; meta?: Record<string, unknown> }
  ): Promise<TaxonomyTerm | null> {
    const sql = getConnection();
    const taxonomy = await this.getBySlug(taxonomySlug);
    if (!taxonomy) return null;
    const rows = await sql.unsafe('SELECT * FROM taxonomy_terms WHERE id = $1 AND taxonomy_id = $2', [termId, taxonomy.id]);
    const existing = rows[0] as Record<string, unknown> | undefined;
    if (!existing) return null;

    const result = await sql.unsafe(
      `UPDATE taxonomy_terms SET name = $1, slug = $2, description = $3, parent_id = $4, meta = $5::jsonb
       WHERE id = $6 AND taxonomy_id = $7 RETURNING *`,
      [
        patch.name ?? String(existing['name']),
        patch.slug ?? String(existing['slug']),
        patch.description ?? (existing['description'] as string | null) ?? null,
        patch.parentId !== undefined ? patch.parentId : (existing['parent_id'] as string | null) ?? null,
        patch.meta ?? (existing['meta'] as Record<string, unknown>) ?? {},
        termId,
        taxonomy.id,
      ]
    );
    return result[0] ? this.rowToTerm(result[0] as Record<string, unknown>) : null;
  }

  async deleteTerm(taxonomySlug: string, termId: string): Promise<boolean> {
    const sql = getConnection();
    const taxonomy = await this.getBySlug(taxonomySlug);
    if (!taxonomy) return false;
    const result = await sql.unsafe('DELETE FROM taxonomy_terms WHERE id = $1 AND taxonomy_id = $2 RETURNING id', [termId, taxonomy.id]);
    return result.length > 0;
  }

  async setTermsForContent(contentId: string, taxonomySlug: string, termIds: string[]): Promise<void> {
    const sql = getConnection();
    const taxonomy = await this.getBySlug(taxonomySlug);
    if (!taxonomy) throw new Error(`Taxonomia "${taxonomySlug}" não encontrada`);

    const validTerms = await sql.unsafe(
      'SELECT id FROM taxonomy_terms WHERE taxonomy_id = $1',
      [taxonomy.id]
    );
    const validIds = new Set((validTerms as unknown as Array<{ id: string }>).map((term) => String(term.id)));

    await sql.unsafe(
      `DELETE FROM content_taxonomy_terms
       WHERE content_id = $1 AND term_id IN (SELECT id FROM taxonomy_terms WHERE taxonomy_id = $2)`,
      [contentId, taxonomy.id]
    );

    for (const termId of termIds) {
      if (!validIds.has(termId)) continue;

      await sql.unsafe(
        'INSERT INTO content_taxonomy_terms (content_id, term_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
        [contentId, termId]
      );
    }
  }

  async getTermsForContent(contentId: string, taxonomySlug?: string): Promise<TaxonomyTerm[]> {
    const sql = getConnection();

    if (taxonomySlug) {
      const rows = await sql.unsafe(
        `SELECT t.* FROM taxonomy_terms t
         JOIN content_taxonomy_terms ct ON ct.term_id = t.id
         JOIN taxonomies tx ON tx.id = t.taxonomy_id
         WHERE ct.content_id = $1 AND tx.slug = $2`,
        [contentId, taxonomySlug]
      );
      return (rows as unknown as Array<Record<string, unknown>>).map((row) => this.rowToTerm(row));
    }

    const rows = await sql.unsafe(
      `SELECT t.* FROM taxonomy_terms t
       JOIN content_taxonomy_terms ct ON ct.term_id = t.id
       WHERE ct.content_id = $1`,
      [contentId]
    );
    return (rows as unknown as Array<Record<string, unknown>>).map((row) => this.rowToTerm(row));
  }

  private rowToTaxonomy(row: Record<string, unknown>): CustomTaxonomy {
    return {
      id: String(row['id']),
      name: String(row['name']),
      slug: String(row['slug']),
      hierarchical: Boolean(row['hierarchical']),
      attachTo: (row['attach_to'] as string[]) ?? [],
      labels: (row['labels'] as Record<string, string>) ?? {},
      meta: (row['meta'] as Record<string, unknown>) ?? {},
      source: (row['source'] as CustomTaxonomy['source']) ?? 'ADMIN',
    };
  }

  private rowToTerm(row: Record<string, unknown>): TaxonomyTerm {
    return {
      id: String(row['id']),
      taxonomyId: String(row['taxonomy_id']),
      name: String(row['name']),
      slug: String(row['slug']),
      description: (row['description'] as string | null) ?? undefined,
      parentId: (row['parent_id'] as string | null) ?? null,
      meta: (row['meta'] as Record<string, unknown>) ?? {},
    };
  }
}

export const taxonomyService = new TaxonomyService();
