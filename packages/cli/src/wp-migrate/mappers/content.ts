/**
 * Content Mapper
 * Maps wp_posts → OkCMS content + content_versions
 */

import { WPMySQLConnector } from '../connectors/mysql';
import {
  WPMigrationConfig,
  MigrationPhase,
  PhaseStats,
  IDMaps,
  MigrationError,
  WPPost,
  WPPostMeta,
} from '../types';
import { parsePostDates, createDateConfig } from '../transformers/dates';
import { getSlugManager, recordSlugMapping, sanitizeTitle } from '../transformers/slugs';
import { htmlToStructuredContent, structuredContentToBody } from '../transformers/html-to-json';
import { deepUnserialize } from '../transformers/serialized-php';

export interface ContentMapperDeps {
  connector: WPMySQLConnector;
  config: WPMigrationConfig;
  idMaps: IDMaps;
  stats: Record<MigrationPhase, PhaseStats>;
  errors: MigrationError[];
  reportProgress: (phase: MigrationPhase, current: number, total: number) => void;
  tenantId: string;
  dateConfig: ReturnType<typeof createDateConfig>;
  authorIdMap: Map<number, string>; // WP user ID -> OkCMS user UUID
}

const WP_STATUS_MAP: Record<string, 'DRAFT' | 'PUBLISHED' | 'ARCHIVED' | 'TRASHED'> = {
  publish: 'PUBLISHED',
  future: 'PUBLISHED', // Scheduled posts
  draft: 'DRAFT',
  'auto-draft': 'DRAFT',
  pending: 'DRAFT',
  private: 'PUBLISHED', // Private but published
  trash: 'TRASHED',
  inherit: 'DRAFT', // Revisions/attachments
};

export class ContentMapper {
  private deps: ContentMapperDeps;
  private slugManager = getSlugManager();
  private contentTypeIdMap: Map<string, string> = new Map(); // WP post_type -> OkCMS content_type UUID

  constructor(deps: ContentMapperDeps) {
    this.deps = deps;
  }

  /**
   * Main entry point: migrate content
   */
  async migrate(): Promise<void> {
    const phase: MigrationPhase = 'content';
    this.deps.stats[phase] = { created: 0, updated: 0, skipped: 0, errors: 0, durationMs: 0 };
    const startTime = Date.now();

    try {
      // Load content type ID map
      await this.loadContentTypeIds();

      // Preload existing slugs for collision detection
      await this.preloadSlugs();

      // Get all posts (excluding revisions and nav_menu_items - handled separately)
      const posts = await this.deps.connector.getPosts({
        postType: this.getMigratedPostTypes(),
        orderBy: 'ID',
        orderDir: 'ASC',
      });

      const total = posts.length;
      const batchSize = this.deps.config.batchSize ?? 500;

      // Process in batches
      for (let i = 0; i < posts.length; i += batchSize) {
        const batch = posts.slice(i, i + batchSize);
        await this.processBatch(batch);
        this.deps.reportProgress(phase, Math.min(i + batchSize, total), total);
      }

      this.deps.stats[phase].durationMs = Date.now() - startTime;
    } catch (error) {
      this.deps.stats[phase].errors++;
      this.addError(phase, 'posts', 0, 'migrate', error instanceof Error ? error.message : 'Unknown error');
      throw error;
    }
  }

  /**
   * Get post types to migrate (exclude revisions, nav_menu_items, attachments handled separately)
   */
  private getMigratedPostTypes(): string[] {
    // We'll migrate all post types except revisions and nav_menu_items
    // Attachments are migrated in media mapper but also need content entry
    return []; // Empty means all types - filtered in getPosts
  }

  /**
   * Load content type IDs from database
   */
  private async loadContentTypeIds(): Promise<void> {
    const { connector } = this.deps;
    const rows = await connector.query<{ slug: string; id: string }>(
      `SELECT slug, id FROM content_types`
    );
    for (const row of rows) {
      this.contentTypeIdMap.set(row.slug, row.id);
    }
  }

  /**
   * Preload existing slugs for collision detection
   */
  private async preloadSlugs(): Promise<void> {
    const { connector, tenantId } = this.deps;

    // Get all existing slugs per content type
    const rows = await connector.query<Record<string, unknown>>(
      `SELECT type, slug FROM content WHERE tenant_id = ?`,
      [tenantId]
    );

    const byType = new Map<string, string[]>();
    for (const row of rows) {
      const type = String(row['type']);
      const slug = String(row['slug']);
      if (!byType.has(type)) byType.set(type, []);
      byType.get(type)!.push(slug);
    }

    for (const [type, slugs] of byType) {
      this.slugManager.preload(tenantId, type, slugs);
    }
  }

  /**
   * Process a batch of posts
   */
  private async processBatch(posts: WPPost[]): Promise<void> {
    const { connector } = this.deps;

    // Collect all post IDs for bulk meta fetch
    const postIds = posts.map(p => p.ID);
    const allMeta = await connector.getPostMetaBulk(postIds);
    const metaMap = new Map<number, WPPostMeta[]>();
    for (const meta of allMeta) {
      if (!metaMap.has(meta.post_id)) metaMap.set(meta.post_id, []);
      metaMap.get(meta.post_id)!.push(meta);
    }

    // Process each post
    for (const post of posts) {
      try {
        await this.migratePost(post, metaMap.get(post.ID) ?? []);
      } catch (error) {
        this.deps.stats['content'].errors++;
        this.addError('content', 'posts', post.ID, 'migrate_post', error instanceof Error ? error.message : 'Unknown error');
      }
    }
  }

  /**
   * Migrate a single post
   */
  private async migratePost(post: WPPost, meta: WPPostMeta[]): Promise<void> {
    const { connector, idMaps, tenantId, authorIdMap, dateConfig } = this.deps;

    // Skip revisions and nav_menu_items (handled separately)
    if (post.post_type === 'revision' || post.post_type === 'nav_menu_item') {
      this.deps.stats['content'].skipped++;
      return;
    }

    // Map author
    const authorId = authorIdMap.get(post.post_author);
    if (!authorId) {
      this.addError('content', 'posts', post.ID, 'author', `Author ${post.post_author} not mapped`);
      this.deps.stats['content'].skipped++;
      return;
    }

    // Get content type ID
    const contentTypeId = this.contentTypeIdMap.get(post.post_type);
    if (!contentTypeId) {
      this.addError('content', 'posts', post.ID, 'content_type', `Content type ${post.post_type} not registered`);
      this.deps.stats['content'].skipped++;
      return;
    }

    // Parse dates
    const { publishedAt } = parsePostDates(post, dateConfig);

    // Generate slug
    const baseSlug = post.post_name || sanitizeTitle(post.post_title);
    const slug = this.slugManager.generate(tenantId, post.post_type, baseSlug);

    // Record slug mapping for redirects
    recordSlugMapping({
      wpPostId: post.ID,
      wpPostName: post.post_name,
      okcmsSlug: slug,
      tenantId,
      contentType: post.post_type,
    });

    // Build metadata from post columns
    const metadata: Record<string, unknown> = {
      wp_post_id: post.ID,
      wp_post_type: post.post_type,
      comment_status: post.comment_status,
      ping_status: post.ping_status,
      post_password: post.post_password ? '[protected]' : null,
      to_ping: post.to_ping ? post.to_ping.split('\n').filter(Boolean) : [],
      pinged: post.pinged ? post.pinged.split('\n').filter(Boolean) : [],
      menu_order: post.menu_order,
      guid: post.guid,
      mime_type: post.post_mime_type,
    };

    // Build body from post_content
    const structured = htmlToStructuredContent(post.post_content);
    const body = structuredContentToBody(structured);

    // Extract featured image from _thumbnail_id meta
    let featuredImageId: string | undefined;
    const thumbnailMeta = meta.find(m => m.meta_key === '_thumbnail_id');
    if (thumbnailMeta) {
      const thumbId = parseInt(thumbnailMeta.meta_value, 10);
      if (!isNaN(thumbId)) {
        featuredImageId = this.deps.idMaps.media.get(thumbId);
      }
    }

    // Build data JSONB (additional structured data)
    const data: Record<string, unknown> = {
      wp_id: post.ID,
      wp_post_type: post.post_type,
      shortcodes: structured.shortcodes.map(sc => ({
        name: sc.name,
        attributes: sc.attributes,
        selfClosing: sc.selfClosing,
      })),
    };

    // Add page template if present
    const templateMeta = meta.find(m => m.meta_key === '_wp_page_template');
    if (templateMeta) {
      data['template'] = templateMeta.meta_value;
      metadata['template'] = templateMeta.meta_value;
    }

    // Add custom fields meta (non-WP internal) to data
    for (const m of meta) {
      if (m.meta_key.startsWith('_') || m.meta_key.startsWith('wp_')) continue;
      if (['_thumbnail_id', '_wp_page_template', '_edit_lock', '_edit_last', '_wp_old_slug'].includes(m.meta_key)) continue;

      // Try to unserialize
      const value = deepUnserialize(m.meta_value);
      data[m.meta_key] = value;
    }

    // Determine status
    const status = WP_STATUS_MAP[post.post_status] ?? 'DRAFT';

    // Published at: only for published posts
    const finalPublishedAt = status === 'PUBLISHED' ? publishedAt : null;

    // Check if content already exists (by slug + type + tenant)
    const existing = await connector.queryOne<{ id: string; version: number }>(
      `SELECT id, version FROM content WHERE tenant_id = ? AND type = ? AND slug = ?`,
      [tenantId, post.post_type, slug]
    );

    let contentId: string;
    let version = 1;

    if (existing) {
      // Update existing
      contentId = existing.id;
      version = existing.version + 1;

      await connector.query(
        `UPDATE content SET
          title = ?, body = ?, excerpt = ?, status = ?, author_id = ?,
          featured_image_id = ?, seo_title = ?, seo_description = ?,
          metadata = ?, published_at = ?, version = ?, updated_at = NOW(),
          parent_id = ?, layout = ?, data = ?
        WHERE id = ?`,
        [
          post.post_title,
          JSON.stringify(body),
          post.post_excerpt || null,
          status,
          authorId,
          featuredImageId || null,
          metadata['seo_title'] as string ?? null,
          metadata['seo_description'] as string ?? null,
          JSON.stringify(metadata),
          finalPublishedAt?.toISOString().slice(0, 19).replace('T', ' ') ?? null,
          version,
          this.getParentId(post, idMaps),
          data['layout'] as string ?? null,
          JSON.stringify(data),
          contentId,
        ]
      );

      this.deps.stats['content'].updated++;
    } else {
      // Insert new
      contentId = crypto.randomUUID();
      version = 1;

      await connector.query(
        `INSERT INTO content (id, tenant_id, type, title, slug, body, excerpt, status, author_id,
          featured_image_id, seo_title, seo_description, metadata, published_at, version, created_at, updated_at, parent_id, layout, data)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW(), ?, ?, ?)`,
        [
          contentId,
          tenantId,
          post.post_type,
          post.post_title,
          slug,
          JSON.stringify(body),
          post.post_excerpt || null,
          status,
          authorId,
          featuredImageId || null,
          metadata['seo_title'] as string ?? null,
          metadata['seo_description'] as string ?? null,
          JSON.stringify(metadata),
          finalPublishedAt?.toISOString().slice(0, 19).replace('T', ' ') ?? null,
          version,
          this.getParentId(post, idMaps),
          data['layout'] as string ?? null,
          JSON.stringify(data),
        ]
      );

      this.deps.stats['content'].created++;
    }

    // Map WP post ID -> OkCMS content UUID
    idMaps.content.set(post.ID, contentId);

    // Handle revisions (post_type='revision' with post_parent = this post)
    await this.migrateRevisions(post.ID, contentId, authorId);
  }

  /**
   * Get parent ID from post_parent mapping
   */
  private getParentId(post: WPPost, idMaps: IDMaps): string | null {
    if (post.post_parent > 0) {
      return idMaps.content.get(post.post_parent) ?? null;
    }
    return null;
  }

  /**
   * Migrate revisions for a post
   */
  private async migrateRevisions(parentPostId: number, contentId: string, authorId: string): Promise<void> {
    const { connector, dateConfig } = this.deps;

    // Get revisions for this post
    const revisions = await connector.query<Record<string, unknown>>(`
      SELECT * FROM ${connector.table('posts')}
      WHERE post_type = 'revision' AND post_parent = ?
      ORDER BY post_date ASC
    `, [parentPostId]);

    if (revisions.length === 0) return;

    for (let i = 0; i < revisions.length; i++) {
      const rev = revisions[i];
      if (!rev) continue;

      const revId = Number(rev['ID']);

      // Parse dates - extract required properties from rev
      const revPost = {
        post_date: String(rev['post_date'] ?? ''),
        post_date_gmt: String(rev['post_date_gmt'] ?? ''),
        post_modified: String(rev['post_modified'] ?? ''),
        post_modified_gmt: String(rev['post_modified_gmt'] ?? ''),
      };
      const { createdAt } = parsePostDates(revPost, dateConfig);

      // Build revision body
      const structured = htmlToStructuredContent(String(rev['post_content'] ?? ''));
      const body = structuredContentToBody(structured);

      // Extract metadata
      const metadata: Record<string, unknown> = {
        wp_revision_id: revId,
        wp_post_parent: Number(rev['post_parent'] ?? 0),
      };

      // Insert into content_versions
      const versionId = crypto.randomUUID();
      await connector.query(
        `INSERT INTO content_versions (id, content_id, version, title, body, excerpt, featured_image_id, seo_title, seo_description, metadata, author_id, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          versionId,
          contentId,
          i + 1, // Version number
          String(rev['post_title'] ?? ''),
          JSON.stringify(body),
          String(rev['post_excerpt'] ?? '') || null,
          null, // featured_image_id - would need to map from meta
          metadata['seo_title'] as string ?? null,
          metadata['seo_description'] as string ?? null,
          JSON.stringify(metadata),
          authorId,
          createdAt.toISOString().slice(0, 19).replace('T', ' '),
        ]
      );
    }
  }

  /**
   * Add error to collection
   */
  private addError(
    phase: MigrationPhase,
    wpTable: string,
    wpId: number | string,
    field: string,
    message: string
  ): void {
    this.deps.errors.push({
      phase,
      wpTable,
      wpId,
      field,
      message,
      severity: 'error',
      timestamp: new Date().toISOString(),
    });
  }
}

/**
 * Factory function
 */
export async function migrateContent(
  connector: WPMySQLConnector,
  config: WPMigrationConfig,
  idMaps: IDMaps,
  stats: Record<MigrationPhase, PhaseStats>,
  errors: MigrationError[],
  reportProgress: (phase: MigrationPhase, current: number, total: number) => void,
  tenantId: string,
  authorIdMap: Map<number, string>
): Promise<void> {
  const dateConfig = createDateConfig(new Map()); // Will be populated from options later

  const mapper = new ContentMapper({
    connector,
    config,
    idMaps,
    stats,
    errors,
    reportProgress,
    tenantId,
    dateConfig,
    authorIdMap,
  });

  await mapper.migrate();
}