import { Hono } from 'hono';
import type { Context } from 'hono';
import { mediaService, enqueueJob } from '@oktis-works/core';
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
      let url = body.url;
      // Normaliza URL relativa se vier absoluta (evita host do admin em prod)
      if (url && url.startsWith('http')) {
        try {
          const u = new URL(url);
          url = u.pathname + u.search;
        } catch {
          // mantém original se falhar
        }
      }
      const result = await mediaService.create({
        tenantId,
        filename: body.filename,
        title: body.title,
        mimeType: body.mimeType,
        size: body.size,
        path: body.path,
        url,
        alt: body.alt,
        caption: body.caption,
        description: body.description,
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

    const result = await mediaService.create({
      tenantId,
      filename: file.name,
      title: typeof body['title'] === 'string' && body['title'].trim() ? body['title'] : file.name,
      mimeType: file.type || mimeFor(file.name),
      size: stored.size,
      path: stored.path,
      // URL relativa ao host público — funciona tanto no admin (via proxy /api/) quanto no site
      url: `/api/v1/media/file/${stored.path}`,
      alt: typeof body['alt'] === 'string' ? body['alt'] : undefined,
      caption: typeof body['caption'] === 'string' ? body['caption'] : undefined,
      description: typeof body['description'] === 'string' ? body['description'] : undefined,
      uploadedBy: userId,
    });

    // A3: processamento de imagem no worker (thumbnail + compress). Fila
    // opcional — sem Redis o upload continua válido (degradação silenciosa).
    // Row cru vem snake_case do RETURNING *.
    const row = result as unknown as Record<string, unknown>;
    const mimeType = String(row['mime_type'] ?? row['mimeType'] ?? '');
    if (mimeType.startsWith('image/') && !mimeType.includes('svg')) {
      void enqueueJob(
        'media.process',
        {
          mediaId: result.id,
          operations: [
            { type: 'thumbnail', options: { width: 300 } },
            { type: 'compress', options: { quality: 80 } },
          ],
        },
        { tenantId, userId }
      );
    }

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

/** Substitui o arquivo mantendo o mesmo anexo e seus metadados editoriais. */
router.put('/:id/file', requirePermission('update', 'media'), async (c) => {
  let replacementPath: string | undefined;
  try {
    const id = c.req.param('id') as string;
    const existing = await mediaService.getById(id);
    if (!existing) return c.json({ error: 'Media not found' }, 404);

    const body = await c.req.parseBody();
    const file = body['file'];
    if (!(file instanceof File)) return c.json({ error: 'Missing file field "file"' }, 400);
    if (file.size === 0) return c.json({ error: 'Empty file' }, 400);
    if (file.size > MAX_UPLOAD_BYTES) return c.json({ error: `File too large (max ${MAX_UPLOAD_BYTES} bytes)` }, 413);

    const existingRow = existing as unknown as Record<string, unknown>;
    const tenantId = String(c.get('tenantId' as never) ?? existingRow['tenant_id'] ?? existing.tenantId ?? 'default');
    const resolvedTenantId = await resolveTenantId(tenantId);
    const stored = await saveUpload(resolvedTenantId, file.name, new Uint8Array(await file.arrayBuffer()));
    replacementPath = stored.path;

    const updated = await mediaService.replaceFile(id, {
      filename: file.name,
      mimeType: file.type || mimeFor(file.name),
      size: stored.size,
      path: stored.path,
      url: `/api/v1/media/file/${stored.path}`,
    });
    if (!updated) {
      await removeUpload(stored.path);
      replacementPath = undefined;
      return c.json({ error: 'Media not found' }, 404);
    }

    if (existing.path && isSafeStoredPath(existing.path)) await removeUpload(existing.path);

    const mimeType = String((updated as unknown as Record<string, unknown>)['mime_type'] ?? '');
    if (mimeType.startsWith('image/') && !mimeType.includes('svg')) {
      void enqueueJob(
        'media.process',
        { mediaId: updated.id, operations: [{ type: 'thumbnail', options: { width: 300 } }, { type: 'compress', options: { quality: 80 } }] },
        { tenantId: resolvedTenantId, userId: c.get('userId' as never) as string }
      );
    }

    replacementPath = undefined;
    return c.json(updated);
  } catch (error) {
    if (replacementPath) await removeUpload(replacementPath);
    const message = error instanceof Error ? error.message : 'Failed to replace media file';
    return c.json({ error: message }, 400);
  }
});

/** Edição de alt/caption/metadata (sem reupload). */
router.put('/:id', requirePermission('update', 'media'), async (c) => {
  try {
    const id = c.req.param('id') as string;
    const body = await c.req.json();

    const updateInput: {
      title?: string;
      alt?: string;
      caption?: string;
      description?: string;
      metadata?: Record<string, unknown>;
    } = {
      alt: body.alt,
      caption: body.caption,
      metadata: body.metadata,
    };
    if (body.title !== undefined) updateInput.title = body.title;
    if (body.description !== undefined) updateInput.description = body.description;

    const result = await mediaService.update(id, updateInput);
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
