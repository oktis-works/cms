// @oktis-works/api - Rate limit (rest-api-003)

import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@oktis-works/core', () => ({
  establishTenantContext: vi.fn(async () => undefined),
}));

import { Hono } from 'hono';
import { rateLimitMiddleware, resetRateLimiter, parseRateLimitEnv } from './rate-limit.js';

function buildApp(max: number) {
  const app = new Hono();
  app.use('*', rateLimitMiddleware({ max, windowMs: 60_000 }));
  app.get('/api/v1/things', (c) => c.json({ ok: true }));
  app.get('/health', (c) => c.json({ status: 'ok' }));
  return app;
}

beforeEach(() => {
  resetRateLimiter();
});

describe('parseRateLimitEnv', () => {
  it('lê env com defaults sensatos', () => {
    expect(parseRateLimitEnv({})).toEqual({ max: 300, windowMs: 60_000 });
    expect(parseRateLimitEnv({ RATE_LIMIT_MAX: '10', RATE_LIMIT_WINDOW_SECONDS: '30' })).toEqual({
      max: 10,
      windowMs: 30_000,
    });
    expect(parseRateLimitEnv({ RATE_LIMIT_MAX: 'abc' })).toEqual({ max: 300, windowMs: 60_000 });
  });
});

describe('rateLimitMiddleware', () => {
  it('permite até max requisições e devolve 429 + Retry-After na excedente', async () => {
    const app = buildApp(3);
    const headers = { 'X-Tenant-ID': 't1', 'X-Forwarded-For': '10.0.0.1' };

    for (let i = 0; i < 3; i++) {
      const res = await app.request('/api/v1/things', { headers });
      expect(res.status).toBe(200);
    }

    const blocked = await app.request('/api/v1/things', { headers });
    expect(blocked.status).toBe(429);
    expect(Number(blocked.headers.get('Retry-After'))).toBeGreaterThan(0);
    expect(blocked.headers.get('X-RateLimit-Limit')).toBe('3');
    const body = (await blocked.json()) as { error: string };
    expect(body.error).toBe('TOO_MANY_REQUESTS');
  });

  it('buckets separados por tenant+IP', async () => {
    const app = buildApp(1);
    const h1 = { 'X-Tenant-ID': 't1', 'X-Forwarded-For': '10.0.0.1' };
    const h2 = { 'X-Tenant-ID': 't2', 'X-Forwarded-For': '10.0.0.2' };

    expect((await app.request('/api/v1/things', { headers: h1 })).status).toBe(200);
    expect((await app.request('/api/v1/things', { headers: h1 })).status).toBe(429);
    expect((await app.request('/api/v1/things', { headers: h2 })).status).toBe(200);
  });

  it('health fica isento do limite', async () => {
    const app = buildApp(1);
    expect((await app.request('/health')).status).toBe(200);
    expect((await app.request('/health')).status).toBe(200);
    expect((await app.request('/health')).status).toBe(200);
  });
});
