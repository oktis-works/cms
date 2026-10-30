/**
 * WordPress Schema Introspection
 * Analyzes WP database structure to detect custom post types, taxonomies, ACF fields, etc.
 */

import { WPMySQLConnector } from './mysql';
import {
  WPContentTypeInfo,
  WPTaxonomyInfo,
  ACFFieldGroup,
  ACFField,
  WPPost,
} from '../types';

export interface WPSchemaAnalysis {
  contentTypes: Map<string, WPContentTypeInfo>;
  taxonomies: Map<string, WPTaxonomyInfo>;
  acfFieldGroups: ACFFieldGroup[];
  seoPlugins: string[];
  customTables: string[];
  multisite: boolean;
  version: string;
  prefix: string;
}

export class WPSchemaInspector {
  private connector: WPMySQLConnector;

  constructor(connector: WPMySQLConnector) {
    this.connector = connector;
  }

  /**
   * Run full schema analysis
   */
  async analyze(): Promise<WPSchemaAnalysis> {
    const [
      contentTypes,
      taxonomies,
      acfFieldGroups,
      seoPlugins,
      customTables,
      multisite,
      version,
    ] = await Promise.all([
      this.analyzeContentTypes(),
      this.analyzeTaxonomies(),
      this.detectACFFieldGroups(),
      this.detectSEOPlugins(),
      this.detectCustomTables(),
      this.checkMultisite(),
      this.getWPVersion(),
    ]);

    return {
      contentTypes,
      taxonomies,
      acfFieldGroups,
      seoPlugins,
      customTables,
      multisite,
      version,
      prefix: this.connector['config'].prefix,
    };
  }

  /**
   * Analyze post types from wp_posts
   */
  private async analyzeContentTypes(): Promise<Map<string, WPContentTypeInfo>> {
    const types = new Map<string, WPContentTypeInfo>();

    // Get all distinct post types with counts
    const rows = await this.connector.query<{ post_type: string; count: number }>(
      `SELECT post_type, COUNT(*) as count
      FROM ${this.connector.table('posts')}
      GROUP BY post_type
      ORDER BY count DESC`
    );

    for (const row of rows) {
      const postType = row.post_type;
      const count = row.count;

      // Get sample post for this type
      const sample = await this.connector.queryOne<WPPost>(
        `SELECT * FROM ${this.connector.table('posts')}
         WHERE post_type = ?
         ORDER BY ID DESC
         LIMIT 1`,
        [postType]
      );

      // Get distinct meta keys for this post type
      const metaKeys = await this.getMetaKeysForPostType(postType);

      // Check if hierarchical (pages, custom hierarchical types)
      const hasParent = await this.connector.queryScalar(`
        SELECT COUNT(*) FROM ${this.connector.table('posts')}
        WHERE post_type = ? AND post_parent > 0
      `, [postType]);

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
   * Get distinct meta keys for a post type
   */
  private async getMetaKeysForPostType(postType: string): Promise<Set<string>> {
    const rows = await this.connector.query<{ meta_key: string }>(
      `SELECT DISTINCT pm.meta_key
      FROM ${this.connector.table('postmeta')} pm
      JOIN ${this.connector.table('posts')} p ON pm.post_id = p.ID
      WHERE p.post_type = ?
      ORDER BY pm.meta_key`,
      [postType]
    );

    return new Set(rows.map(r => r.meta_key));
  }

  /**
   * Infer supported features from meta keys and post type
   */
  private inferSupports(postType: string, metaKeys: Set<string>): string[] {
    const supports: string[] = ['title', 'editor'];

    // Core post types have known supports
    const coreSupports: Record<string, string[]> = {
      post: ['title', 'editor', 'author', 'thumbnail', 'excerpt', 'trackbacks', 'custom-fields', 'comments', 'revisions', 'post-formats'],
      page: ['title', 'editor', 'author', 'thumbnail', 'excerpt', 'custom-fields', 'comments', 'revisions', 'page-attributes'],
      attachment: ['title', 'author'],
      revision: ['author'],
      nav_menu_item: ['title'],
    };

    if (coreSupports[postType]) {
      return coreSupports[postType];
    }

    // Custom post type - infer from meta keys
    if (metaKeys.has('_thumbnail_id')) supports.push('thumbnail');
    if (metaKeys.has('_wp_page_template')) supports.push('page-attributes');
    if (metaKeys.has('_edit_lock') || metaKeys.has('_edit_last')) supports.push('revisions');
    if (metaKeys.has('_ping_status') || metaKeys.has('_comment_status')) supports.push('comments');
    if (postType !== 'attachment') supports.push('custom-fields');

    return supports;
  }

  /**
   * Analyze taxonomies from wp_term_taxonomy
   */
  private async analyzeTaxonomies(): Promise<Map<string, WPTaxonomyInfo>> {
    const taxonomies = new Map<string, WPTaxonomyInfo>();

    // Get all taxonomies with term counts
    const rows = await this.connector.query<{
      taxonomy: string;
      term_count: number;
      hierarchical: number;
    }>(
      `SELECT taxonomy, COUNT(*) as term_count, MAX(CASE WHEN parent > 0 THEN 1 ELSE 0 END) as hierarchical
      FROM ${this.connector.table('term_taxonomy')}
      GROUP BY taxonomy
      ORDER BY term_count DESC`
    );

    for (const row of rows) {
      const taxonomy = row.taxonomy;

      // Get object types (post types this taxonomy applies to)
      const objectTypes = await this.connector.query<{ post_type: string }>(
        `SELECT DISTINCT p.post_type
        FROM ${this.connector.table('term_relationships')} tr
        JOIN ${this.connector.table('term_taxonomy')} tt ON tr.term_taxonomy_id = tt.term_taxonomy_id
        JOIN ${this.connector.table('posts')} p ON tr.object_id = p.ID
        WHERE tt.taxonomy = ?
        GROUP BY p.post_type`,
        [taxonomy]
      );

      // Try to get labels from wp_options (for registered taxonomies)
      const labels = await this.getTaxonomyLabels(taxonomy);

      taxonomies.set(taxonomy, {
        taxonomy,
        termCount: row.term_count,
        hierarchical: row.hierarchical > 0,
        objectTypes: objectTypes.map(r => r.post_type),
        labels,
      });
    }

    return taxonomies;
  }

  /**
   * Get taxonomy labels from wp_options (if registered via register_taxonomy)
   */
  private async getTaxonomyLabels(taxonomy: string): Promise<{ name: string; singular_name: string; menu_name?: string }> {
    // WordPress stores taxonomy labels in wp_options under 'taxonomy_labels_{taxonomy}'
    const optionName = `taxonomy_labels_${taxonomy}`;
    const option = await this.connector.getOption(optionName);

    if (option && option.option_value) {
      try {
        const labels = typeof option.option_value === 'string'
          ? JSON.parse(option.option_value)
          : option.option_value;
        return {
          name: labels.name ?? taxonomy,
          singular_name: labels.singular_name ?? taxonomy,
          menu_name: labels.menu_name,
        };
      } catch {
        // Ignore parse errors
      }
    }

    // Fallback: humanize taxonomy name
    const humanized = taxonomy.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    return {
      name: humanized,
      singular_name: humanized.replace(/s$/, ''),
    };
  }

  /**
   * Detect ACF (Advanced Custom Fields) field groups
   * ACF stores field groups as posts with post_type='acf-field-group'
   * and field data in postmeta
   */
  private async detectACFFieldGroups(): Promise<ACFFieldGroup[]> {
    // Check if ACF is installed
    const acfExists = await this.connector.queryScalar(`
      SELECT COUNT(*) FROM ${this.connector.table('posts')}
      WHERE post_type = 'acf-field-group'
    `);

    if ((acfExists as number) === 0) {
      // Also check for ACF in options
      const acfOption = await this.connector.getOption('acf_version');
      if (!acfOption) return [];
    }

    // Get all ACF field group posts
    const groups = await this.connector.getPosts({
      postType: 'acf-field-group',
      postStatus: 'publish',
    });

    const fieldGroups: ACFFieldGroup[] = [];

    for (const group of groups) {
      // Get field group meta
      const meta = await this.connector.getPostMeta(group.ID);
      const metaMap = new Map(meta.map(m => [m.meta_key, m.meta_value]));

      // ACF stores field definitions in '_fields' meta key (serialized)
      const fieldsData = metaMap.get('_fields');
      let fields: ACFField[] = [];

      if (fieldsData) {
        try {
          // ACF fields are stored as PHP serialized array
          const { safePhpUnserialize } = await import('../transformers/serialized-php');
          const unserialized = safePhpUnserialize(fieldsData);
          if (Array.isArray(unserialized)) {
            fields = unserialized as ACFField[];
          }
        } catch {
          // Ignore parse errors
        }
      }

      const fieldGroup: ACFFieldGroup = {
        ID: group.ID,
        key: (metaMap.get('key') as string) ?? `group_${group.ID}`,
        title: group.post_title,
        fields,
        location: await this.parseACFLocation(metaMap.get('location')),
        menu_order: parseInt(metaMap.get('menu_order') as string ?? '0', 10),
        position: (metaMap.get('position') as ACFFieldGroup['position']) ?? 'normal',
        style: (metaMap.get('style') as ACFFieldGroup['style']) ?? 'default',
        label_placement: (metaMap.get('label_placement') as ACFFieldGroup['label_placement']) ?? 'top',
        instruction_placement: (metaMap.get('instruction_placement') as ACFFieldGroup['instruction_placement']) ?? 'label',
        hide_on_screen: metaMap.get('hide_on_screen') as string ?? '',
        active: true,
        description: metaMap.get('description') as string ?? '',
        show_in_rest: parseInt(metaMap.get('show_in_rest') as string ?? '0', 10),
        modified: Date.parse(group.post_modified),
      };

      fieldGroups.push(fieldGroup);
    }

    return fieldGroups;
  }

  /**
   * Parse ACF location rules from serialized data
   */
  private async parseACFLocation(locationData: string | undefined): Promise<ACFFieldGroup['location']> {
    if (!locationData) return [];

    try {
      const { safePhpUnserialize } = await import('../transformers/serialized-php');
      const unserialized = safePhpUnserialize(locationData);
      if (Array.isArray(unserialized)) {
        return unserialized as ACFFieldGroup['location'];
      }
    } catch {
      // Ignore
    }
    return [];
  }

  /**
   * Detect SEO plugins (Yoast, RankMath, All in One SEO, etc.)
   */
  private async detectSEOPlugins(): Promise<string[]> {
    const plugins: string[] = [];

    // Check for Yoast SEO
    const yoast = await this.connector.getOption('wpseo_version');
    if (yoast) plugins.push('yoast-seo');

    // Check for RankMath
    const rankmath = await this.connector.getOption('rank_math_version');
    if (rankmath) plugins.push('rank-math');

    // Check for All in One SEO
    const aioseo = await this.connector.getOption('aioseo_version');
    if (aioseo) plugins.push('all-in-one-seo');

    // Check for The SEO Framework
    const seoFramework = await this.connector.getOption('the_seo_framework_version');
    if (seoFramework) plugins.push('the-seo-framework');

    // Check for SEOPress
    const seopress = await this.connector.getOption('seopress_version');
    if (seopress) plugins.push('seopress');

    // Check meta keys in postmeta for SEO plugins
    const seoMetaCheck = await this.connector.queryScalar(`
      SELECT COUNT(*) FROM ${this.connector.table('postmeta')}
      WHERE meta_key LIKE '_yoast_%' OR meta_key LIKE '_rank_math_%' OR meta_key LIKE '_aioseo_%'
      LIMIT 1
    `);

    if ((seoMetaCheck as number) > 0) {
      if (!plugins.includes('yoast-seo') && await this.hasMetaKey('_yoast_wpseo_title')) plugins.push('yoast-seo');
      if (!plugins.includes('rank-math') && await this.hasMetaKey('_rank_math_title')) plugins.push('rank-math');
      if (!plugins.includes('all-in-one-seo') && await this.hasMetaKey('_aioseo_title')) plugins.push('all-in-one-seo');
    }

    return plugins;
  }

  private async hasMetaKey(key: string): Promise<boolean> {
    const count = await this.connector.queryScalar(`
      SELECT COUNT(*) FROM ${this.connector.table('postmeta')}
      WHERE meta_key = ?
      LIMIT 1
    `, [key]);
    return (count as number) > 0;
  }

  /**
   * Detect custom tables (non-WP core tables)
   */
  private async detectCustomTables(): Promise<string[]> {
    const coreTables = new Set([
      'users', 'usermeta', 'posts', 'postmeta',
      'terms', 'term_taxonomy', 'term_relationships', 'termmeta',
      'comments', 'commentmeta', 'options', 'links',
      'term_relationships', 'signups', 'registration_log',
      'blog_versions', 'sitemeta', 'site', 'blogs',
    ]);

    const prefix = this.connector['config'].prefix;

    const rows = await this.connector.query<Record<string, string>>(
      `SHOW TABLES`
    );

    const customTables: string[] = [];
    for (const row of rows) {
      const tableName = String(row[`Tables_in_${this.connector['config'].database}`] ?? row['Tables_in']);
      const withoutPrefix = tableName.replace(new RegExp(`^${prefix}`), '');
      if (!coreTables.has(withoutPrefix) && !withoutPrefix.startsWith('wp_')) {
        customTables.push(tableName);
      }
    }

    return customTables;
  }

  /**
   * Check if this is a WordPress Multisite installation
   */
  private async checkMultisite(): Promise<boolean> {
    const tables = await this.connector.query<Record<string, string>>(`SHOW TABLES`);
    const tableNames = tables.map(r => String(r[`Tables_in_${this.connector['config'].database}`] ?? r['Tables_in']));

    return tableNames.some(name =>
      name.endsWith('_blogs') ||
      name.endsWith('_site') ||
      name.endsWith('_sitemeta') ||
      name.endsWith('_signups') ||
      name.endsWith('_registration_log')
    );
  }

  /**
   * Get WordPress version from wp_options or wp-includes/version.php equivalent
   */
  private async getWPVersion(): Promise<string> {
    const versionOption = await this.connector.getOption('wp_version');
    if (versionOption) return versionOption.option_value;

    // Try to get from db_version
    const dbVersion = await this.connector.getOption('db_version');
    if (dbVersion) return `DB: ${dbVersion.option_value}`;

    return 'Unknown';
  }

  /**
   * Generate a human-readable analysis report
   */
  async generateReport(): Promise<string> {
    const analysis = await this.analyze();

    const lines: string[] = [
      '# WordPress Schema Analysis Report',
      '',
      `**Prefix:** ${analysis.prefix}`,
      `**Version:** ${analysis.version}`,
      `**Multisite:** ${analysis.multisite ? 'Yes' : 'No'}`,
      `**SEO Plugins:** ${analysis.seoPlugins.join(', ') || 'None detected'}`,
      `**Custom Tables:** ${analysis.customTables.length > 0 ? analysis.customTables.join(', ') : 'None'}`,
      '',
      '## Content Types (Post Types)',
      '',
    ];

    for (const [type, info] of analysis.contentTypes) {
      lines.push(`### ${type} (${info.count} posts)`);
      lines.push(`- Hierarchical: ${info.hasHierarchical ? 'Yes' : 'No'}`);
      lines.push(`- Supports: ${info.supports.join(', ')}`);
      lines.push(`- Meta Keys (${info.metaKeys.size}): ${Array.from(info.metaKeys).slice(0, 20).join(', ')}${info.metaKeys.size > 20 ? '...' : ''}`);
      lines.push('');
    }

    lines.push('## Taxonomies', '');

    for (const [tax, info] of analysis.taxonomies) {
      lines.push(`### ${tax} (${info.termCount} terms)`);
      lines.push(`- Hierarchical: ${info.hierarchical ? 'Yes' : 'No'}`);
      lines.push(`- Attached to: ${info.objectTypes.join(', ')}`);
      lines.push(`- Labels: ${info.labels.name} / ${info.labels.singular_name}`);
      lines.push('');
    }

    lines.push('## ACF Field Groups', '');

    if (analysis.acfFieldGroups.length === 0) {
      lines.push('No ACF field groups detected.');
    } else {
      for (const group of analysis.acfFieldGroups) {
        lines.push(`### ${group.title} (${group.key})`);
        lines.push(`- Fields: ${group.fields.length}`);
        lines.push(`- Location: ${JSON.stringify(group.location)}`);
        for (const field of group.fields) {
          lines.push(`  - ${field.name} (${field.label}) [${field.type}]`);
        }
        lines.push('');
      }
    }

    return lines.join('\n');
  }
}

/**
 * Create inspector from migration config
 */
export async function inspectWPSchema(connector: WPMySQLConnector): Promise<WPSchemaAnalysis> {
  const inspector = new WPSchemaInspector(connector);
  return inspector.analyze();
}

/**
 * Quick validation of WP database structure
 */
export async function validateWPSchema(connector: WPMySQLConnector): Promise<{ valid: boolean; errors: string[]; warnings: string[] }> {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Check core tables exist
  const coreTables = ['users', 'posts', 'postmeta', 'terms', 'term_taxonomy', 'term_relationships', 'options'];
  for (const table of coreTables) {
    const exists = await connector.tableExists(table);
    if (!exists) {
      errors.push(`Missing core table: ${table}`);
    }
  }

  // Check for at least one admin user
  const adminCount = await connector.queryScalar(`
    SELECT COUNT(*) FROM ${connector.table('users')} u
    JOIN ${connector.table('usermeta')} um ON u.ID = um.user_id
    WHERE um.meta_key = '${connector['config'].prefix}capabilities'
    AND um.meta_value LIKE '%administrator%'
  `);

  if ((adminCount as number) === 0) {
    warnings.push('No administrator users found');
  }

  // Check for posts
  const postCount = await connector.getTableCount('posts');
  if (postCount === 0) {
    warnings.push('No posts found in database');
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}