// @oktis-works/api - Auth Routes (HttpOnly cookies via hono/cookie + CSRF)

import { Hono } from 'hono';
import type { Context } from 'hono';
import { setCookie, getCookie, deleteCookie } from 'hono/cookie';
import { AuthService } from '@oktis-works/auth';
import { loadConfig } from '@oktis-works/config';
import { establishTenantContext } from '@oktis-works/core';
import { getConnection } from '@oktis-works/database';
import { getCsrfToken, setCsrfCookie } from '../../utils/csrf.js';

const config = loadConfig();
const authService = new AuthService(config.auth);
const { cookie: cookieCfg } = config.auth;

/** Resolve tenant from Host header — same logic as web app's resolveTenantFromHost. */
async function resolveTenantFromHost(rawHost: string): Promise<{ id: string; slug: string } | null> {
  const host = rawHost.replace(/:\d+$/, '');
  const sql = getConnection();

  const isLoopback = host === 'localhost' || host === '::1' || host === '[::1]' || /^127\./.test(host);

  if (isLoopback) {
    // Dev zero-config: tenant padrão criado no primeiro db:migrate
    const defaults = await sql.unsafe('SELECT id, slug FROM tenants WHERE slug = $1 AND status = $2', [
      'default',
      'ACTIVE',
    ]);
    if (defaults.length > 0) return defaults[0] as unknown as { id: string; slug: string };

    // Sem tenant default: aceita domain 'localhost' configurado manualmente
    const byDomain = await sql.unsafe('SELECT id, slug FROM tenants WHERE domain = $1 AND status = $2', [
      host,
      'ACTIVE',
    ]);
    return byDomain.length > 0 ? (byDomain[0] as unknown as { id: string; slug: string }) : null;
  }

  // Subdomain primeiro (apenas host com ponto: loja.exemplo.com)
  const subdomain = host.split('.')[0];
  if (host.includes('.') && subdomain && subdomain !== 'www' && subdomain !== 'api') {
    const tenants = await sql.unsafe('SELECT id, slug FROM tenants WHERE subdomain = $1 AND status = $2', [
      subdomain,
      'ACTIVE',
    ]);
    if (tenants.length > 0) return tenants[0] as unknown as { id: string; slug: string };
  }

  // Domain exato (já sem porta)
  const tenants = await sql.unsafe('SELECT id, slug FROM tenants WHERE domain = $1 AND status = $2', [
    host,
    'ACTIVE',
  ]);
  return tenants.length > 0 ? (tenants[0] as unknown as { id: string; slug: string }) : null;
}

const authRouter = new Hono();

// Cookie options from config — None requer Secure (auto em produção)
const isProd = config.app.nodeEnv === 'production';
const cookieSecure = cookieCfg.secure ?? isProd;
const cookieDomain = cookieCfg.domain;
const ACCESS_OPTS = {
  httpOnly: true,
  secure: cookieSecure,
  sameSite: cookieCfg.sameSite,
  ...(cookieDomain ? { domain: cookieDomain } : {}),
  path: '/',
  maxAge: cookieCfg.accessTokenMaxAge ?? 60 * 15, // 15min
};
const REFRESH_OPTS = {
  httpOnly: true,
  secure: cookieSecure,
  sameSite: cookieCfg.sameSite,
  ...(cookieDomain ? { domain: cookieDomain } : {}),
  path: '/',
  maxAge: cookieCfg.refreshTokenMaxAge ?? 60 * 60 * 24 * 30, // 30d
};

/** Set-Cookie múltiplo: hono/cookie setCookie appenda corretamente. */
function setAuthCookies(c: Context, accessToken: string, refreshToken: string): void {
  setCookie(c, 'access_token', accessToken, ACCESS_OPTS);
  setCookie(c, 'refresh_token', refreshToken, REFRESH_OPTS);
}

function clearAuthCookies(c: Context): void {
  deleteCookie(c, 'access_token', { path: '/', ...(cookieDomain ? { domain: cookieDomain } : {}) });
  deleteCookie(c, 'refresh_token', { path: '/', ...(cookieDomain ? { domain: cookieDomain } : {}) });
}

function isBrowserRequest(c: Context): boolean {
  return Boolean(c.req.header('Origin') || c.req.header('Sec-Fetch-Site'));
}

function authResponse(c: Context, result: { user: unknown; tenantId: string; accessToken: string; refreshToken: string }): Record<string, unknown> {
  if (isBrowserRequest(c)) {
    return { user: result.user, tenantId: result.tenantId };
  }
  return {
    user: result.user,
    tenantId: result.tenantId,
    accessToken: result.accessToken,
    refreshToken: result.refreshToken,
  };
}

// CSRF é validado globalmente em app.use('/api/*', csrfMiddleware) — ver middleware/csrf.ts

// GET /auth/csrf — bootstrap explícito para browsers, sem expor Set-Cookie ao JS
authRouter.get('/csrf', async (c: Context) => {
  const token = getCsrfToken(c) ?? setCsrfCookie(c);
  return c.json({ csrfToken: token });
});

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

    // Tokens no body também: compat com clientes API-first (@oktis-works/api-client)
    return c.json(authResponse(c, result), 201);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Registration failed';
    return c.json({ error: message }, 400);
  }
});

// POST /auth/login
authRouter.post('/login', async (c: Context) => {
  try {
    const body = await c.req.json();
    const { email, password } = body;

    if (!email || !password) {
      return c.json({ error: 'Missing required fields' }, 400);
    }

    // Resolve tenant from Host header automatically
    const host = c.req.header('host') ?? '';
    const tenant = await resolveTenantFromHost(host);
    
    if (!tenant) {
      return c.json({ error: 'Tenant not found for this host' }, 404);
    }

    await establishTenantContext(tenant.id);

    const result = await authService.login({
      email,
      password,
      tenantId: tenant.id,
      ipAddress: c.req.header('x-forwarded-for') ?? c.req.header('x-real-ip'),
      userAgent: c.req.header('user-agent'),
    });

    setAuthCookies(c, result.accessToken, result.refreshToken);
    setCsrfCookie(c);

    // Tokens no body também: clientes API-first (@oktis-works/api-client) usam
    // Bearer; o browser continua nos cookies HttpOnly (nunca localStorage).
    return c.json(authResponse(c, result));
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Login failed';
    return c.json({ error: message }, 401);
  }
});

// POST /auth/refresh — híbrido: refreshToken do cookie (browser) OU body (API-first);
// retorna tokens no body (clientes externos) E seta cookies (browser)
authRouter.post('/refresh', async (c: Context) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    const refreshToken = getCookie(c, 'refresh_token') ?? body['refreshToken'];

    if (!refreshToken) {
      return c.json({ error: 'Missing refresh token' }, 400);
    }

    const tokens = await authService.refreshToken(refreshToken, {
      ipAddress: c.req.header('x-forwarded-for') ?? c.req.header('x-real-ip'),
      userAgent: c.req.header('user-agent'),
    });
    if (!tokens) {
      clearAuthCookies(c);
      return c.json({ error: 'Invalid refresh token' }, 401);
    }

    setAuthCookies(c, tokens.accessToken, tokens.refreshToken);
    if (!getCsrfToken(c)) setCsrfCookie(c);

    // Browser usa cookies; apenas clientes sem Origin recebem tokens no body.
    return c.json(isBrowserRequest(c)
      ? { success: true }
      : { success: true, accessToken: tokens.accessToken, refreshToken: tokens.refreshToken });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Token refresh failed';
    return c.json({ error: message }, 400);
  }
});

// POST /auth/logout — encerra sessão pelo refresh_token do cookie ou do body
authRouter.post('/logout', async (c: Context) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    const refreshToken = getCookie(c, 'refresh_token') ?? body['refreshToken'];

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
