// @oktis-works/api - Rate limiting por classe de tráfego (REQU-020/rest-api-003)
//
// Três classes, três orçamentos, três chaves:
//
//   | Classe       | Chave              | Budget (default)   |
//   |--------------|--------------------|--------------------|
//   | Credenciais  | login:ip / login:e | 100 e 10 / 5 min   |
//   | Autenticado  | u:<user id>        | 1200 / 60s         |
//   | Anônimo      | ip:<ip real>       | 300 / 60s          |
//
// Por que não é "300 req/min para todo mundo" (comportamento antigo):
//
//  * a identidade do cliente vem do IP real (socket, ou X-Forwarded-For
//    apenas quando o par imediato é um proxy de confiança) — nunca mais a
//    chave literal `platform:unknown` que fazia TODOS os clientes dividirem
//    um único balde;
//  * `X-Tenant-ID` e `X-Forwarded-For` não compõem mais a chave: o primeiro
//    é controlado pelo cliente (burlava o limite) e o segundo só vale atrás
//    de proxy confiável;
//  * requisições autenticadas têm balde próprio por usuário, então crawlers
//    e visitantes anônimos do site público não derrubam o admin;
//  * mídia estática (`/api/v1/media/file/...`, já servida com cache
//    imutável) e o bootstrap de CSRF não consomem orçamento;
//  * escritas custam mais que leituras (POST/PUT/PATCH/DELETE = 5), então
//    uma rajada de GETs de miniatura não bloqueia um PUT legítimo;
//  * os buckets expiram por varredura oportunista (nada fica no Map para
//    sempre) e há teto de chaves vivas (vetor de DoS por memória fechado).

import type { Context, Next } from 'hono';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { loadConfig, parseRateLimitSettings, type RateLimitSettings } from '@oktis-works/config';

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

/** Teto de chaves vivas: acima disso varre e evita o mais antigo (fecho DoS). */
const MAX_BUCKETS = 50_000;
/** Varre buckets expirados a cada N consumos (sem timer — nada segura o processo). */
const SWEEP_EVERY = 500;
let operations = 0;

export interface RateLimitOptions {
  /** Máximo do bucket ANÔNIMO por janela. */
  max?: number;
  /** Janela (ms) dos buckets anônimo e autenticado. */
  windowMs?: number;
  /** Máximo do bucket AUTENTICADO por janela. */
  authMax?: number;
  /** Tentativas de login por IP na janela de credenciais. */
  loginMaxPerIp?: number;
  /** Tentativas de login por e-mail na janela de credenciais. */
  loginMax?: number;
  /** Janela (ms) do limiter de credenciais. */
  loginWindowMs?: number;
}

/** Parser único (delega para @oktis-works/config — mesma fonte do wizard da CLI). */
export function parseRateLimitEnv(env: Record<string, string | undefined> = process.env): RateLimitSettings {
  return parseRateLimitSettings(env);
}

/** Reseta os buckets (uso em testes). */
export function resetRateLimiter(): void {
  buckets.clear();
  operations = 0;
  jwtSecretCache = null;
}

/** Observabilidade/testes: quantos buckets estão vivos agora. */
export function rateLimiterStats(): { buckets: number } {
  return { buckets: buckets.size };
}

/** Remove buckets cuja janela já venceu (uso em testes e em shutdown). */
export function sweepExpiredBuckets(now: number = Date.now()): number {
  const before = buckets.size;
  sweep(now);
  return before - buckets.size;
}

// ---------------------------------------------------------------- identidade ---

function readEnv(name: string): string {
  return (process.env[name] ?? '').trim();
}

/** Faixas privadas + loopback: o padrão de "proxy de confiança" (nginx/docker/local). */
function isPrivateOrLoopback(ip: string): boolean {
  if (ip === '::1' || ip === 'localhost') return true;
  if (/^127\./.test(ip)) return true;
  if (/^10\./.test(ip)) return true;
  if (/^192\.168\./.test(ip)) return true;
  if (/^169\.254\./.test(ip)) return true;
  const second = Number(ip.split('.')[1] ?? NaN);
  if (ip.startsWith('172.') && second >= 16 && second <= 31) return true;
  // ULA do IPv6 (fc00::/7) e link-local (fe80::/10)
  if (/^f[cd]/i.test(ip) || /^fe[89ab]/i.test(ip)) return true;
  return false;
}

/** Lista explícita TRUSTED_PROXIES (IPs ou CIDRs, separados por vírgula). */
function isExplicitlyTrusted(ip: string): boolean {
  const raw = readEnv('TRUSTED_PROXIES');
  if (!raw) return false;
  return raw.split(',').some((entry) => {
    const value = entry.trim();
    if (!value) return false;
    if (value === ip) return true;
    if (!value.includes('/')) return false;
    // CIDR /8 /16 /24 para IPv4 — suficiente para os casos reais de proxy.
    const [base, prefixRaw] = value.split('/');
    const prefix = Number(prefixRaw);
    if (!base || !Number.isInteger(prefix)) return false;
    const a = ip.split('.').map(Number);
    const b = base.split('.').map(Number);
    if (a.length !== 4 || b.length !== 4 || a.some(Number.isNaN) || b.some(Number.isNaN)) return false;
    const maskBits = prefix;
    for (let i = 0; i < 4; i++) {
      const bits = Math.min(8, Math.max(0, maskBits - i * 8));
      const mask = bits === 0 ? 0 : (0xff << (8 - bits)) & 0xff;
      if ((a[i]! & mask) !== (b[i]! & mask)) return false;
    }
    return true;
  });
}

export function isTrustedProxy(ip: string | null | undefined): boolean {
  if (!ip) return false;
  return isExplicitlyTrusted(ip) || isPrivateOrLoopback(ip);
}

/** IP do par imediato (socket TCP) — a identidade que NUNCA é forjável. */
export function socketPeerIp(c: Context): string | null {
  const env = c.env as unknown as { incoming?: { socket?: { remoteAddress?: string } } } | undefined;
  const raw = env?.incoming?.socket?.remoteAddress ?? null;
  if (!raw) return null;
  return raw.startsWith('::ffff:') ? raw.slice(7) : raw;
}

/**
 * Cliente final a partir de X-Forwarded-For: caminha da DIREITA para a
 * esquerda pulando proxies de confiança e para no primeiro hop que NÃO é
 * proxy — esse é o cliente real. O primeiro valor (o que o antigo código
 * usava) é justamente o mais forjável: qualquer um manda `XFF: 1.2.3.4`.
 */
function clientFromForwarded(value: string): string | null {
  const hops = value.split(',').map((s) => s.trim()).filter(Boolean);
  if (hops.length === 0) return null;
  for (let i = hops.length - 1; i >= 0; i--) {
    const hop = hops[i]!;
    if (!isTrustedProxy(hop)) return hop;
  }
  // Todos os hops são proxies de confiança: o mais externo é o cliente.
  return hops[0] ?? null;
}

/** Resolve o IP do cliente final respeitando TRUST_PROXY (true/false/auto). */
export function resolveClientIp(c: Context): string {
  const peer = socketPeerIp(c);
  const forwarded = c.req.header('X-Forwarded-For');
  const realIp = c.req.header('X-Real-IP');
  const trust = readEnv('TRUST_PROXY').toLowerCase();

  const trusted = trust === 'true' || trust === '1' || trust === 'on';
  const distrusted = trust === 'false' || trust === '0' || trust === 'off';

  // TRUST_PROXY=false: header de proxy é ignorado de propósito.
  if (distrusted) return peer ?? 'unknown';

  // Sem par TCP identificável (testes, runtimes sem IncomingMessage): o header
  // é a única sinalização de identidade existente e vem do proxy de edge.
  if (!peer) {
    if (forwarded) return clientFromForwarded(forwarded) ?? 'unknown';
    return realIp?.trim() || 'unknown';
  }

  // Par não-proxied (exposto direto na internet): só o socket vale. Um
  // atacante direto não consegue trocar de balde mandando XFF forjado.
  if (!trusted && !isTrustedProxy(peer)) return peer;

  // TRUST_PROXY=true ou par é proxy de confiança → o header descreve o cliente.
  if (forwarded) return clientFromForwarded(forwarded) ?? peer;
  if (realIp) return realIp.trim() || peer;
  return peer;
}

// ------------------------------------------------------------------- sessão ---

/**
 * Secret do JWT em cache: `loadConfig()` faz I/O de disco a cada chamada e
 * este caminho roda em TODA requisição autenticada.
 */
let jwtSecretCache: string | null = null;
function jwtSecret(): string {
  if (jwtSecretCache === null) jwtSecretCache = loadConfig().auth.jwtSecret;
  return jwtSecretCache;
}

/**
 * Extrai o user id da sessão verificando a assinatura HS256 do cookie
 * `access_token` — HMAC puro, sem tocar o banco (custo desprezível frente a
 * uma query) e, principalmente, IMPOSSÍVEL de forjar por um cliente.
 */
function subjectFromAccessToken(token: string): string | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [headerPart, payloadPart, signature] = parts;
  if (!headerPart || !payloadPart || !signature) return null;

  try {
    const header = JSON.parse(Buffer.from(headerPart, 'base64url').toString('utf8')) as { alg?: string };
    if (header.alg !== 'HS256') return null;

    const expected = createHmac('sha256', jwtSecret()).update(`${headerPart}.${payloadPart}`).digest('base64url');
    const a = Buffer.from(signature);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

    const payload = JSON.parse(Buffer.from(payloadPart, 'base64url').toString('utf8')) as {
      sub?: unknown;
      exp?: unknown;
    };
    if (typeof payload.sub !== 'string' || !payload.sub) return null;
    if (typeof payload.exp === 'number' && payload.exp * 1000 <= Date.now()) return null;
    return payload.sub;
  } catch {
    return null;
  }
}

function readCookie(cookieHeader: string | undefined, name: string): string | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) return decodeURIComponent(rest.join('='));
  }
  return null;
}

/** User id da sessão, quando o request carrega um access token válido. */
export function authenticatedUserId(c: Context): string | null {
  const cookieToken = readCookie(c.req.header('Cookie'), 'access_token');
  const bearer = c.req.header('Authorization')?.startsWith('Bearer ')
    ? c.req.header('Authorization')!.slice(7)
    : undefined;
  const token = cookieToken ?? bearer;
  return token ? subjectFromAccessToken(token) : null;
}

// ------------------------------------------------------------------- chaves ---

/**
 * Chave do bucket: `u:<user id>` quando autenticado (orçamento próprio, não
 * disputa com anônimos), senão `ip:<ip real>`. O tenant saiu da chave porque
 * `X-Tenant-ID` é controlado pelo cliente e permitia trocar de balde à vontade.
 */
export function clientKey(c: Context): string {
  const userId = authenticatedUserId(c);
  return userId ? `u:${userId}` : `ip:${resolveClientIp(c)}`;
}

/** Leitura é barata; escrita custa 5x para não ser engolida por rajadas de GET. */
export function requestCost(method: string): number {
  return ['GET', 'HEAD', 'OPTIONS', 'TRACE'].includes(method.toUpperCase()) ? 1 : 5;
}

/**
 * Rotas que nunca consomem orçamento: probes (/health, /metrics), mídia
 * estática (binário imutável, cache 30d no nginx) e o bootstrap do CSRF
 * (UUID aleatório, não toca o banco) — nenhuma delas é API transacional.
 */
export function isExemptPath(method: string, path: string): boolean {
  if (path === '/health' || path.startsWith('/api/v1/health') || path === '/metrics') return true;
  const get = method.toUpperCase() === 'GET';
  if (get && path.startsWith('/api/v1/media/file/')) return true;
  if (get && path === '/api/v1/auth/csrf') return true;
  return false;
}

// ------------------------------------------------------------------ buckets ---

function sweep(now: number): void {
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}

function maybeSweep(now: number): void {
  operations += 1;
  if (buckets.size <= MAX_BUCKETS && operations % SWEEP_EVERY !== 0) return;
  sweep(now);
  if (buckets.size <= MAX_BUCKETS) return;
  // Estourou o teto mesmo com a varredura: evicta o bucket mais antigo.
  const oldest = [...buckets.entries()].sort((a, b) => a[1].resetAt - b[1].resetAt);
  for (const [key] of oldest.slice(0, buckets.size - MAX_BUCKETS)) buckets.delete(key);
}

/**
 * consome `cost` tokens do bucket da `key`, recriando a janela quando ela
 * expira. Devolve o total consumido na janela corrente e o instante de reset
 * (o caller compara com o max da própria classe).
 */
function consume(
  key: string,
  cost: number,
  windowMs: number,
  now: number
): { count: number; resetAt: number } {
  maybeSweep(now);

  let bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    bucket = { count: 0, resetAt: now + windowMs };
    buckets.set(key, bucket);
  }

  bucket.count += cost;
  return { count: bucket.count, resetAt: bucket.resetAt };
}

function rateLimitResponse(c: Context, limit: number, resetAt: number): Response {
  const retryAfter = Math.max(1, Math.ceil((resetAt - Date.now()) / 1000));
  c.header('Retry-After', String(retryAfter));
  c.header('X-RateLimit-Limit', String(limit));
  c.header('X-RateLimit-Remaining', '0');
  return c.json(
    { error: 'TOO_MANY_REQUESTS', message: `Rate limit exceeded. Retry after ${retryAfter}s.` },
    429
  );
}

/**
 * Limiter global por classe de tráfego: 429 + Retry-After quando a classe
 * estoura o próprio orçamento. Credenciais e probes ficam por conta de
 * `loginRateLimitMiddleware` e das isenções acima.
 */
export function rateLimitMiddleware(options: RateLimitOptions = {}) {
  // Garante que o .env do projeto já tenha sido carregado antes do parse
  // (loadConfig faz o load uma única vez e é idempotente).
  loadConfig();
  const settings = parseRateLimitSettings();
  const { max, windowMs, authMax } = {
    max: options.max ?? settings.max,
    windowMs: options.windowMs ?? settings.windowMs,
    authMax: options.authMax ?? settings.authMax,
  };

  return async (c: Context, next: Next): Promise<Response | undefined> => {
    const path = new URL(c.req.url).pathname;
    if (isExemptPath(c.req.method, path)) {
      await next();
      return;
    }

    const key = clientKey(c);
    const limit = key.startsWith('u:') ? authMax : max;
    const now = Date.now();
    const result = consume(key, requestCost(c.req.method), windowMs, now);

    if (result.count > limit) {
      return rateLimitResponse(c, limit, result.resetAt);
    }

    c.header('X-RateLimit-Limit', String(limit));
    c.header('X-RateLimit-Remaining', String(Math.max(0, limit - result.count)));
    await next();
    return;
  };
}

/**
 * Limiter POR PLUGIN (Item 17 do plugin-parity-plan): orçamento de rpm sobre
 * TODA a superfície de rotas HTTP do plugin (montadas em
 * /api/v1/plugins/:plugin). Um plugin pesado não consegue consumir o
 * orçamento dos demais nem derrubar a API. Default 120 rpm, override pelo
 * manifesto (`rateLimit.rpm`). Resposta 429 com headers de rate limit.
 */
export function pluginRateLimitMiddleware(pluginName: string, rpm?: number, tenantId?: string | null) {
  loadConfig();
  const limit = rpm && rpm > 0 ? Math.floor(rpm) : 120;
  const windowMs = 60_000;

  return async (c: Context, next: Next): Promise<Response | undefined> => {
    const now = Date.now();
    const result = consume(`plugin-routes:${tenantId ?? 'platform'}:${pluginName}`, 1, windowMs, now);

    if (result.count > limit) {
      return rateLimitResponse(c, limit, result.resetAt);
    }

    c.header('X-RateLimit-Limit', String(limit));
    c.header('X-RateLimit-Remaining', String(Math.max(0, limit - result.count)));
    await next();
    return;
  };
}

/**
 * Limiter dedicado de credenciais (POST /auth/login).
 *
 * Duas chaves simultâneas: por IP (segura o ataque de um host rotando
 * e-mails) e por e-mail (segura o ataque de muitos hosts mirando uma conta).
 * Fica ANTES do limiter global para que o brute force receba 429 próprio em
 * vez de esvaziar o orçamento dos demais clientes.
 */
export function loginRateLimitMiddleware(options: RateLimitOptions = {}) {
  loadConfig();
  const settings = parseRateLimitSettings();
  const loginMax = options.loginMax ?? settings.loginMax;
  const loginMaxPerIp = options.loginMaxPerIp ?? settings.loginMaxPerIp;
  const windowMs = options.loginWindowMs ?? settings.loginWindowMs;

  return async (c: Context, next: Next): Promise<Response | undefined> => {
    if (c.req.method.toUpperCase() !== 'POST') {
      await next();
      return;
    }

    const ip = resolveClientIp(c);
    const body = await c.req.json().catch(() => null) as { email?: unknown; apiKey?: unknown } | null;
    const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase().slice(0, 254) : '';
    // Login via API key (POST /auth/api-key-login) não tem e-mail; o prefixo
    // (em claro, não é segredo) vira a chave do balde para segurar brute force
    // de uma key específica além do limite por IP.
    const apiKeyPrefix = typeof body?.apiKey === 'string'
      ? (body.apiKey.trim().split('_')[1] ?? '').slice(0, 32)
      : '';
    const now = Date.now();

    const ipKey = `login:ip:${ip}`;
    const ipResult = consume(ipKey, 1, windowMs, now);
    if (ipResult.count > loginMaxPerIp) {
      return rateLimitResponse(c, loginMaxPerIp, ipResult.resetAt);
    }

    if (email) {
      const emailKey = `login:email:${email}`;
      const emailResult = consume(emailKey, 1, windowMs, now);
      if (emailResult.count > loginMax) {
        return rateLimitResponse(c, loginMax, emailResult.resetAt);
      }
    }

    if (apiKeyPrefix) {
      const keyResult = consume(`login:key:${apiKeyPrefix}`, 1, windowMs, now);
      if (keyResult.count > loginMax) {
        return rateLimitResponse(c, loginMax, keyResult.resetAt);
      }
    }

    await next();
    return;
  };
}
