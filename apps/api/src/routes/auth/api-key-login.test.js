// @oktis-works/api - POST /auth/api-key-login: troca API key por JWTs híbridos
import { describe, it, expect, vi, beforeEach } from 'vitest';
const { loginWithApiKey } = vi.hoisted(() => ({ loginWithApiKey: vi.fn() }));
vi.mock('@oktis-works/auth', () => ({
    AuthService: vi.fn(() => ({
        loginWithApiKey,
        register: vi.fn(),
        login: vi.fn(),
        refreshToken: vi.fn(),
        logout: vi.fn(),
        verifyToken: vi.fn(),
    })),
}));
vi.mock('@oktis-works/config', () => ({
    loadConfig: vi.fn(() => ({
        app: { nodeEnv: 'test' },
        auth: {
            cookie: { sameSite: 'lax', secure: false, accessTokenMaxAge: 900, refreshTokenMaxAge: 2592000 },
            csrf: { enabled: true, headerName: 'x-csrf-token', cookieName: 'csrf_token' },
        },
    })),
}));
vi.mock('@oktis-works/core', () => ({
    establishTenantContext: vi.fn(async () => undefined),
}));
vi.mock('@oktis-works/database', () => ({
    getConnection: vi.fn(() => ({
        unsafe: vi.fn(async (query) => {
            // resolveTenantFromHost (loopback → tenant default) e o SELECT de /me
            if (query.includes('FROM tenants'))
                return [{ id: 'tenant-1', slug: 'default' }];
            if (query.includes('FROM users'))
                return [{ id: 'user-1', email: 'a@b.c', name: 'A' }];
            return [];
        }),
    })),
}));
import authRouter from './index.js';
const RESULT = {
    user: { id: 'user-1', email: 'a@b.c', name: 'A' },
    accessToken: 'access-jwt',
    refreshToken: 'refresh-token',
    sessionId: 'session-1',
    tenantId: 'tenant-1',
};
beforeEach(() => {
    vi.clearAllMocks();
    loginWithApiKey.mockResolvedValue(RESULT);
});
describe('POST /auth/api-key-login', () => {
    it('cliente API-first (sem Origin) recebe accessToken + refreshToken no body', async () => {
        const res = await authRouter.request('/api-key-login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Host: 'localhost:3010' },
            body: JSON.stringify({ apiKey: 'okcms_abc123_secret' }),
        });
        const body = (await res.json());
        expect(res.status).toBe(200);
        expect(body['accessToken']).toBe('access-jwt');
        expect(body['refreshToken']).toBe('refresh-token');
        expect(body['user']).toMatchObject({ id: 'user-1' });
        expect(loginWithApiKey).toHaveBeenCalledWith(expect.objectContaining({ apiKey: 'okcms_abc123_secret', tenantId: 'tenant-1' }));
    });
    it('browser (com Origin) recebe só user + tenantId; tokens vão em cookie HttpOnly', async () => {
        const res = await authRouter.request('/api-key-login', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Host: 'localhost:3010',
                Origin: 'http://localhost:3011',
            },
            body: JSON.stringify({ apiKey: 'okcms_abc123_secret' }),
        });
        const body = (await res.json());
        const cookies = res.headers.getSetCookie?.() ?? [];
        expect(res.status).toBe(200);
        expect(body).not.toHaveProperty('accessToken');
        expect(cookies.some((c) => c.startsWith('access_token='))).toBe(true);
        expect(cookies.some((c) => c.startsWith('refresh_token='))).toBe(true);
    });
    it('400 quando apiKey ausente', async () => {
        const res = await authRouter.request('/api-key-login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Host: 'localhost:3010' },
            body: JSON.stringify({}),
        });
        expect(res.status).toBe(400);
        expect(loginWithApiKey).not.toHaveBeenCalled();
    });
    it('401 quando a key é inválida, expirada ou revogada', async () => {
        loginWithApiKey.mockResolvedValue(null);
        const res = await authRouter.request('/api-key-login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Host: 'localhost:3010' },
            body: JSON.stringify({ apiKey: 'okcms_revogada_x' }),
        });
        expect(res.status).toBe(401);
    });
});
//# sourceMappingURL=api-key-login.test.js.map