import { Hono } from 'hono';
import type { Context } from 'hono';
import { mediaService } from '@oktis-works/core';
import { resolveTenantId } from '@oktis-works/database';
import { authMiddleware, requirePermission } from '../../middleware/auth.js';
import {
  MAX_UPLOAD_BYTES,
  isSafeSegment,
  isSafeStoredPath,
  mimeFor,
  readUpload,
  removeUpload,
  saveUpload,
} from '../../storage.js';

const router = new Hono();

// GET /file/* é o asset público do site (tema/web sem token — o nome aleatório
// do arquivo é o "segredo"); todo o resto passa pela sessão. O regex cobre o
// path montado (/api/v1/media/file/...) e a rota chamada direto nos testes.
router.use('*', async (c, next) => {
  if (c.req.method === 'GET' && /^\/(?:api\/v1\/media\/)?file\/[^/]+\/[^/]+$/.test(c.req.path)) {
    return next();
  }
  return authMiddleware(c, next);
});

/**
 * Servir o arquivo do disco (sem DB/RLS): <uploadDir>/<tenant>/<filename>.
 * Cache imutável — o nome tem uuid, arquivo novo = URL nova.
 */
router.get('/file/:tenant/:filename', async (c) => {
  const tenant = c.req.param('tenant') as string;
  const filename = c.req.param('filename') as string;

  if (!isSafeSegment(tenant) || !isSafeStoredPath(`${tenant}/${filename}`)) {
    return c.notFound();
  }

  const data = await readUpload(`${tenant}/${filename}`);
  if (!data) return c.notFound();

  return c.body(new Uint8Array(data), 200, {
    'Content-Type': mimeFor(filename),
    'Cache-Control': 'public, max-age=31536000, immutable',
  });
});

/**
 * Upload real: multipart FormData ({file, alt?, caption?}) — o que o
 * api-client (`uploadMedia`) e a página /media da admin enviam. O JSON puro
 * (metadados já existentes no disco) continua aceito em POST / para
 * compatibilidade.
 */
async function handleUpload(c: Context): Promise<Response> {
  const contentType = c.req.header('content-type') ?? '';

  if (!contentType.includes('multipart/form-data')) {
    // Legado: JSON com metadados (path/url apontam para arquivo já existente)
    try {
      const body = await c.req.json();
      const userId = c.get('userId' as never) as string;
      const tenantId = await resolveTenantId(String(c.get('tenantId') ?? 'default'));
      const result = await mediaService.create({
        tenantId,
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
  }

  try {
    const body = await c.req.parseBody();
    const file = body['file'];

    if (!(file instanceof File)) {
      return c.json({ error: 'Missing file field "file"' }, 400);
    }
    if (file.size === 0) {
      return c.json({ error: 'Empty file' }, 400);
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      return c.json({ error: `File too large (max ${MAX_UPLOAD_BYTES} bytes)` }, 413);
    }

    const rawTenant = String(c.get('tenantId') ?? 'default');
    const tenantId = await resolveTenantId(rawTenant);
    const userId = c.get('userId' as never) as string;

    const data = new Uint8Array(await file.arrayBuffer());
    const stored = await saveUpload(tenantId, file.name, data);
    const origin = new URL(c.req.url).origin;

    const result = await mediaService.create({
      tenantId,
      filename: file.name,
      mimeType: file.type || mimeFor(file.name),
      size: stored.size,
      path: stored.path,
      url: `${origin}/api/v1/media/file/${stored.path}`,
      alt: typeof body['alt'] === 'string' ? body['alt'] : undefined,
      caption: typeof body['caption'] === 'string' ? body['caption'] : undefined,
      uploadedBy: userId,
    });

    return c.json(result, 201);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to upload media';
    return c.json({ error: message }, 400);
  }
}

router.post('/upload', requirePermission('upload', 'media'), handleUpload);
router.post('/', requirePermission('upload', 'media'), handleUpload);

router.get('/', requirePermission('read', 'media'), async (c) => {
  const page = Number(c.req.query('page') ?? 1);
  const limit = Number(c.req.query('limit') ?? 20);
  const mimeType = c.req.query('mimeType') || undefined;
  const search = c.req.query('search') || undefined;

  const result = await mediaService.list({ page, limit, mimeType, search });
  return c.json(result);
});

router.get('/:id', requirePermission('read', 'media'), async (c) => {
  const id = c.req.param('id') as string;
  const result = await mediaService.getById(id);
  if (!result) return c.json({ error: 'Media not found' }, 404);
  return c.json(result);
});

/** Edição de alt/caption/metadata (sem reupload). */
router.put('/:id', requirePermission('update', 'media'), async (c) => {
  try {
    const id = c.req.param('id') as string;
    const body = await c.req.json();

    const result = await mediaService.update(id, {
      alt: body.alt,
      caption: body.caption,
      metadata: body.metadata,
    });
    if (!result) return c.json({ error: 'Media not found' }, 404);
    return c.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to update media';
    return c.json({ error: message }, 400);
  }
});

router.delete('/:id', requirePermission('delete', 'media'), async (c) => {
  const id = c.req.param('id') as string;
  const existing = await mediaService.getById(id);
  if (!existing) return c.json({ error: 'Media not found' }, 404);

  const deleted = await mediaService.delete(id);
  if (!deleted) return c.json({ error: 'Media not found' }, 404);

  if (existing.path && isSafeStoredPath(existing.path)) {
    await removeUpload(existing.path);
  }
  return c.json({ success: true });
});

export default router;
