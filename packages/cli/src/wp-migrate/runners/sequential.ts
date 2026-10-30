/**
 * Sequential Migration Runner with Checkpointing
 * Runs migration phases in dependency order with resume capability
 */

import { WPMySQLConnector } from '../connectors/mysql';
import {
  WPMigrationConfig,
  MigrationPhase,
  PhaseStats,
  IDMaps,
  MigrationError,
  MigrationCheckpoint,
  MigrationReport,
} from '../types';
import { migrateUsers } from '../mappers/users';
import { migrateContentTypes } from '../mappers/content-types';
import { migrateContent } from '../mappers/content';
import { migratePostMeta } from '../mappers/postmeta';
import { migrateTaxonomies } from '../mappers/taxonomies';
import { migrateTermMeta } from '../mappers/termmeta';
import { migrateMedia } from '../mappers/media';
import { migrateContentTaxonomy } from '../mappers/content-taxonomy';
import { migrateComments } from '../mappers/comments';
import { migrateOptions } from '../mappers/options';
import { migrateMenus } from '../mappers/menus';
import { validateContent } from '../validators/content';
import { validateFieldValues } from '../validators/field-values';

export interface RunnerDeps {
  connector: WPMySQLConnector;
  config: WPMigrationConfig;
  idMaps: IDMaps;
  stats: Record<MigrationPhase, PhaseStats>;
  errors: MigrationError[];
  onProgress: (phase: MigrationPhase, current: number, total: number) => void;
  onPhaseComplete: (phase: MigrationPhase, stats: PhaseStats) => void;
  onError: (error: MigrationError) => void;
}

// Phase execution order (dependency order)
const PHASE_ORDER: MigrationPhase[] = [
  'tenant-users',
  'content-types',
  'taxonomies',
  'content',
  'postmeta',
  'termmeta',
  'media',
  'content-taxonomy',
  'comments',
  'menus',
  'options',
  'redirects',
  'validation',
  'complete',
];

const PHASE_RUNNERS: Record<MigrationPhase, (deps: RunnerDeps, tenantId: string, authorIdMap: Map<number, string>) => Promise<void>> = {
  'tenant-users': async (deps) => {
    await migrateUsers(deps.connector, deps.config, deps.idMaps, deps.stats, deps.errors, deps.onProgress);
  },
  'content-types': async (deps) => {
    await migrateContentTypes(deps.connector, deps.config, deps.idMaps, deps.stats, deps.errors, deps.onProgress);
  },
  'taxonomies': async (deps, tenantId) => {
    await migrateTaxonomies(deps.connector, deps.config, deps.idMaps, deps.stats, deps.errors, deps.onProgress, tenantId);
  },
  'content': async (deps, tenantId, authorIdMap) => {
    await migrateContent(deps.connector, deps.config, deps.idMaps, deps.stats, deps.errors, deps.onProgress, tenantId, authorIdMap);
  },
  'postmeta': async (deps) => {
    const fieldDefMap = new Map<string, string>();
    await migratePostMeta(deps.connector, deps.config, deps.idMaps, deps.stats, deps.errors, deps.onProgress, fieldDefMap);
  },
  'termmeta': async (deps) => {
    await migrateTermMeta(deps.connector, deps.config, deps.idMaps, deps.stats, deps.errors, deps.onProgress);
  },
  'media': async (deps, tenantId, authorIdMap) => {
    await migrateMedia(deps.connector, deps.config, deps.idMaps, deps.stats, deps.errors, deps.onProgress, tenantId, authorIdMap);
  },
  'content-taxonomy': async (deps) => {
    await migrateContentTaxonomy(deps.connector, deps.config, deps.idMaps, deps.stats, deps.errors, deps.onProgress);
  },
  'comments': async (deps, tenantId, authorIdMap) => {
    await migrateComments(deps.connector, deps.config, deps.idMaps, deps.stats, deps.errors, deps.onProgress, tenantId, authorIdMap);
  },
  'menus': async (deps, tenantId) => {
    await migrateMenus(deps.connector, deps.config, deps.idMaps, deps.stats, deps.errors, deps.onProgress, tenantId);
  },
  'options': async (deps, tenantId) => {
    await migrateOptions(deps.connector, deps.config, deps.idMaps, deps.stats, deps.errors, deps.onProgress, tenantId);
  },
  'redirects': async (deps) => {
    // Redirects are generated from slug mappings in content mapper
    // This phase just logs the count
    deps.stats['redirects'] = { created: 0, updated: 0, skipped: 0, errors: 0, durationMs: 0 };
  },
  'validation': async (deps, tenantId) => {
    await validateContent(deps.connector, deps.config, deps.idMaps, deps.stats, deps.errors, tenantId);
    await validateFieldValues(deps.connector, deps.config, deps.idMaps, deps.stats, deps.errors, tenantId);
  },
  'complete': async (deps) => {
    // Final phase - no-op, just marks completion
    deps.stats['complete'] = { created: 0, updated: 0, skipped: 0, errors: 0, durationMs: 0 };
  },
};

export class SequentialRunner {
  private deps: RunnerDeps;
  private tenantId: string | null = null;
  private authorIdMap = new Map<number, string>();
  private checkpoints: MigrationCheckpoint[] = [];
  private currentPhaseIndex = 0;
  private startTime = Date.now();

  constructor(deps: RunnerDeps) {
    this.deps = deps;
  }

  /**
   * Run full migration
   */
  async run(): Promise<MigrationReport> {
    const { config, stats, errors } = this.deps;

    // Load checkpoint if resuming
    if (config.resumeFrom) {
      await this.loadCheckpoint(config.resumeFrom);
    }

    // Run phases
    for (let i = this.currentPhaseIndex; i < PHASE_ORDER.length; i++) {
      this.currentPhaseIndex = i;
      const phase = PHASE_ORDER[i];
      if (!phase) continue;

      // Skip if already completed (from checkpoint)
      if (this.isPhaseCompleted(phase)) {
        continue;
      }

      const phaseStartTime = Date.now();
      stats[phase] = { created: 0, updated: 0, skipped: 0, errors: 0, durationMs: 0 };

      try {
        const runner = PHASE_RUNNERS[phase];
        if (runner) {
          await runner(this.deps, this.tenantId!, this.authorIdMap);
        } else {
          throw new Error(`No runner found for phase: ${phase}`);
        }

        stats[phase].durationMs = Date.now() - phaseStartTime;
        this.deps.onPhaseComplete(phase, stats[phase]);

        // Save checkpoint after each phase
        await this.saveCheckpoint(phase);
      } catch (error) {
        stats[phase].errors++;
        stats[phase].durationMs = Date.now() - phaseStartTime;
        const migrationError: MigrationError = {
          phase,
          wpTable: 'migration',
          wpId: 0,
          field: 'phase_runner',
          message: error instanceof Error ? error.message : 'Unknown error',
          severity: 'error',
          timestamp: new Date().toISOString(),
        };
        errors.push(migrationError);
        this.deps.onError(migrationError);

        if (!config.dryRun) {
          throw error;
        }
      }
    }

    return this.generateReport();
  }

  /**
   * Set tenant ID (from users migration)
   */
  setTenantId(tenantId: string): void {
    this.tenantId = tenantId;
  }

  /**
   * Set author ID map (from users migration)
   */
  setAuthorIdMap(map: Map<number, string>): void {
    this.authorIdMap = map;
  }

  /**
   * Check if phase is completed (from checkpoint)
   */
  private isPhaseCompleted(phase: MigrationPhase): boolean {
    return this.checkpoints.some(c => c.phase === phase);
  }

  /**
   * Save checkpoint
   */
  private async saveCheckpoint(phase: MigrationPhase): Promise<void> {
    const checkpoint: MigrationCheckpoint = {
      phase,
      completedAt: new Date().toISOString(),
      stats: { ...this.deps.stats[phase] },
      idMaps: this.cloneIDMaps(this.deps.idMaps),
    };

    this.checkpoints.push(checkpoint);

    // Persist to file if not dry run
    if (!this.deps.config.dryRun) {
      const fs = await import('fs/promises');
      const checkpointDir = '.wp-migration-checkpoints';
      await fs.mkdir(checkpointDir, { recursive: true });
      await fs.writeFile(
        `${checkpointDir}/${this.deps.config.tenantSlug}-${phase}.json`,
        JSON.stringify(checkpoint, null, 2)
      );
    }
  }

  /**
   * Load checkpoint
   */
  private async loadCheckpoint(checkpointId: string): Promise<void> {
    const fs = await import('fs/promises');
    const checkpointDir = '.wp-migration-checkpoints';
    const filePath = `${checkpointDir}/${checkpointId}.json`;

    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const checkpoint = JSON.parse(content) as MigrationCheckpoint;

      // Restore stats
      this.deps.stats[checkpoint.phase] = checkpoint.stats;

      // Restore ID maps
      this.restoreIDMaps(checkpoint.idMaps);

      // Find phase index
      this.currentPhaseIndex = PHASE_ORDER.indexOf(checkpoint.phase) + 1;
    } catch {
      // Checkpoint not found or invalid, start fresh
      this.currentPhaseIndex = 0;
    }
  }

  /**
   * Clone ID maps for checkpoint
   */
  private cloneIDMaps(idMaps: IDMaps): IDMaps {
    return {
      user: new Map(idMaps.user),
      content: new Map(idMaps.content),
      term: new Map(idMaps.term),
      taxonomy: new Map(idMaps.taxonomy),
      media: new Map(idMaps.media),
      comment: new Map(idMaps.comment),
      menu: new Map(idMaps.menu),
      menuItem: new Map(idMaps.menuItem),
    };
  }

  /**
   * Restore ID maps from checkpoint
   */
  private restoreIDMaps(idMaps: IDMaps): void {
    this.deps.idMaps.user = new Map(idMaps.user);
    this.deps.idMaps.content = new Map(idMaps.content);
    this.deps.idMaps.term = new Map(idMaps.term);
    this.deps.idMaps.taxonomy = new Map(idMaps.taxonomy);
    this.deps.idMaps.media = new Map(idMaps.media);
    this.deps.idMaps.comment = new Map(idMaps.comment);
    this.deps.idMaps.menu = new Map(idMaps.menu);
    this.deps.idMaps.menuItem = new Map(idMaps.menuItem);
  }

  /**
   * Generate final migration report
   */
  private generateReport(): MigrationReport {
    const { config, stats, errors } = this.deps;

    const totals: PhaseStats = {
      created: 0,
      updated: 0,
      skipped: 0,
      errors: 0,
      durationMs: Date.now() - this.startTime,
    };

    for (const phaseStats of Object.values(stats)) {
      totals.created += phaseStats.created;
      totals.updated += phaseStats.updated;
      totals.skipped += phaseStats.skipped;
      totals.errors += phaseStats.errors;
    }

    return {
      startedAt: new Date(this.startTime).toISOString(),
      completedAt: new Date().toISOString(),
      config: (() => {
        const { password: _password, ...configWithoutPassword } = config;
        return { ...configWithoutPassword, password: '***' as const };
      })(),
      phases: stats,
      totals,
      errors,
      unmappedMetaKeys: config.unmappedMetaKeys ?? [],
      warnings: errors.filter(e => e.severity === 'warning').map(e => e.message),
    };
  }
}

/**
 * Factory function to create and run migration
 */
export async function runMigration(
  connector: WPMySQLConnector,
  config: WPMigrationConfig,
  onProgress: (phase: MigrationPhase, current: number, total: number) => void,
  onPhaseComplete: (phase: MigrationPhase, stats: PhaseStats) => void,
  onError: (error: MigrationError) => void
): Promise<MigrationReport> {
  const idMaps: IDMaps = {
    user: new Map(),
    content: new Map(),
    term: new Map(),
    taxonomy: new Map(),
    media: new Map(),
    comment: new Map(),
    menu: new Map(),
    menuItem: new Map(),
  };

  const stats: Record<MigrationPhase, PhaseStats> = {} as Record<MigrationPhase, PhaseStats>;
  const errors: MigrationError[] = [];

  const runner = new SequentialRunner({
    connector,
    config,
    idMaps,
    stats,
    errors,
    onProgress,
    onPhaseComplete,
    onError,
  });

  // Run users first to get tenant ID and author map
  const tenantId = await migrateUsers(connector, config, idMaps, stats, errors, onProgress);
  runner.setTenantId(tenantId);

  // Build author ID map from user migration
  for (const _entry of idMaps.user) {
    runner.setAuthorIdMap(new Map(idMaps.user));
    break; // Just need to set once
  }

  // Run remaining phases
  return runner.run();
}