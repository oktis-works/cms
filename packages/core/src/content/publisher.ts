// @oktis-works/core - Content Publisher
// Handles publish/unpublish workflow with versioning

import { randomUUID } from 'node:crypto';
import { getConnection } from '@oktis-works/database';
import type { Content, ContentStatus } from '@oktis-works/types';
import { getHookRegistry } from '@oktis-works/plugin-runtime';
import { getEventBus } from '../events/bus.js';
import { getCache } from '../cache/index.js';
import { HOOK_POINTS } from '../hooks/points.js';

export interface PublishResult {
  content: Content;
  previousStatus: ContentStatus;
}

export class ContentPublisher {
  /**
   * Publish content: change status from DRAFT to PUBLISHED
   */
  async publish(contentId: string, userId: string): Promise<PublishResult> {
    const sql = getConnection();

    const existing = await sql.unsafe('SELECT * FROM content WHERE id = $1', [contentId]);
    if (existing.length === 0) {
      throw new Error('Content not found');
    }

    const content = existing[0] as unknown as Content;
    const previousStatus = content.status;

    if (previousStatus === 'PUBLISHED') {
      throw new Error('Content is already published');
    }

    await getHookRegistry().doAction(HOOK_POINTS.BEFORE_PUBLISH_CONTENT(content.type), content);

    const newVersion = content.version + 1;

    const result = await sql.unsafe(
      `UPDATE content
       SET status = 'PUBLISHED', published_at = NOW(), version = $1, updated_at = NOW()
       WHERE id = $2
       RETURNING *`,
      [String(newVersion), contentId]
    );

    const updatedContent = result[0] as unknown as Content;

    // Create version snapshot
    await this.createVersionSnapshot(updatedContent, newVersion, userId);

    await getHookRegistry().doAction(HOOK_POINTS.AFTER_PUBLISH_CONTENT(content.type), updatedContent, { previousStatus });

    // Emit event
    const eventBus = getEventBus();
    await eventBus.emit({
      id: randomUUID(),
      type: 'content.published',
      aggregateType: 'content',
      aggregateId: contentId,
      payload: { content: updatedContent, previousStatus },
      processed: false,
      createdAt: new Date(),
    });

    // Invalidate cache
    const cache = getCache();
    await cache.del(`content:${contentId}`);
    await cache.del(`content:slug:${updatedContent.slug}`);

    return { content: updatedContent, previousStatus };
  }

  /**
   * Unpublish content: change status from PUBLISHED back to DRAFT
   */
  async unpublish(contentId: string, userId: string): Promise<PublishResult> {
    const sql = getConnection();

    const existing = await sql.unsafe('SELECT * FROM content WHERE id = $1', [contentId]);
    if (existing.length === 0) {
      throw new Error('Content not found');
    }

    const content = existing[0] as unknown as Content;
    const previousStatus = content.status;

    if (previousStatus !== 'PUBLISHED') {
      throw new Error('Content is not published');
    }

    const newVersion = content.version + 1;

    const result = await sql.unsafe(
      `UPDATE content
       SET status = 'DRAFT', published_at = NULL, version = $1, updated_at = NOW()
       WHERE id = $2
       RETURNING *`,
      [String(newVersion), contentId]
    );

    const updatedContent = result[0] as unknown as Content;

    // Create version snapshot
    await this.createVersionSnapshot(updatedContent, newVersion, userId);

    // Emit event
    const eventBus = getEventBus();
    await eventBus.emit({
      id: randomUUID(),
      type: 'content.unpublished',
      aggregateType: 'content',
      aggregateId: contentId,
      payload: { content: updatedContent, previousStatus },
      processed: false,
      createdAt: new Date(),
    });

    // Invalidate cache
    const cache = getCache();
    await cache.del(`content:${contentId}`);
    await cache.del(`content:slug:${updatedContent.slug}`);

    return { content: updatedContent, previousStatus };
  }

  /**
   * Archive content: change status to ARCHIVED
   */
  async archive(contentId: string, userId: string): Promise<PublishResult> {
    const sql = getConnection();

    const existing = await sql.unsafe('SELECT * FROM content WHERE id = $1', [contentId]);
    if (existing.length === 0) {
      throw new Error('Content not found');
    }

    const content = existing[0] as unknown as Content;
    const previousStatus = content.status;
    const newVersion = content.version + 1;

    const result = await sql.unsafe(
      `UPDATE content
       SET status = 'ARCHIVED', version = $1, updated_at = NOW()
       WHERE id = $2
       RETURNING *`,
      [String(newVersion), contentId]
    );

    const updatedContent = result[0] as unknown as Content;

    await this.createVersionSnapshot(updatedContent, newVersion, userId);

    const eventBus = getEventBus();
    await eventBus.emit({
      id: randomUUID(),
      type: 'content.archived',
      aggregateType: 'content',
      aggregateId: contentId,
      payload: { content: updatedContent, previousStatus },
      processed: false,
      createdAt: new Date(),
    });

    const cache = getCache();
    await cache.del(`content:${contentId}`);

    return { content: updatedContent, previousStatus };
  }

  /**
   * Restore content from TRASHED to DRAFT
   */
  async restore(contentId: string, userId: string): Promise<PublishResult> {
    const sql = getConnection();

    const existing = await sql.unsafe('SELECT * FROM content WHERE id = $1', [contentId]);
    if (existing.length === 0) {
      throw new Error('Content not found');
    }

    const content = existing[0] as unknown as Content;
    const previousStatus = content.status;

    if (previousStatus !== 'TRASHED') {
      throw new Error('Content is not trashed');
    }

    const newVersion = content.version + 1;

    const result = await sql.unsafe(
      `UPDATE content
       SET status = 'DRAFT', version = $1, updated_at = NOW()
       WHERE id = $2
       RETURNING *`,
      [String(newVersion), contentId]
    );

    const updatedContent = result[0] as unknown as Content;

    await this.createVersionSnapshot(updatedContent, newVersion, userId);

    const cache = getCache();
    await cache.del(`content:${contentId}`);

    return { content: updatedContent, previousStatus };
  }

  private async createVersionSnapshot(
    content: Content,
    version: number,
    authorId: string
  ): Promise<void> {
    const sql = getConnection();
    const bodyJson = content.body ? JSON.stringify(content.body) : null;
    const metadataJson = content.metadata ? JSON.stringify(content.metadata) : '{}';

    await sql.unsafe(
      `INSERT INTO content_versions (id, content_id, version, title, body, metadata, author_id)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7)`,
      [randomUUID(), content.id, String(version), content.title, bodyJson, metadataJson, authorId]
    );
  }
}

export const contentPublisher = new ContentPublisher();
