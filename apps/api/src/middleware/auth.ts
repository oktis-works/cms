// @oktis-works/api - Authentication Middleware (Bearer + HttpOnly cookie via hono/cookie)

import type { Context, Next } from 'hono';
import { getCookie } from 'hono/cookie';
import { AuthService } from '@oktis-works/auth';
import { loadConfig } from '@oktis-works/config';
import { runWithTenantTransaction } from '@oktis-works/database';

const config = loadConfig();
const authService = new AuthService(config.auth);

export const authMiddleware = async (c: Context, next: Next) => {
  // Bearer primeiro (clientes API-first), depois cookie HttpOnly (admin/navegador)
  const authHeader = c.req.header('Authorization');
  const cookieToken = getCookie(c, 'access_token');

  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : cookieToken;

  if (!token) {
    return c.json({ error: 'Missing or invalid authorization header/cookie' }, 401);
  }

  const payload = await authService.verifyToken(token);

  if (!payload) {
    return c.json({ error: 'Invalid or expired token' }, 401);
  }

  // Set user context
  c.set('userId', payload.sub);
  c.set('userEmail', payload.email);
  c.set('tenantId', payload.tenantId);
  c.set('userRoles', payload.roles);

  // O tenant efetivo vem da sessão assinada, nunca do header/query controlado
  // pelo cliente. A transação mantém o RLS correto em todas as consultas desta
  // requisição, inclusive quando o pool troca de conexão.
  if (!payload.tenantId) return c.json({ error: 'Token has no tenant' }, 401);
  return runWithTenantTransaction(payload.tenantId, () => next());
};

export const requirePermission = (action: string, resource: string) => {
  return async (c: Context, next: Next) => {
    const userRoles = c.get('userRoles') as string[];

    if (!authService.hasPermission(userRoles, action, resource)) {
      return c.json({ error: 'Insufficient permissions' }, 403);
    }

    await next();
  };
};
