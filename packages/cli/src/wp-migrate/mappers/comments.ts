/**
 * Comments Mapper
 * Maps wp_comments + wp_commentmeta → OkCMS comments + comment_meta
 */

import { WPMySQLConnector } from '../connectors/mysql';
import {
  WPMigrationConfig,
  MigrationPhase,
  PhaseStats,
  IDMaps,
  MigrationError,
  WPComment,
  WPCommentMeta,
} from '../types';
import { parseWPDate } from '../transformers/dates';

export interface CommentsMapperDeps {
  connector: WPMySQLConnector;
  config: WPMigrationConfig;
  idMaps: IDMaps;
  stats: Record<MigrationPhase, PhaseStats>;
  errors: MigrationError[];
  reportProgress: (phase: MigrationPhase, current: number, total: number) => void;
  tenantId: string;
  authorIdMap: Map<number, string>;
}

const COMMENT_STATUS_MAP: Record<string, 'PENDING' | 'APPROVED' | 'SPAM' | 'TRASHED'> = {
  '0': 'PENDING',
  '1': 'APPROVED',
  spam: 'SPAM',
  trash: 'TRASHED',
};

export class CommentsMapper {
  private deps: CommentsMapperDeps;

  constructor(deps: CommentsMapperDeps) {
    this.deps = deps;
  }

  /**
   * Main entry point: migrate comments
   */
  async migrate(): Promise<void> {
    const phase: MigrationPhase = 'comments';
    this.deps.stats[phase] = { created: 0, updated: 0, skipped: 0, errors: 0, durationMs: 0 };
    const startTime = Date.now();

    try {
      // Get all comments
      const comments = await this.deps.connector.getComments();

      // Get all commentmeta in bulk
      const allMeta = await this.deps.connector.getCommentMeta();
      const metaMap = new Map<number, WPCommentMeta[]>();
      for (const meta of allMeta) {
        if (!metaMap.has(meta.comment_id)) metaMap.set(meta.comment_id, []);
        metaMap.get(meta.comment_id)!.push(meta);
      }

      const total = comments.length;
      const batchSize = this.deps.config.batchSize ?? 1000;

      // First pass: create top-level comments
      for (let i = 0; i < comments.length; i += batchSize) {
        const batch = comments.slice(i, i + batchSize);
        for (const comment of batch) {
          if (comment.comment_parent === 0) {
            try {
              await this.migrateComment(comment, metaMap.get(comment.comment_ID) ?? []);
            } catch (error) {
              this.deps.stats[phase].errors++;
              this.addError(phase, 'comments', comment.comment_ID, 'migrate_comment', error instanceof Error ? error.message : 'Unknown error');
            }
          }
        }
        this.deps.reportProgress(phase, Math.min(i + batchSize, total), total);
      }

      // Second pass: create child comments (replies)
      for (let i = 0; i < comments.length; i += batchSize) {
        const batch = comments.slice(i, i + batchSize);
        for (const comment of batch) {
          if (comment.comment_parent > 0) {
            try {
              await this.migrateComment(comment, metaMap.get(comment.comment_ID) ?? []);
            } catch (error) {
              this.deps.stats[phase].errors++;
              this.addError(phase, 'comments', comment.comment_ID, 'migrate_reply', error instanceof Error ? error.message : 'Unknown error');
            }
          }
        }
      }

      this.deps.stats[phase].durationMs = Date.now() - startTime;
    } catch (error) {
      this.deps.stats[phase].errors++;
      this.addError(phase, 'comments', 0, 'migrate', error instanceof Error ? error.message : 'Unknown error');
      throw error;
    }
  }

  /**
   * Migrate a single comment
   */
  private async migrateComment(comment: WPComment, meta: WPCommentMeta[]): Promise<void> {
    const { connector, idMaps, tenantId, authorIdMap, stats } = this.deps;

    // Map content (post) ID
    const contentId = idMaps.content.get(comment.comment_post_ID);
    if (!contentId) {
      stats['comments'].skipped++;
      return;
    }

    // Map parent comment ID
    let parentId: string | null = null;
    if (comment.comment_parent > 0) {
      parentId = idMaps.comment.get(comment.comment_parent) ?? null;
      if (!parentId) {
        // Parent not migrated yet - skip for now, will be caught in second pass
        return;
      }
    }

    // Map author if registered user
    let authorId: string | undefined;
    if (comment.user_id > 0) {
      authorId = authorIdMap.get(comment.user_id);
    }

    // Parse dates
    const createdAt = parseWPDate(comment.comment_date_gmt, true) ?? parseWPDate(comment.comment_date, false) ?? new Date();
    const updatedAt = parseWPDate(comment.comment_date_gmt, true) ?? parseWPDate(comment.comment_date, false) ?? new Date();

    // Map status
    const status = COMMENT_STATUS_MAP[comment.comment_approved] ?? 'PENDING';

    // Build metadata
    const metadata: Record<string, unknown> = {
      wp_comment_id: comment.comment_ID,
      wp_comment_karma: comment.comment_karma,
      wp_comment_type: comment.comment_type || 'comment',
      wp_comment_agent: comment.comment_agent,
    };

    // Check if comment already exists
    const existing = await connector.queryOne<{ id: string }>(
      `SELECT id FROM comments WHERE tenant_id = ? AND metadata->>'$.wp_comment_id' = ?`,
      [tenantId, String(comment.comment_ID)]
    );

    let commentId: string;

    if (existing) {
      commentId = existing.id;
      await connector.query(
        `UPDATE comments SET
          content_id = ?, parent_id = ?, author_name = ?, author_email = ?, author_url = ?,
          author_id = ?, body = ?, status = ?, ip_address = ?, user_agent = ?,
          metadata = ?, updated_at = NOW()
        WHERE id = ?`,
        [
          contentId,
          parentId,
          comment.comment_author,
          comment.comment_author_email || null,
          comment.comment_author_url || null,
          authorId ?? null,
          comment.comment_content,
          status,
          comment.comment_author_IP || null,
          comment.comment_agent || null,
          JSON.stringify(metadata),
          commentId,
        ]
      );
      stats['comments'].updated++;
    } else {
      commentId = crypto.randomUUID();
      await connector.query(
        `INSERT INTO comments (id, tenant_id, content_id, parent_id, author_name, author_email, author_url, author_id, body, status, ip_address, user_agent, metadata, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          commentId,
          tenantId,
          contentId,
          parentId,
          comment.comment_author,
          comment.comment_author_email || null,
          comment.comment_author_url || null,
          authorId ?? null,
          comment.comment_content,
          status,
          comment.comment_author_IP || null,
          comment.comment_agent || null,
          JSON.stringify(metadata),
          createdAt.toISOString().slice(0, 19).replace('T', ' '),
          updatedAt.toISOString().slice(0, 19).replace('T', ' '),
        ]
      );
      stats['comments'].created++;
    }

    // Map WP comment ID -> OkCMS comment UUID
    idMaps.comment.set(comment.comment_ID, commentId);

    // Migrate comment meta
    for (const m of meta) {
      try {
        await this.migrateCommentMeta(commentId, m);
      } catch (error) {
        stats['comments'].errors++;
        this.addError('comments', 'commentmeta', m.meta_id, m.meta_key, error instanceof Error ? error.message : 'Unknown error');
      }
    }
  }

  /**
   * Migrate comment meta
   */
  private async migrateCommentMeta(commentId: string, meta: WPCommentMeta): Promise<void> {
    const { connector } = this.deps;

    // Unserialize if needed
    let value: unknown = meta.meta_value;
    if (meta.meta_value && (meta.meta_value.startsWith('a:') || meta.meta_value.startsWith('O:') || meta.meta_value.startsWith('s:'))) {
      try {
        const { safePhpUnserialize } = await import('../transformers/serialized-php');
        value = safePhpUnserialize(meta.meta_value);
      } catch {
        // Keep as string
      }
    }

    await connector.query(
      `INSERT INTO comment_meta (id, comment_id, \`key\`, value)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE value = ?`,
      [crypto.randomUUID(), commentId, meta.meta_key, JSON.stringify(value), JSON.stringify(value)]
    );
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
export async function migrateComments(
  connector: WPMySQLConnector,
  config: WPMigrationConfig,
  idMaps: IDMaps,
  stats: Record<MigrationPhase, PhaseStats>,
  errors: MigrationError[],
  reportProgress: (phase: MigrationPhase, current: number, total: number) => void,
  tenantId: string,
  authorIdMap: Map<number, string>
): Promise<void> {
  const mapper = new CommentsMapper({ connector, config, idMaps, stats, errors, reportProgress, tenantId, authorIdMap });
  await mapper.migrate();
}