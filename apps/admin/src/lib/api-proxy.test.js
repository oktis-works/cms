// @oktis-works/admin - lib/api-proxy: o IP do cliente precisa chegar à API
//
// Sem X-Forwarded-For aqui, o rate limiter da API via o IP do próprio processo
// do Admin e TODOS os usuários dividiam o mesmo balde (`platform:unknown`) —
// causa direta do 429 em rajada. Este arquivo trava o contrato de identidade.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { proxyApiRequest } from './api-proxy.js';
const fetchMock = vi.fn();
beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => vi.unstubAllGlobals());
function upstream(headers = {}) {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'content-type': 'application/json', ...headers },
    }));
}
function forwardedHeaders() {
    const init = fetchMock.mock.calls[0]?.[1];
    return new Headers(init.headers);
}
describe('proxyApiRequest (identidade do cliente)', () => {
    it('injeta X-Forwarded-For e X-Real-IP com o socket do browser', async () => {
        upstream();
        await proxyApiRequest('http://127.0.0.1:3000', new Request('http://localhost:3011/api/v1/auth/me'), {
            clientAddress: '198.51.100.7',
        });
        const headers = forwardedHeaders();
        expect(headers.get('X-Forwarded-For')).toBe('198.51.100.7');
        expect(headers.get('X-Real-IP')).toBe('198.51.100.7');
    });
    it('APPENDA à cadeia existente (XFF forjado pelo browser fica à esquerda)', async () => {
        upstream();
        await proxyApiRequest('http://127.0.0.1:3000', new Request('http://localhost:3011/api/v1/auth/me', {
            headers: { 'X-Forwarded-For': '1.2.3.4' },
        }), { clientAddress: '198.51.100.7' });
        // O rate limiter caminha da direita: o hop real é o último, o forjado fica
        // ignorado à esquerda.
        expect(forwardedHeaders().get('X-Forwarded-For')).toBe('1.2.3.4, 198.51.100.7');
    });
    it('sem clientAddress não escreve header algum', async () => {
        upstream();
        await proxyApiRequest('http://127.0.0.1:3000', new Request('http://localhost:3011/api/v1/content'));
        const headers = forwardedHeaders();
        expect(headers.get('X-Forwarded-For')).toBeNull();
        expect(headers.get('X-Real-IP')).toBeNull();
    });
    it('mantém cookies e descarta headers hop-by-hop', async () => {
        upstream();
        await proxyApiRequest('http://127.0.0.1:3000', new Request('http://localhost:3011/api/v1/auth/me', {
            headers: { Cookie: 'access_token=abc', Connection: 'keep-alive', Host: 'localhost:3011' },
        }), { clientAddress: '198.51.100.7' });
        const headers = forwardedHeaders();
        expect(headers.get('Cookie')).toBe('access_token=abc');
        expect(headers.get('Connection')).toBeNull();
        expect(headers.get('Host')).toBeNull();
    });
    it('repassa o Set-Cookie item a item (a sessão depende disso)', async () => {
        const upstreamResponse = new Response(JSON.stringify({ ok: true }), { status: 200 });
        // undici expõe a lista real de Set-Cookie (um Headers.get devolve tudo
        // concatenado, o que quebraria o Expires da sessão).
        upstreamResponse.headers.getSetCookie = () => [
            'access_token=abc; HttpOnly; Path=/',
            'refresh_token=def; HttpOnly; Path=/',
        ];
        fetchMock.mockResolvedValue(upstreamResponse);
        const response = await proxyApiRequest('http://127.0.0.1:3000', new Request('http://localhost:3011/api/v1/auth/login', { method: 'POST' }), { clientAddress: '198.51.100.7' });
        const setCookies = response.headers.getSetCookie?.() ?? [];
        expect(setCookies).toHaveLength(2);
        expect(setCookies[0]).toContain('access_token=abc');
        expect(setCookies[1]).toContain('refresh_token=def');
    });
});
//# sourceMappingURL=api-proxy.test.js.map