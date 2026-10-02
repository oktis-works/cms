// @oktis-works/api - Taxonomies Routes (Custom Taxonomies + Terms + Attach)

import { Hono } from 'hono';
import { taxonomyService } from '@oktis-works/core';
import { authMiddleware, requirePermission } from '../../middleware/auth.js';

const router = new Hono();

router.use('*', authMiddleware);

router.get('/', requirePermission('read', 'category'), async (c) => {
  const result = await taxonomyService.list();
  return c.json(result);
});

router.get('/:slug', requirePermission('read', 'category'), async (c) => {
  const slug = c.req.param('slug') as string;
  const result = await taxonomyService.getBySlug(slug);
  if (!result) return c.json({ error: 'Taxonomy not found' }, 404);
  return c.json(result);
});

router.post('/', requirePermission('create', 'category'), async (c) => {
  try {
    const body = await c.req.json();
    const result = await taxonomyService.create({
      name: body.name,
      slug: body.slug,
      hierarchical: body.hierarchical,
      attachTo: body.attachTo,
      labels: body.labels,
      meta: body.meta,
      source: 'ADMIN',
    });
    return c.json(result, 201);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to create taxonomy';
    return c.json({ error: message }, 400);
  }
});

router.put('/:slug', requirePermission('update', 'category'), async (c) => {
  try {
    const slug = c.req.param('slug') as string;
    const body = await c.req.json();
    const result = await taxonomyService.update(slug, {
      name: body.name,
      hierarchical: body.hierarchical,
      attachTo: body.attachTo,
      labels: body.labels,
      meta: body.meta,
    });
    if (!result) return c.json({ error: 'Taxonomy not found' }, 404);
    return c.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to update taxonomy';
    return c.json({ error: message }, 400);
  }
});

router.delete('/:slug', requirePermission('delete', 'category'), async (c) => {
  const slug = c.req.param('slug') as string;
  const deleted = await taxonomyService.delete(slug);
  if (!deleted) return c.json({ error: 'Taxonomy not found' }, 404);
  return c.json({ success: true });
});

// Attach/detach taxonomy to content type
router.post('/:slug/attach', requirePermission('update', 'category'), async (c) => {
  try {
    const slug = c.req.param('slug') as string;
    const body = await c.req.json();
    await taxonomyService.attach(body.contentType, slug);
    return c.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to attach taxonomy';
    return c.json({ error: message }, 400);
  }
});

router.post('/:slug/detach', requirePermission('update', 'category'), async (c) => {
  try {
    const slug = c.req.param('slug') as string;
    const body = await c.req.json();
    await taxonomyService.detach(body.contentType, slug);
    return c.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to detach taxonomy';
    return c.json({ error: message }, 400);
  }
});

// Terms
router.get('/:slug/terms', requirePermission('read', 'category'), async (c) => {
  const slug = c.req.param('slug') as string;
  const result = await taxonomyService.listTerms(slug);
  return c.json(result);
});

router.post('/:slug/terms', requirePermission('create', 'category'), async (c) => {
  try {
    const slug = c.req.param('slug') as string;
    const body = await c.req.json();
    const result = await taxonomyService.createTerm(slug, {
      name: body.name,
      slug: body.slug,
      description: body.description,
      parentId: body.parentId,
      meta: body.meta,
    });
    return c.json(result, 201);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to create term';
    return c.json({ error: message }, 400);
  }
});

export default router;
