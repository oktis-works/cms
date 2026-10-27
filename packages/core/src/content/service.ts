// @oktis-works/core - Content Service

import { randomUUID } from 'node:crypto';
import { getConnection } from '@oktis-works/database';
import type { Content, ContentVersion, ContentStatus } from '@oktis-works/types';
import { getHookRegistry } from '@oktis-works/plugin-runtime';
import { getEventBus } from '../events/bus.js';
import { getCache } from '../cache/index.js';
import { HOOK_POINTS } from '../hooks/points.js';
import { getTaggedCacheIndex } from '../cache/tags.js';
import { postTypeRegistry } from './post-types.js';
import { fieldGroupService } from '../fields/service.js';
import {
  logicalValuesToBody,
  logicalValuesToNative,
  normalizeLogicalValues,
} from '@oktis-works/validation';

export interface CreateContentInput {
  type: string;
  title: string;
  /** UUID do tenant — as rotas injetam do JWT (nunca vem do body do cliente). */
  tenantId: string;
  slug?: string;
  body?: Record<string, unknown>;
  excerpt?: string;
  status?: ContentStatus;
  authorId: string;
  featuredImageId?: string;
  seoTitle?: string;
  seoDescription?: string;
  metadata?: Record<string, unknown>;
  /** Override de layout/template (content.layout) resolvido pelo theme runtime. */
  layout?: string | null;
  /** Parent content ID for hierarchical URLs (same type, same tenant). */
  parentId?: string;
}

export interface UpdateContentInput {
  title?: string;
  slug?: string;
  body?: Record<string, unknown>;
  excerpt?: string;
  status?: ContentStatus;
  featuredImageId?: string;
  seoTitle?: string;
  seoDescription?: string;
  metadata?: Record<string, unknown>;
  /** Override de layout/template (content.layout); string vazia limpa o override. */
  layout?: string | null;
  /** Parent content ID for hierarchical URLs. null = remover pai. */
  parentId?: string | null;
}

const FIELD_SUPPORT_REQUIREMENT: Record<string, string> = {
  title: 'title',
  body: 'editor',
  excerpt: 'excerpt',
  featuredImageId: 'thumbnail',
};

async function stripUnsupportedFields<T extends object>(
  type: string,
  input: T
): Promise<T> {
  const result: Record<string, unknown> = { ...(input as Record<string, unknown>) };
  const definition = await postTypeRegistry.getBySlug(type);
  const supports = new Set(definition?.supports ?? ['title', 'editor']);
  for (const [field, support] of Object.entries(FIELD_SUPPORT_REQUIREMENT)) {
    if (!supports.has(support)) delete result[field];
  }
  return result as T;
}

async function typeSupports(type: string | undefined | null, support: string): Promise<boolean> {
  if (!type) return false;
  const definition = await postTypeRegistry.getBySlug(type);
  return definition?.supports?.includes(support as never) ?? false;
}

/** Validates the logical content values against the active field groups. */
async function validateCustomFields(
  context: { contentType: string; contentSlug?: string; postStatus?: string },
  body: Record<string, unknown>
): Promise<void> {
  const issues = await fieldGroupService.validateValues(context, body);
  if (issues.length > 0) {
    throw new Error(`Field validation failed: ${issues.join('; ')}`);
  }
}

function readString(record: Record<string, unknown>, ...keys: string[]): string | undefined {
  for (const key of keys) {
    if (typeof record[key] === 'string') return record[key] as string;
  }
  return undefined;
}

function generateSlug(title: string): string {
  return title
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

/**
 * Item 23: invalida as entradas de cache de um conteúdo pelas TAGS sob as
 * quais foram gravadas (por id e por tipo) — sem enumerar formas de chave.
 */
async function invalidateContentCache(id: string, slug?: string | null, type?: string): Promise<void> {
  const index = getTaggedCacheIndex();
  await index.invalidateTag(`content:${id}`);
  if (type) await index.invalidateTag(`content:type:${type}`);
  if (slug) await index.invalidateTag(`content:slug:${slug}`);
}

/**
 * Validates parent chain: no cycles, same type, max depth 5.
 * Called inside the transaction before INSERT/UPDATE.
 */
async function validateParentChain(
  sql: ReturnType<typeof getConnection>,
  tenantId: string,
  childId: string,
  newParentId: string | null,
  type: string
): Promise<void> {
  if (!newParentId) return;

  // 1) Parent exists, same tenant, same type
  const parent = await sql.unsafe(
    'SELECT id, type FROM content WHERE id = $1 AND tenant_id = $2',
    [newParentId, tenantId]
  );
  if (!parent.length) {
    throw new Error('Parent not found or cross-tenant');
  }
  const parentRow = parent[0] as { type: string };
  if (parentRow.type !== type) {
    throw new Error('Parent must be same content type');
  }

  // 2) Detect cycle: walk up from newParentId
  let current: string | null = newParentId;
  const visited = new Set<string>();
  while (current) {
    if (current === childId || visited.has(current)) {
      throw new Error('Parent assignment would create a cycle');
    }
    visited.add(current);
    const p = await sql.unsafe('SELECT parent_id FROM content WHERE id = $1', [current]);
    const row = p[0] as { parent_id: string | null } | undefined;
    current = row?.parent_id ?? null;
  }

  // 3) Max depth (5 levels including the item itself)
  if (visited.size >= 5) {
    throw new Error('Maximum nesting depth (5) exceeded');
  }
}

/**
 * Builds path segments from parent chain (excludes the base segment).
 * Returns array like ['cliente-a'] for item whose parent is 'cliente-a'.
 */
async function buildItemPathSegments(
  sql: ReturnType<typeof getConnection>,
  tenantId: string,
  itemId: string
): Promise<string[]> {
  const segments: string[] = [];
  let currentId: string | null = itemId;
  const visited = new Set<string>();

  while (true) {
    const row = await sql.unsafe('SELECT parent_id, slug FROM content WHERE id = $1', [currentId]);
    const rowData = row[0] as { parent_id: string | null; slug: string } | undefined;
    if (!rowData || !rowData.parent_id) break;
    if (visited.has(rowData.parent_id)) break;
    visited.add(rowData.parent_id);
    segments.unshift(rowData.slug);
    currentId = rowData.parent_id;
  }
  return segments;
}

/**
 * Builds full path (without base) for an item given slug and parent_id.
 * Used for redirect recording.
 */
async function buildFullPath(
  sql: ReturnType<typeof getConnection>,
  tenantId: string,
  type: string,
  slug: string,
  parentId: string | null
): Promise<string> {
  if (!parentId) return slug;
  const parentSegments = await buildItemPathSegments(sql, tenantId, parentId);
  return [...parentSegments, slug].join('/');
}

/**
 * Records an exact-match redirect in url_redirects table.
 */
async function recordExactRedirect(
  sql: ReturnType<typeof getConnection>,
  tenantId: string,
  sourcePath: string,
  targetPath: string,
  userId: string,
  reason: string
): Promise<void> {
  if (sourcePath === targetPath) return;
  await sql.unsafe(
    `INSERT INTO url_redirects (tenant_id, source_path, target_path, redirect_type, is_prefix, created_by, reason)
     VALUES ($1, $2, $3, 301, false, $4, $5)
     ON CONFLICT DO NOTHING`,
    [tenantId, sourcePath, targetPath, userId, reason]
  );
}

/**
 * Records a prefix redirect (for base rename: /old-base/* -> /new-base/*).
 */
async function recordPrefixRedirect(
  sql: ReturnType<typeof getConnection>,
  tenantId: string,
  oldBase: string,
  newBase: string,
  userId: string
): Promise<void> {
  await sql.unsafe(
    `INSERT INTO url_redirects (tenant_id, source_path, target_path, redirect_type, is_prefix, created_by, reason)
     VALUES ($1, $2, $3, 301, true, $4, 'base_rename')
     ON CONFLICT DO NOTHING`,
    [tenantId, `${oldBase}/*`, `${newBase}/*`, userId]
  );
}

export class ContentService {
  async getSingleton(type: string, tenantId: string): Promise<Content | null> {
    const definition = await postTypeRegistry.getBySlug(type);
    if (!definition?.singleton) return null;

    const sql = getConnection();
    const result = await sql.unsafe(
      'SELECT * FROM content WHERE tenant_id = $1 AND type = $2 ORDER BY created_at ASC LIMIT 1',
      [tenantId, type]
    );
    return (result[0] as unknown as Content) ?? null;
  }

  async list(options: {
    page?: number;
    limit?: number;
    type?: string;
    status?: ContentStatus;
    search?: string;
  }): Promise<{ data: Content[]; total: number }> {
    const sql = getConnection();
    const { page = 1, limit = 20, type, status, search } = options;
    const offset = (page - 1) * limit;

    let whereClause = 'WHERE 1=1';
    const params: string[] = [];

    if (type) {
      whereClause += ` AND type = $${params.length + 1}`;
      params.push(type);
    }
    if (status) {
      whereClause += ` AND status = $${params.length + 1}`;
      params.push(status);
    }
    if (search) {
      whereClause += ` AND (title ILIKE $${params.length + 1} OR slug ILIKE $${params.length + 2})`;
      params.push(`%${search}%`);
      params.push(`%${search}%`);
    }

    // Lista com JOIN opcional para evitar N+1 em author/media quando expand=true (query param futuro)
    const dataResult = await sql.unsafe(
      `SELECT c.* FROM content c ${whereClause} ORDER BY c.created_at DESC LIMIT ${limit} OFFSET ${offset}`.replace('WHERE 1=1', 'WHERE 1=1'),
      params
    );
    const countResult = await sql.unsafe(
      `SELECT COUNT(*)::int as total FROM content ${whereClause}`,
      params
    );

    const registry = getHookRegistry();
    const filteredData = (await registry.applyFiltersAsync(HOOK_POINTS.CONTENT_QUERY, dataResult as unknown as Content[])) as Content[];

    return {
      data: filteredData,
      total: Number((countResult[0] as Record<string, unknown>)?.['total'] ?? 0),
    };
  }

  async getById(id: string): Promise<Content | null> {
    const sql = getConnection();
    const cache = getCache();
    const cacheKey = `content:${id}`;
    const cached = await cache.get(cacheKey);
    if (cached) return cached as Content;

    // Eager loading: content + author + featuredImage metadata em query única (evita N+1)
    const result = await sql.unsafe(
      `SELECT c.*,
              json_build_object('id', u.id, 'name', u.name, 'email', u.email) AS author,
              json_build_object('id', m.id, 'url', m.url, 'mimeType', m.mime_type) AS featuredImage
       FROM content c
       LEFT JOIN users u ON u.id = c.author_id
       LEFT JOIN media m ON m.id = c.featured_image_id
       WHERE c.id = $1`,
      [id]
    );
    const content = (result[0] as unknown as Content) ?? null;
    if (content) {
      // Item 23: entrada registrada sob tags de conteúdo — save/publish/delete
      // invalidam por tag em vez de adivinhar chaves derivadas.
      await getTaggedCacheIndex().setWithTags(
        cacheKey,
        content,
        [`content:${id}`, `content:type:${content.type}`],
        60
      );
    }
    return content;
  }

  async getByIdBatch(ids: string[]): Promise<Map<string, Content>> {
    if (ids.length === 0) return new Map();
    const sql = getConnection();
    const result = await sql.unsafe(
      `SELECT c.*,
              json_build_object('id', u.id, 'name', u.name) AS author
       FROM content c LEFT JOIN users u ON u.id = c.author_id
       WHERE c.id = ANY($1::uuid[])`,
      [ids]
    );
    const map = new Map<string, Content>();
    for (const row of result as unknown as Content[]) {
      const r = row as unknown as Record<string, unknown>;
      map.set(String(r['id']), row);
    }
    return map;
  }

  async getBySlug(slug: string, type?: string): Promise<Content | null> {
    const sql = getConnection();
    if (type) {
      const result = await sql.unsafe('SELECT * FROM content WHERE slug = $1 AND type = $2', [slug, type]);
      return (result[0] as unknown as Content) ?? null;
    }
    const result = await sql.unsafe('SELECT * FROM content WHERE slug = $1', [slug]);
    return (result[0] as unknown as Content) ?? null;
  }

  async create(rawInput: CreateContentInput): Promise<Content> {
    const sql = getConnection();
    const registry = getHookRegistry();

    const input = (await stripUnsupportedFields(rawInput.type, rawInput)) as CreateContentInput;

    const definition = await postTypeRegistry.getBySlug(input.type);
    if (!definition) throw new Error(`Content type "${input.type}" não encontrado`);
    if (definition.singleton) {
      const existing = await this.getSingleton(input.type, input.tenantId);
      if (existing) {
        throw new Error(`O conteúdo singleton "${input.type}" já existe`);
      }
    }

    // Validate parentId if provided
    if (input.parentId) {
      await validateParentChain(sql, input.tenantId, '', input.parentId, input.type);
    }

    const filteredInput = (await registry.applyFiltersAsync(
      HOOK_POINTS.BEFORE_SAVE_CONTENT(input.type),
      input.body ?? {},
      { operation: 'create', title: input.title, slug: input.slug }
    )) as Record<string, unknown>;

    const slug = input.slug ?? generateSlug(input.title);

    const logical = normalizeLogicalValues({
      body: filteredInput,
      native: { ...input, slug, status: input.status ?? 'DRAFT', author: input.authorId },
    });
    await validateCustomFields(
      {
        contentType: input.type,
        contentSlug: slug,
        postStatus: input.status ?? 'DRAFT',
      },
      logical
    );
    const canonicalBody = logicalValuesToBody(logical);
    const native = logicalValuesToNative(logical);

    const id = randomUUID();
    const status = input.status ?? 'DRAFT';
    const metadata = input.metadata ?? {};

    const result = await sql.unsafe(
      `INSERT INTO content (id, tenant_id, type, title, slug, body, excerpt, status, author_id, featured_image_id, seo_title, seo_description, metadata, layout, parent_id)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9, $10, $11, $12, $13::jsonb, $14, $15)
       RETURNING *`,
      [id, input.tenantId, input.type, String(logical['title'] ?? input.title), String(logical['slug'] ?? slug), canonicalBody, native['excerpt'] ?? null, String(logical['status'] ?? status), String(native['authorId'] ?? input.authorId), native['featuredImageId'] ?? null, native['seoTitle'] ?? null, native['seoDescription'] ?? null, metadata, input.layout ?? null, input.parentId ?? null]
    );

    const content = result[0] as unknown as Content;

    if (await typeSupports(content.type, 'revisions')) {
      await this.recordSnapshot(content);
    }

    await registry.doAction(HOOK_POINTS.AFTER_SAVE_CONTENT(input.type), content, { operation: 'create' });

    const eventBus = getEventBus();
    await eventBus.emit({
      id: randomUUID(),
      type: 'content.created',
      aggregateType: 'content',
      aggregateId: content.id,
      payload: { content },
      processed: false,
      createdAt: new Date(),
    });

    // Item 23: invalidação por tag — pega qualquer chave derivada registrada
    // (por id e por tipo) sem enumerar formas de chave manualmente.
    await invalidateContentCache(content.id, content.slug, content.type);

    return content;
  }

  async update(id: string, input: UpdateContentInput): Promise<Content | null> {
    const sql = getConnection();
    const registry = getHookRegistry();

    const existing = await this.getById(id);
    if (!existing) return null;

    // Capture old values for redirect recording
    const oldSlug = existing.slug;
    const oldParentId = (existing as any).parent_id ?? null;
    const oldMetadata = existing.metadata ?? {};

    input = (await stripUnsupportedFields(existing.type, input)) as UpdateContentInput;
    const existingRow = existing as unknown as Record<string, unknown>;

    // Validate parentId if provided (including null to remove)
    if (Object.prototype.hasOwnProperty.call(input, 'parentId')) {
      const newParentId = input.parentId ?? null;
      if (newParentId !== oldParentId) {
        await validateParentChain(sql, existingRow['tenant_id'] as string, id, newParentId, existing.type);
      }
    }

    let logical = normalizeLogicalValues({
      body: existing.body,
      data: (existing as unknown as Record<string, unknown>)['data'],
      native: existing as unknown as Record<string, unknown>,
    });

    if (input.body !== undefined) {
      input.body = (await registry.applyFiltersAsync(
        HOOK_POINTS.BEFORE_SAVE_CONTENT(existing.type),
        input.body,
        { operation: 'update', title: input.title, slug: input.slug, id }
      )) as Record<string, unknown>;
    }

    const providedLogical = input.body !== undefined
      ? normalizeLogicalValues({ body: input.body })
      : {};

    const updateBody = {
      ...logical,
      ...providedLogical,
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.slug !== undefined ? { slug: input.slug } : {}),
      ...(input.excerpt !== undefined ? { excerpt: input.excerpt } : {}),
      ...(input.status !== undefined ? { status: input.status } : {}),
      ...(input.featuredImageId !== undefined ? { featured_image: input.featuredImageId } : {}),
      ...(input.seoTitle !== undefined ? { seo_title: input.seoTitle } : {}),
      ...(input.seoDescription !== undefined ? { seo_description: input.seoDescription } : {}),
    };
    logical = normalizeLogicalValues({
      body: updateBody,
      native: {
        ...(existing as unknown as Record<string, unknown>),
        ...input,
        title: input.title ?? existing.title,
        slug: input.slug ?? existing.slug,
        status: input.status ?? existing.status,
        author: readString(existing as unknown as Record<string, unknown>, 'authorId', 'author_id'),
      },
    });
    await validateCustomFields(
      {
        contentType: existing.type,
        contentSlug: String(logical['slug'] ?? existing.slug),
        postStatus: String(logical['status'] ?? existing.status),
      },
      logical
    );
    const canonicalBody = logicalValuesToBody(logical);
    const native = logicalValuesToNative(logical);

    if (await typeSupports(existing.type, 'revisions')) {
      await this.recordSnapshot(existing);
    }

    const newVersion = existing.version + 1;
    const setClauses: string[] = [];
    const setParams: unknown[] = [];

    if (input.title !== undefined || Object.prototype.hasOwnProperty.call(providedLogical, 'title')) {
      setClauses.push(`title = $${setParams.length + 1}`);
      setParams.push(native['title']);
    }
    if (input.slug !== undefined || Object.prototype.hasOwnProperty.call(providedLogical, 'slug')) {
      setClauses.push(`slug = $${setParams.length + 1}`);
      setParams.push(native['slug']);
    }
    {
      setClauses.push(`body = $${setParams.length + 1}::jsonb`);
      setParams.push(canonicalBody);
      setClauses.push(`data = '{}'::jsonb`);
    }
    if (input.excerpt !== undefined || Object.prototype.hasOwnProperty.call(providedLogical, 'excerpt')) {
      setClauses.push(`excerpt = $${setParams.length + 1}`);
      setParams.push(native['excerpt'] ?? null);
    }
    if (input.status !== undefined || Object.prototype.hasOwnProperty.call(providedLogical, 'status')) {
      setClauses.push(`status = $${setParams.length + 1}`);
      setParams.push(native['status']);
    }
    if (input.featuredImageId !== undefined || Object.prototype.hasOwnProperty.call(providedLogical, 'featured_image')) {
      setClauses.push(`featured_image_id = $${setParams.length + 1}`);
      setParams.push(native['featuredImageId'] ?? null);
    }
    if (input.seoTitle !== undefined || Object.prototype.hasOwnProperty.call(providedLogical, 'seo_title')) {
      setClauses.push(`seo_title = $${setParams.length + 1}`);
      setParams.push(native['seoTitle'] ?? null);
    }
    if (input.seoDescription !== undefined || Object.prototype.hasOwnProperty.call(providedLogical, 'seo_description')) {
      setClauses.push(`seo_description = $${setParams.length + 1}`);
      setParams.push(native['seoDescription'] ?? null);
    }
    if (input.metadata !== undefined) {
      setClauses.push(`metadata = $${setParams.length + 1}::jsonb`);
      setParams.push(input.metadata);
    }
    if (input.layout !== undefined) {
      setClauses.push(`layout = $${setParams.length + 1}`);
      setParams.push(input.layout ? input.layout : null);
    }
    // parent_id handling
    if (Object.prototype.hasOwnProperty.call(input, 'parentId')) {
      setClauses.push(`parent_id = $${setParams.length + 1}`);
      setParams.push(input.parentId ?? null);
    }

    setClauses.push(`version = $${setParams.length + 1}`);
    setParams.push(String(newVersion));

    if (input.status === 'PUBLISHED') {
      setClauses.push(`published_at = CASE WHEN status != 'PUBLISHED' THEN NOW() ELSE published_at END`);
    }

    setParams.push(id);
    const whereParam = setParams.length;

    const result = await sql.unsafe(
      `UPDATE content SET ${setClauses.join(', ')} WHERE id = $${whereParam} RETURNING *`,
      setParams
    );

    const content = result[0] as unknown as Content;
    const contentRow = result[0] as Record<string, unknown>; // DB row with snake_case

    // Record redirects AFTER successful update
    // 1) slug change
    if (content.slug !== oldSlug) {
      const oldPath = await buildFullPath(sql, contentRow['tenant_id'] as string, content.type, oldSlug, oldParentId);
      const newPath = await buildFullPath(sql, contentRow['tenant_id'] as string, content.type, content.slug, (contentRow['parent_id'] as string | null) ?? null);
      // We need a userId - get from author_id as fallback (should come from context in real usage)
      await recordExactRedirect(sql, contentRow['tenant_id'] as string, oldPath, newPath, contentRow['author_id'] as string, 'slug_change');
    }

    // 2) parent change
    const newParentId = (contentRow['parent_id'] as string | null) ?? null;
    if (newParentId !== oldParentId) {
      const oldPath = await buildFullPath(sql, contentRow['tenant_id'] as string, content.type, oldSlug, oldParentId);
      const newPath = await buildFullPath(sql, contentRow['tenant_id'] as string, content.type, content.slug, newParentId);
      await recordExactRedirect(sql, contentRow['tenant_id'] as string, oldPath, newPath, contentRow['author_id'] as string, 'parent_change');
    }

    // 3) Base rename detection: if this is a PAGE and its slug changed, check if it's a hub page
    if (existing.type === 'page' && content.slug !== oldSlug) {
      const wasHub = oldMetadata?.['hub_type'] as string | undefined;
      const newMetadata = input.metadata ?? existing.metadata ?? {};
      const isHub = newMetadata?.['hub_type'] as string | undefined;
      const hubType = wasHub || isHub;
      if (hubType) {
        // This page is/was a hub page - record prefix redirect for all items under it
        await recordPrefixRedirect(sql, contentRow['tenant_id'] as string, oldSlug, content.slug, contentRow['author_id'] as string);
      }
    }

    await registry.doAction(HOOK_POINTS.AFTER_SAVE_CONTENT(content.type), content, { operation: 'update', previousVersion: existing.version });

    const eventBus = getEventBus();
    await eventBus.emit({
      id: randomUUID(),
      type: 'content.updated',
      aggregateType: 'content',
      aggregateId: content.id,
      payload: { content, previousVersion: existing.version },
      processed: false,
      createdAt: new Date(),
    });

    await invalidateContentCache(content.id, content.slug, content.type);

    return content;
  }

  async delete(id: string): Promise<boolean> {
    const sql = getConnection();
    const registry = getHookRegistry();

    const existing = await this.getById(id);
    if (!existing) return false;

    await registry.doAction(HOOK_POINTS.BEFORE_DELETE_CONTENT(existing.type), existing);

    await sql.unsafe('UPDATE content SET status = $1 WHERE id = $2', ['TRASHED', id]);

    await registry.doAction(HOOK_POINTS.AFTER_DELETE_CONTENT(existing.type), existing);

    const eventBus = getEventBus();
    await eventBus.emit({
      id: randomUUID(),
      type: 'content.deleted',
      aggregateType: 'content',
      aggregateId: id,
      payload: { content: existing },
      processed: false,
      createdAt: new Date(),
    });

    await invalidateContentCache(id, existing.slug, existing.type);

    return true;
  }

  async getVersions(contentId: string): Promise<ContentVersion[]> {
    const sql = getConnection();
    const result = await sql.unsafe(
      `SELECT id, content_id AS "contentId", version, title, slug, body, excerpt,
              featured_image_id AS "featuredImageId", seo_title AS "seoTitle",
              seo_description AS "seoDescription", metadata, author_id AS "authorId", created_at AS "createdAt"
       FROM content_versions WHERE content_id = $1 ORDER BY version DESC`,
      [contentId]
    );
    return result as unknown as ContentVersion[];
  }

  async getRevisions(contentId: string): Promise<ContentVersion[]> {
    return this.getVersions(contentId);
  }

  async restoreRevision(contentId: string, revisionIdOrVersion: string): Promise<Content | null> {
    const sql = getConnection();

    const current = await this.getById(contentId);
    if (!current) return null;

    const revisionResult = await sql.unsafe(
      'SELECT * FROM content_versions WHERE id::text = $1 AND content_id = $2 LIMIT 1',
      [revisionIdOrVersion, contentId]
    );
    let revision = (revisionResult[0] as unknown as Record<string, unknown>) ?? null;

    if (!revision && /^\d+$/.test(revisionIdOrVersion)) {
      const byVersion = await sql.unsafe(
        'SELECT * FROM content_versions WHERE version = $1 AND content_id = $2 ORDER BY created_at DESC LIMIT 1',
        [Number(revisionIdOrVersion), contentId]
      );
      revision = (byVersion[0] as unknown as Record<string, unknown>) ?? null;
    }
    if (!revision) return null;

    await this.recordSnapshot(current);

    const restoredLogical = normalizeLogicalValues({
      body: revision['body'],
      native: revision,
    });
    const restoredNative = logicalValuesToNative(restoredLogical);

    const result = await sql.unsafe(
      `UPDATE content SET
         title = $1,
         slug = $2,
         body = $3::jsonb,
         data = '{}'::jsonb,
         excerpt = $4,
         featured_image_id = $5,
         seo_title = $6,
         seo_description = $7,
         metadata = $8::jsonb,
         updated_at = NOW()
       WHERE id = $9 RETURNING *`,
      [
        String(restoredLogical['title'] ?? current.title),
        restoredLogical['slug'] != null ? String(restoredLogical['slug']) : current.slug,
        logicalValuesToBody(restoredLogical),
        restoredNative['excerpt'] != null ? String(restoredNative['excerpt']) : null,
        restoredNative['featuredImageId'] != null ? String(restoredNative['featuredImageId']) : null,
        restoredNative['seoTitle'] != null ? String(restoredNative['seoTitle']) : null,
        restoredNative['seoDescription'] != null ? String(restoredNative['seoDescription']) : null,
        revision['metadata'] ?? {},
        contentId,
      ] as unknown[]
    );

    const restored = result[0] as unknown as Content;

    const eventBus = getEventBus();
    await eventBus.emit({
      id: randomUUID(),
      type: 'content.revision.restored',
      aggregateType: 'content',
      aggregateId: contentId,
      payload: { contentId, revisionId: String(revision['id']), restoredBy: restored.version },
      processed: false,
      createdAt: new Date(),
    });

    await invalidateContentCache(contentId, restored.slug, restored.type);

    return restored;
  }

  private async recordSnapshot(content: Content): Promise<void> {
    const sql = getConnection();

    const raw = content as unknown as Record<string, unknown>;
    const logical = normalizeLogicalValues({
      body: content.body,
      data: raw['data'],
      native: raw,
    });
    const native = logicalValuesToNative(logical);
    const values: unknown[] = [
      randomUUID(),
      content.id,
      Number(content.version),
      String(logical['title'] ?? content.title),
      logical['slug'] != null ? String(logical['slug']) : null,
      logicalValuesToBody(logical),
      native['excerpt'] ?? null,
      native['featuredImageId'] ?? null,
      native['seoTitle'] ?? null,
      native['seoDescription'] ?? null,
      content.metadata ?? {},
      native['authorId'] ?? content.authorId ?? null,
    ];

    await sql.unsafe(
      `INSERT INTO content_versions (id, content_id, version, title, slug, body, excerpt, featured_image_id, seo_title, seo_description, metadata, author_id)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9, $10, $11::jsonb, $12)`,
      values
    );
  }
}

export const contentService = new ContentService();
