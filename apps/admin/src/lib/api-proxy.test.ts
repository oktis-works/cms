// @oktis-works/admin - lib/api-proxy: forward /api/* → ADMIN_API_PROXY_TARGET

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { proxyApiRequest } from './api-proxy.js';

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => vi.unstubAllGlobals());

// Helper para acessar chamadas do mock de forma segura (mesmo padrão de api.test.ts)
function call(i: number): [string, RequestInit & { duplex?: string }] {
  const c = fetchMock.mock.calls[i];
  if (!c) throw new Error(`Mock call ${i} not found`);
  return c as [string, RequestInit & { duplex?: string }];
}

describe('proxyApiRequest', () => {
  it('encaminha método, caminho, query e corpo para o alvo', async () => {
    fetchMock.mockResolvedValue(new Response('{"ok":true}', {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }));

    const request = new Request('http://localhost:3011/api/v1/auth/login?x=1', {
      method: 'POST',
      body: '{"email":"a@b.c"}',
      headers: {
        'content-type': 'application/json',
        host: 'localhost:3011',
        cookie: 'csrf_token=t',
      },
    });

    const res = await proxyApiRequest('http://localhost:3000', request);

    expect(fetchMock).toHaveBeenCalledWith('http://localhost:3000/api/v1/auth/login?x=1', expect.anything());
    const [url, init] = call(0);
    expect(url).not.toContain('/api/api/');
    expect(init.method).toBe('POST');
    const fwd = new Headers(init.headers);
    expect(fwd.get('host')).toBeNull();          // identidade removida
    expect(fwd.get('content-type')).toBe('application/json');
    expect(fwd.get('cookie')).toBe('csrf_token=t');
    expect(init.body).toBeTruthy();              // corpo passa como stream
    expect(init.duplex).toBe('half');

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it('alvo com barra final não gera // no upstream', async () => {
    fetchMock.mockResolvedValue(new Response('ok', { status: 200 }));
    const request = new Request('http://localhost:3011/api/v1/auth/csrf');

    await proxyApiRequest('http://localhost:3000/', request);

    expect(String(call(0)[0])).toBe('http://localhost:3000/api/v1/auth/csrf');
  });

  it('GET não envia corpo', async () => {
    fetchMock.mockResolvedValue(new Response('ok', { status: 200 }));
    const request = new Request('http://localhost:3011/api/v1/contents');

    await proxyApiRequest('http://localhost:3000', request);

    const init = call(0)[1];
    expect(init.body).toBeUndefined();
    expect(init.duplex).toBeUndefined();
  });

  it('repassa múltiplos Set-Cookie item a item (sessão + csrf)', async () => {
    const upstreamHeaders = new Headers({ 'content-type': 'application/json' });
    upstreamHeaders.append('set-cookie', 'csrf_token=abc; Path=/; SameSite=Lax');
    upstreamHeaders.append('set-cookie', 'session=xyz; Path=/; HttpOnly; SameSite=Lax');
    fetchMock.mockResolvedValue(new Response('{"ok":true}', { status: 200, headers: upstreamHeaders }));

    const res = await proxyApiRequest('http://localhost:3000', new Request('http://localhost:3011/api/v1/auth/login', { method: 'POST', body: '{}' }));

    const cookies = res.headers.getSetCookie();
    expect(cookies).toHaveLength(2);
    expect(cookies[0]).toContain('csrf_token=abc');
    expect(cookies[1]).toContain('session=xyz');
  });

  it('API fora do ar → 502 JSON em vez de estourar exceção', async () => {
    fetchMock.mockRejectedValue(new Error('ECONNREFUSED'));

    const res = await proxyApiRequest('http://localhost:3000', new Request('http://localhost:3011/api/v1/auth/csrf'));

    expect(res.status).toBe(502);
    const body = await res.json() as { error: string };
    expect(body.error).toBe('API unreachable');
  });

  it('preserva status e statusText da API (401 de login chega ao browser)', async () => {
    fetchMock.mockResolvedValue(new Response('{"error":"invalid_credentials"}', {
      status: 401,
      headers: { 'content-type': 'application/json' },
    }));

    const res = await proxyApiRequest('http://localhost:3000', new Request('http://localhost:3011/api/v1/auth/login', { method: 'POST', body: '{}' }));

    expect(res.status).toBe(401);
    expect((await res.json() as { error: string }).error).toBe('invalid_credentials');
  });
});
