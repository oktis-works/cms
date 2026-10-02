// @oktis-works/api - Authentication Middleware

import type { Context, Next } from 'hono';
import { AuthService } from '@oktis-works/auth';
import { loadConfig } from '@oktis-works/config';

const config = loadConfig();
const authService = new AuthService(config.auth);

export const authMiddleware = async (c: Context, next: Next) => {
  const authHeader = c.req.header('Authorization');

  if (!authHeader?.startsWith('Bearer ')) {
    return c.json({ error: 'Missing or invalid authorization header' }, 401);
  }

  const token = authHeader.slice(7);
  const payload = await authService.verifyToken(token);

  if (!payload) {
    return c.json({ error: 'Invalid or expired token' }, 401);
  }

  // Set user context
  c.set('userId', payload.sub);
  c.set('userEmail', payload.email);
  c.set('tenantId', payload.tenantId);
  c.set('userRoles', payload.roles);

  await next();
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
