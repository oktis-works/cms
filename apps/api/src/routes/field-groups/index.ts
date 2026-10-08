// @oktis-works/api - Field Groups Routes (Builder + Location Rules + Import/Export)

import { Hono } from 'hono';
import { fieldGroupService } from '@oktis-works/core';
import { authMiddleware, requirePermission } from '../../middleware/auth.js';

const router = new Hono();

router.use('*', authMiddleware);

router.get('/', requirePermission('read', 'content'), async (c) => {
  const type = c.req.query('type');
  if (type) {
      const resolved = await fieldGroupService.resolveGroupsByLocation({
        contentType: type,
        contentSlug: c.req.query('slug') || undefined,
      taxonomy: c.req.query('taxonomy') || undefined,
      termSlug: c.req.query('term') || undefined,
      userRole: c.req.query('userRole') || undefined,
      pageTemplate: c.req.query('template') || undefined,
      postStatus: c.req.query('status') || undefined,
    });
    return c.json(resolved);
  }
  const result = await fieldGroupService.list();
  return c.json(result);
});

router.get('/:id', requirePermission('read', 'content'), async (c) => {
  const id = c.req.param('id') as string;
  const result = await fieldGroupService.getById(id);
  if (!result) return c.json({ error: 'Field group not found' }, 404);
  return c.json(result);
});

/** Exporta um field group como JSON portável (chave = group.key). */
router.get('/:id/export', requirePermission('read', 'content'), async (c) => {
  const id = c.req.param('id') as string;
  const group = await fieldGroupService.getById(id);
  if (!group) return c.json({ error: 'Field group not found' }, 404);

  const exportData = {
    key: group.key,
    title: group.title,
    locationRules: group.locationRules ?? [],
    position: group.position ?? 'normal',
    displayStyle: group.displayStyle ?? 'standard',
    active: group.active !== false,
    metadata: group.metadata ?? {},
    fields: (group.fields ?? []).map((f) => ({
      type: f.type,
      name: f.name,
      key: f.key,
      label: f.label,
      instructions: f.instructions ?? null,
      required: f.required ?? false,
      config: f.config ?? {},
      conditionalLogic: f.conditionalLogic ?? null,
      sortOrder: f.sortOrder ?? 0,
      subFields: (f.subFields ?? []).map((sf) => ({
        type: sf.type,
        name: sf.name,
        key: sf.key,
        label: sf.label,
        instructions: sf.instructions ?? null,
        required: sf.required ?? false,
        config: sf.config ?? {},
        conditionalLogic: sf.conditionalLogic ?? null,
        sortOrder: sf.sortOrder ?? 0,
        subFields: (sf.subFields ?? []).map((ssf) => ({
          type: ssf.type,
          name: ssf.name,
          key: ssf.key,
          label: ssf.label,
          instructions: ssf.instructions ?? null,
          required: ssf.required ?? false,
          config: ssf.config ?? {},
          conditionalLogic: ssf.conditionalLogic ?? null,
          sortOrder: ssf.sortOrder ?? 0,
          subFields: [],
        })),
      })),
      layouts: (f.layouts ?? []).map((layout) => ({
        name: layout.name,
        label: layout.label ?? null,
        display: layout.display ?? 'block',
        min: layout.min ?? null,
        max: layout.max ?? null,
        subFields: (layout.subFields ?? []).map((lsf) => ({
          type: lsf.type,
          name: lsf.name,
          key: lsf.key,
          label: lsf.label,
          instructions: lsf.instructions ?? null,
          required: lsf.required ?? false,
          config: lsf.config ?? {},
          conditionalLogic: lsf.conditionalLogic ?? null,
          sortOrder: lsf.sortOrder ?? 0,
          subFields: (lsf.subFields ?? []).map((lssf) => ({
            type: lssf.type,
            name: lssf.name,
            key: lssf.key,
            label: lssf.label,
            instructions: lssf.instructions ?? null,
            required: lssf.required ?? false,
            config: lssf.config ?? {},
            conditionalLogic: lssf.conditionalLogic ?? null,
            sortOrder: lssf.sortOrder ?? 0,
            subFields: [],
          })),
        })),
      })),
    })),
  };

  c.header('Content-Type', 'application/json');
  c.header('Content-Disposition', `attachment; filename="${group.key}.json"`);
  return c.body(JSON.stringify(exportData, null, 2));
});

/** Importa field groups a partir de JSON (array ou objeto único). Usa group.key para upsert idempotente. */
router.post('/import', requirePermission('create', 'content'), async (c) => {
  try {
    const body = await c.req.json();
    const items = Array.isArray(body) ? body : [body];

    const results = [];
    for (const item of items) {
      if (!item || !item.key || !item.title) {
        results.push({ key: item?.key ?? 'unknown', success: false, error: 'Missing key or title' });
        continue;
      }
      // Check if group with this key exists
      const existing = await fieldGroupService.getByKey(item.key);
      const payload = {
        title: item.title,
        key: item.key,
        locationRules: item.locationRules ?? [],
        position: item.position ?? 'normal',
        displayStyle: item.displayStyle ?? 'standard',
        active: item.active !== false,
        metadata: item.metadata ?? {},
        fields: item.fields ?? [],
      };
      let group;
      if (existing) {
        group = await fieldGroupService.update(existing.id, payload);
        results.push({ key: item.key, success: true, action: 'updated', id: group?.id });
      } else {
        group = await fieldGroupService.create(payload);
        results.push({ key: item.key, success: true, action: 'created', id: group?.id });
      }
    }
    return c.json({ results });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to import field groups';
    return c.json({ error: message }, 400);
  }
});

router.post('/', requirePermission('create', 'content'), async (c) => {
  try {
    const body = await c.req.json();
    const result = await fieldGroupService.create({
      title: body.title,
      key: body.key,
      locationRules: body.locationRules,
      position: body.position,
      displayStyle: body.displayStyle,
      active: body.active,
      metadata: body.metadata,
      fields: body.fields,
    });
    return c.json(result, 201);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to create field group';
    return c.json({ error: message }, 400);
  }
});

router.put('/:id', requirePermission('update', 'content'), async (c) => {
  try {
    const id = c.req.param('id') as string;
    const body = await c.req.json();
    const result = await fieldGroupService.update(id, {
      title: body.title,
      locationRules: body.locationRules,
      position: body.position,
      displayStyle: body.displayStyle,
      active: body.active,
      metadata: body.metadata,
      fields: body.fields,
    });
    if (!result) return c.json({ error: 'Field group not found' }, 404);
    return c.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to update field group';
    return c.json({ error: message }, 400);
  }
});

router.delete('/:id', requirePermission('delete', 'content'), async (c) => {
  const id = c.req.param('id') as string;
  const deleted = await fieldGroupService.delete(id);
  if (!deleted) return c.json({ error: 'Field group not found' }, 404);
  return c.json({ success: true });
});

export default router;
