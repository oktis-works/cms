// @oktis-works/api - API Keys (CRUD + revogação)
//
// A key em claro é retornada SOMENTE no POST de criação. Daí em diante só
// existe o hash; clientes trocam a key por JWT em POST /api/v1/auth/api-key-login.
import { Hono } from 'hono';
import { ApiKeyService } from '@oktis-works/auth';
import { getConnection } from '@oktis-works/database';
import { authMiddleware, requirePermission } from '../../middleware/auth.js';
const apiKeyService = new ApiKeyService();
const router = new Hono();
router.use('*', authMiddleware);
/** Shape seguro para respostas — nunca inclui key_hash. */
function publicApiKey(key) {
    return {
        id: key.id,
        tenant_id: key.tenantId,
        user_id: key.userId,
        name: key.name,
        key_prefix: key.keyPrefix,
        one_time: key.oneTime,
        expires_at: key.expiresAt ?? null,
        last_used_at: key.lastUsedAt ?? null,
        use_count: key.useCount,
        revoked_at: key.revokedAt ?? null,
        created_by: key.createdBy ?? null,
        created_at: key.createdAt,
    };
}
router.get('/', requirePermission('read', 'apikey'), async (c) => {
    const tenantId = String(c.get('tenantId') ?? 'default');
    const keys = await apiKeyService.list(tenantId);
    return c.json(keys.map(publicApiKey));
});
router.post('/', requirePermission('create', 'apikey'), async (c) => {
    try {
        const body = await c.req.json();
        const sql = getConnection();
        const tenantId = String(c.get('tenantId') ?? 'default');
        const name = typeof body['name'] === 'string' ? body['name'].trim() : '';
        // Identidade que a key assume: padrão é o usuário que está criando.
        const userId = typeof body['userId'] === 'string' && body['userId'].trim()
            ? body['userId'].trim()
            : String(c.get('userId') ?? '');
        const oneTime = body['oneTime'] === true;
        const expiresAtRaw = body['expiresAt'];
        const expiresAt = typeof expiresAtRaw === 'string' && expiresAtRaw.trim()
            ? new Date(expiresAtRaw)
            : null;
        if (!name)
            return c.json({ error: 'Name is required' }, 400);
        if (!userId)
            return c.json({ error: 'User is required' }, 400);
        if (expiresAt && Number.isNaN(expiresAt.getTime())) {
            return c.json({ error: 'Invalid expiresAt' }, 400);
        }
        // O usuário precisa pertencer ao tenant (RLS bloqueia o INSERT de qualquer
        // forma, mas um 400 explícito é uma melhor mensagem).
        const owner = await sql.unsafe(`SELECT u.id FROM users u
       JOIN tenant_users tu ON tu.user_id = u.id
       WHERE u.id = $1 AND tu.tenant_id = $2 AND tu.status = 'ACTIVE'`, [userId, tenantId]);
        if (!owner[0])
            return c.json({ error: 'User does not belong to this tenant' }, 400);
        const created = await apiKeyService.create({
            tenantId,
            userId,
            name,
            oneTime,
            expiresAt,
            createdBy: String(c.get('userId') ?? ''),
        });
        return c.json({ ...publicApiKey(created), plaintext: created.plaintext }, 201);
    }
    catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to create API key';
        return c.json({ error: message }, 400);
    }
});
router.delete('/:id', requirePermission('delete', 'apikey'), async (c) => {
    const id = c.req.param('id');
    if (!id)
        return c.json({ error: 'Missing key id' }, 400);
    const tenantId = String(c.get('tenantId') ?? 'default');
    const revoked = await apiKeyService.revoke(id, tenantId);
    if (!revoked)
        return c.json({ error: 'API key not found or already revoked' }, 404);
    return c.json({ success: true });
});
export default router;
//# sourceMappingURL=index.js.map