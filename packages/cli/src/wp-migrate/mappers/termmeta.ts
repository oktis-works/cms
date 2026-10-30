/**
 * Term Meta Mapper
 * Maps wp_termmeta → OkCMS taxonomy_terms.meta + field_values
 */

import { WPMySQLConnector } from '../connectors/mysql';
import {
  WPMigrationConfig,
  MigrationPhase,
  PhaseStats,
  IDMaps,
  MigrationError,
  WPTermMeta,
} from '../types';
import { deepUnserialize } from '../transformers/serialized-php';

export interface TermMetaMapperDeps {
  connector: WPMySQLConnector;
  config: WPMigrationConfig;
  idMaps: IDMaps;
  stats: Record<MigrationPhase, PhaseStats>;
  errors: MigrationError[];
  reportProgress: (phase: MigrationPhase, current: number, total: number) => void;
}

export class TermMetaMapper {
  private deps: TermMetaMapperDeps;

  constructor(deps: TermMetaMapperDeps) {
    this.deps = deps;
  }

  /**
   * Main entry point: migrate term meta
   */
  async migrate(): Promise<void> {
    const phase: MigrationPhase = 'postmeta'; // Reuse postmeta phase or create new
    // We'll use a sub-phase tracking
    const startTime = Date.now();

    try {
      // Get all termmeta
      const meta = await this.deps.connector.getTermMeta();

      for (const m of meta) {
        try {
          await this.migrateTermMeta(m);
        } catch (error) {
          this.deps.stats[phase].errors++;
          this.addError('termmeta', 'termmeta', m.meta_id, m.meta_key, error instanceof Error ? error.message : 'Unknown error');
        }
      }

      this.deps.stats[phase].durationMs = Date.now() - startTime;
    } catch (error) {
      this.deps.stats[phase].errors++;
      this.addError('termmeta', 'termmeta', 0, 'migrate', error instanceof Error ? error.message : 'Unknown error');
      throw error;
    }
  }

  /**
   * Migrate a single term meta value
   */
  private async migrateTermMeta(meta: WPTermMeta): Promise<void> {
    const { connector, idMaps } = this.deps;

    // Get target term UUID (mapped from term_taxonomy_id)
    const termId = idMaps.term.get(meta.term_id);
    if (!termId) {
      this.deps.stats['postmeta'].skipped++;
      return;
    }

    // Unserialize value
    const value = deepUnserialize(meta.meta_value);

    // Update taxonomy_terms.meta JSONB
    await connector.query(
      `UPDATE taxonomy_terms SET meta = JSON_SET(COALESCE(meta, '{}'), ?, ?) WHERE id = ?`,
      [`$.${meta.meta_key}`, JSON.stringify(value), termId]
    );

    this.deps.stats['postmeta'].created++;
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
export async function migrateTermMeta(
  connector: WPMySQLConnector,
  config: WPMigrationConfig,
  idMaps: IDMaps,
  stats: Record<MigrationPhase, PhaseStats>,
  errors: MigrationError[],
  reportProgress: (phase: MigrationPhase, current: number, total: number) => void
): Promise<void> {
  const mapper = new TermMetaMapper({ connector, config, idMaps, stats, errors, reportProgress });
  await mapper.migrate();
}