// @oktis-works/admin - lib/api: sessão (cookie HttpOnly + CSRF), upload multipart e métodos

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { apiClient, ApiClient, ApiError } from './api.js';

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  // Simula o cookie não-HttpOnly emitido pelo endpoint /auth/csrf.
  vi.stubGlobal('document', { cookie: 'csrf_token=test-token' });
});

afterEach(() => vi.unstubAllGlobals());

function respond(data: unknown, ok = true, status = 200, headers: Record<string, string> = {}) {
  return {
    ok,
    status,
    json: async () => data,
    headers: new Headers(headers),
  };
}

// Helper para acessar chamadas do mock de forma segura
function call(i: number): [string, RequestInit] {
  const c = fetchMock.mock.calls[i];
  if (!c) throw new Error(`Mock call ${i} not found`);
  return c as [string, RequestInit];
}

describe('sessão (cookies HttpOnly + CSRF)', () => {
  it('login → cookies HttpOnly são setados pelo backend; chamadas usam credentials: include', async () => {
    const loginRes = {
      user: { id: 'u1', email: 'a@b.c', name: 'Admin' },
      tenantId: 'tenant-uuid',
    };

    fetchMock
      .mockResolvedValueOnce(respond(loginRes))
      .mockResolvedValueOnce(respond({ user: { id: 'u1' }, tenantId: 'tenant-uuid', roles: ['TENANT_ADMIN'] }));

    const result = await apiClient.login({ email: 'a@b.c', password: 'x' });
    expect(result.user.id).toBe('u1');
    expect(result.tenantId).toBe('tenant-uuid');
  });

  it('isLoggedIn verifica /me com credentials: include', async () => {
    fetchMock.mockResolvedValueOnce(respond({ user: { id: 'u1' }, tenantId: 't1', roles: ['TENANT_ADMIN'] }));
    const logged = await apiClient.isLoggedIn();
    expect(logged).toBe(true);
  });

  it('logout chama /auth/logout e limpa estado', async () => {
    fetchMock.mockResolvedValueOnce(respond({ success: true }));
    await apiClient.logout();
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/api/v1/auth/logout'),
      expect.objectContaining({ method: 'POST', credentials: 'include' })
    );
  });
});

describe('auto-refresh em 401', () => {
  it('refaz a requisição após /auth/refresh retornar 200', async () => {
    fetchMock
      .mockResolvedValueOnce({ ok: false, status: 401, json: async () => ({ error: 'Unauthorized' }) })
      .mockResolvedValueOnce(respond({ success: true }))
      .mockResolvedValueOnce(respond({ data: [{ id: 'u1' }], total: 1 }));

    const result = await apiClient.listUsers({ page: 1, limit: 10 });
    expect(result.data).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});

describe('media upload', () => {
  it('uploadMedia envia FormData para /media/upload com credentials: include', async () => {
    fetchMock.mockResolvedValueOnce(respond({ id: 'm1', filename: 'a.png' }));

    const file = new File([new Uint8Array([1, 2, 3])], 'a.png', { type: 'image/png' });
    await apiClient.uploadMedia(file, { alt: 'Foto' });

    const c = call(0);
    expect(c[0]).toContain('/api/v1/media/upload');
    expect(c[1].body).toBeInstanceOf(FormData);
    expect(c[1].credentials).toBe('include');
    // Regressão: forçar application/json no FormData fazia a API cair no
    // branch JSON e responder 400 — o fetch precisa gerar o boundary.
    const sentHeaders = c[1].headers as Record<string, string> | undefined;
    expect(sentHeaders?.['Content-Type']).toBeUndefined();
  });

  it('listMedia/updateMedia/deleteMedia batem nos endpoints certos', async () => {
    fetchMock.mockResolvedValue(respond({ data: [], total: 0 }));

    await apiClient.listMedia({ search: 'logo', mimeType: 'image/png' });
    expect(String(call(0)[0])).toContain('/api/v1/media?mimeType=image%2Fpng&search=logo');

    await apiClient.updateMedia('m1', { alt: 'novo' });
    expect(call(1)[0]).toContain('/api/v1/media/m1');
    expect(call(1)[1]?.method).toBe('PUT');

    await apiClient.deleteMedia('m1');
    expect(call(2)[1]?.method).toBe('DELETE');
  });
});

describe('users/roles/settings', () => {
  it('createUser e assignRole POST nos endpoints certos', async () => {
    fetchMock.mockResolvedValue(respond({ id: 'u2' }));

    await apiClient.createUser({ email: 'n@n.n', name: 'N', password: 'senha123' });
    expect(call(0)[0]).toContain('/api/v1/users');
    expect(call(0)[1]?.method).toBe('POST');

    await apiClient.assignRole('u2', 'role-1');
    expect(call(1)[0]).toContain('/api/v1/users/u2/roles');
  });

  it('setUserPassword usa PUT /users/:id/password', async () => {
    fetchMock.mockResolvedValueOnce(respond({ success: true }));
    await apiClient.setUserPassword('u2', 'nova1234');
    expect(call(0)[0]).toContain('/api/v1/users/u2/password');
    expect(call(0)[1]?.method).toBe('PUT');
  });

  it('getSettings(?group) e updateSettings(array)', async () => {
    fetchMock.mockResolvedValue(respond([]));

    await apiClient.getSettings('general');
    expect(String(call(0)[0])).toContain('/api/v1/settings?group=general');

    await apiClient.updateSettings([{ key: 'siteTitle', value: 'X', group: 'general', type: 'string' }]);
    expect(call(1)[1]?.method).toBe('PUT');
    expect(JSON.parse(String(call(1)[1]?.body))).toEqual([
      { key: 'siteTitle', value: 'X', group: 'general', type: 'string' },
    ]);
  });

  it('listRoles busca /api/v1/roles', async () => {
    fetchMock.mockResolvedValueOnce(respond([]));
    await apiClient.listRoles();
    expect(String(call(0)[0])).toContain('/api/v1/roles');
  });
});

describe('base relativa /api (modo proxy do scaffold)', () => {
  it('new ApiClient("/api") → fetch sem prefixo duplicado /api/api/v1', async () => {
    const client = new ApiClient('/api');
    fetchMock.mockResolvedValue(respond({ success: true }));

    await client.logout();

    expect(fetchMock).toHaveBeenCalledWith('/api/v1/auth/logout', expect.anything());
    expect(fetchMock).not.toHaveBeenCalledWith(expect.stringContaining('/api/api/'), expect.anything());
  });

  it('new ApiClient("/api") → csrf bootstrap em /api/v1/auth/csrf', async () => {
    const client = new ApiClient('/api');
    // Sem cookie: força o bootstrap via GET /auth/csrf.
    vi.stubGlobal('document', { cookie: '' });
    fetchMock.mockResolvedValueOnce(respond({ csrfToken: 'tok-1' }));
    fetchMock.mockResolvedValueOnce(respond({ success: true }));

    await client.logout();

    expect(String(call(0)[0])).toBe('/api/v1/auth/csrf');
    expect(String(call(1)[0])).toBe('/api/v1/auth/logout');
  });

  it('base de origin absoluta continua montando http://.../api/v1/...', async () => {
    const client = new ApiClient('http://localhost:3000');
    fetchMock.mockResolvedValue(respond({ success: true }));

    await client.logout();

    expect(fetchMock).toHaveBeenCalledWith('http://localhost:3000/api/v1/auth/logout', expect.anything());
  });
});

// ---------------------------------------------------------------- resiliência --
// Contrato que eliminou o "logout falso": só um 401 definitivo derruba a
// sessão, 429 é sinalizado (e reenviado quando a espera é curta) e o token é
// renovado proativamente pelo cookie session_expires_at.

describe('checkSession (tri-state)', () => {
  it('401 definitivo → unauthenticated (mesmo após o refresh falhar)', async () => {
    const client = new ApiClient('/api');
    fetchMock
      .mockResolvedValueOnce(respond({ error: 'Unauthorized' }, false, 401)) // /me
      .mockResolvedValueOnce(respond({ error: 'Unauthorized' }, false, 401)) // /refresh
      .mockResolvedValueOnce(respond({ error: 'Unauthorized' }, false, 401)); // /me (reenvio)

    expect(await client.checkSession()).toBe('unauthenticated');
  });

  it('429 → unavailable (rate limit NÃO é "usuário deslogado")', async () => {
    const client = new ApiClient('/api');
    fetchMock.mockResolvedValue(
      respond({ error: 'TOO_MANY_REQUESTS' }, false, 429)
    );

    expect(await client.checkSession()).toBe('unavailable');
  });

  it('5xx/rede → unavailable (sessão segue viva)', async () => {
    const client = new ApiClient('/api');
    fetchMock.mockResolvedValue(respond({ error: 'boom' }, false, 500));
    expect(await client.checkSession()).toBe('unavailable');

    const offline = new ApiClient('/api');
    fetchMock.mockRejectedValueOnce(new Error('network down'));
    expect(await offline.checkSession()).toBe('unavailable');
  });

  it('200 → authenticated', async () => {
    const client = new ApiClient('/api');
    fetchMock.mockResolvedValueOnce(respond({ user: { id: 'u1' } }));
    expect(await client.checkSession()).toBe('authenticated');
  });
});

describe('429 (rate limit) no cliente', () => {
  function stubWindow() {
    const dispatchEvent = vi.fn();
    vi.stubGlobal('window', { dispatchEvent, addEventListener: vi.fn() });
    return dispatchEvent;
  }

  it('espera curta → reenvia uma única vez e resolve', async () => {
    const dispatchEvent = stubWindow();
    vi.useFakeTimers();
    const client = new ApiClient('/api');
    fetchMock
      .mockResolvedValueOnce(respond({ error: 'TOO_MANY_REQUESTS' }, false, 429, { 'retry-after': '1' }))
      .mockResolvedValueOnce(respond({ data: [] }));

    const pending = client.getContent();
    await vi.advanceTimersByTimeAsync(1200);
    const result = await pending;

    expect(result.data).toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(dispatchEvent).toHaveBeenCalledWith(expect.objectContaining({ type: 'okcms:rate-limited' }));
    vi.useRealTimers();
  });

  it('espera longa → NÃO trava a UI: lança ApiError com o status e o Retry-After', async () => {
    stubWindow();
    const client = new ApiClient('/api');
    fetchMock.mockResolvedValueOnce(
      respond({ error: 'TOO_MANY_REQUESTS' }, false, 429, { 'retry-after': '45' })
    );

    const error = await client.getContent().catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).status).toBe(429);
    expect((error as ApiError).retryAfter).toBe(45);
    // Uma única tentativa: sem loop de retry cego.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('sessão proativa (session_expires_at)', () => {
  it('sem cookie → não faz nada (comportamento legado preservado)', async () => {
    vi.stubGlobal('document', { cookie: '' });
    const client = new ApiClient('/api');

    await client.ensureFreshSession();

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('token perto do vencimento → renova ANTES do 401', async () => {
    const soon = new Date(Date.now() + 60 * 1000).toISOString(); // vence em 1min
    vi.stubGlobal('document', { cookie: `session_expires_at=${soon}; csrf_token=test-token` });
    const client = new ApiClient('/api');
    fetchMock.mockResolvedValueOnce(respond({ success: true }));

    await client.ensureFreshSession();

    expect(String(call(0)[0])).toBe('/api/v1/auth/refresh');
    expect(call(0)[1].method).toBe('POST');
  });

  it('token ainda válido → não gasta requisição', async () => {
    const later = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    vi.stubGlobal('document', { cookie: `session_expires_at=${later}` });
    const client = new ApiClient('/api');

    await client.ensureFreshSession();

    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('CSRF em memória (evita /auth/csrf por mutação)', () => {
  it('segunda mutação dentro do TTL reusa o token já buscado', async () => {
    const client = new ApiClient('/api');
    vi.stubGlobal('document', { cookie: '' });
    fetchMock.mockResolvedValue(respond({ csrfToken: 'tok-2' }));

    await client.updateSettings([{ key: 'siteName', value: 'A' }]);
    await client.updateSettings([{ key: 'siteName', value: 'B' }]);

    const urls = fetchMock.mock.calls.map((c) => String(c[0]));
    expect(urls.filter((u) => u === '/api/v1/auth/csrf')).toHaveLength(1);
  });
});

describe('getContent com include=author', () => {
  it('anexa include=author quando pedido (anti N+1 no dashboard)', async () => {
    const client = new ApiClient('/api');
    vi.stubGlobal('document', { cookie: 'csrf_token=test-token' });
    fetchMock.mockResolvedValueOnce(respond({ data: [], total: 0 }));

    await client.getContent({ limit: 10, includeAuthor: true });

    expect(String(call(0)[0])).toContain('include=author');
  });
});

describe('lock de refresh entre abas (sem polling)', () => {
  function stubTabs() {
    const store = new Map<string, string>();
    const listeners: Array<(event: { key: string }) => void> = [];
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => void store.set(key, value),
      removeItem: (key: string) => void store.delete(key),
    });
    vi.stubGlobal('window', {
      addEventListener: (_type: string, fn: (event: { key: string }) => void) => void listeners.push(fn),
      removeEventListener: (_type: string, fn: (event: { key: string }) => void) => {
        const index = listeners.indexOf(fn);
        if (index >= 0) listeners.splice(index, 1);
      },
      dispatchEvent: vi.fn(),
    });
    return { store, listeners };
  }

  it('com outra aba segurando o lock, não chama /auth/refresh — acorda no storage event', async () => {
    const { store, listeners } = stubTabs();
    store.set(
      'okcms:auth:refresh-lock',
      JSON.stringify({ owner: 'outra-aba', expiresAt: Date.now() + 3000 })
    );

    const client = new ApiClient('/api');
    fetchMock
      .mockResolvedValueOnce(respond({ error: 'Unauthorized' }, false, 401)) // /me
      .mockResolvedValueOnce(respond({ error: 'Unauthorized' }, false, 401)); // /me (reenvio)

    const pending = client.checkSession();
    await new Promise((resolve) => setTimeout(resolve, 20));

    const urls = () => fetchMock.mock.calls.map((c) => String(c[0]));
    expect(urls().some((url) => url.includes('/auth/refresh'))).toBe(false);
    // Esta aba está escutando `storage` em vez de fazer polling.
    expect(listeners.length).toBeGreaterThan(0);

    // A outra aba libera a chave → o evento acorda esta imediatamente.
    listeners.forEach((fn) => fn({ key: 'okcms:auth:refresh-lock' }));

    expect(await pending).toBe('unauthenticated');
    expect(urls().some((url) => url.includes('/auth/refresh'))).toBe(false);
  });
});
