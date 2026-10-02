// @oktis-works/api - CSRF via double-submit cookie + verificação de Origin (security-001)

import type { Context, Next } from 'hono';
import { randomUUID } from 'node:crypto';

const STATE_CHANGING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export const CSRF_COOKIE = 'bl_csrf';
export const CSRF_HEADER = 'X-CSRF-Token';

export function issueCsrfToken(): string {
  return randomUUID();
}

/** Origem esperada: mesma do Host da requisição (ou configurada em TRUSTED_ORIGINS). */
export function isSameOrigin(c: Context): boolean {
  const origin = c.req.header('Origin') ?? c.req.header('Referer');
  if (!origin) return false;

  let originHost: string;
  try {
    originHost = new URL(origin).host;
  } catch {
    return false;
  }

  const trusted = (process.env['TRUSTED_ORIGINS'] ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  if (trusted.includes(originHost)) return true;

  const host = c.req.header('X-Forwarded-Host') ?? c.req.header('Host');
  return Boolean(host) && originHost === host;
}

function readCookie(cookieHeader: string | undefined, name: string): string | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) return decodeURIComponent(rest.join('='));
  }
  return null;
}

/**
 * Double-submit cookie: emite cookie bl_csrf para navegadores e valida que
 * header X-CSRF-Token === cookie em requisições state-changing com cookie de sessão.
 * Clientes não-navegador (Authorization Bearer) ficam isentos.
 */
export async function csrfMiddleware(c: Context, next: Next): Promise<Response | undefined> {
  const method = c.req.method.toUpperCase();
  if (!STATE_CHANGING.has(method)) {
    await next();
    return;
  }

  // Autenticação por token (API-first) não é vulnerável a CSRF
  const hasBearer = Boolean(c.req.header('Authorization')?.startsWith('Bearer '));
  const cookieHeader = c.req.header('Cookie');

  if (!hasBearer && cookieHeader?.includes(CSRF_COOKIE)) {
    const cookieToken = readCookie(cookieHeader, CSRF_COOKIE);
    const headerToken = c.req.header(CSRF_HEADER);

    if (!cookieToken || !headerToken || cookieToken !== headerToken || !isSameOrigin(c)) {
      return c.json(
        { error: 'CSRF_TOKEN_INVALID', message: 'CSRF validation failed.' },
        403
      );
    }
  }

  await next();
  return;
}
