// @oktis-works/api - Rate limiting por janela deslizante in-memory (REQU-020/rest-api-003)

import type { Context, Next } from 'hono';

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

export interface RateLimitOptions {
  max?: number;
  windowMs?: number;
}

export function parseRateLimitEnv(env: Record<string, string | undefined> = process.env): {
  max: number;
  windowMs: number;
} {
  const max = Number(env['RATE_LIMIT_MAX'] ?? 300);
  const windowSeconds = Number(env['RATE_LIMIT_WINDOW_SECONDS'] ?? 60);
  return {
    max: Number.isFinite(max) && max > 0 ? Math.floor(max) : 300,
    windowMs: Number.isFinite(windowSeconds) && windowSeconds > 0 ? windowSeconds * 1000 : 60_000,
  };
}

export function clientKey(c: Context): string {
  const tenant = c.req.header('X-Tenant-ID') ?? 'platform';
  const ip =
    c.req.header('X-Forwarded-For')?.split(',')[0]?.trim() ??
    c.req.header('X-Real-IP') ??
    'unknown';
  return `${tenant}:${ip}`;
}

/** Reseta os buckets (uso em testes). */
export function resetRateLimiter(): void {
  buckets.clear();
}

/**
 * Janela deslizante simples: 429 + Retry-After quando excede o limite.
 * /health e /metrics ficam de fora (probes não devem ser limitados).
 */
export function rateLimitMiddleware(options: RateLimitOptions = {}) {
  const { max, windowMs } = { ...parseRateLimitEnv(), ...options };

  return async (c: Context, next: Next): Promise<Response | undefined> => {
    const path = new URL(c.req.url).pathname;
    if (path === '/health' || path.startsWith('/api/v1/health') || path.startsWith('/metrics')) {
      await next();
      return;
    }

    const key = clientKey(c);
    const now = Date.now();
    const bucket = buckets.get(key);

    if (!bucket || bucket.resetAt <= now) {
      buckets.set(key, { count: 1, resetAt: now + windowMs });
      c.header('X-RateLimit-Limit', String(max));
      c.header('X-RateLimit-Remaining', String(max - 1));
      await next();
      return;
    }

    bucket.count += 1;

    if (bucket.count > max) {
      const retryAfter = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
      c.header('Retry-After', String(retryAfter));
      c.header('X-RateLimit-Limit', String(max));
      c.header('X-RateLimit-Remaining', '0');
      return c.json(
        { error: 'TOO_MANY_REQUESTS', message: `Rate limit exceeded. Retry after ${retryAfter}s.` },
        429
      );
    }

    c.header('X-RateLimit-Limit', String(max));
    c.header('X-RateLimit-Remaining', String(Math.max(0, max - bucket.count)));
    await next();
    return;
  };
}
