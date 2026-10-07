// @oktis-works/api - CSRF via double-submit cookie + verificação de Origin (security-001)

import type { Context, Next } from 'hono';
import { randomUUID } from 'node:crypto';
import { loadConfig } from '@oktis-works/config';

const config = loadConfig();
const { csrf: csrfCfg } = config.auth;

const STATE_CHANGING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

// Cookie CSRF usa o nome do config (padrão: csrf_token)
export const CSRF_COOKIE = csrfCfg.cookieName;
export const CSRF_HEADER = csrfCfg.headerName;

export function issueCsrfToken(): string {
  return randomUUID();
}

function normalizeOrigin(value: string): { origin: string; host: string; hasProtocol: boolean } | null {
  const raw = value.trim();
  if (!raw) return null;

  const hasProtocol = /^[a-z][a-z\d+.-]*:\/\//i.test(raw);
  try {
    const parsed = new URL(hasProtocol ? raw : `http://${raw}`);
    return { origin: parsed.origin, host: parsed.host, hasProtocol };
  } catch {
    return null;
  }
}

/** Origem esperada: mesma do Host da requisição (ou configurada em TRUSTED_ORIGINS). */
export function isSameOrigin(c: Context): boolean {
  const origin = c.req.header('Origin') ?? c.req.header('Referer');
  if (!origin) return false;

  const parsedOrigin = normalizeOrigin(origin);
  if (!parsedOrigin) return false;

  const trusted = (process.env['TRUSTED_ORIGINS'] ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  // Aceita tanto `localhost:3011` quanto `http://localhost:3011`, mas nunca
  // faz wildcard: quando o protocolo é informado, a origem completa precisa
  // ser exatamente igual (incluindo protocolo, host e porta).
  if (trusted.some((value) => {
    const parsedTrusted = normalizeOrigin(value);
    if (!parsedTrusted) return false;
    return parsedTrusted.hasProtocol
      ? parsedTrusted.origin === parsedOrigin.origin
      : parsedTrusted.host === parsedOrigin.host;
  })) return true;

  const host = (c.req.header('X-Forwarded-Host') ?? c.req.header('Host'))?.split(',')[0]?.trim();
  return Boolean(host) && parsedOrigin.host === host;
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
 * Double-submit cookie: valida que header X-CSRF-Token === cookie em requisições
 * state-changing de BROWSER (com Origin/Referer).
 * - Bearer (API-first) → isento;
 * - sem Origin/Referer → cliente não-browser (curl/SDK/CI) → isento (CSRF só
 *   afeta browsers — navegadores SEMPRE enviam Origin em fetch state-changing);
 * - Origin presente e diferente do Host → só passa se estiver em TRUSTED_ORIGINS
 *   (cross-port na mesma máquina, ex. admin:3011 → api:3010).
 */
export async function csrfMiddleware(c: Context, next: Next): Promise<Response | void> {
  if (!csrfCfg.enabled) return next();

  const method = c.req.method.toUpperCase();
  if (!STATE_CHANGING.has(method)) {
    await next();
    return;
  }

  // Bearer (API-first) é isento de CSRF
  if (c.req.header('Authorization')?.startsWith('Bearer ')) {
    await next();
    return;
  }

  // Sem Origin/Referer = cliente não-browser (curl/SDK/CI) → CSRF não se aplica
  const origin = c.req.header('Origin') ?? c.req.header('Referer');
  if (!origin) {
    await next();
    return;
  }

  // Login ainda não possui sessão para emitir um token CSRF. A validação
  // estrita de Origin protege contra login-CSRF; as demais mutações exigem o
  // par cookie + header abaixo.
  if (c.req.path === '/api/v1/auth/login' || c.req.path === '/api/v1/auth/register') {
    if (!isSameOrigin(c)) {
      return c.json(
        { error: 'CSRF_TOKEN_INVALID', message: 'CSRF validation failed.' },
        403
      );
    }
    await next();
    return;
  }

  const cookieHeader = c.req.header('Cookie');

  const cookieToken = readCookie(cookieHeader, CSRF_COOKIE);
  const headerToken = c.req.header(CSRF_HEADER);

  if (!cookieToken || !headerToken || cookieToken !== headerToken || !isSameOrigin(c)) {
    return c.json(
      { error: 'CSRF_TOKEN_INVALID', message: 'CSRF validation failed.' },
      403
    );
  }

  await next();
  return;
}
