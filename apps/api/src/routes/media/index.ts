import { Hono } from 'hono';
import { mediaService } from '@oktis-works/core';
import { authMiddleware, requirePermission } from '../../middleware/auth.js';

const router = new Hono();

router.use('*', authMiddleware);

router.get('/', requirePermission('read', 'media'), async (c) => {
  const page = Number(c.req.query('page') ?? 1);
  const limit = Number(c.req.query('limit') ?? 20);
  const mimeType = c.req.query('mimeType') || undefined;
  const search = c.req.query('search') || undefined;

  const result = await mediaService.list({ page, limit, mimeType, search });
  return c.json(result);
});

router.post('/', requirePermission('upload', 'media'), async (c) => {
  try {
    const body = await c.req.json();
    const userId = c.get('userId' as never) as string;

    const result = await mediaService.create({
      filename: body.filename,
      mimeType: body.mimeType,
      size: body.size,
      path: body.path,
      url: body.url,
      alt: body.alt,
      caption: body.caption,
      metadata: body.metadata,
      uploadedBy: userId,
    });
    return c.json(result, 201);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to upload media';
    return c.json({ error: message }, 400);
  }
});

router.get('/:id', requirePermission('read', 'media'), async (c) => {
  const id = c.req.param('id') as string;
  const result = await mediaService.getById(id);
  if (!result) return c.json({ error: 'Media not found' }, 404);
  return c.json(result);
});

router.delete('/:id', requirePermission('delete', 'media'), async (c) => {
  const id = c.req.param('id') as string;
  const deleted = await mediaService.delete(id);
  if (!deleted) return c.json({ error: 'Media not found' }, 404);
  return c.json({ success: true });
});

export default router;
