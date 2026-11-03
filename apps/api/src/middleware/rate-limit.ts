// @oktis-works/api - Rate limiting with Redis sorted sets + in-memory fallback

import type { Context, Next } from 'hono';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { loadConfig, parseRateLimitSettings, type RateLimitSettings } from '@oktis-works/config';
import { getRedisClient } from '@oktis-works/core';

interface Bucket {
  count: number;
  resetAt: number;
}

interface RateLimitStore {
  consume(key: string, cost: number, windowMs: number, now: number): Promise<{ count: number; resetAt: number }>;
  reset(): Promise<void>;
  stats(): Promise<{ buckets: number }>;
  sweep(now: number): Promise<number>;
}

const MAX_BUCKETS = 50_000;
const SWEEP_EVERY = 500;

class MemoryStore implements RateLimitStore {
  private buckets = new Map<string, Bucket>();
  private operations = 0;

  async consume(key: string, cost: number, windowMs: number, now: number): Promise<{ count: number; resetAt: number }> {
    await this.maybeSweep(now);

    let bucket = this.buckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      bucket = { count: 0, resetAt: now + windowMs };
      this.buckets.set(key, bucket);
    }

    bucket.count += cost;
    return { count: bucket.count, resetAt: bucket.resetAt };
  }

  async reset(): Promise<void> {
    this.buckets.clear();
    this.operations = 0;
  }

  async stats(): Promise<{ buckets: number }> {
    return { buckets: this.buckets.size };
  }

  async sweep(now: number = Date.now()): Promise<number> {
    const before = this.buckets.size;
    for (const [key, bucket] of this.buckets) {
      if (bucket.resetAt <= now) this.buckets.delete(key);
    }
    if (this.buckets.size > MAX_BUCKETS) {
      const oldest = [...this.buckets.entries()].sort((a, b) => a[1].resetAt - b[1].resetAt);
      for (const [key] of oldest.slice(0, this.buckets.size - MAX_BUCKETS)) this.buckets.delete(key);
    }
    return before - this.buckets.size;
  }

  private async maybeSweep(now: number): Promise<void> {
    this.operations += 1;
    if (this.buckets.size <= MAX_BUCKETS && this.operations % SWEEP_EVERY !== 0) return;
    await this.sweep(now);
  }
}

class RedisStore implements RateLimitStore {
  private client: ReturnType<typeof getRedisClient> | null = null;
  private enabled = false;

  async init(): Promise<void> {
    try {
      this.client = getRedisClient();
      if (this.client) {
        await this.client.ping();
        this.enabled = true;
      }
    } catch {
      this.enabled = false;
      this.client = null;
    }
  }

  async consume(key: string, cost: number, windowMs: number, now: number): Promise<{ count: number; resetAt: number }> {
    if (!this.enabled || !this.client) {
      throw new Error('Redis not available');
    }

    const redisKey = `ratelimit:${key}`;
    const windowSec = Math.ceil(windowMs / 1000);
    const resetAt = now + windowMs;

    const multi = this.client.multi();
    multi.zRemRangeByScore(redisKey, 0, now);
    multi.zAdd(redisKey, { score: now, value: `${now}:${cost}` });
    multi.expire(redisKey, windowSec + 30);
    await multi.exec();

    const countResult = await this.client.zRange(redisKey, 0, -1);
    let count = 0;
    for (const entry of countResult) {
      const parts = entry.split(':');
      if (parts.length === 2) {
        count += parseInt(parts[1]!, 10);
      }
    }

    if (count > MAX_BUCKETS) {
      await this.sweep(now);
    }

    return { count, resetAt };
  }

  async reset(): Promise<void> {
    if (!this.enabled || !this.client) return;
    const keys = await this.client.keys('ratelimit:*');
    if (keys.length > 0) {
      await this.client.del(keys);
    }
  }

  async stats(): Promise<{ buckets: number }> {
    if (!this.enabled || !this.client) return { buckets: 0 };
    const keys = await this.client.keys('ratelimit:*');
    return { buckets: keys.length };
  }

  async sweep(now: number = Date.now()): Promise<number> {
    if (!this.enabled || !this.client) return 0;
    const keys = await this.client.keys('ratelimit:*');
    let removed = 0;
    for (const key of keys) {
      const removedCount = await this.client.zRemRangeByScore(key, 0, now);
      removed += removedCount;
    }
    return removed;
  }
}

let store: RateLimitStore | null = null;
let storeInitialized = false;

async function getStore(): Promise<RateLimitStore> {
  if (store) return store;

  if (!storeInitialized) {
    storeInitialized = true;

    // Try Redis first
    try {
      const redisStore = new RedisStore();
      await redisStore.init();
      if (redisStore['enabled']) {
        store = redisStore;
        console.log('[RateLimit] Using Redis store');
        return store;
      }
    } catch {
      // Fall through to in-memory store
    }

    // Fallback to in-memory store (never null)
    store = new MemoryStore();
    console.log('[RateLimit] Using in-memory store (Redis unavailable)');
  }

  return store!;
}

export interface RateLimitOptions {
  max?: number;
  windowMs?: number;
  authMax?: number;
  loginMaxPerIp?: number;
  loginMax?: number;
  loginWindowMs?: number;
}

export function parseRateLimitEnv(env: Record<string, string | undefined> = process.env): RateLimitSettings {
  return parseRateLimitSettings(env);
}

export async function resetRateLimiter(): Promise<void> {
  const s = await getStore();
  await s.reset();
}

export async function rateLimiterStats(): Promise<{ buckets: number }> {
  const s = await getStore();
  return s.stats();
}

export async function sweepExpiredBuckets(now: number = Date.now()): Promise<number> {
  const s = await getStore();
  return s.sweep(now);
}

function readEnv(name: string): string {
  return (process.env[name] ?? '').trim();
}

function isPrivateOrLoopback(ip: string): boolean {
  if (ip === '::1' || ip === 'localhost') return true;
  if (/^127\./.test(ip)) return true;
  if (/^10\./.test(ip)) return true;
  if (/^192\.168\./.test(ip)) return true;
  if (/^169\.254\./.test(ip)) return true;
  const second = Number(ip.split('.')[1] ?? NaN);
  if (ip.startsWith('172.') && second >= 16 && second <= 31) return true;
  if (/^f[cd]/i.test(ip) || /^fe[89ab]/i.test(ip)) return true;
  return false;
}

function isExplicitlyTrusted(ip: string): boolean {
  const raw = readEnv('TRUSTED_PROXIES');
  if (!raw) return false;
  return raw.split(',').some((entry) => {
    const value = entry.trim();
    if (!value) return false;
    if (value === ip) return true;
    if (!value.includes('/')) return false;
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

export function socketPeerIp(c: Context): string | null {
  const env = c.env as unknown as { incoming?: { socket?: { remoteAddress?: string } } } | undefined;
  const raw = env?.incoming?.socket?.remoteAddress ?? null;
  if (!raw) return null;
  return raw.startsWith('::ffff:') ? raw.slice(7) : raw;
}

function clientFromForwarded(value: string): string | null {
  const hops = value.split(',').map((s) => s.trim()).filter(Boolean);
  if (hops.length === 0) return null;
  for (let i = hops.length - 1; i >= 0; i--) {
    const hop = hops[i]!;
    if (!isTrustedProxy(hop)) return hop;
  }
  return hops[0] ?? null;
}

export function resolveClientIp(c: Context): string {
  const peer = socketPeerIp(c);
  const forwarded = c.req.header('X-Forwarded-For');
  const realIp = c.req.header('X-Real-IP');
  const trust = readEnv('TRUST_PROXY').toLowerCase();

  const trusted = trust === 'true' || trust === '1' || trust === 'on';
  const distrusted = trust === 'false' || trust === '0' || trust === 'off';

  if (distrusted) return peer ?? 'unknown';
  if (!peer) {
    if (forwarded) return clientFromForwarded(forwarded) ?? 'unknown';
    return realIp?.trim() || 'unknown';
  }
  if (!trusted && !isTrustedProxy(peer)) return peer;
  if (forwarded) return clientFromForwarded(forwarded) ?? peer;
  if (realIp) return realIp.trim() || peer;
  return peer;
}

let jwtSecretCache: string | null = null;
function jwtSecret(): string {
  if (jwtSecretCache === null) jwtSecretCache = loadConfig().auth.jwtSecret;
  return jwtSecretCache;
}

function subjectFromAccessToken(token: string): string | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [headerPart, payloadPart, signature] = parts;
  if (!headerPart || !payloadPart || !signature) return null;

  try {
    const header = JSON.parse(Buffer.from(headerPart, 'base64url').toString('utf8')) as { alg?: string };
    if (header.alg !== 'RS256' && header.alg !== 'HS256') return null;

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

export function authenticatedUserId(c: Context): string | null {
  const cookieToken = readCookie(c.req.header('Cookie'), 'access_token');
  const bearer = c.req.header('Authorization')?.startsWith('Bearer ')
    ? c.req.header('Authorization')!.slice(7)
    : undefined;
  const token = cookieToken ?? bearer;
  return token ? subjectFromAccessToken(token) : null;
}

export function clientKey(c: Context): string {
  const userId = authenticatedUserId(c);
  return userId ? `u:${userId}` : `ip:${resolveClientIp(c)}`;
}

export function requestCost(method: string): number {
  return ['GET', 'HEAD', 'OPTIONS', 'TRACE'].includes(method.toUpperCase()) ? 1 : 5;
}

export function isExemptPath(method: string, path: string): boolean {
  if (path === '/health' || path.startsWith('/api/v1/health') || path === '/metrics') return true;
  const get = method.toUpperCase() === 'GET';
  if (get && path.startsWith('/api/v1/media/file/')) return true;
  if (get && path === '/api/v1/auth/csrf') return true;
  return false;
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

export function rateLimitMiddleware(options: RateLimitOptions = {}) {
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
    const storeInstance = await getStore();
    const result = await storeInstance.consume(key, requestCost(c.req.method), windowMs, now);

    if (result.count > limit) {
      return rateLimitResponse(c, limit, result.resetAt);
    }

    c.header('X-RateLimit-Limit', String(limit));
    c.header('X-RateLimit-Remaining', String(Math.max(0, limit - result.count)));
    await next();
    return;
  };
}

export function pluginRateLimitMiddleware(pluginName: string, rpm?: number, tenantId?: string | null) {
  loadConfig();
  const limit = rpm && rpm > 0 ? Math.floor(rpm) : 120;
  const windowMs = 60_000;

  return async (c: Context, next: Next): Promise<Response | undefined> => {
    const now = Date.now();
    const storeInstance = await getStore();
    const result = await storeInstance.consume(`plugin-routes:${tenantId ?? 'platform'}:${pluginName}`, 1, windowMs, now);

    if (result.count > limit) {
      return rateLimitResponse(c, limit, result.resetAt);
    }

    c.header('X-RateLimit-Limit', String(limit));
    c.header('X-RateLimit-Remaining', String(Math.max(0, limit - result.count)));
    await next();
    return;
  };
}

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
    const apiKeyPrefix = typeof body?.apiKey === 'string'
      ? (body.apiKey.trim().split('_')[1] ?? '').slice(0, 32)
      : '';
    const now = Date.now();
    const storeInstance = await getStore();

    const ipKey = `login:ip:${ip}`;
    const ipResult = await storeInstance.consume(ipKey, 1, windowMs, now);
    if (ipResult.count > loginMaxPerIp) {
      return rateLimitResponse(c, loginMaxPerIp, ipResult.resetAt);
    }

    if (email) {
      const emailKey = `login:email:${email}`;
      const emailResult = await storeInstance.consume(emailKey, 1, windowMs, now);
      if (emailResult.count > loginMax) {
        return rateLimitResponse(c, loginMax, emailResult.resetAt);
      }
    }

    if (apiKeyPrefix) {
      const keyResult = await storeInstance.consume(`login:key:${apiKeyPrefix}`, 1, windowMs, now);
      if (keyResult.count > loginMax) {
        return rateLimitResponse(c, loginMax, keyResult.resetAt);
      }
    }

    await next();
    return;
  };
}