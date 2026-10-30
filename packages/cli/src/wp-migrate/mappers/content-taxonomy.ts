/**
 * Content Taxonomy Mapper
 * Maps wp_term_relationships → OkCMS content_taxonomy_terms
 */

import { WPMySQLConnector } from '../connectors/mysql';
import {
  WPMigrationConfig,
  MigrationPhase,
  PhaseStats,
  IDMaps,
  MigrationError,
  WPTermRelationship,
} from '../types';

export interface ContentTaxonomyMapperDeps {
  connector: WPMySQLConnector;
  config: WPMigrationConfig;
  idMaps: IDMaps;
  stats: Record<MigrationPhase, PhaseStats>;
  errors: MigrationError[];
  reportProgress: (phase: MigrationPhase, current: number, total: number) => void;
}

export class ContentTaxonomyMapper {
  private deps: ContentTaxonomyMapperDeps;

  constructor(deps: ContentTaxonomyMapperDeps) {
    this.deps = deps;
  }

  /**
   * Main entry point: migrate content-taxonomy relationships
   */
  async migrate(): Promise<void> {
    const phase: MigrationPhase = 'content-taxonomy';
    this.deps.stats[phase] = { created: 0, updated: 0, skipped: 0, errors: 0, durationMs: 0 };
    const startTime = Date.now();

    try {
      // Get all term relationships
      const relationships = await this.deps.connector.getTermRelationships();

      let processed = 0;
      const batchSize = 1000;

      for (let i = 0; i < relationships.length; i += batchSize) {
        const batch = relationships.slice(i, i + batchSize);
        await this.processBatch(batch);
        processed += batch.length;
        this.deps.reportProgress(phase, processed, relationships.length);
      }

      this.deps.stats[phase].durationMs = Date.now() - startTime;
    } catch (error) {
      this.deps.stats[phase].errors++;
      this.addError(phase, 'term_relationships', 0, 'migrate', error instanceof Error ? error.message : 'Unknown error');
      throw error;
    }
  }

  /**
   * Process a batch of relationships
   */
  private async processBatch(relationships: WPTermRelationship[]): Promise<void> {
    const { connector, idMaps, stats } = this.deps;

    for (const rel of relationships) {
      try {
        // Map object_id (WP post ID) to OkCMS content UUID
        const contentId = idMaps.content.get(rel.object_id);
        if (!contentId) {
          // Content not migrated (maybe revision, attachment, etc.)
          stats['content-taxonomy'].skipped++;
          continue;
        }

        // Map term_taxonomy_id to OkCMS term UUID
        const termId = idMaps.term.get(rel.term_taxonomy_id);
        if (!termId) {
          stats['content-taxonomy'].skipped++;
          continue;
        }

        // Insert into content_taxonomy_terms
        await connector.query(
          `INSERT INTO content_taxonomy_terms (content_id, term_id)
           VALUES (?, ?)
           ON DUPLICATE KEY UPDATE content_id = content_id`,
          [contentId, termId]
        );

        stats['content-taxonomy'].created++;
      } catch (error) {
        stats['content-taxonomy'].errors++;
        this.addError('content-taxonomy', 'term_relationships', rel.object_id, 'insert', error instanceof Error ? error.message : 'Unknown error');
      }
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
export async function migrateContentTaxonomy(
  connector: WPMySQLConnector,
  config: WPMigrationConfig,
  idMaps: IDMaps,
  stats: Record<MigrationPhase, PhaseStats>,
  errors: MigrationError[],
  reportProgress: (phase: MigrationPhase, current: number, total: number) => void
): Promise<void> {
  const mapper = new ContentTaxonomyMapper({ connector, config, idMaps, stats, errors, reportProgress });
  await mapper.migrate();
}