/**
 * Media Mapper
 * Maps wp_posts (post_type='attachment') → OkCMS media
 */

import { WPMySQLConnector } from '../connectors/mysql';
import {
  WPMigrationConfig,
  MigrationPhase,
  PhaseStats,
  IDMaps,
  MigrationError,
  WPPost,
  WPPostMeta,
  WPAttachmentMetadata,
} from '../types';


export interface MediaMapperDeps {
  connector: WPMySQLConnector;
  config: WPMigrationConfig;
  idMaps: IDMaps;
  stats: Record<MigrationPhase, PhaseStats>;
  errors: MigrationError[];
  reportProgress: (phase: MigrationPhase, current: number, total: number) => void;
  tenantId: string;
  authorIdMap: Map<number, string>;
}

export class MediaMapper {
  private deps: MediaMapperDeps;

  constructor(deps: MediaMapperDeps) {
    this.deps = deps;
  }

  /**
   * Main entry point: migrate media attachments
   */
  async migrate(): Promise<void> {
    const phase: MigrationPhase = 'media';
    this.deps.stats[phase] = { created: 0, updated: 0, skipped: 0, errors: 0, durationMs: 0 };
    const startTime = Date.now();

    try {
      // Get all attachments
      const attachments = await this.deps.connector.getPosts({
        postType: 'attachment',
        orderBy: 'ID',
        orderDir: 'ASC',
      });

      const total = attachments.length;
      const batchSize = this.deps.config.batchSize ?? 500;

      // Get all attachment meta in bulk
      const attachmentIds = attachments.map(a => a.ID);
      const allMeta = await this.deps.connector.getPostMetaBulk(attachmentIds);
      const metaMap = new Map<number, WPPostMeta[]>();
      for (const meta of allMeta) {
        if (!metaMap.has(meta.post_id)) metaMap.set(meta.post_id, []);
        metaMap.get(meta.post_id)!.push(meta);
      }

      // Process in batches
      for (let i = 0; i < attachments.length; i += batchSize) {
        const batch = attachments.slice(i, i + batchSize);
        for (const attachment of batch) {
          try {
            await this.migrateAttachment(attachment, metaMap.get(attachment.ID) ?? []);
          } catch (error) {
            this.deps.stats[phase].errors++;
            this.addError(phase, 'posts', attachment.ID, 'migrate_attachment', error instanceof Error ? error.message : 'Unknown error');
          }
        }
        this.deps.reportProgress(phase, Math.min(i + batchSize, total), total);
      }

      this.deps.stats[phase].durationMs = Date.now() - startTime;
    } catch (error) {
      this.deps.stats[phase].errors++;
      this.addError(phase, 'posts', 0, 'migrate', error instanceof Error ? error.message : 'Unknown error');
      throw error;
    }
  }

  /**
   * Migrate a single attachment
   */
  private async migrateAttachment(post: WPPost, meta: WPPostMeta[]): Promise<void> {
    const { connector, idMaps, tenantId, authorIdMap, stats } = this.deps;

    // Map author
    const authorId = authorIdMap.get(post.post_author);
    if (!authorId) {
      this.addError('media', 'posts', post.ID, 'author', `Author ${post.post_author} not mapped`);
      stats['media'].skipped++;
      return;
    }

    // Extract metadata from postmeta
    const metaMap = new Map(meta.map(m => [m.meta_key, m.meta_value]));

    // Get file info from _wp_attached_file
    const attachedFile = metaMap.get('_wp_attached_file');
    const attachmentMetadata = metaMap.get('_wp_attachment_metadata');

    // Parse attachment metadata
    let parsedMetadata: WPAttachmentMetadata = {};
    if (attachmentMetadata) {
      const { safePhpUnserialize } = await import('../transformers/serialized-php');
      const unserialized = safePhpUnserialize(attachmentMetadata);
      if (unserialized && typeof unserialized === 'object') {
        parsedMetadata = unserialized as WPAttachmentMetadata;
      }
    }

    // Determine file path and URL
    const _uploadsPath = '/wp-content/uploads/'; // Default, could be configurable
    const filePath = attachedFile as string ?? '';
    let fileUrl = post.guid ?? '';

    // If GUID is not a full URL, construct from site URL
    if (fileUrl && !fileUrl.startsWith('http')) {
      const siteUrl = await this.getSiteUrl();
      fileUrl = `${siteUrl.replace(/\/$/, '')}/${fileUrl.replace(/^\//, '')}`;
    }

    // Get file size
    let fileSize = 0;
    if (parsedMetadata.filesize) {
      fileSize = parsedMetadata.filesize;
    } else if (attachedFile) {
      // Try to get from filesystem if copyFiles is enabled
      // For now, use metadata or 0
    }

    // Build metadata JSONB
    const metadata: Record<string, unknown> = {
      wp_attachment_id: post.ID,
      wp_post_parent: post.post_parent,
      wp_post_mime_type: post.post_mime_type,
      attached_file: attachedFile,
      attachment_metadata: parsedMetadata,
    };

    // Add image sizes if available
    if (parsedMetadata.sizes) {
      metadata['sizes'] = parsedMetadata.sizes;
    }

    if (parsedMetadata.image_meta) {
      metadata['image_meta'] = parsedMetadata.image_meta;
    }

    // Generate filename from attached_file or GUID
    let filename = post.post_title;
    if (attachedFile) {
      filename = attachedFile.split('/').pop() ?? filename;
    } else if (fileUrl) {
      filename = fileUrl.split('/').pop()?.split('?')[0] ?? filename;
    }

    // Check if media already exists (by filename + tenant)
    const existing = await connector.queryOne<{ id: string }>(
      `SELECT id FROM media WHERE tenant_id = ? AND filename = ?`,
      [tenantId, filename]
    );

    let mediaId: string;

    if (existing) {
      mediaId = existing.id;
      // Update metadata
      await connector.query(
        `UPDATE media SET
          title = ?, mime_type = ?, size = ?, path = ?, url = ?,
          alt = ?, caption = ?, description = ?, metadata = ?, updated_at = NOW()
        WHERE id = ?`,
        [
          post.post_title || filename,
          post.post_mime_type,
          fileSize,
          filePath,
          fileUrl,
          metaMap.get('_wp_attachment_image_alt') ?? null,
          post.post_excerpt || null,
          post.post_content || null,
          JSON.stringify(metadata),
          mediaId,
        ]
      );
      stats['media'].updated++;
    } else {
      mediaId = crypto.randomUUID();
      await connector.query(
        `INSERT INTO media (id, tenant_id, filename, title, mime_type, size, path, url, alt, caption, description, metadata, uploaded_by, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
        [
          mediaId,
          tenantId,
          filename,
          post.post_title || filename,
          post.post_mime_type,
          fileSize,
          filePath,
          fileUrl,
          metaMap.get('_wp_attachment_image_alt') ?? null,
          post.post_excerpt || null,
          post.post_content || null,
          JSON.stringify(metadata),
          authorId,
        ]
      );
      stats['media'].created++;
    }

    // Map WP attachment ID -> OkCMS media UUID
    idMaps.media.set(post.ID, mediaId);

    // Also create content entry for attachment (handled in content mapper but ensure link)
    // The content mapper should have created a content entry with featured_image_id pointing here
  }

  /**
   * Get site URL from wp_options
   */
  private async getSiteUrl(): Promise<string> {
    const { connector } = this.deps;
    const option = await connector.getOption('siteurl') ?? await connector.getOption('home');
    return option?.option_value ?? 'http://localhost';
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
export async function migrateMedia(
  connector: WPMySQLConnector,
  config: WPMigrationConfig,
  idMaps: IDMaps,
  stats: Record<MigrationPhase, PhaseStats>,
  errors: MigrationError[],
  reportProgress: (phase: MigrationPhase, current: number, total: number) => void,
  tenantId: string,
  authorIdMap: Map<number, string>
): Promise<void> {
  if (config.skipMedia) return;

  const mapper = new MediaMapper({ connector, config, idMaps, stats, errors, reportProgress, tenantId, authorIdMap });
  await mapper.migrate();
}