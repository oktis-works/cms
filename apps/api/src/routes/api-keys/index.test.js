// @oktis-works/api - rota /api-keys: criação (plaintext 1x), lista segura e revogação
import { describe, it, expect, vi, beforeEach } from 'vitest';
const { serviceMock } = vi.hoisted(() => ({
    serviceMock: {
        list: vi.fn(),
        create: vi.fn(),
        revoke: vi.fn(),
    },
}));
vi.mock('../../middleware/auth.js', () => ({
    authMiddleware: async (c, next) => {
        c.set('userId', 'admin-1');
        c.set('tenantId', 'tenant-1');
        await next();
    },
    requirePermission: () => async (_c, next) => next(),
}));
vi.mock('@oktis-works/auth', () => ({
    ApiKeyService: vi.fn(() => serviceMock),
}));
vi.mock('@oktis-works/database', () => ({
    getConnection: vi.fn(() => ({
        unsafe: vi.fn(async () => [{ id: 'user-1' }]),
    })),
}));
import router from './index.js';
const KEY = {
    id: 'key-1',
    tenantId: 'tenant-1',
    userId: 'user-1',
    name: 'App mobile',
    keyPrefix: 'a1b2c3d4e5f60718',
    oneTime: false,
    expiresAt: null,
    lastUsedAt: null,
    useCount: 0,
    revokedAt: null,
    createdBy: 'admin-1',
    createdAt: new Date('2026-01-01T00:00:00Z'),
};
beforeEach(() => vi.clearAllMocks());
describe('GET /api-keys', () => {
    it('lista as keys do tenant sem expor hash', async () => {
        serviceMock.list.mockResolvedValue([KEY]);
        const res = await router.request('/');
        const body = (await res.json());
        expect(res.status).toBe(200);
        expect(body).toHaveLength(1);
        expect(body[0]['key_prefix']).toBe(KEY.keyPrefix);
        expect(body[0]).not.toHaveProperty('key_hash');
        expect(body[0]).not.toHaveProperty('keyHash');
        expect(body[0]).not.toHaveProperty('plaintext');
        expect(serviceMock.list).toHaveBeenCalledWith('tenant-1');
    });
});
describe('POST /api-keys', () => {
    it('retorna o plaintext SOMENTE na criação (201)', async () => {
        serviceMock.create.mockResolvedValue({ ...KEY, plaintext: 'okcms_a1b2c3d4e5f60718_secret' });
        const res = await router.request('/', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: 'App mobile', userId: 'user-1' }),
        });
        const body = (await res.json());
        expect(res.status).toBe(201);
        expect(body['plaintext']).toBe('okcms_a1b2c3d4e5f60718_secret');
        expect(body['key_prefix']).toBe(KEY.keyPrefix);
        expect(serviceMock.create).toHaveBeenCalledWith(expect.objectContaining({ tenantId: 'tenant-1', userId: 'user-1', name: 'App mobile', createdBy: 'admin-1' }));
    });
    it('usa o próprio criador quando userId não é enviado', async () => {
        serviceMock.create.mockResolvedValue({ ...KEY, userId: 'admin-1', plaintext: 'okcms_x_y' });
        const res = await router.request('/', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: 'k' }),
        });
        expect(res.status).toBe(201);
        expect(serviceMock.create).toHaveBeenCalledWith(expect.objectContaining({ userId: 'admin-1' }));
    });
    it('valida nome obrigatório (400)', async () => {
        const res = await router.request('/', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: '   ' }),
        });
        expect(res.status).toBe(400);
        expect(serviceMock.create).not.toHaveBeenCalled();
    });
    it('valida expiresAt inválido (400)', async () => {
        const res = await router.request('/', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: 'k', expiresAt: 'não-é-data' }),
        });
        expect(res.status).toBe(400);
    });
});
describe('DELETE /api-keys/:id', () => {
    it('revoga e responde success', async () => {
        serviceMock.revoke.mockResolvedValue(true);
        const res = await router.request('/key-1', { method: 'DELETE' });
        expect(res.status).toBe(200);
        expect(serviceMock.revoke).toHaveBeenCalledWith('key-1', 'tenant-1');
    });
    it('404 quando já revogada ou inexistente', async () => {
        serviceMock.revoke.mockResolvedValue(false);
        const res = await router.request('/key-x', { method: 'DELETE' });
        expect(res.status).toBe(404);
    });
});
//# sourceMappingURL=index.test.js.map