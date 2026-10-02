// @oktis-works/api - Content Types Routes (Custom Post Types)

import { Hono } from 'hono';
import { postTypeRegistry } from '@oktis-works/core';
import { authMiddleware, requirePermission } from '../../middleware/auth.js';

const router = new Hono();

router.use('*', authMiddleware);

router.get('/', requirePermission('read', 'content'), async (c) => {
  const result = await postTypeRegistry.list();
  return c.json(result);
});

router.get('/:slug', requirePermission('read', 'content'), async (c) => {
  const slug = c.req.param('slug') as string;
  const result = await postTypeRegistry.getBySlug(slug);
  if (!result) return c.json({ error: 'Content type not found' }, 404);
  return c.json(result);
});

router.post('/', requirePermission('create', 'content'), async (c) => {
  try {
    const body = await c.req.json();
    const result = await postTypeRegistry.create({
      name: body.name,
      slug: body.slug,
      pluralLabel: body.pluralLabel,
      singularLabel: body.singularLabel,
      supports: body.supports,
      hasArchive: body.hasArchive,
      menuIcon: body.menuIcon,
      source: 'ADMIN',
    });
    return c.json(result, 201);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to create content type';
    return c.json({ error: message }, 400);
  }
});

router.put('/:slug', requirePermission('update', 'content'), async (c) => {
  try {
    const slug = c.req.param('slug') as string;
    const body = await c.req.json();
    const result = await postTypeRegistry.update(slug, {
      pluralLabel: body.pluralLabel,
      singularLabel: body.singularLabel,
      supports: body.supports,
      hasArchive: body.hasArchive,
      menuIcon: body.menuIcon,
    });
    return c.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to update content type';
    return c.json({ error: message }, 400);
  }
});

router.delete('/:slug', requirePermission('delete', 'content'), async (c) => {
  try {
    const slug = c.req.param('slug') as string;
    const deleted = await postTypeRegistry.delete(slug);
    if (!deleted) return c.json({ error: 'Content type not found' }, 404);
    return c.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to delete content type';
    return c.json({ error: message }, 400);
  }
});

export default router;
