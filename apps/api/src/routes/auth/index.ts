// @oktis-works/api - Auth Routes

import { Hono } from 'hono';
import type { Context } from 'hono';
import { AuthService } from '@oktis-works/auth';
import { loadConfig } from '@oktis-works/config';
import { establishTenantContext } from '@oktis-works/core';

const config = loadConfig();
const authService = new AuthService(config.auth);

const authRouter = new Hono();

// POST /auth/register
authRouter.post('/register', async (c: Context) => {
  try {
    const body = await c.req.json();
    const { email, password, name } = body;

    if (!email || !password || !name) {
      return c.json({ error: 'Missing required fields' }, 400);
    }

    const user = await authService.register({ email, password, name });
    return c.json({ user }, 201);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Registration failed';
    return c.json({ error: message }, 400);
  }
});

// POST /auth/login
authRouter.post('/login', async (c: Context) => {
  try {
    const body = await c.req.json();
    const { email, password, tenantId } = body;

    if (!email || !password || !tenantId) {
      return c.json({ error: 'Missing required fields' }, 400);
    }

    await establishTenantContext(tenantId);

    const result = await authService.login({
      email,
      password,
      tenantId,
      ipAddress: c.req.header('x-forwarded-for') ?? c.req.header('x-real-ip'),
      userAgent: c.req.header('user-agent'),
    });

    return c.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Login failed';
    return c.json({ error: message }, 401);
  }
});

// POST /auth/refresh
authRouter.post('/refresh', async (c: Context) => {
  try {
    const body = await c.req.json();
    const { refreshToken } = body;

    if (!refreshToken) {
      return c.json({ error: 'Missing refresh token' }, 400);
    }

    const tokens = await authService.refreshToken(refreshToken);
    if (!tokens) {
      return c.json({ error: 'Invalid refresh token' }, 401);
    }

    return c.json(tokens);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Token refresh failed';
    return c.json({ error: message }, 400);
  }
});

// POST /auth/logout
authRouter.post('/logout', async (c: Context) => {
  try {
    const body = await c.req.json();
    const { token } = body;

    if (!token) {
      return c.json({ error: 'Missing token' }, 400);
    }

    await authService.logout(token);
    return c.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Logout failed';
    return c.json({ error: message }, 400);
  }
});

export default authRouter;
