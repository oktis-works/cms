// @oktis-works/core - Comments service (Item 11 do plugin-parity-plan)
//
// WordPress-parity comments: threaded (parent_id), moderated
// (PENDING → APPROVED | SPAM | TRASHED), tenant-scoped via RLS. Antispam is
// hook-based: `comment:before_save` is a FILTER over the comment input — a
// plugin (Akismet-style) can set `status: 'SPAM'` before persisting.

import { randomUUID } from 'node:crypto';
import { getConnection } from '@oktis-works/database';
import type { Comment, CommentStatus } from '@oktis-works/types';
import { getHookRegistry } from '@oktis-works/plugin-runtime';
import { HOOK_POINTS } from '../hooks/points.js';

export interface CreateCommentInput {
  contentId: string;
  parentId?: string | null;
  authorName: string;
  authorEmail?: string | null;
  authorUrl?: string | null;
  authorId?: string | null;
  body: string;
  status?: CommentStatus;
  ipAddress?: string | null;
  userAgent?: string | null;
}

export interface CommentListFilter {
  status?: CommentStatus;
  contentId?: string;
  parentId?: string | null;
  search?: string;
  limit?: number;
  offset?: number;
}

export class CommentService {
  /** Public approved list for a content item (site rendering / REST). */
  async listApprovedByContent(contentId: string, limit = 50): Promise<Comment[]> {
    const sql = getConnection();
    const rows = await sql.unsafe(
      `SELECT * FROM comments WHERE content_id = $1 AND status = 'APPROVED' ORDER BY created_at ASC LIMIT $2`,
      [contentId, Math.min(Math.max(limit, 1), 200)]
    );
    return rows as unknown as Comment[];
  }

  /** Moderation list (admin) with optional filters. */
  async list(filter: CommentListFilter = {}): Promise<Comment[]> {
    const sql = getConnection();
    const clauses: string[] = [];
    const params: unknown[] = [];

    if (filter.status) {
      params.push(filter.status);
      clauses.push(`status = $${params.length}`);
    }
    if (filter.contentId) {
      params.push(filter.contentId);
      clauses.push(`content_id = $${params.length}`);
    }
    if (filter.parentId !== undefined) {
      if (filter.parentId === null) {
        clauses.push('parent_id IS NULL');
      } else {
        params.push(filter.parentId);
        clauses.push(`parent_id = $${params.length}`);
      }
    }
    if (filter.search) {
      params.push(`%${filter.search}%`);
      clauses.push(`(body ILIKE $${params.length} OR author_name ILIKE $${params.length} OR author_email ILIKE $${params.length})`);
    }

    const where = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
    params.push(Math.min(Math.max(filter.limit ?? 50, 1), 200));
    const limitParam = `$${params.length}`;
    params.push(Math.max(filter.offset ?? 0, 0));
    const offsetParam = `$${params.length}`;

    const rows = await sql.unsafe(
      `SELECT * FROM comments ${where} ORDER BY created_at DESC LIMIT ${limitParam} OFFSET ${offsetParam}`,
      params
    );
    return rows as unknown as Comment[];
  }

  async getById(id: string): Promise<Comment | null> {
    const sql = getConnection();
    const rows = await sql.unsafe('SELECT * FROM comments WHERE id = $1', [id]);
    return (rows[0] as unknown as Comment) ?? null;
  }

  /** Counts per status for the moderation dashboard. */
  async countByStatus(): Promise<Record<CommentStatus, number>> {
    const sql = getConnection();
    const rows = await sql.unsafe('SELECT status, COUNT(*)::int AS count FROM comments GROUP BY status', []);
    const counts: Record<CommentStatus, number> = { PENDING: 0, APPROVED: 0, SPAM: 0, TRASHED: 0 };
    for (const row of rows as unknown as Array<{ status: string; count: number }>) {
      if (row.status in counts) counts[row.status as CommentStatus] = Number(row.count);
    }
    return counts;
  }

  /**
   * Creates a comment. `comment:before_save` (filter) runs BEFORE validation
   * — antispam plugins may stamp `status: 'SPAM'`. Defaults to PENDING
   * (moderation queue) unless explicitly approved.
   */
  async create(input: CreateCommentInput): Promise<Comment> {
    const sql = getConnection();

    const filtered = (await getHookRegistry().applyFiltersAsync(
      HOOK_POINTS.COMMENT_BEFORE_SAVE,
      { ...input, status: input.status ?? ('PENDING' as const) },
      { contentId: input.contentId }
    )) as CreateCommentInput & { status: CommentStatus };

    const status = filtered.status ?? 'PENDING';
    const id = randomUUID();
    const rows = await sql.unsafe(
      `INSERT INTO comments (id, content_id, parent_id, author_name, author_email, author_url, author_id, body, status, ip_address, user_agent)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING *`,
      [
        id,
        filtered.contentId,
        filtered.parentId ?? null,
        filtered.authorName,
        filtered.authorEmail ?? null,
        filtered.authorUrl ?? null,
        filtered.authorId ?? null,
        filtered.body,
        status,
        filtered.ipAddress ?? null,
        filtered.userAgent ?? null,
      ]
    );

    const comment = rows[0] as unknown as Comment;
    await getHookRegistry().doAction(HOOK_POINTS.COMMENT_AFTER_SAVE, comment, { isNew: true, status });
    return comment;
  }

  /** Updates author/body fields (moderation edit). */
  async update(id: string, patch: { authorName?: string; authorEmail?: string | null; authorUrl?: string | null; body?: string }): Promise<Comment | null> {
    const sql = getConnection();
    const existing = await this.getById(id);
    if (!existing) return null;

    const rows = await sql.unsafe(
      `UPDATE comments SET author_name = $1, author_email = $2, author_url = $3, body = $4, updated_at = NOW()
       WHERE id = $5 RETURNING *`,
      [
        patch.authorName ?? existing.authorName,
        patch.authorEmail ?? existing.authorEmail ?? null,
        patch.authorUrl ?? existing.authorUrl ?? null,
        patch.body ?? existing.body,
        id,
      ]
    );
    return (rows[0] as unknown as Comment) ?? null;
  }

  /**
   * Moderation status transition. Fires `comment:approved` / `comment:spammed`
   * side-effect hooks (notify author, learn spam corpus, …).
   */
  async setStatus(id: string, status: CommentStatus): Promise<Comment | null> {
    const sql = getConnection();
    const existing = await this.getById(id);
    if (!existing) return null;

    const rows = await sql.unsafe(
      `UPDATE comments SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING *`,
      [status, id]
    );
    const updated = (rows[0] as unknown as Comment) ?? null;
    if (!updated) return null;

    const registry = getHookRegistry();
    if (status === 'APPROVED' && existing.status !== 'APPROVED') {
      await registry.doAction(HOOK_POINTS.COMMENT_APPROVED, updated, { previousStatus: existing.status });
    }
    if (status === 'SPAM' && existing.status !== 'SPAM') {
      await registry.doAction(HOOK_POINTS.COMMENT_SPAMMED, updated, { previousStatus: existing.status });
    }
    return updated;
  }

  async delete(id: string): Promise<boolean> {
    const sql = getConnection();
    const existing = await this.getById(id);
    if (!existing) return false;

    await getHookRegistry().doAction(HOOK_POINTS.COMMENT_BEFORE_DELETE, existing, {});
    await sql.unsafe('DELETE FROM comments WHERE id = $1', [id]);
    await getHookRegistry().doAction(HOOK_POINTS.COMMENT_DELETED, existing, {});
    return true;
  }

  // ── comment_meta (key/value JSONB) ──────────────────────────────────────
  async getMeta(commentId: string, key: string): Promise<unknown> {
    const sql = getConnection();
    const rows = await sql.unsafe('SELECT value FROM comment_meta WHERE comment_id = $1 AND key = $2', [
      commentId,
      key,
    ]);
    const row = rows[0] as unknown as { value?: unknown } | undefined;
    return row?.value ?? null;
  }

  async setMeta(commentId: string, key: string, value: unknown): Promise<void> {
    const sql = getConnection();
    await sql.unsafe(
      `INSERT INTO comment_meta (id, comment_id, key, value) VALUES ($1, $2, $3, $4::jsonb)
       ON CONFLICT (comment_id, key) DO UPDATE SET value = EXCLUDED.value`,
      [randomUUID(), commentId, key, value ?? null]
    );
  }

  async deleteMeta(commentId: string, key: string): Promise<void> {
    const sql = getConnection();
    await sql.unsafe('DELETE FROM comment_meta WHERE comment_id = $1 AND key = $2', [commentId, key]);
  }
}

export const commentService = new CommentService();
