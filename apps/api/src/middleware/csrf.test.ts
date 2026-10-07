// @oktis-works/api - CSRF double-submit (security-001)

import { describe, it, expect, vi } from 'vitest';

vi.mock('@oktis-works/core', () => ({
  establishTenantContext: vi.fn(async () => undefined),
}));

import { Hono } from 'hono';
import { csrfMiddleware, issueCsrfToken, CSRF_COOKIE, CSRF_HEADER, isSameOrigin } from './csrf.js';

function buildApp() {
  const app = new Hono();
  app.use('*', csrfMiddleware);
  app.post('/api/v1/things', (c) => c.json({ ok: true }));
  app.get('/api/v1/things', (c) => c.json({ ok: true }));
  return app;
}

describe('csrfMiddleware', () => {
  it('GET passa sem validação', async () => {
    const res = await buildApp().request('/api/v1/things');
    expect(res.status).toBe(200);
  });

  it('POST com Bearer token fica isento (API-first)', async () => {
    const res = await buildApp().request('/api/v1/things', {
      method: 'POST',
      headers: { Authorization: 'Bearer abc' },
    });
    expect(res.status).toBe(200);
  });

  it('POST de browser (com Origin) sem header CSRF é bloqueado', async () => {
    const res = await buildApp().request('/api/v1/things', {
      method: 'POST',
      headers: { Host: 'cms.local', Origin: 'https://cms.local', Cookie: `session=abc; ${CSRF_COOKIE}=tok-1` },
    });
    expect(res.status).toBe(403);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('CSRF_TOKEN_INVALID');
  });

  it('POST de browser sem cookie CSRF também é bloqueado', async () => {
    const res = await buildApp().request('/api/v1/things', {
      method: 'POST',
      headers: { Host: 'cms.local', Origin: 'https://cms.local' },
    });
    expect(res.status).toBe(403);
  });

  it('POST sem Origin/Referer (cliente não-browser: curl/SDK/CI) é isento de CSRF', async () => {
    const res = await buildApp().request('/api/v1/things', {
      method: 'POST',
      headers: { Cookie: `session=abc; ${CSRF_COOKIE}=tok-1` },
    });
    expect(res.status).toBe(200);
  });

  it('POST com cookie + header iguais e mesma origem passa', async () => {
    const res = await buildApp().request('/api/v1/things', {
      method: 'POST',
      headers: {
        Host: 'cms.local',
        Origin: 'https://cms.local',
        Cookie: `session=abc; ${CSRF_COOKIE}=tok-1`,
        [CSRF_HEADER]: 'tok-1',
      },
    });
    expect(res.status).toBe(200);
  });

  it('token divergente ou origem cruzada é rejeitado', async () => {
    const app = buildApp();

    const mismatch = await app.request('/api/v1/things', {
      method: 'POST',
      headers: {
        Host: 'cms.local',
        Origin: 'https://cms.local',
        Cookie: `${CSRF_COOKIE}=tok-1`,
        [CSRF_HEADER]: 'tok-other',
      },
    });
    expect(mismatch.status).toBe(403);

    const crossOrigin = await app.request('/api/v1/things', {
      method: 'POST',
      headers: {
        Host: 'cms.local',
        Origin: 'https://evil.example',
        Cookie: `${CSRF_COOKIE}=tok-1`,
        [CSRF_HEADER]: 'tok-1',
      },
    });
    expect(crossOrigin.status).toBe(403);
  });

  it('issueCsrfToken gera tokens únicos', () => {
    expect(issueCsrfToken()).not.toBe(issueCsrfToken());
  });
});

describe('isSameOrigin', () => {
  it('aceita host igual e TRUSTED_ORIGINS', () => {
    const ctx = (origin: string | undefined, host = 'cms.local') =>
      ({
        req: {
          header: (name: string) =>
            name === 'Origin' ? origin : name === 'Host' ? host : undefined,
        },
      }) as never;

    process.env['TRUSTED_ORIGINS'] = 'app.okcms.dev';
    try {
      expect(isSameOrigin(ctx('https://cms.local'))).toBe(true);
      expect(isSameOrigin(ctx('https://app.okcms.dev'))).toBe(true);
      expect(isSameOrigin(ctx(undefined))).toBe(false);
      expect(isSameOrigin(ctx('https://evil.example'))).toBe(false);
    } finally {
      delete process.env['TRUSTED_ORIGINS'];
    }
  });
});
