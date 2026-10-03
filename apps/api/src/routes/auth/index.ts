// @oktis-works/api - Auth Routes (HttpOnly cookies via hono/cookie + CSRF)

import { Hono } from 'hono';
import type { Context } from 'hono';
import { setCookie, getCookie, deleteCookie } from 'hono/cookie';
import { AuthService } from '@oktis-works/auth';
import { loadConfig } from '@oktis-works/config';
import { establishTenantContext } from '@oktis-works/core';
import { setCsrfCookie } from '../../utils/csrf.js';

const config = loadConfig();
const authService = new AuthService(config.auth);
const { cookie: cookieCfg } = config.auth;

const authRouter = new Hono();

// Cookie options from config — None requer Secure (auto em produção)
const isProd = config.app.nodeEnv === 'production';
const cookieSecure = cookieCfg.secure ?? isProd;
const ACCESS_OPTS = {
  httpOnly: true,
  secure: cookieSecure,
  sameSite: cookieCfg.sameSite,
  path: '/',
  maxAge: cookieCfg.accessTokenMaxAge ?? 60 * 15, // 15min
};
const REFRESH_OPTS = {
  httpOnly: true,
  secure: cookieSecure,
  sameSite: cookieCfg.sameSite,
  path: '/',
  maxAge: cookieCfg.refreshTokenMaxAge ?? 60 * 60 * 24 * 30, // 30d
};

/** Set-Cookie múltiplo: hono/cookie setCookie appenda corretamente. */
function setAuthCookies(c: Context, accessToken: string, refreshToken: string): void {
  setCookie(c, 'access_token', accessToken, ACCESS_OPTS);
  setCookie(c, 'refresh_token', refreshToken, REFRESH_OPTS);
}

function clearAuthCookies(c: Context): void {
  deleteCookie(c, 'access_token', { path: '/' });
  deleteCookie(c, 'refresh_token', { path: '/' });
}

// CSRF é validado globalmente em app.use('/api/*', csrfMiddleware) — ver middleware/csrf.ts

// POST /auth/register
authRouter.post('/register', async (c: Context) => {
  try {
    const body = await c.req.json();
    const { email, password, name, tenantId } = body;

    if (!email || !password || !name) {
      return c.json({ error: 'Missing required fields' }, 400);
    }

    await authService.register({ email, password, name, tenantId });

    // Auto-login pós-registro: tokens em cookies HttpOnly (nunca no localStorage)
    await establishTenantContext(tenantId ?? 'default');
    const result = await authService.login({
      email,
      password,
      tenantId: tenantId ?? 'default',
      ipAddress: c.req.header('x-forwarded-for') ?? c.req.header('x-real-ip'),
      userAgent: c.req.header('user-agent'),
    });

    setAuthCookies(c, result.accessToken, result.refreshToken);
    setCsrfCookie(c);

    return c.json({ user: result.user, tenantId: result.tenantId }, 201);
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

    setAuthCookies(c, result.accessToken, result.refreshToken);
    setCsrfCookie(c);

    return c.json({ user: result.user, tenantId: result.tenantId });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Login failed';
    return c.json({ error: message }, 401);
  }
});

// POST /auth/refresh — lê refresh_token do cookie HttpOnly
authRouter.post('/refresh', async (c: Context) => {
  try {
    const refreshToken = getCookie(c, 'refresh_token');

    if (!refreshToken) {
      return c.json({ error: 'Missing refresh token' }, 400);
    }

    const tokens = await authService.refreshToken(refreshToken);
    if (!tokens) {
      clearAuthCookies(c);
      return c.json({ error: 'Invalid refresh token' }, 401);
    }

    setAuthCookies(c, tokens.accessToken, tokens.refreshToken);

    return c.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Token refresh failed';
    return c.json({ error: message }, 400);
  }
});

// POST /auth/logout — encerra sessão pelo refresh_token do cookie
authRouter.post('/logout', async (c: Context) => {
  try {
    const refreshToken = getCookie(c, 'refresh_token');

    if (refreshToken) {
      await authService.logout(refreshToken);
    }

    clearAuthCookies(c);

    return c.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Logout failed';
    return c.json({ error: message }, 400);
  }
});

// GET /auth/me — sessão atual via cookie (fallback Bearer para clientes API-first)
authRouter.get('/me', async (c: Context) => {
  try {
    const accessToken = getCookie(c, 'access_token') ?? c.req.header('Authorization')?.slice(7);

    if (!accessToken) {
      return c.json({ error: 'Not authenticated' }, 401);
    }

    const payload = await authService.verifyToken(accessToken);
    if (!payload) {
      return c.json({ error: 'Invalid or expired token' }, 401);
    }

    const sql = (await import('@oktis-works/database')).getConnection();
    const rows = await sql.unsafe(
      'SELECT id, email, name, avatar, status, last_login_at FROM users WHERE id = $1',
      [payload.sub]
    );

    if (!rows.length) {
      return c.json({ error: 'User not found' }, 404);
    }

    return c.json({ user: rows[0], tenantId: payload.tenantId, roles: payload.roles });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to get user';
    return c.json({ error: message }, 400);
  }
});

export default authRouter;