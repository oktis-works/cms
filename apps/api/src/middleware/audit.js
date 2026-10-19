// @oktis-works/api - Auditoria transversal das ações HTTP do CMS
import { auditService } from '@oktis-works/core';
const RESOURCE_METHODS = {
    POST: 'create',
    PUT: 'update',
    PATCH: 'update',
    DELETE: 'delete',
};
/**
 * Registra mutações e falhas de autenticação mesmo quando uma rota não emite
 * evento de domínio. Os eventos específicos continuam sendo registrados pelo
 * EventBus, por isso o histórico contém tanto a intenção HTTP quanto o evento
 * efetivamente executado.
 */
export const auditMiddleware = async (c, next) => {
    await next();
    const method = c.req.method.toUpperCase();
    if (!RESOURCE_METHODS[method])
        return;
    const path = c.req.path;
    if (path === '/api/v1/audit-logs' || path.startsWith('/api/v1/audit-logs/'))
        return;
    const segments = path.replace(/^\/api\/v1\//, '').split('/').filter(Boolean);
    const resourceType = segments[0] ?? 'system';
    const endpoint = segments[1];
    const operation = resourceType === 'auth' && endpoint
        ? `auth.${endpoint}`
        : `${resourceType}.${RESOURCE_METHODS[method]}`;
    const action = c.res.status >= 400 ? `${operation}.failed` : operation;
    void auditService.record({
        tenantId: c.get('tenantId'),
        userId: c.get('userId'),
        action,
        resourceType,
        changes: {
            method,
            path,
            status: c.res.status,
        },
        ipAddress: c.req.header('x-forwarded-for') ?? c.req.header('x-real-ip'),
        userAgent: c.req.header('user-agent'),
    });
};
//# sourceMappingURL=audit.js.map