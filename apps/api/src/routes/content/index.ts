// @oktis-works/api - Content Routes

import { Hono } from 'hono';
import { contentService, contentPublisher, enqueueJob } from '@oktis-works/core';
import { resolveTenantId } from '@oktis-works/database';
import type { ContentStatus } from '@oktis-works/types';
import { authMiddleware, requirePermission } from '../../middleware/auth.js';

const contentRouter = new Hono();

contentRouter.use('*', authMiddleware);

contentRouter.get('/', requirePermission('read', 'content'), async (c) => {
  const page = Number(c.req.query('page') ?? 1);
  const limit = Number(c.req.query('limit') ?? 20);
  const type = c.req.query('type') || undefined;
  const status = (c.req.query('status') || undefined) as ContentStatus | undefined;
  const search = c.req.query('search') || undefined;

  const result = await contentService.list({ page, limit, type, status, search });
  return c.json(result);
});

contentRouter.get('/slug/:slug', requirePermission('read', 'content'), async (c) => {
  const slug = c.req.param('slug') as string;
  const type = c.req.query('type') || undefined;
  const content = await contentService.getBySlug(slug, type);

  if (!content) {
    return c.json({ error: 'Content not found' }, 404);
  }

  return c.json(content);
});

contentRouter.get('/:id', requirePermission('read', 'content'), async (c) => {
  const id = c.req.param('id') as string;
  const content = await contentService.getById(id);

  if (!content) {
    return c.json({ error: 'Content not found' }, 404);
  }

  return c.json(content);
});

contentRouter.post('/', requirePermission('create', 'content'), async (c) => {
  try {
    const body = await c.req.json();
    const userId = c.get('userId' as never) as string;
    // Depois do spread: tenant/autoridade vêm do JWT, nunca do body do cliente.
    const tenantId = await resolveTenantId(String(c.get('tenantId' as never) ?? 'default'));

    const content = await contentService.create({
      ...body,
      tenantId,
      authorId: userId,
    });

    return c.json(content, 201);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to create content';
    return c.json({ error: message }, 400);
  }
});

contentRouter.put('/:id', requirePermission('update', 'content'), async (c) => {
  try {
    const id = c.req.param('id') as string;
    const body = await c.req.json();

    const content = await contentService.update(id, body);

    if (!content) {
      return c.json({ error: 'Content not found' }, 404);
    }

    return c.json(content);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to update content';
    return c.json({ error: message }, 400);
  }
});

// POST /content/:id/publish — workflow real via contentPublisher
// (versionamento + hooks + eventBus + cache). `?mode=async` enfileira
// `content.publish` para o worker executar (publicação agendada/assíncrona);
// fila indisponível → degrada para síncrono (fluxo nunca quebra).
contentRouter.post('/:id/publish', requirePermission('update', 'content'), async (c) => {
  const id = c.req.param('id') as string;
  const userId = c.get('userId' as never) as string;
  const tenantId = c.get('tenantId' as never) as string | undefined;
  const mode = c.req.query('mode');

  if (mode === 'async') {
    const scheduledAt = c.req.query('scheduledAt');
    const delay = scheduledAt ? Math.max(0, new Date(scheduledAt).getTime() - Date.now()) : undefined;

    const queued = await enqueueJob(
      'content.publish',
      { contentId: id, ...(scheduledAt ? { scheduledAt } : {}) },
      { userId, tenantId, delay, jobId: `content.publish:${id}` }
    );
    if (queued) {
      return c.json({ queued: true, mode: 'async', contentId: id, ...(delay !== undefined ? { delay } : {}) }, 202);
    }
    // Fila degradada → cai para o caminho síncrono abaixo
  }

  try {
    const result = await contentPublisher.publish(id, userId);

    return c.json({ content: result.content, previousStatus: result.previousStatus, mode: 'sync' });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to publish content';
    const status = message === 'Content not found' ? 404 : 400;
    return c.json({ error: message }, status);
  }
});

// POST /content/:id/unpublish — PUBLISHED → DRAFT via contentPublisher (mesmo contrato do publish)
contentRouter.post('/:id/unpublish', requirePermission('update', 'content'), async (c) => {
  const id = c.req.param('id') as string;
  const userId = c.get('userId' as never) as string;
  const tenantId = c.get('tenantId' as never) as string | undefined;
  const mode = c.req.query('mode');

  if (mode === 'async') {
    const queued = await enqueueJob(
      'content.unpublish',
      { contentId: id },
      { userId, tenantId, jobId: `content.unpublish:${id}` }
    );
    if (queued) {
      return c.json({ queued: true, mode: 'async', contentId: id }, 202);
    }
  }

  try {
    const result = await contentPublisher.unpublish(id, userId);

    return c.json({ content: result.content, previousStatus: result.previousStatus, mode: 'sync' });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to unpublish content';
    const status = message === 'Content not found' ? 404 : 400;
    return c.json({ error: message }, status);
  }
});

contentRouter.delete('/:id', requirePermission('delete', 'content'), async (c) => {
  try {
    const id = c.req.param('id') as string;
    const deleted = await contentService.delete(id);

    if (!deleted) {
      return c.json({ error: 'Content not found' }, 404);
    }

    return c.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to delete content';
    return c.json({ error: message }, 400);
  }
});

contentRouter.get('/:id/versions', requirePermission('read', 'content'), async (c) => {
  const id = c.req.param('id') as string;
  const versions = await contentService.getVersions(id);
  return c.json(versions);
});

/**
 * POST /content/:id/publish — fluxo real do publisher: hooks before/after,
 * version snapshot (revisions), eventBus (content.published) e invalidação de cache.
 */
contentRouter.post('/:id/publish', requirePermission('update', 'content'), async (c) => {
  try {
    const id = c.req.param('id') as string;
    const userId = c.get('userId' as never) as string;

    const result = await contentPublisher.publish(id, userId);

    return c.json({ content: result.content, previousStatus: result.previousStatus });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to publish content';
    const status = message === 'Content not found' ? 404 : 400;
    return c.json({ error: message }, status);
  }
});

/** POST /content/:id/unpublish — PUBLISHED → DRAFT com snapshot + evento + cache. */
contentRouter.post('/:id/unpublish', requirePermission('update', 'content'), async (c) => {
  try {
    const id = c.req.param('id') as string;
    const userId = c.get('userId' as never) as string;

    const result = await contentPublisher.unpublish(id, userId);

    return c.json({ content: result.content, previousStatus: result.previousStatus });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to unpublish content';
    const status = message === 'Content not found' ? 404 : 400;
    return c.json({ error: message }, status);
  }
});

export default contentRouter;
