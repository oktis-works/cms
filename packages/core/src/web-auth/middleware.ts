// @oktis-works/core - Web Auth Middleware

import type { Context, Next, MiddlewareHandler } from 'hono';
import { getCookie } from 'hono/cookie';
import { AuthService } from '@oktis-works/auth';
import { loadConfig } from '@oktis-works/config';
import { runWithTenantTransaction } from '@oktis-works/database';
import { runWithUserContext } from './context.js';
import type { WebAuthMiddlewareOptions, UserContext } from './types.js';

const config = loadConfig();
const authService = new AuthService(config.auth);

interface WebAuthVariables {
  userId?: string;
  userEmail?: string;
  tenantId?: string;
  userRoles?: string[];
}

function _isBrowserRequest(c: Context): boolean {
  return Boolean(c.req.header('Origin') || c.req.header('Sec-Fetch-Site'));
}

// Generic middleware that works with any Env that includes WebAuthVariables
export function webAuthMiddleware<Env extends { Variables: WebAuthVariables & Record<string, unknown> }>(
  options: WebAuthMiddlewareOptions = {}
): MiddlewareHandler<Env> {
  const { optional = true } = options;

  return (async function (
    c: Context<Env>,
    next: Next
  ): Promise<void | Response> {
    const authHeader = c.req.header('Authorization');
    const cookieToken = getCookie(c, 'access_token');

    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : cookieToken;

    if (!token) {
      if (optional) {
        return next();
      }
      return c.json({ error: 'Missing or invalid authorization header/cookie' }, 401);
    }

    const payload = await authService.verifyToken(token);

    if (!payload) {
      if (optional) {
        return next();
      }
      return c.json({ error: 'Invalid or expired token' }, 401);
    }

    const userContext: UserContext = {
      userId: payload.sub,
      userEmail: payload.email,
      tenantId: payload.tenantId,
      userRoles: payload.roles,
    };

    const tenantId = payload.tenantId;
    if (!tenantId) {
      if (optional) {
        return next();
      }
      return c.json({ error: 'Token has no tenant' }, 401);
    }

    // Use runWithTenantTransaction to set BOTH app.current_tenant_id AND app.current_user_id in Postgres
    // This enables RLS policies like: USING (user_id = current_user_id())
    return runWithTenantTransaction(tenantId, () =>
      runWithUserContext(userContext, () => {
        c.set('userId', payload.sub);
        c.set('userEmail', payload.email);
        c.set('tenantId', payload.tenantId);
        c.set('userRoles', payload.roles);
        return next();
      })
    , payload.sub);
  }) as MiddlewareHandler<Env>;
}

export async function resolveUserFromToken(token: string): Promise<UserContext | null> {
  const payload = await authService.verifyToken(token);
  if (!payload || !payload.tenantId) return null;

  return {
    userId: payload.sub,
    userEmail: payload.email,
    tenantId: payload.tenantId,
    userRoles: payload.roles,
  };
}