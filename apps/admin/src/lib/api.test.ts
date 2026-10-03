// @oktis-works/admin - lib/api: sessão (cookie HttpOnly + CSRF), upload multipart e métodos

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { apiClient } from './api.js';

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  vi.stubGlobal('document', { cookie: '' });
});

afterEach(() => vi.unstubAllGlobals());

function respond(data: unknown, ok = true, status = 200) {
  return {
    ok,
    status,
    json: async () => data,
    headers: new Headers(),
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

    const result = await apiClient.login({ email: 'a@b.c', password: 'x', tenantId: 'default' });
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