/**
 * Taxonomies Mapper
 * Maps wp_terms + wp_term_taxonomy + wp_term_relationships → OkCMS taxonomies + taxonomy_terms + content_taxonomy_terms
 */

import { WPMySQLConnector } from '../connectors/mysql';
import {
  WPMigrationConfig,
  MigrationPhase,
  PhaseStats,
  IDMaps,
  MigrationError,
} from '../types';
import { sanitizeTitle, getSlugManager } from '../transformers/slugs';
import { humanize } from '../../utils/strings';

export interface TaxonomiesMapperDeps {
  connector: WPMySQLConnector;
  config: WPMigrationConfig;
  idMaps: IDMaps;
  stats: Record<MigrationPhase, PhaseStats>;
  errors: MigrationError[];
  reportProgress: (phase: MigrationPhase, current: number, total: number) => void;
  tenantId: string;
}

export class TaxonomiesMapper {
  private deps: TaxonomiesMapperDeps;
  private slugManager = getSlugManager();
  private termIdMap: Map<number, string> = new Map(); // WP term_id -> OkCMS term UUID
  private termTaxonomyIdMap: Map<number, string> = new Map(); // WP term_taxonomy_id -> OkCMS term UUID

  constructor(deps: TaxonomiesMapperDeps) {
    this.deps = deps;
  }

  /**
   * Main entry point: migrate taxonomies and terms
   */
  async migrate(): Promise<void> {
    const phase: MigrationPhase = 'taxonomies';
    this.deps.stats[phase] = { created: 0, updated: 0, skipped: 0, errors: 0, durationMs: 0 };
    const startTime = Date.now();

    try {
      // 1. Migrate taxonomies (term_taxonomy grouped by taxonomy)
      await this.migrateTaxonomies();

      // 2. Migrate terms
      await this.migrateTerms();

      // 3. Build term_taxonomy_id -> term UUID map
      this.buildTermTaxonomyMap();

      this.deps.stats[phase].durationMs = Date.now() - startTime;
    } catch (error) {
      this.deps.stats[phase].errors++;
      this.addError(phase, 'taxonomies', 0, 'migrate', error instanceof Error ? error.message : 'Unknown error');
      throw error;
    }
  }

  /**
   * Migrate taxonomies (categories, tags, custom)
   */
  private async migrateTaxonomies(): Promise<void> {
    const { connector, stats } = this.deps;

    // Get distinct taxonomies with term counts
    const rows = await connector.query<{
      taxonomy: string;
      term_count: number;
      hierarchical: number;
    }>(`
      SELECT taxonomy, COUNT(*) as term_count, MAX(CASE WHEN parent > 0 THEN 1 ELSE 0 END) as hierarchical
      FROM ${connector.table('term_taxonomy')}
      GROUP BY taxonomy
      ORDER BY term_count DESC
    `);

    for (const row of rows) {
      try {
        await this.migrateTaxonomy(String(row.taxonomy), row.hierarchical > 0);
        stats['taxonomies'].created++;
      } catch (error) {
        stats['taxonomies'].errors++;
        this.addError('taxonomies', 'term_taxonomy', String(row.taxonomy), 'migrate_taxonomy', error instanceof Error ? error.message : 'Unknown error');
      }
    }
  }

  /**
   * Migrate a single taxonomy
   */
  private async migrateTaxonomy(taxonomySlug: string, hierarchical: boolean): Promise<string> {
    const { connector, idMaps, tenantId } = this.deps;

    // Check if already exists
    const existing = await connector.queryOne<{ id: string }>(
      `SELECT id FROM taxonomies WHERE slug = ? AND tenant_id = ?`,
      [taxonomySlug, tenantId]
    );

    if (existing) {
      idMaps.taxonomy.set(taxonomySlug, existing.id);
      this.deps.stats['taxonomies'].updated++;
      return existing.id;
    }

    // Get object types (post types this taxonomy applies to)
    const objectTypes = await connector.query<{ post_type: string }>(`
      SELECT DISTINCT p.post_type
      FROM ${connector.table('term_relationships')} tr
      JOIN ${connector.table('term_taxonomy')} tt ON tr.term_taxonomy_id = tt.term_taxonomy_id
      JOIN ${connector.table('posts')} p ON tr.object_id = p.ID
      WHERE tt.taxonomy = ?
      GROUP BY p.post_type
    `, [taxonomySlug]);

    // Get labels from wp_options if available
    const labels = await this.getTaxonomyLabels(taxonomySlug);

    const id = crypto.randomUUID();
    await connector.query(
      `INSERT INTO taxonomies (id, tenant_id, name, slug, hierarchical, attach_to, labels, meta, source, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, '{}', 'ADMIN', NOW(), NOW())`,
      [
        id,
        tenantId,
        labels.name,
        taxonomySlug,
        hierarchical ? 1 : 0,
        JSON.stringify(objectTypes.map(r => String(r.post_type))),
        JSON.stringify(labels),
      ]
    );

    idMaps.taxonomy.set(taxonomySlug, id);
    return id;
  }

  /**
   * Get taxonomy labels from wp_options
   */
  private async getTaxonomyLabels(taxonomy: string): Promise<{ name: string; singular_name: string; menu_name?: string }> {
    const { connector } = this.deps;

    // Try to get from registered taxonomy labels option
    const optionName = `taxonomy_labels_${taxonomy}`;
    const option = await connector.queryOne<{ option_value: string }>(
      `SELECT option_value FROM ${connector.table('options')} WHERE option_name = ?`,
      [optionName]
    );

    if (option && option.option_value) {
      try {
        const labels = typeof option.option_value === 'string'
          ? JSON.parse(option.option_value)
          : option.option_value;
        return {
          name: labels.name ?? humanize(taxonomy),
          singular_name: labels.singular_name ?? humanize(taxonomy).replace(/s$/, ''),
          menu_name: labels.menu_name,
        };
      } catch {
        // Ignore parse errors
      }
    }

    // Fallback
    const humanized = humanize(taxonomy);
    return {
      name: humanized,
      singular_name: humanized.replace(/s$/, ''),
    };
  }

  /**
   * Migrate terms
   */
  private async migrateTerms(): Promise<void> {
    const { connector, idMaps, tenantId, stats, reportProgress } = this.deps;

    // Get all terms with their taxonomy info
    const rows = await connector.query<{
      t_id: number;
      t_name: string;
      t_slug: string;
      tt_id: number;
      tt_taxonomy: string;
      tt_description: string;
      tt_parent: number;
      tt_count: number;
    }>(`
      SELECT t.term_id as t_id, t.name as t_name, t.slug as t_slug,
             tt.term_taxonomy_id as tt_id, tt.taxonomy as tt_taxonomy,
             tt.description as tt_description, tt.parent as tt_parent, tt.count as tt_count
      FROM ${connector.table('terms')} t
      JOIN ${connector.table('term_taxonomy')} tt ON t.term_id = tt.term_id
      ORDER BY tt.taxonomy, t.term_id
    `);

    // Group by taxonomy for slug preloading
    const termsByTaxonomy = new Map<string, typeof rows>();
    for (const row of rows) {
      const ttTaxonomy = String(row.tt_taxonomy);
      if (!termsByTaxonomy.has(ttTaxonomy)) termsByTaxonomy.set(ttTaxonomy, []);
      termsByTaxonomy.get(ttTaxonomy)!.push(row);
    }

    // Preload slugs per taxonomy
    for (const [taxonomy, _terms] of termsByTaxonomy) {
      const taxonomyId = idMaps.taxonomy.get(taxonomy);
      if (taxonomyId) {
        const existing = await connector.query<{ slug: string }>(
          `SELECT slug FROM taxonomy_terms WHERE taxonomy_id = ?`,
          [taxonomyId]
        );
        this.slugManager.preload(tenantId, `taxonomy:${taxonomy}`, existing.map(e => String(e.slug)));
      }
    }

    // Migrate terms
    let processed = 0;
    for (const row of rows) {
      try {
        await this.migrateTerm(row as {
          t_id: number;
          t_name: string;
          t_slug: string;
          tt_id: number;
          tt_taxonomy: string;
          tt_description: string;
          tt_parent: number;
          tt_count: number;
        });
        processed++;
      } catch (error) {
        stats['taxonomies'].errors++;
        this.addError('taxonomies', 'terms', Number(row.t_id), 'migrate_term', error instanceof Error ? error.message : 'Unknown error');
      }

      if (processed % 100 === 0) {
        reportProgress('taxonomies', processed, rows.length);
      }
    }
  }

  /**
   * Migrate a single term
   */
  private async migrateTerm(row: {
    t_id: number;
    t_name: string;
    t_slug: string;
    tt_id: number;
    tt_taxonomy: string;
    tt_description: string;
    tt_parent: number;
    tt_count: number;
  }): Promise<void> {
    const { connector, idMaps, tenantId, stats } = this.deps;

    const taxonomyId = idMaps.taxonomy.get(row.tt_taxonomy);
    if (!taxonomyId) {
      // Taxonomy not migrated (shouldn't happen)
      stats['taxonomies'].skipped++;
      return;
    }

    // Check if term already exists (by taxonomy_id + slug)
    const existing = await connector.queryOne<{ id: string }>(
      `SELECT id FROM taxonomy_terms WHERE taxonomy_id = ? AND slug = ?`,
      [taxonomyId, row.t_slug]
    );

    let termId: string;

    if (existing) {
      termId = existing.id;
      stats['taxonomies'].updated++;
    } else {
      // Generate unique slug
      const baseSlug = row.t_slug || sanitizeTitle(row.t_name);
      const slug = this.slugManager.generate(tenantId, `taxonomy:${row.tt_taxonomy}`, baseSlug);

      // Map parent term
      let parentId: string | null = null;
      if (row.tt_parent > 0) {
        parentId = this.termIdMap.get(row.tt_parent) ?? null;
      }

      termId = crypto.randomUUID();
      await connector.query(
        `INSERT INTO taxonomy_terms (id, taxonomy_id, tenant_id, name, slug, description, parent_id, meta, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, '{}', NOW())`,
        [
          termId,
          taxonomyId,
          tenantId,
          row.t_name,
          slug,
          row.tt_description || null,
          parentId,
        ]
      );

      stats['taxonomies'].created++;
    }

    // Map both term_id and term_taxonomy_id to the same term UUID
    this.termIdMap.set(row.t_id, termId);
    this.termTaxonomyIdMap.set(row.tt_id, termId);
    idMaps.term.set(row.tt_id, termId); // Map term_taxonomy_id for relationships
  }

  /**
   * Build term_taxonomy_id -> term UUID map for relationships
   */
  private buildTermTaxonomyMap(): void {
    // Already built in migrateTerm via idMaps.term.set(tt_id, termId)
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
export async function migrateTaxonomies(
  connector: WPMySQLConnector,
  config: WPMigrationConfig,
  idMaps: IDMaps,
  stats: Record<MigrationPhase, PhaseStats>,
  errors: MigrationError[],
  reportProgress: (phase: MigrationPhase, current: number, total: number) => void,
  tenantId: string
): Promise<void> {
  const mapper = new TaxonomiesMapper({ connector, config, idMaps, stats, errors, reportProgress, tenantId });
  await mapper.migrate();
}