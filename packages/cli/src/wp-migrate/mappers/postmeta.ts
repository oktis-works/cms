/**
 * Post Meta Mapper
 * Maps wp_postmeta → OkCMS field_values / body / data / metadata
 */

import { WPMySQLConnector } from '../connectors/mysql';
import {
  WPMigrationConfig,
  MigrationPhase,
  PhaseStats,
  IDMaps,
  MigrationError,
  WPPostMeta,
} from '../types';
import { deepUnserialize } from '../transformers/serialized-php';

export interface PostMetaMapperDeps {
  connector: WPMySQLConnector;
  config: WPMigrationConfig;
  idMaps: IDMaps;
  stats: Record<MigrationPhase, PhaseStats>;
  errors: MigrationError[];
  reportProgress: (phase: MigrationPhase, current: number, total: number) => void;
  fieldDefinitionIdMap: Map<string, string>; // field key -> field_definition_id
}

interface MetaClassification {
  target: 'field_values' | 'body' | 'data' | 'metadata' | 'skip';
  fieldKey?: string;
  fieldDefinitionId?: string;
  reason: string;
}

export class PostMetaMapper {
  private deps: PostMetaMapperDeps;
  private classifications: Map<string, MetaClassification> = new Map(); // meta_key -> classification
  private unmappedKeys: Set<string> = new Set();

  constructor(deps: PostMetaMapperDeps) {
    this.deps = deps;
  }

  /**
   * Main entry point: migrate post meta
   */
  async migrate(): Promise<void> {
    const phase: MigrationPhase = 'postmeta';
    this.deps.stats[phase] = { created: 0, updated: 0, skipped: 0, errors: 0, durationMs: 0 };
    const startTime = Date.now();

    try {
      // 1. Classify all meta keys
      await this.classifyMetaKeys();

      // 2. Create field definitions for field_values targets
      await this.createFieldDefinitions();

      // 3. Migrate meta values
      await this.migrateMetaValues();

      // 4. Report unmapped keys
      this.deps.config.unmappedMetaKeys = Array.from(this.unmappedKeys);

      this.deps.stats[phase].durationMs = Date.now() - startTime;
    } catch (error) {
      this.deps.stats[phase].errors++;
      this.addError(phase, 'postmeta', 0, 'migrate', error instanceof Error ? error.message : 'Unknown error');
      throw error;
    }
  }

  /**
   * Classify all distinct meta keys
   */
  private async classifyMetaKeys(): Promise<void> {
    const { connector } = this.deps;

    // Get all distinct meta keys with counts
    const rows = await connector.query<Record<string, unknown>>(
      `SELECT meta_key, COUNT(*) as count
      FROM ${connector.table('postmeta')}
      GROUP BY meta_key
      ORDER BY count DESC`
    );

    for (const row of rows) {
      const classification = this.classifyMetaKey(String(row['meta_key']));
      this.classifications.set(String(row['meta_key']), classification);

      if (classification.target === 'skip') {
        this.unmappedKeys.add(String(row['meta_key']));
      }
    }
  }

  /**
   * Classify a single meta key
   */
  private classifyMetaKey(metaKey: string): MetaClassification {
    // WP Internal meta - skip or metadata
    if (metaKey.startsWith('_wp_') || metaKey.startsWith('_edit_')) {
      const skipKeys = ['_edit_lock', '_edit_last', '_wp_old_slug', '_wp_trash_meta_status', '_wp_trash_meta_time', '_wp_desired_post_slug'];
      if (skipKeys.includes(metaKey)) {
        return { target: 'skip', reason: 'WP internal tracking' };
      }
      return { target: 'metadata', reason: 'WP internal metadata' };
    }

    // Featured image - handled in content mapper
    if (metaKey === '_thumbnail_id') {
      return { target: 'skip', reason: 'Handled in content mapper' };
    }

    // Page template - goes to data.layout
    if (metaKey === '_wp_page_template') {
      return { target: 'data', reason: 'Page template' };
    }

    // SEO meta - goes to content.seo_title/seo_description or metadata
    const seoKeys = [
      '_yoast_wpseo_title', '_yoast_wpseo_metadesc', '_yoast_wpseo_focuskw',
      '_yoast_wpseo_canonical', '_yoast_wpseo_noindex', '_yoast_wpseo_nofollow',
      '_yoast_wpseo_opengraph_title', '_yoast_wpseo_opengraph_description', '_yoast_wpseo_opengraph_image',
      '_yoast_wpseo_twitter_title', '_yoast_wpseo_twitter_description', '_yoast_wpseo_twitter_image',
      'rank_math_title', 'rank_math_description', 'rank_math_focus_keyword',
      'rank_math_canonical_url', 'rank_math_robots',
      '_aioseo_title', '_aioseo_description', '_aioseo_keywords',
    ];
    if (seoKeys.includes(metaKey)) {
      return { target: 'metadata', reason: 'SEO metadata' };
    }

    // ACF field keys (field_XXXXXX)
    if (metaKey.match(/^field_[a-f0-9]{13}$/)) {
      return { target: 'field_values', fieldKey: metaKey, reason: 'ACF field' };
    }

    // Custom field keys (user-defined)
    if (!metaKey.startsWith('_') && !metaKey.startsWith('wp_')) {
      return { target: 'field_values', fieldKey: metaKey, reason: 'Custom field' };
    }

    // Other WP internal - metadata
    return { target: 'metadata', reason: 'Other WP internal' };
  }

  /**
   * Create field definitions for field_values targets
   */
  private async createFieldDefinitions(): Promise<void> {
    const { connector, fieldDefinitionIdMap, stats } = this.deps;

    // Group field keys by content type (we'll create generic ones for now)
    const fieldKeys = new Set<string>();
    for (const [_key, classification] of this.classifications) {
      if (classification.target === 'field_values' && classification.fieldKey) {
        fieldKeys.add(classification.fieldKey);
      }
    }

    // Get or create a generic field group for migrated fields
    const groupId = await this.getOrCreateFieldGroup();

    // Create field definitions
    for (const fieldKey of fieldKeys) {
      if (fieldDefinitionIdMap.has(fieldKey)) continue;

      const fieldDefId = crypto.randomUUID();
      await connector.query(
        `INSERT INTO field_definitions (id, group_id, type, name, key, label, required, config, sort_order, is_core_field, is_locked, created_at, updated_at)
         VALUES (?, ?, 'text', ?, ?, ?, false, '{}', 0, false, false, NOW(), NOW())`,
        [fieldDefId, groupId, fieldKey, fieldKey, this.humanizeFieldKey(fieldKey)]
      );

      fieldDefinitionIdMap.set(fieldKey, fieldDefId);
      stats['postmeta'].created++;
    }
  }

  /**
   * Get or create field group for migrated WP fields
   */
  private async getOrCreateFieldGroup(): Promise<string> {
    const { connector } = this.deps;
    const groupKey = 'wp_migrated_fields';

    const existing = await connector.queryOne<{ id: string }>(
      `SELECT id FROM field_groups WHERE \`key\` = ? AND tenant_id IS NULL`,
      [groupKey]
    );

    if (existing) return existing.id;

    const groupId = crypto.randomUUID();
    await connector.query(
      `INSERT INTO field_groups (id, tenant_id, title, \`key\`, location_rules, position, display_style, active, metadata, created_at, updated_at)
       VALUES (?, NULL, 'WP Migrated Fields', ?, '[]', 'normal', 'standard', true, '{}', NOW(), NOW())`,
      [groupId, groupKey]
    );

    return groupId;
  }

  /**
   * Migrate meta values to appropriate targets
   */
  private async migrateMetaValues(): Promise<void> {
    const { connector, stats, reportProgress } = this.deps;

    // Get all postmeta in batches
    const batchSize = 5000;
    let offset = 0;
    let totalProcessed = 0;

    while (true) {
      const metaBatch = await connector.query<Record<string, unknown>>(
        `SELECT * FROM ${connector.table('postmeta')}
         ORDER BY meta_id
         LIMIT ? OFFSET ?`,
        [batchSize, offset]
      );

      if (metaBatch.length === 0) break;

      for (const meta of metaBatch) {
        try {
          await this.migrateMetaValue({
            meta_id: Number(meta['meta_id']),
            post_id: Number(meta['post_id']),
            meta_key: String(meta['meta_key']),
            meta_value: String(meta['meta_value']),
          } as WPPostMeta);
          totalProcessed++;
        } catch (error) {
          stats['postmeta'].errors++;
          this.addError('postmeta', 'postmeta', Number(meta['meta_id']), String(meta['meta_key']), error instanceof Error ? error.message : 'Unknown error');
        }
      }

      offset += batchSize;
      reportProgress('postmeta', totalProcessed, totalProcessed); // Total unknown, just report processed
    }
  }

  /**
   * Migrate a single meta value
   */
  private async migrateMetaValue(meta: WPPostMeta): Promise<void> {
    const { connector, idMaps, fieldDefinitionIdMap, stats } = this.deps;

    // Get target content ID
    const contentId = idMaps.content.get(meta.post_id);
    if (!contentId) {
      // Post not migrated (maybe revision, attachment, etc.)
      stats['postmeta'].skipped++;
      return;
    }

    const classification = this.classifications.get(meta.meta_key);
    if (!classification) {
      stats['postmeta'].skipped++;
      return;
    }

    // Unserialize value
    const value = deepUnserialize(meta.meta_value);

    switch (classification.target) {
      case 'field_values': {
        if (!classification.fieldKey) return;
        const fieldDefId = fieldDefinitionIdMap.get(classification.fieldKey);
        if (!fieldDefId) return;

        // Check if already exists
        const existing = await connector.queryOne<{ id: string }>(
          `SELECT id FROM field_values WHERE field_definition_id = ? AND entity_type = 'content' AND entity_id = ?`,
          [fieldDefId, contentId]
        );

        if (existing) {
          await connector.query(
            `UPDATE field_values SET value = ?, updated_at = NOW() WHERE id = ?`,
            [JSON.stringify(value), existing.id]
          );
          stats['postmeta'].updated++;
        } else {
          await connector.query(
            `INSERT INTO field_values (id, field_definition_id, entity_type, entity_id, value, created_at, updated_at)
             VALUES (?, ?, 'content', ?, ?, NOW(), NOW())`,
            [crypto.randomUUID(), fieldDefId, contentId, JSON.stringify(value)]
          );
          stats['postmeta'].created++;
        }
        break;
      }

      case 'data': {
        // Update content.data JSONB
        await this.updateContentJSONB(contentId, 'data', meta.meta_key, value);
        break;
      }

      case 'metadata': {
        // Update content.metadata JSONB
        await this.updateContentJSONB(contentId, 'metadata', meta.meta_key, value);
        break;
      }

      case 'body': {
        // Would update content.body - not typically used for meta
        break;
      }

      case 'skip':
      default:
        stats['postmeta'].skipped++;
        break;
    }
  }

  /**
   * Update a JSONB column in content table
   */
  private async updateContentJSONB(
    contentId: string,
    column: 'data' | 'metadata',
    key: string,
    value: unknown
  ): Promise<void> {
    const { connector } = this.deps;

    // Use JSON_SET to update specific key
    await connector.query(
      `UPDATE content SET \`${column}\` = JSON_SET(COALESCE(\`${column}\`, '{}'), ?, ?), updated_at = NOW() WHERE id = ?`,
      [`$.${key}`, JSON.stringify(value), contentId]
    );
  }

  /**
   * Humanize field key for label
   */
  private humanizeFieldKey(key: string): string {
    return key
      .replace(/_/g, ' ')
      .replace(/-/g, ' ')
      .replace(/\b\w/g, c => c.toUpperCase());
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
export async function migratePostMeta(
  connector: WPMySQLConnector,
  config: WPMigrationConfig,
  idMaps: IDMaps,
  stats: Record<MigrationPhase, PhaseStats>,
  errors: MigrationError[],
  reportProgress: (phase: MigrationPhase, current: number, total: number) => void,
  fieldDefinitionIdMap: Map<string, string>
): Promise<void> {
  const mapper = new PostMetaMapper({
    connector,
    config,
    idMaps,
    stats,
    errors,
    reportProgress,
    fieldDefinitionIdMap,
  });

  await mapper.migrate();
}