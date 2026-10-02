// @oktis-works/api - Content Routes

import { Hono } from 'hono';
import { contentService } from '@oktis-works/core';
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

    const content = await contentService.create({
      ...body,
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

export default contentRouter;
