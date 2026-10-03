// @oktis-works/api - Shared typed-content collection router factory
// Elimina duplicação entre /posts e /pages (mesmo contrato, type diferente).

import { Hono } from 'hono';
import { contentService } from '@oktis-works/core';
import { resolveTenantId } from '@oktis-works/database';
import type { ContentStatus } from '@oktis-works/types';
import { authMiddleware, requirePermission } from '../../middleware/auth.js';

export interface ContentCollectionConfig {
  /** Valor do discriminador `type` no serviço de conteúdo (ex.: 'post', 'page'). */
  type: string;
  /** Nome em minúsculo para mensagens de erro (ex.: 'post'). */
  name: string;
}

export function createContentCollectionRouter(config: ContentCollectionConfig): Hono {
  const Label = config.name.charAt(0).toUpperCase() + config.name.slice(1);
  const router = new Hono();

  router.use('*', authMiddleware);

  // GET / - List
  router.get('/', requirePermission('read', 'content'), async (c) => {
    const page = Number(c.req.query('page') ?? 1);
    const limit = Number(c.req.query('limit') ?? 20);
    const status = (c.req.query('status') || undefined) as ContentStatus | undefined;
    const search = c.req.query('search') || undefined;

    const result = await contentService.list({ page, limit, type: config.type, status, search });
    return c.json(result);
  });

  // POST / - Create
  router.post('/', requirePermission('create', 'content'), async (c) => {
    try {
      const body = await c.req.json();
      const userId = c.get('userId' as never) as string;
      // Depois do spread: tenant/autoridade vêm do JWT, nunca do body do cliente.
      const tenantId = await resolveTenantId(String(c.get('tenantId' as never) ?? 'default'));

      const content = await contentService.create({
        ...body,
        tenantId,
        type: config.type,
        authorId: userId,
      });

      return c.json(content, 201);
    } catch (error) {
      const message = error instanceof Error ? error.message : `Failed to create ${config.name}`;
      return c.json({ error: message }, 400);
    }
  });

  // GET /:id - Get by ID
  router.get('/:id', requirePermission('read', 'content'), async (c) => {
    const id = c.req.param('id') as string;
    const content = await contentService.getById(id);

    if (!content || content.type !== config.type) {
      return c.json({ error: `${Label} not found` }, 404);
    }

    return c.json(content);
  });

  // PUT /:id - Update
  router.put('/:id', requirePermission('update', 'content'), async (c) => {
    try {
      const id = c.req.param('id') as string;
      const body = await c.req.json();

      const content = await contentService.update(id, body);

      if (!content) {
        return c.json({ error: `${Label} not found` }, 404);
      }

      return c.json(content);
    } catch (error) {
      const message = error instanceof Error ? error.message : `Failed to update ${config.name}`;
      return c.json({ error: message }, 400);
    }
  });

  // GET /:id/revisions - Revision history (WP-style)
  router.get('/:id/revisions', requirePermission('read', 'content'), async (c) => {
    const id = c.req.param('id') as string;
    const content = await contentService.getById(id);

    if (!content || content.type !== config.type) {
      return c.json({ error: `${Label} not found` }, 404);
    }

    const revisions = await contentService.getRevisions(id);
    return c.json({ data: revisions, count: revisions.length });
  });

  // POST /:id/revisions/:revisionId/restore - Restore a revision
  router.post('/:id/revisions/:revisionId/restore', requirePermission('update', 'content'), async (c) => {
    try {
      const id = c.req.param('id') as string;
      const revisionId = c.req.param('revisionId') as string;

      const restored = await contentService.restoreRevision(id, revisionId);

      if (!restored) {
        return c.json({ error: `Revision not found` }, 404);
      }

      return c.json(restored);
    } catch (error) {
      const message = error instanceof Error ? error.message : `Failed to restore revision`;
      return c.json({ error: message }, 400);
    }
  });

  // DELETE /:id - Delete
  router.delete('/:id', requirePermission('delete', 'content'), async (c) => {
    try {
      const id = c.req.param('id') as string;
      const deleted = await contentService.delete(id);

      if (!deleted) {
        return c.json({ error: `${Label} not found` }, 404);
      }

      return c.json({ success: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : `Failed to delete ${config.name}`;
      return c.json({ error: message }, 400);
    }
  });

  return router;
}
