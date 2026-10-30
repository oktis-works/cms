/**
 * Options Mapper
 * Maps wp_options → OkCMS settings
 */

import { WPMySQLConnector } from '../connectors/mysql';
import {
  WPMigrationConfig,
  MigrationPhase,
  PhaseStats,
  IDMaps,
  MigrationError,
  WPOption,
} from '../types';
import { deepUnserialize } from '../transformers/serialized-php';

export interface OptionsMapperDeps {
  connector: WPMySQLConnector;
  config: WPMigrationConfig;
  idMaps: IDMaps;
  stats: Record<MigrationPhase, PhaseStats>;
  errors: MigrationError[];
  reportProgress: (phase: MigrationPhase, current: number, total: number) => void;
  tenantId: string;
}

interface OptionMapping {
  group: string;
  type: string;
  skip: boolean;
}

const CORE_OPTION_MAPPING: Record<string, OptionMapping> = {
  siteurl: { group: 'general', type: 'url', skip: false },
  home: { group: 'general', type: 'url', skip: false },
  blogname: { group: 'general', type: 'string', skip: false },
  blogdescription: { group: 'general', type: 'string', skip: false },
  admin_email: { group: 'general', type: 'email', skip: false },
  users_can_register: { group: 'general', type: 'boolean', skip: false },
  default_role: { group: 'general', type: 'string', skip: false },
  timezone_string: { group: 'general', type: 'string', skip: false },
  date_format: { group: 'general', type: 'string', skip: false },
  time_format: { group: 'general', type: 'string', skip: false },
  start_of_week: { group: 'general', type: 'number', skip: false },
  WPLANG: { group: 'general', type: 'string', skip: false },

  posts_per_page: { group: 'reading', type: 'number', skip: false },
  show_on_front: { group: 'reading', type: 'string', skip: false },
  page_on_front: { group: 'reading', type: 'number', skip: false },
  page_for_posts: { group: 'reading', type: 'number', skip: false },
  rss_use_excerpt: { group: 'reading', type: 'boolean', skip: false },

  default_category: { group: 'writing', type: 'number', skip: false },
  default_post_format: { group: 'writing', type: 'string', skip: false },
  post_via_email: { group: 'writing', type: 'string', skip: true },

  default_ping_status: { group: 'discussion', type: 'string', skip: false },
  default_comment_status: { group: 'discussion', type: 'string', skip: false },
  require_name_email: { group: 'discussion', type: 'boolean', skip: false },
  comment_registration: { group: 'discussion', type: 'boolean', skip: false },
  close_comments_for_old_posts: { group: 'discussion', type: 'boolean', skip: false },
  close_comments_days_old: { group: 'discussion', type: 'number', skip: false },
  thread_comments: { group: 'discussion', type: 'boolean', skip: false },
  thread_comments_depth: { group: 'discussion', type: 'number', skip: false },
  page_comments: { group: 'discussion', type: 'boolean', skip: false },
  comments_per_page: { group: 'discussion', type: 'number', skip: false },
  default_comments_page: { group: 'discussion', type: 'string', skip: false },
  comment_order: { group: 'discussion', type: 'string', skip: false },
  comment_moderation: { group: 'discussion', type: 'string', skip: false },
  comment_whitelist: { group: 'discussion', type: 'string', skip: false },
  comment_blacklist: { group: 'discussion', type: 'string', skip: false },
  comment_max_links: { group: 'discussion', type: 'number', skip: false },
  moderation_notify: { group: 'discussion', type: 'boolean', skip: false },
  moderation_keys: { group: 'discussion', type: 'string', skip: false },

  thumbnail_size_w: { group: 'media', type: 'number', skip: false },
  thumbnail_size_h: { group: 'media', type: 'number', skip: false },
  thumbnail_crop: { group: 'media', type: 'boolean', skip: false },
  medium_size_w: { group: 'media', type: 'number', skip: false },
  medium_size_h: { group: 'media', type: 'number', skip: false },
  large_size_w: { group: 'media', type: 'number', skip: false },
  large_size_h: { group: 'media', type: 'number', skip: false },
  uploads_use_yearmonth_folders: { group: 'media', type: 'boolean', skip: false },
  upload_path: { group: 'media', type: 'string', skip: true },
  upload_url_path: { group: 'media', type: 'string', skip: true },

  permalink_structure: { group: 'permalink', type: 'string', skip: false },
  category_base: { group: 'permalink', type: 'string', skip: false },
  tag_base: { group: 'permalink', type: 'string', skip: false },

  wp_page_for_privacy_policy: { group: 'privacy', type: 'number', skip: false },
};

export class OptionsMapper {
  private deps: OptionsMapperDeps;

  constructor(deps: OptionsMapperDeps) {
    this.deps = deps;
  }

  /**
   * Main entry point: migrate options
   */
  async migrate(): Promise<void> {
    const phase: MigrationPhase = 'options';
    this.deps.stats[phase] = { created: 0, updated: 0, skipped: 0, errors: 0, durationMs: 0 };
    const startTime = Date.now();

    try {
      const options = await this.deps.connector.getOptions();

      for (const option of options) {
        try {
          await this.migrateOption(option);
        } catch (error) {
          this.deps.stats[phase].errors++;
          this.addError(phase, 'options', option.option_id, option.option_name, error instanceof Error ? error.message : 'Unknown error');
        }
      }

      this.deps.stats[phase].durationMs = Date.now() - startTime;
    } catch (error) {
      this.deps.stats[phase].errors++;
      this.addError(phase, 'options', 0, 'migrate', error instanceof Error ? error.message : 'Unknown error');
      throw error;
    }
  }

  /**
   * Migrate a single option
   */
  private async migrateOption(option: WPOption): Promise<void> {
    const { connector, tenantId, stats } = this.deps;

    const mapping = CORE_OPTION_MAPPING[option.option_name];
    if (mapping?.skip) {
      stats['options'].skipped++;
      return;
    }

    const group = mapping?.group ?? this.inferGroup(option.option_name);
    const type = mapping?.type ?? this.inferType(option.option_value);

    // Unserialize value
    const value = deepUnserialize(option.option_value);

    // Check if setting already exists
    const existing = await connector.queryOne<{ id: string }>(
      `SELECT id FROM settings WHERE tenant_id = ? AND \`key\` = ?`,
      [tenantId, option.option_name]
    );

    if (existing) {
      await connector.query(
        `UPDATE settings SET value = ?, \`group\` = ?, type = ?, updated_at = NOW() WHERE id = ?`,
        [JSON.stringify(value), group, type, existing.id]
      );
      stats['options'].updated++;
    } else {
      await connector.query(
        `INSERT INTO settings (id, tenant_id, \`key\`, value, \`group\`, type, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, NOW(), NOW())`,
        [crypto.randomUUID(), tenantId, option.option_name, JSON.stringify(value), group, type]
      );
      stats['options'].created++;
    }
  }

  /**
   * Infer group from option name
   */
  private inferGroup(name: string): string {
    if (name.startsWith('wp_') || name.startsWith('_')) return 'wordpress';
    if (name.includes('seo') || name.includes('yoast') || name.includes('rank_math')) return 'seo';
    if (name.includes('cache') || name.includes('transient')) return 'cache';
    if (name.includes('api') || name.includes('key') || name.includes('token')) return 'api';
    if (name.includes('theme') || name.includes('template')) return 'theme';
    if (name.includes('plugin')) return 'plugin';
    return 'general';
  }

  /**
   * Infer type from value
   */
  private inferType(value: unknown): string {
    if (value === null || value === undefined) return 'null';
    if (typeof value === 'boolean') return 'boolean';
    if (typeof value === 'number') return Number.isInteger(value) ? 'integer' : 'number';
    if (typeof value === 'string') {
      // Check if it's a URL
      if (value.match(/^https?:\/\//)) return 'url';
      // Check if it's an email
      if (value.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) return 'email';
      // Check if it's a number string
      if (/^\d+$/.test(value)) return 'integer';
      if (/^\d*\.\d+$/.test(value)) return 'number';
      return 'string';
    }
    if (Array.isArray(value)) return 'array';
    if (typeof value === 'object') return 'json';
    return 'string';
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
export async function migrateOptions(
  connector: WPMySQLConnector,
  config: WPMigrationConfig,
  idMaps: IDMaps,
  stats: Record<MigrationPhase, PhaseStats>,
  errors: MigrationError[],
  reportProgress: (phase: MigrationPhase, current: number, total: number) => void,
  tenantId: string
): Promise<void> {
  const mapper = new OptionsMapper({ connector, config, idMaps, stats, errors, reportProgress, tenantId });
  await mapper.migrate();
}