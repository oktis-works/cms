// @oktis-works/api - CSRF Utilities (double-submit cookie via hono/cookie)

import { randomUUID } from 'node:crypto';
import { setCookie, getCookie } from 'hono/cookie';
import { loadConfig } from '@oktis-works/config';

const config = loadConfig();
const { cookie: cookieCfg, csrf: csrfCfg } = config.auth;

// None requer Secure (auto em produção); localhost HTTP aceita None sem Secure
const isProd = config.app.nodeEnv === 'production';
const CSRF_COOKIE_OPTS = {
  // httpOnly=FALSE é ESSENCIAL: double-submit exige que o JS leia o cookie e
  // devolva no header X-CSRF-Token. O valor CSRF não é sensível — o token de
  // SESSÃO (access_token) é que fica HttpOnly.
  httpOnly: false,
  secure: cookieCfg.secure ?? isProd,
  sameSite: cookieCfg.sameSite,
  path: '/',
  maxAge: 60 * 60 * 24, // 24h
};

/** Gera novo token CSRF e seta cookie legível pelo JS (double-submit) */
export function setCsrfCookie(c: Parameters<typeof setCookie>[0]): string {
  const token = randomUUID();
  setCookie(c, csrfCfg.cookieName, token, CSRF_COOKIE_OPTS);
  return token;
}

/** Lê token CSRF do cookie */
export function getCsrfToken(c: Parameters<typeof getCookie>[0]): string | undefined {
  return getCookie(c, csrfCfg.cookieName);
}