// @oktis-works/api - Content Routes
import { Hono } from 'hono';
import { contentService, contentPublisher, enqueueJob } from '@oktis-works/core';
import { getConnection, resolveTenantId } from '@oktis-works/database';
import { authMiddleware, requirePermission } from '../../middleware/auth.js';
const contentRouter = new Hono();
contentRouter.use('*', authMiddleware);
/**
 * Expande o autor de um lote de conteúdo em UMA query (anti N+1).
 * O widget de atividade do dashboard consumia 1 requisição por item para
 * descobrir o autor — 10 itens = 10 chamadas a /content/:id por carregamento.
 */
async function attachAuthors(items) {
    const ids = [...new Set(items
            .map((item) => (item['author_id'] ?? item['authorId']))
            .filter((id) => typeof id === 'string' && id.length > 0))];
    if (ids.length === 0)
        return;
    const rows = await getConnection().unsafe('SELECT id, name, email, avatar FROM users WHERE id = ANY($1)', [ids]);
    const byId = new Map(rows.map((row) => [String(row['id']), row]));
    for (const item of items) {
        const authorId = (item['author_id'] ?? item['authorId']);
        const row = authorId ? byId.get(authorId) : undefined;
        const record = row;
        item['author'] = record
            ? { id: record['id'], name: record['name'], email: record['email'], avatar: record['avatar'] ?? null }
            : null;
    }
}
contentRouter.get('/singleton/:type', requirePermission('read', 'content'), async (c) => {
    const type = c.req.param('type');
    const tenantId = await resolveTenantId(String(c.get('tenantId') ?? 'default'));
    const content = await contentService.getSingleton(type, tenantId);
    return c.json({ content });
});
contentRouter.get('/', requirePermission('read', 'content'), async (c) => {
    const page = Number(c.req.query('page') ?? 1);
    const limit = Number(c.req.query('limit') ?? 20);
    const type = c.req.query('type') || undefined;
    const status = (c.req.query('status') || undefined);
    const search = c.req.query('search') || undefined;
    // ?include=author → anexa {author} a cada item em uma única query de users.
    const includeAuthor = c.req.query('include') === 'author';
    const result = await contentService.list({ page, limit, type, status, search });
    if (includeAuthor) {
        await attachAuthors(result.data);
    }
    return c.json(result);
});
contentRouter.get('/slug/:slug', requirePermission('read', 'content'), async (c) => {
    const slug = c.req.param('slug');
    const type = c.req.query('type') || undefined;
    const content = await contentService.getBySlug(slug, type);
    if (!content) {
        return c.json({ error: 'Content not found' }, 404);
    }
    return c.json(content);
});
contentRouter.get('/:id', requirePermission('read', 'content'), async (c) => {
    const id = c.req.param('id');
    const content = await contentService.getById(id);
    if (!content) {
        return c.json({ error: 'Content not found' }, 404);
    }
    return c.json(content);
});
contentRouter.post('/', requirePermission('create', 'content'), async (c) => {
    try {
        const body = await c.req.json();
        const userId = c.get('userId');
        // Depois do spread: tenant/autoridade vêm do JWT, nunca do body do cliente.
        const tenantId = await resolveTenantId(String(c.get('tenantId') ?? 'default'));
        const content = await contentService.create({
            ...body,
            tenantId,
            authorId: userId,
        });
        return c.json(content, 201);
    }
    catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to create content';
        return c.json({ error: message }, 400);
    }
});
contentRouter.put('/:id', requirePermission('update', 'content'), async (c) => {
    try {
        const id = c.req.param('id');
        const body = await c.req.json();
        const content = await contentService.update(id, body);
        if (!content) {
            return c.json({ error: 'Content not found' }, 404);
        }
        return c.json(content);
    }
    catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to update content';
        return c.json({ error: message }, 400);
    }
});
// POST /content/:id/publish — workflow real via contentPublisher
// (versionamento + hooks + eventBus + cache). `?mode=async` enfileira
// `content.publish` para o worker executar (publicação agendada/assíncrona);
// fila indisponível → degrada para síncrono (fluxo nunca quebra).
contentRouter.post('/:id/publish', requirePermission('update', 'content'), async (c) => {
    const id = c.req.param('id');
    const userId = c.get('userId');
    const tenantId = c.get('tenantId');
    const mode = c.req.query('mode');
    if (mode === 'async') {
        const scheduledAt = c.req.query('scheduledAt');
        const delay = scheduledAt ? Math.max(0, new Date(scheduledAt).getTime() - Date.now()) : undefined;
        const queued = await enqueueJob('content.publish', { contentId: id, ...(scheduledAt ? { scheduledAt } : {}) }, { userId, tenantId, delay, jobId: `content.publish:${id}` });
        if (queued) {
            return c.json({ queued: true, mode: 'async', contentId: id, ...(delay !== undefined ? { delay } : {}) }, 202);
        }
        // Fila degradada → cai para o caminho síncrono abaixo
    }
    try {
        const result = await contentPublisher.publish(id, userId);
        return c.json({ content: result.content, previousStatus: result.previousStatus, mode: 'sync' });
    }
    catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to publish content';
        const status = message === 'Content not found' ? 404 : 400;
        return c.json({ error: message }, status);
    }
});
// POST /content/:id/unpublish — PUBLISHED → DRAFT via contentPublisher (mesmo contrato do publish)
contentRouter.post('/:id/unpublish', requirePermission('update', 'content'), async (c) => {
    const id = c.req.param('id');
    const userId = c.get('userId');
    const tenantId = c.get('tenantId');
    const mode = c.req.query('mode');
    if (mode === 'async') {
        const queued = await enqueueJob('content.unpublish', { contentId: id }, { userId, tenantId, jobId: `content.unpublish:${id}` });
        if (queued) {
            return c.json({ queued: true, mode: 'async', contentId: id }, 202);
        }
    }
    try {
        const result = await contentPublisher.unpublish(id, userId);
        return c.json({ content: result.content, previousStatus: result.previousStatus, mode: 'sync' });
    }
    catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to unpublish content';
        const status = message === 'Content not found' ? 404 : 400;
        return c.json({ error: message }, status);
    }
});
contentRouter.delete('/:id', requirePermission('delete', 'content'), async (c) => {
    try {
        const id = c.req.param('id');
        const deleted = await contentService.delete(id);
        if (!deleted) {
            return c.json({ error: 'Content not found' }, 404);
        }
        return c.json({ success: true });
    }
    catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to delete content';
        return c.json({ error: message }, 400);
    }
});
contentRouter.get('/:id/versions', requirePermission('read', 'content'), async (c) => {
    const id = c.req.param('id');
    const versions = await contentService.getVersions(id);
    return c.json(versions);
});
export default contentRouter;
//# sourceMappingURL=index.js.map