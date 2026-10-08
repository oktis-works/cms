import { randomUUID } from 'node:crypto';
import { getConnection } from '@oktis-works/database';
import type { Media } from '@oktis-works/types';

export class MediaService {
  async list(options: {
    page?: number;
    limit?: number;
    mimeType?: string;
    search?: string;
  }): Promise<{ data: Media[]; total: number }> {
    const sql = getConnection();
    const { page = 1, limit = 20, mimeType, search } = options;
    const offset = (page - 1) * limit;

    let whereClause = 'WHERE 1=1';
    const params: string[] = [];

    if (mimeType) {
      whereClause += ` AND mime_type = $${params.length + 1}`;
      params.push(mimeType);
    }
    if (search) {
      whereClause += ` AND (filename ILIKE $${params.length + 1} OR alt ILIKE $${params.length + 2})`;
      params.push(`%${search}%`);
      params.push(`%${search}%`);
    }

    const dataResult = await sql.unsafe(
      `SELECT * FROM media ${whereClause} ORDER BY created_at DESC LIMIT ${limit} OFFSET ${offset}`,
      params
    );
    const countResult = await sql.unsafe(
      `SELECT COUNT(*) as total FROM media ${whereClause}`,
      params
    );

    return {
      data: dataResult as unknown as Media[],
      total: Number((countResult[0] as Record<string, unknown>)?.['total'] ?? 0),
    };
  }

  async getById(id: string): Promise<Media | null> {
    const sql = getConnection();
    const result = await sql.unsafe('SELECT * FROM media WHERE id = $1', [id]);
    return (result[0] as unknown as Media) ?? null;
  }

  async create(input: {
    /** UUID do tenant (NOT NULL em media) — a rota resolve a partir do JWT. */
    tenantId: string;
    filename: string;
    title?: string;
    mimeType: string;
    size: number;
    path: string;
    url: string;
    alt?: string;
    caption?: string;
    description?: string;
    metadata?: Record<string, unknown>;
    uploadedBy: string;
  }): Promise<Media> {
    const sql = getConnection();
    const id = randomUUID();
    const metadata = input.metadata ?? null;

    const result = await sql.unsafe(
      `INSERT INTO media (id, tenant_id, filename, title, mime_type, size, path, url, alt, caption, description, metadata, uploaded_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb, $13)
       RETURNING *`,
      [
        id,
        input.tenantId,
        input.filename,
        input.title ?? input.filename,
        input.mimeType,
        input.size,
        input.path,
        input.url,
        input.alt ?? null,
        input.caption ?? null,
        input.description ?? null,
        metadata,
        input.uploadedBy,
      ]
    );

    return result[0] as unknown as Media;
  }

  async update(
    id: string,
    input: {
      title?: string;
      alt?: string;
      caption?: string;
      description?: string;
      metadata?: Record<string, unknown>;
    }
  ): Promise<Media | null> {
    const sql = getConnection();

    const existing = await this.getById(id);
    if (!existing) return null;

    const setClauses: string[] = [];
    const setParams: unknown[] = [];

    if (input.title !== undefined) {
      setClauses.push(`title = $${setParams.length + 1}`);
      setParams.push(input.title);
    }
    if (input.alt !== undefined) {
      setClauses.push(`alt = $${setParams.length + 1}`);
      setParams.push(input.alt);
    }
    if (input.caption !== undefined) {
      setClauses.push(`caption = $${setParams.length + 1}`);
      setParams.push(input.caption);
    }
    if (input.description !== undefined) {
      setClauses.push(`description = $${setParams.length + 1}`);
      setParams.push(input.description);
    }
    if (input.metadata !== undefined) {
      setClauses.push(`metadata = $${setParams.length + 1}::jsonb`);
      setParams.push(input.metadata);
    }

    if (setClauses.length === 0) return existing;

    setClauses.push(`updated_at = NOW()`);
    setParams.push(id);

    const result = await sql.unsafe(
      `UPDATE media SET ${setClauses.join(', ')} WHERE id = $${setParams.length} RETURNING *`,
      setParams
    );

    return (result[0] as unknown as Media) ?? null;
  }

  async replaceFile(
    id: string,
    input: { filename: string; mimeType: string; size: number; path: string; url: string }
  ): Promise<Media | null> {
    const sql = getConnection();
    const existing = await this.getById(id);
    if (!existing) return null;

    const result = await sql.unsafe(
      `UPDATE media
       SET filename = $1, mime_type = $2, size = $3, path = $4, url = $5, updated_at = NOW()
       WHERE id = $6
       RETURNING *`,
      [input.filename, input.mimeType, input.size, input.path, input.url, id]
    );

    return (result[0] as unknown as Media) ?? null;
  }

  async delete(id: string): Promise<boolean> {
    const sql = getConnection();

    const existing = await this.getById(id);
    if (!existing) return false;

    await sql.unsafe('DELETE FROM media WHERE id = $1', [id]);

    return true;
  }
}

export const mediaService = new MediaService();
