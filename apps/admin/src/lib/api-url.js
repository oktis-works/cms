// @oktis-works/admin - lib/api-url: join base + path sem duplicar o prefixo /api
//
// O Admin pode ser configurado de três formas:
//   - PUBLIC_API_URL=http://localhost:3000  → origin puro (rotas em /api/v1/...)
//   - PUBLIC_API_URL=/api                   → path relativo via proxy (vite dev ou
//                                             middleware ADMIN_API_PROXY_TARGET)
//   - PUBLIC_API_URL=''                     → mesma origem (nginx encaminha /api)
//
// As rotas do client já incluem o prefixo completo ('/api/v1/...'). Com base
// '/api', a concatenação ingênua gerava '/api/api/v1/...' → 404 na API
// (bug do login em `okcms dev`). Aqui o join remove a duplicação.
/**
 * Junta a base da API com o path de rota normalizando o prefixo `/api`.
 *
 * - joinApiUrl('/api', '/api/v1/auth/csrf')   → '/api/v1/auth/csrf'
 * - joinApiUrl('/api/', '/api/v1/auth/csrf')  → '/api/v1/auth/csrf'
 * - joinApiUrl('http://h:3000/api', '/api/v1/x') → 'http://h:3000/api/v1/x'
 * - joinApiUrl('http://h:3000', '/api/v1/x') → 'http://h:3000/api/v1/x' (inalterado)
 * - joinApiUrl('', '/api/v1/x')               → '/api/v1/x' (inalterado)
 * - joinApiUrl('/api', '/health')             → '/api/health' (path sem /api fica)
 */
export function joinApiUrl(base, path) {
    if (base && path.startsWith('/api/') && /\/api\/?$/.test(base)) {
        return `${base.replace(/\/$/, '')}${path.replace(/^\/api/, '')}`;
    }
    return `${base}${path}`;
}
//# sourceMappingURL=api-url.js.map