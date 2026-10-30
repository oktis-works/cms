/**
 * Content Types Mapper
 * Maps WP post_types → OkCMS content_types registry
 */

import { WPMySQLConnector } from '../connectors/mysql';
import { WPMigrationConfig, MigrationPhase, PhaseStats, IDMaps, MigrationError, WPContentTypeInfo, WPPost } from '../types';

export interface ContentTypesMapperDeps {
  connector: WPMySQLConnector;
  config: WPMigrationConfig;
  idMaps: IDMaps;
  stats: Record<MigrationPhase, PhaseStats>;
  errors: MigrationError[];
  reportProgress: (phase: MigrationPhase, current: number, total: number) => void;
}

/**
 * Core post types that exist in every WP installation
 */
const CORE_POST_TYPES = new Set(['post', 'page', 'attachment', 'revision', 'nav_menu_item']);

/**
 * Default schema for core post types
 */
const CORE_CONTENT_TYPE_SCHEMAS: Record<string, Record<string, unknown>> = {
  post: {
    type: 'object',
    properties: {
      title: { type: 'string' },
      slug: { type: 'string' },
      content: { type: 'string', format: 'html' },
      excerpt: { type: 'string' },
      featured_image: { type: 'string', format: 'uuid' },
      seo_title: { type: 'string' },
      seo_description: { type: 'string' },
      status: { type: 'string', enum: ['DRAFT', 'PUBLISHED', 'ARCHIVED', 'TRASHED'] },
      author: { type: 'string', format: 'uuid' },
      categories: { type: 'array', items: { type: 'string', format: 'uuid' } },
      tags: { type: 'array', items: { type: 'string', format: 'uuid' } },
    },
    required: ['title', 'slug'],
  },
  page: {
    type: 'object',
    properties: {
      title: { type: 'string' },
      slug: { type: 'string' },
      content: { type: 'string', format: 'html' },
      excerpt: { type: 'string' },
      featured_image: { type: 'string', format: 'uuid' },
      seo_title: { type: 'string' },
      seo_description: { type: 'string' },
      status: { type: 'string', enum: ['DRAFT', 'PUBLISHED', 'ARCHIVED', 'TRASHED'] },
      author: { type: 'string', format: 'uuid' },
      parent: { type: 'string', format: 'uuid' },
      template: { type: 'string' },
    },
    required: ['title', 'slug'],
  },
  attachment: {
    type: 'object',
    properties: {
      title: { type: 'string' },
      slug: { type: 'string' },
      description: { type: 'string' },
      caption: { type: 'string' },
      alt: { type: 'string' },
      mime_type: { type: 'string' },
      file_size: { type: 'number' },
      metadata: { type: 'object' },
    },
    required: ['title', 'slug'],
  },
};

/**
 * Default fields for each core post type
 */
const CORE_DEFAULT_FIELDS: Record<string, string[]> = {
  post: ['title', 'slug', 'content', 'excerpt', 'featured_image', 'seo_title', 'seo_description', 'status', 'author', 'categories', 'tags'],
  page: ['title', 'slug', 'content', 'excerpt', 'featured_image', 'seo_title', 'seo_description', 'status', 'author', 'parent', 'template'],
  attachment: ['title', 'slug', 'description', 'caption', 'alt', 'mime_type', 'file_size', 'metadata'],
  revision: ['title', 'slug', 'content', 'excerpt', 'featured_image', 'seo_title', 'seo_description', 'status', 'author'],
  nav_menu_item: ['title', 'slug', 'url', 'target', 'classes', 'xfn'],
};

export class ContentTypesMapper {
  private deps: ContentTypesMapperDeps;
  private contentTypeIdMap: Map<string, string> = new Map(); // WP post_type -> OkCMS content_type UUID

  constructor(deps: ContentTypesMapperDeps) {
    this.deps = deps;
  }

  /**
   * Main entry point: migrate content types
   */
  async migrate(): Promise<void> {
    const phase: MigrationPhase = 'content-types';
    this.deps.stats[phase] = { created: 0, updated: 0, skipped: 0, errors: 0, durationMs: 0 };
    const startTime = Date.now();

    try {
      // 1. Get all distinct post types from WP
      const wpContentTypes = await this.getWPContentTypes();

      // 2. Register core post types first
      await this.registerCorePostTypes();

      // 3. Register custom post types
      await this.registerCustomPostTypes(wpContentTypes);

      this.deps.stats[phase].durationMs = Date.now() - startTime;
    } catch (error) {
      this.deps.stats[phase].errors++;
      this.addError(phase, 'content_types', 0, 'migrate', error instanceof Error ? error.message : 'Unknown error');
      throw error;
    }
  }

  /**
   * Get all WP content types with analysis
   */
  private async getWPContentTypes(): Promise<Map<string, WPContentTypeInfo>> {
    const { connector } = this.deps;
    const types = new Map<string, WPContentTypeInfo>();

    // Get all distinct post types with counts
    const rows = await connector.query<Record<string, unknown>>(
      `SELECT post_type, COUNT(*) as count
      FROM ${connector.table('posts')}
      GROUP BY post_type
      ORDER BY count DESC`
    );

    for (const row of rows) {
      const postType = String(row['post_type']);
      const count = Number(row['count']);

      // Get sample post
      const sample = await connector.queryOne<WPPost>(
        `SELECT * FROM ${connector.table('posts')}
         WHERE post_type = ?
         ORDER BY ID DESC
         LIMIT 1`,
        [postType]
      );

      // Get meta keys
      const metaKeys = new Set<string>();
      const metaRows = await connector.query<Record<string, unknown>>(
        `SELECT DISTINCT pm.meta_key
        FROM ${connector.table('postmeta')} pm
        JOIN ${connector.table('posts')} p ON pm.post_id = p.ID
        WHERE p.post_type = ?`,
        [postType]
      );
      for (const m of metaRows) metaKeys.add(String(m['meta_key']));

      // Check hierarchical
      const hasParent = await connector.queryScalar(
        `SELECT COUNT(*) FROM ${connector.table('posts')}
         WHERE post_type = ? AND post_parent > 0`,
        [postType]
      );

      types.set(postType, {
        postType,
        count,
        samplePost: sample ?? undefined,
        metaKeys,
        hasHierarchical: (hasParent as number) > 0,
        supports: this.inferSupports(postType, metaKeys),
      });
    }

    return types;
  }

  /**
   * Infer supports from meta keys
   */
  private inferSupports(postType: string, metaKeys: Set<string>): string[] {
    const supports = ['title', 'editor'];

    if (CORE_POST_TYPES.has(postType)) {
      const coreSupports: Record<string, string[]> = {
        post: ['title', 'editor', 'author', 'thumbnail', 'excerpt', 'trackbacks', 'custom-fields', 'comments', 'revisions', 'post-formats'],
        page: ['title', 'editor', 'author', 'thumbnail', 'excerpt', 'custom-fields', 'comments', 'revisions', 'page-attributes'],
        attachment: ['title', 'author'],
        revision: ['author'],
        nav_menu_item: ['title'],
      };
      return coreSupports[postType] ?? supports;
    }

    if (metaKeys.has('_thumbnail_id')) supports.push('thumbnail');
    if (metaKeys.has('_wp_page_template')) supports.push('page-attributes');
    if (metaKeys.has('_edit_lock') || metaKeys.has('_edit_last')) supports.push('revisions');
    supports.push('custom-fields');

    return supports;
  }

  /**
   * Register core post types (post, page, attachment, revision, nav_menu_item)
   */
  private async registerCorePostTypes(): Promise<void> {
    const { stats } = this.deps;

    const coreTypes = [
      { slug: 'post', name: 'Post', plural: 'Posts', singular: 'Post', hierarchical: false },
      { slug: 'page', name: 'Page', plural: 'Pages', singular: 'Page', hierarchical: true },
      { slug: 'attachment', name: 'Media', plural: 'Media', singular: 'Media', hierarchical: false },
      { slug: 'revision', name: 'Revision', plural: 'Revisions', singular: 'Revision', hierarchical: false },
      { slug: 'nav_menu_item', name: 'Menu Item', plural: 'Menu Items', singular: 'Menu Item', hierarchical: false },
    ];

    for (const ct of coreTypes) {
      await this.registerContentType({
        slug: ct.slug,
        name: ct.name,
        pluralLabel: ct.plural,
        singularLabel: ct.singular,
        source: 'CORE',
        schema: CORE_CONTENT_TYPE_SCHEMAS[ct.slug] ?? { type: 'object', properties: {} },
        defaultFields: CORE_DEFAULT_FIELDS[ct.slug] ?? ['title', 'slug', 'content'],
        hierarchical: ct.hierarchical,
      });

      stats['content-types'].created++;
    }
  }

  /**
   * Register custom post types
   */
  private async registerCustomPostTypes(wpContentTypes: Map<string, WPContentTypeInfo>): Promise<void> {
    const { config, stats, reportProgress } = this.deps;

    const customTypes = Array.from(wpContentTypes.entries())
      .filter(([type]) => !CORE_POST_TYPES.has(type))
      .map(([type, info]) => ({ type, info }));

    let index = 0;
    for (const { type, info } of customTypes) {
      try {
        // Check if user wants to map this to a different slug
        const mappedSlug = config.tenantSlug ? type : type; // Could add mapping config later

        await this.registerContentType({
          slug: mappedSlug,
          name: this.humanizePostType(type),
          pluralLabel: this.pluralize(this.humanizePostType(type)),
          singularLabel: this.humanizePostType(type),
          source: 'ADMIN',
          schema: this.buildSchemaFromMetaKeys(info.metaKeys, info.supports),
          defaultFields: this.buildDefaultFields(info.supports),
          hierarchical: info.hasHierarchical,
        });

        stats['content-types'].created++;
      } catch (error) {
        stats['content-types'].errors++;
        this.addError('content-types', 'posts', type, 'register', error instanceof Error ? error.message : 'Unknown error');
      }

      reportProgress('content-types', index + 1, customTypes.length);
      index++;
    }
  }

  /**
   * Register a single content type
   */
  private async registerContentType(params: {
    slug: string;
    name: string;
    pluralLabel: string;
    singularLabel: string;
    source: 'CORE' | 'PLUGIN' | 'ADMIN';
    schema: Record<string, unknown>;
    defaultFields: string[];
    hierarchical: boolean;
  }): Promise<string> {
    const { connector } = this.deps;

    // Check if already exists
    const existing = await connector.queryOne<{ id: string }>(
      `SELECT id FROM content_types WHERE slug = ?`,
      [params.slug]
    );

    if (existing) {
      this.contentTypeIdMap.set(params.slug, existing.id);
      this.deps.stats['content-types'].updated++;
      return existing.id;
    }

    const id = crypto.randomUUID();
    const sourceId = params.source === 'ADMIN' ? id : null;

    await connector.query(
      `INSERT INTO content_types (id, name, slug, source, source_id, schema, plural_label, singular_label, default_fields, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
      [
        id,
        params.name,
        params.slug,
        params.source,
        sourceId,
        JSON.stringify(params.schema),
        params.pluralLabel,
        params.singularLabel,
        JSON.stringify(params.defaultFields),
      ]
    );

    this.contentTypeIdMap.set(params.slug, id);
    return id;
  }

  /**
   * Build JSON schema from meta keys and supports
   */
  private buildSchemaFromMetaKeys(metaKeys: Set<string>, supports: string[]): Record<string, unknown> {
    const properties: Record<string, unknown> = {
      title: { type: 'string' },
      slug: { type: 'string' },
      content: { type: 'string', format: 'html' },
      excerpt: { type: 'string' },
      featured_image: { type: 'string', format: 'uuid' },
      seo_title: { type: 'string' },
      seo_description: { type: 'string' },
      status: { type: 'string', enum: ['DRAFT', 'PUBLISHED', 'ARCHIVED', 'TRASHED'] },
      author: { type: 'string', format: 'uuid' },
    };

    if (supports.includes('page-attributes')) {
      properties['parent'] = { type: 'string', format: 'uuid' };
      properties['template'] = { type: 'string' };
    }

    // Add custom fields from meta keys (exclude WP internal)
    for (const key of metaKeys) {
      if (key.startsWith('_') || key.startsWith('wp_')) continue;
      if (['title', 'slug', 'content', 'excerpt', 'featured_image', 'seo_title', 'seo_description', 'status', 'author', 'parent', 'template'].includes(key)) continue;

      properties[key] = { type: 'string' }; // Default to string, could be enhanced
    }

    return {
      type: 'object',
      properties,
      required: ['title', 'slug'],
    };
  }

  /**
   * Build default fields array from supports
   */
  private buildDefaultFields(supports: string[]): string[] {
    const fields = ['title', 'slug', 'content', 'excerpt', 'featured_image', 'seo_title', 'seo_description', 'status', 'author'];

    if (supports.includes('page-attributes')) {
      fields.push('parent', 'template');
    }

    if (supports.includes('categories')) fields.push('categories');
    if (supports.includes('tags')) fields.push('tags');

    return fields;
  }

  /**
   * Humanize post type (e.g., 'my_custom_post' → 'My Custom Post')
   */
  private humanizePostType(type: string): string {
    return type
      .replace(/_/g, ' ')
      .replace(/-/g, ' ')
      .replace(/\b\w/g, c => c.toUpperCase());
  }

  /**
   * Simple pluralization
   */
  private pluralize(word: string): string {
    if (word.endsWith('y')) return word.slice(0, -1) + 'ies';
    if (word.endsWith('s') || word.endsWith('x') || word.endsWith('z') || word.endsWith('ch') || word.endsWith('sh')) {
      return word + 'es';
    }
    return word + 's';
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
export async function migrateContentTypes(
  connector: WPMySQLConnector,
  config: WPMigrationConfig,
  idMaps: IDMaps,
  stats: Record<MigrationPhase, PhaseStats>,
  errors: MigrationError[],
  reportProgress: (phase: MigrationPhase, current: number, total: number) => void
): Promise<void> {
  const mapper = new ContentTypesMapper({ connector, config, idMaps, stats, errors, reportProgress });
  await mapper.migrate();
}