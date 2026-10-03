// @oktis-works/admin - lib/api: sessão (tenant header), upload multipart e métodos novos

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { apiClient } from './api.js';

const storage = new Map<string, string>();
const localStorageMock = {
  getItem: (k: string) => storage.get(k) ?? null,
  setItem: (k: string, v: string) => void storage.set(k, v),
  removeItem: (k: string) => void storage.delete(k),
  clear: () => storage.clear(),
};

const fetchMock = vi.fn();

// acesso tipado a uma chamada registrada (evita index opcional)
const callAt = (i: number): [string, RequestInit] => fetchMock.mock.calls[i] as [string, RequestInit];

beforeEach(() => {
  storage.clear();
  fetchMock.mockReset();
  apiClient.clearTokens();
  vi.stubGlobal('localStorage', localStorageMock);
  vi.stubGlobal('window', { localStorage: localStorageMock });
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => vi.unstubAllGlobals());

function respond(data: unknown, ok = true, status = 200) {
  return {
    ok,
    status,
    json: async () => data,
  };
}

describe('sessão', () => {
  it('login guarda tokens + tenantId e as chamadas seguintes enviam Authorization e X-Tenant-ID', async () => {
    fetchMock.mockResolvedValueOnce(
      respond({
        user: { id: 'u1' },
        accessToken: 'AT',
        refreshToken: 'RT',
        sessionId: 's1',
        tenantId: 'tenant-uuid',
      })
    );

    await apiClient.login({ email: 'a@b.c', password: 'x', tenantId: 'default' });

    expect(storage.get('accessToken')).toBe('AT');
    expect(storage.get('tenantId')).toBe('tenant-uuid');

    fetchMock.mockResolvedValueOnce(respond({ data: [], total: 0 }));
    await apiClient.listUsers({ page: 1, limit: 10 });

    const [, init] = fetchMock.mock.calls[0 + 1] as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(headers['Authorization']).toBe('Bearer AT');
    expect(headers['X-Tenant-ID']).toBe('tenant-uuid');
    expect(String(callAt(1)[0])).toContain('/api/v1/users?page=1&limit=10');
  });

  it('isLoggedIn reflete a presença do token', () => {
    expect(apiClient.isLoggedIn()).toBe(false);
    apiClient.setTokens('AT', 'RT');
    expect(apiClient.isLoggedIn()).toBe(true);
  });
});

describe('media', () => {
  it('uploadMedia envia FormData para /api/v1/media/upload com auth e SEM Content-Type', async () => {
    apiClient.setTokens('AT', 'RT', 'tenant-uuid');
    fetchMock.mockResolvedValueOnce(respond({ id: 'm1' }));

    const file = new File([new Uint8Array([1, 2, 3])], 'a.png', { type: 'image/png' });
    await apiClient.uploadMedia(file, { alt: 'Foto' });

    const [url, init] = callAt(0) as [string, RequestInit];
    expect(url).toContain('/api/v1/media/upload');
    expect(init.body).toBeInstanceOf(FormData);
    const headers = init.headers as Record<string, string>;
    expect(headers['Authorization']).toBe('Bearer AT');
    expect(headers['X-Tenant-ID']).toBe('tenant-uuid');
    expect(headers['Content-Type']).toBeUndefined();
  });

  it('uploadMedia propaga o erro da API', async () => {
    apiClient.setTokens('AT', 'RT');
    fetchMock.mockResolvedValueOnce(respond({ error: 'File too large' }, false, 413));

    await expect(apiClient.uploadMedia(new File(['x'], 'a.png'))).rejects.toThrow('File too large');
  });

  it('listMedia/updateMedia/deleteMedia batem nos endpoints certos', async () => {
    fetchMock.mockResolvedValue(respond({ data: [], total: 0 }));

    await apiClient.listMedia({ search: 'logo', mimeType: 'image/png' });
    expect(String(callAt(0)[0])).toContain('/api/v1/media?mimeType=image%2Fpng&search=logo');

    await apiClient.updateMedia('m1', { alt: 'novo' });
    expect(callAt(1)[0]).toContain('/api/v1/media/m1');
    expect(callAt(1)[1]?.method).toBe('PUT');

    await apiClient.deleteMedia('m1');
    expect(callAt(2)[1]?.method).toBe('DELETE');
  });
});

describe('users/roles/settings', () => {
  it('createUser e assignRole POST nos endpoints certos', async () => {
    fetchMock.mockResolvedValue(respond({ id: 'u2' }));

    await apiClient.createUser({ email: 'n@n.n', name: 'N', password: 'senha123' });
    expect(callAt(0)[0]).toContain('/api/v1/users');
    expect(callAt(0)[1]?.method).toBe('POST');

    await apiClient.assignRole('u2', 'role-1');
    expect(callAt(1)[0]).toContain('/api/v1/users/u2/roles');
  });

  it('setUserPassword usa PUT /users/:id/password', async () => {
    fetchMock.mockResolvedValueOnce(respond({ success: true }));
    await apiClient.setUserPassword('u2', 'nova1234');
    expect(callAt(0)[0]).toContain('/api/v1/users/u2/password');
    expect(callAt(0)[1]?.method).toBe('PUT');
  });

  it('getSettings(?group) e updateSettings(array)', async () => {
    fetchMock.mockResolvedValue(respond([]));

    await apiClient.getSettings('general');
    expect(String(callAt(0)[0])).toContain('/api/v1/settings?group=general');

    await apiClient.updateSettings([{ key: 'siteTitle', value: 'X', group: 'general', type: 'string' }]);
    expect(callAt(1)[1]?.method).toBe('PUT');
    expect(JSON.parse(String(callAt(1)[1]?.body))).toEqual([
      { key: 'siteTitle', value: 'X', group: 'general', type: 'string' },
    ]);
  });

  it('listRoles busca /api/v1/roles', async () => {
    fetchMock.mockResolvedValueOnce(respond([]));
    await apiClient.listRoles();
    expect(String(callAt(0)[0])).toContain('/api/v1/roles');
  });
});
