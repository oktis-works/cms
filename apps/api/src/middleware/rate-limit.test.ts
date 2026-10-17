// @oktis-works/api - Rate limit por classe de tráfego (rest-api-003)
//
// O contrato testado aqui é o que impediu o 429 em rajada do admin:
//   · identidade = IP real (socket/XFF do proxy) — nunca `platform:unknown`;
//   · sessão autenticada tem balde próprio por user id;
//   · `X-Tenant-ID` e `X-Forwarded-For` forjados não trocam de balde;
//   · mídia estática e bootstrap de CSRF não consomem orçamento;
//   · escrita custa mais que leitura;
//   · login tem limiter dedicado (por IP e por e-mail);
//   · buckets expirados são varridos do Map.

import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import { createHmac } from 'node:crypto';

vi.mock('@oktis-works/core', () => ({
  establishTenantContext: vi.fn(async () => undefined),
}));

import { Hono } from 'hono';
import {
  rateLimitMiddleware,
  loginRateLimitMiddleware,
  resetRateLimiter,
  parseRateLimitEnv,
  rateLimiterStats,
  sweepExpiredBuckets,
  resolveClientIp,
  requestCost,
  isExemptPath,
} from './rate-limit.js';

// Segredo determinístico para assinar access tokens nos testes (o default de
// loadConfig() quando JWT_SECRET não está definido no ambiente).
const SECRET = 'test-secret';
process.env['JWT_SECRET'] = SECRET;

function b64url(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

/** Monta um access token HS256 assinado com o mesmo algoritmo do AuthService. */
function accessToken(sub: string, overrides: { exp?: number; secret?: string } = {}): string {
  const header = b64url({ alg: 'HS256', typ: 'JWT' });
  const payload = b64url({
    sub,
    exp: overrides.exp ?? Math.floor(Date.now() / 1000) + 3600,
  });
  const signature = createHmac('sha256', overrides.secret ?? SECRET)
    .update(`${header}.${payload}`)
    .digest('base64url');
  return `${header}.${payload}.${signature}`;
}

function buildApp(max: number, options: Record<string, number> = {}) {
  const app = new Hono();
  app.use('*', rateLimitMiddleware({ max, windowMs: 60_000, ...options }));
  app.get('/api/v1/things', (c) => c.json({ ok: true }));
  app.post('/api/v1/things', (c) => c.json({ ok: true }));
  app.get('/api/v1/media/file/t1/f.png', (c) => c.text('binary'));
  app.post('/api/v1/media/file/t1/f.png', (c) => c.text('binary'));
  app.get('/api/v1/auth/csrf', (c) => c.json({ csrfToken: 'x' }));
  app.get('/health', (c) => c.json({ status: 'ok' }));
  return app;
}

beforeEach(() => {
  vi.useRealTimers();
  resetRateLimiter();
});

afterAll(() => {
  vi.useRealTimers();
});

describe('parseRateLimitEnv (fonte única: @oktis-works/config)', () => {
  it('expõe os defaults canônicos', () => {
    expect(parseRateLimitEnv({})).toEqual({
      max: 300,
      windowMs: 60_000,
      authMax: 1200,
      loginMax: 10,
      loginMaxPerIp: 100,
      loginWindowMs: 300_000,
    });
  });

  it('lê variáveis explícitas', () => {
    expect(
      parseRateLimitEnv({
        RATE_LIMIT_MAX: '10',
        RATE_LIMIT_WINDOW_SECONDS: '30',
        RATE_LIMIT_AUTH_MAX: '50',
        RATE_LIMIT_LOGIN_MAX: '3',
        RATE_LIMIT_LOGIN_WINDOW_SECONDS: '120',
      })
    ).toEqual({
      max: 10,
      windowMs: 30_000,
      authMax: 50,
      loginMax: 3,
      loginMaxPerIp: 100,
      loginWindowMs: 120_000,
    });
  });

  it('aceita RATE_LIMIT_WINDOW_MS como alias legado (era o nome gravado no .env antigo)', () => {
    expect(parseRateLimitEnv({ RATE_LIMIT_WINDOW_MS: '30000' }).windowMs).toBe(30_000);
    // Com os dois presentes, o nome canônico vence.
    expect(
      parseRateLimitEnv({ RATE_LIMIT_WINDOW_MS: '30000', RATE_LIMIT_WINDOW_SECONDS: '45' }).windowMs
    ).toBe(45_000);
  });

  it('volta aos defaults quando o valor é inválido', () => {
    expect(parseRateLimitEnv({ RATE_LIMIT_MAX: 'abc' }).max).toBe(300);
    expect(parseRateLimitEnv({ RATE_LIMIT_MAX: '-5' }).max).toBe(300);
    expect(parseRateLimitEnv({ RATE_LIMIT_WINDOW_MS: 'zero' }).windowMs).toBe(60_000);
  });
});

describe('identidade do cliente', () => {
  it('usa o hop mais à direita que NÃO é proxy (X-Forwarded-For forjado é ignorado)', async () => {
    const app = buildApp(1);
    // Cadeia plausível: atacante manda um XFF à esquerda, o proxy anexa o IP real.
    const headers = { 'X-Forwarded-For': '1.2.3.4, 203.0.113.7' };
    expect((await app.request('/api/v1/things', { headers })).status).toBe(200);
    expect((await app.request('/api/v1/things', { headers })).status).toBe(429);

    // Trocar só o valor forjado (à esquerda) NÃO cria balde novo.
    const spoofed = { 'X-Forwarded-For': '9.9.9.9, 203.0.113.7' };
    expect((await app.request('/api/v1/things', { headers: spoofed })).status).toBe(429);
  });

  it('TRUST_PROXY=false ignora X-Forwarded-For por completo', async () => {
    process.env['TRUST_PROXY'] = 'false';
    try {
      const app = buildApp(1);
      const a = { 'X-Forwarded-For': '10.0.0.1' };
      const b = { 'X-Forwarded-For': '10.0.0.2' };
      expect((await app.request('/api/v1/things', { headers: a })).status).toBe(200);
      // Sem socket e sem header confiável → mesmo balde 'unknown' para todos.
      expect((await app.request('/api/v1/things', { headers: b })).status).toBe(429);
    } finally {
      delete process.env['TRUST_PROXY'];
    }
  });

  it('resolveClientIp devolve o par do socket quando o header está ausente', () => {
    const c = {
      env: { incoming: { socket: { remoteAddress: '::ffff:198.51.100.9' } } },
      req: { header: () => undefined },
    } as never;
    expect(resolveClientIp(c)).toBe('198.51.100.9');
  });

  it('só honra X-Forwarded-For quando o par é um proxy de confiança', () => {
    const trusted = {
      env: { incoming: { socket: { remoteAddress: '127.0.0.1' } } },
      req: { header: (name: string) => (name === 'X-Forwarded-For' ? '203.0.113.7' : undefined) },
    } as never;
    expect(resolveClientIp(trusted)).toBe('203.0.113.7');

    const exposed = {
      env: { incoming: { socket: { remoteAddress: '198.51.100.20' } } },
      req: { header: (name: string) => (name === 'X-Forwarded-For' ? '1.1.1.1' : undefined) },
    } as never;
    // API exposta direto: só o socket vale, o header não troca de balde.
    expect(resolveClientIp(exposed)).toBe('198.51.100.20');
  });
});

describe('rateLimitMiddleware', () => {
  it('permite até max requisições e devolve 429 + Retry-After na excedente', async () => {
    const app = buildApp(3);
    const headers = { 'X-Forwarded-For': '10.0.0.1' };

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

  it('buckets separados por IP real do cliente', async () => {
    const app = buildApp(1);
    const a = { 'X-Forwarded-For': '10.0.0.1' };
    const b = { 'X-Forwarded-For': '10.0.0.2' };

    expect((await app.request('/api/v1/things', { headers: a })).status).toBe(200);
    expect((await app.request('/api/v1/things', { headers: a })).status).toBe(429);
    expect((await app.request('/api/v1/things', { headers: b })).status).toBe(200);
  });

  it('X-Tenant-ID não cria balde novo (antes permitia trocar de balde à vontade)', async () => {
    const app = buildApp(1);
    const ip = '10.0.0.5';
    expect((await app.request('/api/v1/things', { headers: { 'X-Tenant-ID': 't1', 'X-Forwarded-For': ip } })).status).toBe(200);
    expect((await app.request('/api/v1/things', { headers: { 'X-Tenant-ID': 't2', 'X-Forwarded-For': ip } })).status).toBe(429);
  });

  it('sessão autenticada tem balde próprio por user id (não disputa com anônimos)', async () => {
    const app = buildApp(1, { authMax: 3 });
    const userA = { Cookie: `access_token=${accessToken('user-a')}`, 'X-Forwarded-For': '10.0.0.1' };
    const userB = { Cookie: `access_token=${accessToken('user-b')}`, 'X-Forwarded-For': '10.0.0.1' };
    const anon = { 'X-Forwarded-For': '10.0.0.9' };

    for (let i = 0; i < 3; i++) {
      expect((await app.request('/api/v1/things', { headers: userA })).status).toBe(200);
    }
    expect((await app.request('/api/v1/things', { headers: userA })).status).toBe(429);
    // Outro usuário (mesmo IP) segue com orçamento integral.
    expect((await app.request('/api/v1/things', { headers: userB })).status).toBe(200);
    // O anônimo disputa apenas o balde dele (max: 1).
    expect((await app.request('/api/v1/things', { headers: anon })).status).toBe(200);
    expect((await app.request('/api/v1/things', { headers: anon })).status).toBe(429);
  });

  it('a mesma sessão compartilha o balde mesmo vindo de IPs diferentes', async () => {
    const app = buildApp(5, { authMax: 1 });
    const first = { Cookie: `access_token=${accessToken('user-c')}`, 'X-Forwarded-For': '10.0.0.1' };
    const second = { Cookie: `access_token=${accessToken('user-c')}`, 'X-Forwarded-For': '10.0.0.2' };
    expect((await app.request('/api/v1/things', { headers: first })).status).toBe(200);
    expect((await app.request('/api/v1/things', { headers: second })).status).toBe(429);
  });

  it('token forjado ou expirado cai no balde anônimo', async () => {
    const app = buildApp(1, { authMax: 5 });
    const forged = { Cookie: `access_token=${accessToken('user-a', { secret: 'wrong' })}`, 'X-Forwarded-For': '10.0.0.1' };
    const expired = { Cookie: `access_token=${accessToken('user-a', { exp: Math.floor(Date.now() / 1000) - 10 })}`, 'X-Forwarded-For': '10.0.0.1' };

    expect((await app.request('/api/v1/things', { headers: forged })).status).toBe(200);
    expect((await app.request('/api/v1/things', { headers: forged })).status).toBe(429);
    expect((await app.request('/api/v1/things', { headers: expired })).status).toBe(429);
  });

  it('health, mídia estática e bootstrap de CSRF ficam isentos', async () => {
    const app = buildApp(1);
    for (let i = 0; i < 5; i++) {
      expect((await app.request('/health')).status).toBe(200);
      expect((await app.request('/api/v1/media/file/t1/f.png')).status).toBe(200);
      expect((await app.request('/api/v1/auth/csrf')).status).toBe(200);
    }
  });

  it('escrita não é isenta (custa 5x e é limitada)', async () => {
    const app = buildApp(6);
    const headers = { 'X-Forwarded-For': '10.0.0.4' };
    expect((await app.request('/api/v1/things', { headers })).status).toBe(200); // 1
    expect((await app.request('/api/v1/things', { headers })).status).toBe(200); // 2
    // POST = 5 → total 7 > 6.
    expect((await app.request('/api/v1/things', { method: 'POST', headers })).status).toBe(429);
    // Mídia só é isenta em leitura.
    expect((await app.request('/api/v1/media/file/t1/f.png', { method: 'POST', headers })).status).toBe(429);
  });

  it('varre buckets expirados do Map (nada fica preso para sempre)', async () => {
    const app = buildApp(5);
    for (let i = 0; i < 10; i++) {
      await app.request('/api/v1/things', { headers: { 'X-Forwarded-For': `10.1.0.${i}` } });
    }
    expect(rateLimiterStats().buckets).toBe(10);

    vi.useFakeTimers();
    vi.setSystemTime(Date.now() + 61_000);
    expect(sweepExpiredBuckets()).toBe(10);
    expect(rateLimiterStats().buckets).toBe(0);
  });
});

describe('requestCost / isExemptPath', () => {
  it('leitura custa 1 e escrita custa 5', () => {
    expect(requestCost('GET')).toBe(1);
    expect(requestCost('HEAD')).toBe(1);
    expect(requestCost('OPTIONS')).toBe(1);
    expect(requestCost('POST')).toBe(5);
    expect(requestCost('PUT')).toBe(5);
    expect(requestCost('DELETE')).toBe(5);
  });

  it('só probes, mídia em leitura e CSRF bootstrap são isentos', () => {
    expect(isExemptPath('GET', '/health')).toBe(true);
    expect(isExemptPath('GET', '/metrics')).toBe(true);
    expect(isExemptPath('GET', '/api/v1/health/ready')).toBe(true);
    expect(isExemptPath('GET', '/api/v1/media/file/t/f.png')).toBe(true);
    expect(isExemptPath('POST', '/api/v1/media/file/t/f.png')).toBe(false);
    expect(isExemptPath('GET', '/api/v1/auth/csrf')).toBe(true);
    expect(isExemptPath('GET', '/api/v1/auth/login')).toBe(false);
    expect(isExemptPath('GET', '/api/v1/content')).toBe(false);
  });
});

describe('loginRateLimitMiddleware (brute force)', () => {
  function buildLoginApp(options: { loginMax: number; loginMaxPerIp: number }) {
    const app = new Hono();
    app.use('*', loginRateLimitMiddleware({ ...options, loginWindowMs: 300_000 }));
    app.post('/api/v1/auth/login', (c) => c.json({ ok: true }));
    app.get('/api/v1/auth/login', (c) => c.json({ ok: true }));
    return app;
  }

  it('deixa passar requisições que não são POST', async () => {
    const app = buildLoginApp({ loginMax: 1, loginMaxPerIp: 1 });
    expect((await app.request('/api/v1/auth/login')).status).toBe(200);
    expect((await app.request('/api/v1/auth/login')).status).toBe(200);
  });

  it('bloqueia por e-mail após o limite de tentativas', async () => {
    const app = buildLoginApp({ loginMax: 2, loginMaxPerIp: 100 });
    const attempt = (email: string) => ({
      method: 'POST' as const,
      headers: { 'X-Forwarded-For': '203.0.113.4' },
      body: JSON.stringify({ email, password: 'x' }),
    });

    expect((await app.request('/api/v1/auth/login', attempt('a@b.c'))).status).toBe(200);
    expect((await app.request('/api/v1/auth/login', attempt('a@b.c'))).status).toBe(200);
    const blocked = await app.request('/api/v1/auth/login', attempt('a@b.c'));
    expect(blocked.status).toBe(429);
    expect(Number(blocked.headers.get('Retry-After'))).toBeGreaterThan(0);

    // Outro e-mail do mesmo IP não é pego pelo balde do primeiro.
    expect((await app.request('/api/v1/auth/login', attempt('d@e.f'))).status).toBe(200);
  });

  it('também bloqueia por IP quando o atacante rotaciona e-mails', async () => {
    const app = buildLoginApp({ loginMax: 100, loginMaxPerIp: 3 });
    const attempt = (email: string) => ({
      method: 'POST' as const,
      headers: { 'X-Forwarded-For': '203.0.113.5' },
      body: JSON.stringify({ email, password: 'x' }),
    });

    for (let i = 0; i < 3; i++) {
      expect((await app.request('/api/v1/auth/login', attempt(`v${i}@b.c`))).status).toBe(200);
    }
    expect((await app.request('/api/v1/auth/login', attempt('qualquer@b.c'))).status).toBe(429);
  });
});
