/**
 * MySQL/MariaDB Connector for WordPress Database
 * Uses mysql2/promise for connection pooling and query execution
 */

import mysql, { Pool, PoolOptions } from 'mysql2/promise';
import {
  WPMigrationConfig,
  WPTableCounts,
  WPUser,
  WPUserMeta,
  WPPost,
  WPPostMeta,
  WPTerm,
  WPTermTaxonomy,
  WPTermRelationship,
  WPTermMeta,
  WPComment,
  WPCommentMeta,
  WPOption,
} from '../types';

export interface WPConnectionConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
  prefix: string;
  connectionLimit?: number;
  connectTimeout?: number;
}

export class WPMySQLConnector {
  private pool: Pool | null = null;
  private config: WPConnectionConfig;

  constructor(config: WPConnectionConfig) {
    this.config = {
      connectionLimit: 10,
      connectTimeout: 30000,
      ...config,
    };
  }

  /**
   * Initialize connection pool
   */
  async connect(): Promise<void> {
    if (this.pool) return;

    const poolConfig: PoolOptions = {
      host: this.config.host,
      port: this.config.port,
      user: this.config.user,
      password: this.config.password,
      database: this.config.database,
      connectionLimit: this.config.connectionLimit,
      connectTimeout: this.config.connectTimeout,
      // WP databases typically use utf8mb4
      charset: 'utf8mb4',
      timezone: 'UTC', // Return dates in UTC
      // Type casting for better TypeScript support
      typeCast: (field, next) => {
        // Convert TINYINT(1) to boolean
        if (field.type === 'TINY' && field.length === 1) {
          return field.string() === '1';
        }
        // Convert JSON columns
        if (field.type === 'JSON') {
          const val = field.string();
          try {
            return val ? JSON.parse(val) : null;
          } catch {
            return val;
          }
        }
        return next();
      },
    };

    this.pool = mysql.createPool(poolConfig);

    // Test connection
    const conn = await this.pool.getConnection();
    conn.release();
  }

  /**
   * Close connection pool
   */
  async disconnect(): Promise<void> {
    if (this.pool) {
      await this.pool.end();
      this.pool = null;
    }
  }

  /**
   * Get table name with prefix
   */
  table(name: string): string {
    return `\`${this.config.prefix}${name}\``;
  }

  /**
   * Execute a query and return rows
   */
  async query<T>(sql: string, params?: (string | number | Date | Buffer | null)[]): Promise<T[]> {
    if (!this.pool) throw new Error('Not connected');
    const result = await this.pool.execute(sql, params as mysql.ExecuteValues);
    const rows = result[0];
    return rows as T[];
  }

  /**
   * Execute a query and return first row
   */
  async queryOne<T>(sql: string, params?: (string | number | Date | Buffer | null)[]): Promise<T | null> {
    const rows = await this.query<T>(sql, params);
    return rows[0] ?? null;
  }

  /**
   * Execute a query and return scalar value
   */
  async queryScalar(sql: string, params?: (string | number | Date | Buffer | null)[]): Promise<unknown> {
    const row = await this.queryOne<{ value: unknown }>(sql, params);
    return row?.value ?? null;
  }

  /**
   * Get count of rows in a table
   */
  async getTableCount(tableName: string): Promise<number> {
    const row = await this.queryOne<{ count: number }>(
      `SELECT COUNT(*) as count FROM ${this.table(tableName)}`
    );
    return row?.count ?? 0;
  }

  /**
   * Get counts for all WP tables
   */
  async getAllTableCounts(): Promise<WPTableCounts> {
    const tables = [
      'users', 'usermeta', 'posts', 'postmeta',
      'terms', 'term_taxonomy', 'term_relationships', 'termmeta',
      'comments', 'commentmeta', 'options', 'links'
    ] as const;

    const counts: Partial<WPTableCounts> = {};

    for (const table of tables) {
      try {
        counts[table] = await this.getTableCount(table);
      } catch {
        counts[table] = 0;
      }
    }

    return counts as WPTableCounts;
  }

  /**
   * Check if table exists
   */
  async tableExists(tableName: string): Promise<boolean> {
    try {
      await this.query(`SELECT 1 FROM ${this.table(tableName)} LIMIT 1`);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get column info for a table
   */
  async getColumns(tableName: string): Promise<{ column: string; type: string; nullable: boolean }[]> {
    const rows = await this.query<Record<string, string>>(
      `SHOW COLUMNS FROM ${this.table(tableName)}`
    );
    return rows.map(r => ({
      column: r['Field'] as string,
      type: r['Type'] as string,
      nullable: r['Null'] === 'YES',
    }));
  }

  // ===========================================
  // WordPress-Specific Query Methods
  // ===========================================

  /**
   * Get all users with basic info
   */
  async getUsers(limit?: number, offset?: number): Promise<WPUser[]> {
    let sql = `SELECT * FROM ${this.table('users')} ORDER BY ID`;
    const params: (string | number | Date | Buffer | null)[] = [];
    if (limit) {
      sql += ` LIMIT ?`;
      params.push(limit);
      if (offset) {
        sql += ` OFFSET ?`;
        params.push(offset);
      }
    }
    return this.query<WPUser>(sql, params);
  }

  /**
   * Get user by ID
   */
  async getUserById(id: number): Promise<WPUser | null> {
    return this.queryOne<WPUser>(
      `SELECT * FROM ${this.table('users')} WHERE ID = ?`,
      [id]
    );
  }

  /**
   * Get user by email
   */
  async getUserByEmail(email: string): Promise<WPUser | null> {
    return this.queryOne<WPUser>(
      `SELECT * FROM ${this.table('users')} WHERE user_email = ?`,
      [email]
    );
  }

  /**
   * Get all usermeta for a user
   */
  async getUserMeta(userId: number): Promise<WPUserMeta[]> {
    return this.query<WPUserMeta>(
      `SELECT * FROM ${this.table('usermeta')} WHERE user_id = ? ORDER BY umeta_id`,
      [userId]
    );
  }

  /**
   * Get all usermeta for multiple users
   */
  async getUserMetaBulk(userIds: number[]): Promise<WPUserMeta[]> {
    if (userIds.length === 0) return [];
    const placeholders = userIds.map(() => '?').join(',');
    return this.query<WPUserMeta>(
      `SELECT * FROM ${this.table('usermeta')} WHERE user_id IN (${placeholders}) ORDER BY user_id, umeta_id`,
      userIds as (string | number | Date | Buffer | null)[]
    );
  }

  /**
   * Get posts with optional filters
   */
  async getPosts(options?: {
    postType?: string | string[];
    postStatus?: string | string[];
    limit?: number;
    offset?: number;
    orderBy?: string;
    orderDir?: 'ASC' | 'DESC';
  }): Promise<WPPost[]> {
    const conditions: string[] = [];
    const params: (string | number | Date | Buffer | null)[] = [];

    if (options?.postType) {
      const types = Array.isArray(options.postType) ? options.postType : [options.postType];
      conditions.push(`post_type IN (${types.map(() => '?').join(',')})`);
      params.push(...types);
    }

    if (options?.postStatus) {
      const statuses = Array.isArray(options.postStatus) ? options.postStatus : [options.postStatus];
      conditions.push(`post_status IN (${statuses.map(() => '?').join(',')})`);
      params.push(...statuses);
    }

    let sql = `SELECT * FROM ${this.table('posts')}`;
    if (conditions.length > 0) {
      sql += ` WHERE ${conditions.join(' AND ')}`;
    }

    sql += ` ORDER BY ${options?.orderBy ?? 'ID'} ${options?.orderDir ?? 'ASC'}`;

    if (options?.limit) {
      sql += ` LIMIT ?`;
      params.push(options.limit);
      if (options?.offset) {
        sql += ` OFFSET ?`;
        params.push(options.offset);
      }
    }

    return this.query<WPPost>(sql, params);
  }

  /**
   * Get post by ID
   */
  async getPostById(id: number): Promise<WPPost | null> {
    return this.queryOne<WPPost>(
      `SELECT * FROM ${this.table('posts')} WHERE ID = ?`,
      [id]
    );
  }

  /**
   * Get distinct post types
   */
  async getDistinctPostTypes(): Promise<string[]> {
    const rows = await this.query<{ post_type: string }>(
      `SELECT DISTINCT post_type FROM ${this.table('posts')} ORDER BY post_type`
    );
    return rows.map(r => r.post_type);
  }

  /**
   * Get postmeta for a post
   */
  async getPostMeta(postId: number): Promise<WPPostMeta[]> {
    return this.query<WPPostMeta>(
      `SELECT * FROM ${this.table('postmeta')} WHERE post_id = ? ORDER BY meta_id`,
      [postId]
    );
  }

  /**
   * Get postmeta for multiple posts (bulk)
   */
  async getPostMetaBulk(postIds: number[]): Promise<WPPostMeta[]> {
    if (postIds.length === 0) return [];
    const placeholders = postIds.map(() => '?').join(',');
    return this.query<WPPostMeta>(
      `SELECT * FROM ${this.table('postmeta')} WHERE post_id IN (${placeholders}) ORDER BY post_id, meta_id`,
      postIds as (string | number | Date | Buffer | null)[]
    );
  }

  /**
   * Get all terms
   */
  async getTerms(): Promise<WPTerm[]> {
    return this.query<WPTerm>(
      `SELECT * FROM ${this.table('terms')} ORDER BY term_id`
    );
  }

  /**
   * Get term by ID
   */
  async getTermById(termId: number): Promise<WPTerm | null> {
    return this.queryOne<WPTerm>(
      `SELECT * FROM ${this.table('terms')} WHERE term_id = ?`,
      [termId]
    );
  }

  /**
   * Get all term_taxonomy entries
   */
  async getTermTaxonomies(): Promise<WPTermTaxonomy[]> {
    return this.query<WPTermTaxonomy>(
      `SELECT * FROM ${this.table('term_taxonomy')} ORDER BY term_taxonomy_id`
    );
  }

  /**
   * Get term_taxonomy by ID
   */
  async getTermTaxonomyById(termTaxonomyId: number): Promise<WPTermTaxonomy | null> {
    return this.queryOne<WPTermTaxonomy>(
      `SELECT * FROM ${this.table('term_taxonomy')} WHERE term_taxonomy_id = ?`,
      [termTaxonomyId]
    );
  }

  /**
   * Get term relationships
   */
  async getTermRelationships(): Promise<WPTermRelationship[]> {
    return this.query<WPTermRelationship>(
      `SELECT * FROM ${this.table('term_relationships')} ORDER BY object_id, term_taxonomy_id`
    );
  }

  /**
   * Get termmeta
   */
  async getTermMeta(termId?: number): Promise<WPTermMeta[]> {
    if (termId) {
      return this.query<WPTermMeta>(
        `SELECT * FROM ${this.table('termmeta')} WHERE term_id = ? ORDER BY meta_id`,
        [termId]
      );
    }
    return this.query<WPTermMeta>(
      `SELECT * FROM ${this.table('termmeta')} ORDER BY term_id, meta_id`
    );
  }

  /**
   * Get all comments
   */
  async getComments(options?: {
    postId?: number;
    status?: string;
    limit?: number;
    offset?: number;
  }): Promise<WPComment[]> {
    const conditions: string[] = [];
    const params: (string | number | Date | Buffer | null)[] = [];

    if (options?.postId) {
      conditions.push(`comment_post_ID = ?`);
      params.push(options.postId);
    }

    if (options?.status) {
      conditions.push(`comment_approved = ?`);
      params.push(options.status);
    }

    let sql = `SELECT * FROM ${this.table('comments')}`;
    if (conditions.length > 0) {
      sql += ` WHERE ${conditions.join(' AND ')}`;
    }
    sql += ` ORDER BY comment_ID`;

    if (options?.limit) {
      sql += ` LIMIT ?`;
      params.push(options.limit);
      if (options?.offset) {
        sql += ` OFFSET ?`;
        params.push(options.offset);
      }
    }

    return this.query<WPComment>(sql, params);
  }

  /**
   * Get commentmeta
   */
  async getCommentMeta(commentId?: number): Promise<WPCommentMeta[]> {
    if (commentId) {
      return this.query<WPCommentMeta>(
        `SELECT * FROM ${this.table('commentmeta')} WHERE comment_id = ? ORDER BY meta_id`,
        [commentId]
      );
    }
    return this.query<WPCommentMeta>(
      `SELECT * FROM ${this.table('commentmeta')} ORDER BY comment_id, meta_id`
    );
  }

  /**
   * Get all options
   */
  async getOptions(): Promise<WPOption[]> {
    return this.query<WPOption>(
      `SELECT * FROM ${this.table('options')} ORDER BY option_id`
    );
  }

  /**
   * Get option by name
   */
  async getOption(name: string): Promise<WPOption | null> {
    return this.queryOne<WPOption>(
      `SELECT * FROM ${this.table('options')} WHERE option_name = ?`,
      [name]
    );
  }

  /**
   * Get nav menu items (posts with post_type='nav_menu_item')
   */
  async getNavMenuItems(): Promise<WPPost[]> {
    return this.query<WPPost>(
      `SELECT * FROM ${this.table('posts')} WHERE post_type = 'nav_menu_item' ORDER BY menu_order, ID`
    );
  }

  /**
   * Get nav menu terms (taxonomy='nav_menu')
   */
  async getNavMenus(): Promise<{ term: WPTerm; taxonomy: WPTermTaxonomy }[]> {
    const rows = await this.query<Record<string, string | number>>(`
      SELECT t.*, tt.*
      FROM ${this.table('terms')} t
      JOIN ${this.table('term_taxonomy')} tt ON t.term_id = tt.term_id
      WHERE tt.taxonomy = 'nav_menu'
      ORDER BY t.term_id
    `);
    return rows.map(r => ({
      term: { term_id: Number(r['term_id']), name: String(r['name']), slug: String(r['slug']), term_group: Number(r['term_group']) },
      taxonomy: { term_taxonomy_id: Number(r['term_taxonomy_id']), term_id: Number(r['term_id']), taxonomy: String(r['taxonomy']), description: String(r['description']), parent: Number(r['parent']), count: Number(r['count']) },
    }));
  }

  /**
   * Get postmeta for nav menu items
   */
  async getNavMenuItemMeta(itemIds: number[]): Promise<WPPostMeta[]> {
    if (itemIds.length === 0) return [];
    const placeholders = itemIds.map(() => '?').join(',');
    return this.query<WPPostMeta>(
      `SELECT * FROM ${this.table('postmeta')} WHERE post_id IN (${placeholders}) AND meta_key LIKE '_menu_item_%' ORDER BY post_id, meta_id`,
      itemIds as (string | number | Date | Buffer | null)[]
    );
  }

  /**
   * Stream large result sets (for memory efficiency)
   */
  async *streamQuery<T>(
    sql: string,
    params?: (string | number | Date | Buffer | null)[],
    batchSize: number = 1000
  ): AsyncGenerator<T[]> {
    if (!this.pool) throw new Error('Not connected');

    let offset = 0;
    while (true) {
      const batchSql = `${sql} LIMIT ${batchSize} OFFSET ${offset}`;
      const rows = await this.query<T>(batchSql, params);
      if (rows.length === 0) break;
      yield rows;
      offset += batchSize;
      if (rows.length < batchSize) break;
    }
  }

  /**
   * Get connection for transaction (if needed)
   */
  async getConnection() {
    if (!this.pool) throw new Error('Not connected');
    return this.pool.getConnection();
  }
}

/**
 * Create connector from migration config
 */
export function createWPConnector(config: WPMigrationConfig): WPMySQLConnector {
  return new WPMySQLConnector({
    host: config.host,
    port: config.port,
    user: config.user,
    password: config.password,
    database: config.database,
    prefix: config.prefix,
  });
}

/**
 * Test WP database connection
 */
export async function testWPConnection(config: WPMigrationConfig): Promise<{ success: boolean; error?: string; version?: string }> {
  const connector = createWPConnector(config);
  try {
    await connector.connect();
    const versionRow = await connector.queryOne<{ version: string }>('SELECT VERSION() as version');
    await connector.disconnect();
    return { success: true, version: versionRow?.version };
  } catch (error) {
    await connector.disconnect().catch(() => {});
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}