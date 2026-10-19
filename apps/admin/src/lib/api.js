// API Client for Admin Dashboard (HttpOnly cookies + CSRF + auto-refresh)
import { joinApiUrl } from './api-url.js';
/**
 * Erro tipado da API: o STATUS é o contrato, não a string do corpo.
 *
 * Antes, qualquer `!response.ok` virava `new Error(string)` — e o guarda de
 * sessão do layout tratava "qualquer erro" como "usuário deslogado". Um 429
 * (rate limit) ou um 502 (API reiniciando) bastava para mandar o usuário
 * para a tela de login com a sessão ainda válida no servidor.
 */
export class ApiError extends Error {
    status;
    code;
    /** Segundos do header Retry-After (presente em respostas 429). */
    retryAfter;
    constructor(status, code, message, retryAfter) {
        super(message ?? code);
        this.name = 'ApiError';
        this.status = status;
        this.code = code;
        this.retryAfter = retryAfter;
    }
    static async fromResponse(response) {
        const rawRetryAfter = response.headers?.get?.('Retry-After') ?? '';
        const retryAfter = Number(rawRetryAfter);
        const body = await response.json().catch(() => null);
        return new ApiError(response.status, body?.error ?? 'Request failed', body?.message ?? (body?.error ? undefined : `Request failed: ${response.status}`), rawRetryAfter && Number.isFinite(retryAfter) ? retryAfter : undefined);
    }
}
/** Evento global disparado quando a API responde 429 (o layout exibe um aviso). */
export const RATE_LIMITED_EVENT = 'okcms:rate-limited';
/** Espera máxima de Retry-After antes de reenviar uma leitura (não trava a UI). */
const MAX_RATE_LIMIT_WAIT_MS = 2000;
/** Margem de renovação do access token (15min de vida → renova faltando 5). */
const SESSION_REFRESH_MARGIN_MS = 5 * 60 * 1000;
/** TTL do token CSRF em memória — evita re-buscar /auth/csrf a cada mutação. */
const CSRF_TTL_MS = 60_000;
/** TTL do lock de refresh entre abas (um refresh real leva <1s). */
const REFRESH_LOCK_TTL_MS = 3000;
function emitRateLimited(retryAfter) {
    if (typeof window === 'undefined' || typeof CustomEvent === 'undefined')
        return;
    window.dispatchEvent(new CustomEvent(RATE_LIMITED_EVENT, { detail: { retryAfter: retryAfter ?? null } }));
}
function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
/**
 * Resolve a API em runtime.
 *
 * O Admin também é distribuído como pacote pré-compilado. Nesse caso,
 * import.meta.env.PUBLIC_API_URL é resolvido no build do pacote e não pode
 * receber o valor definido pelo `okcms start` depois que o processo inicia.
 * O BaseLayout injeta esse valor em um meta tag no SSR; o fallback relativo
 * mantém deployments atrás de proxy na mesma origem funcionando.
 *
 * Se PUBLIC_API_URL começar com '/', é tratado como path relativo (proxy local).
 * Ex.: '/api' → fetch('/api/v1/auth/login') via Vite proxy em dev.
 */
function resolveApiBase() {
    const buildTimeUrl = import.meta.env.PUBLIC_API_URL?.trim();
    if (buildTimeUrl) {
        // Path relativo (ex.: '/api') → usa path relativo para proxy local
        if (buildTimeUrl.startsWith('/'))
            return buildTimeUrl.replace(/\/$/, '');
        return buildTimeUrl.replace(/\/$/, '');
    }
    if (typeof document !== 'undefined') {
        const runtimeUrl = document.querySelector('meta[name="okcms-api-url"]')?.getAttribute('content')?.trim();
        if (runtimeUrl) {
            if (runtimeUrl.startsWith('/'))
                return runtimeUrl.replace(/\/$/, '');
            return runtimeUrl.replace(/\/$/, '');
        }
    }
    // Desenvolvimento local sem PUBLIC_API_URL: API padrão do CLI.
    if (import.meta.env.DEV)
        return 'http://localhost:3000';
    // Em produção, /api deve ser encaminhado pelo proxy para a API.
    return '';
}
const API_BASE = resolveApiBase();
export class ApiClient {
    baseUrl;
    csrfToken = null;
    refreshPromise = null;
    proactiveRefreshBound = false;
    csrfFetchedAt = 0;
    refreshOwner = typeof globalThis.crypto?.randomUUID === 'function'
        ? globalThis.crypto.randomUUID()
        : Math.random().toString(36).slice(2);
    refreshLockKey = 'okcms:auth:refresh-lock';
    constructor(baseUrl = API_BASE) {
        this.baseUrl = baseUrl;
    }
    /** Resolve a relative media URL against the API, not the Admin port. */
    mediaUrl(path) {
        if (/^(?:https?:)?\/\//i.test(path))
            return path;
        if (!this.baseUrl)
            return path;
        try {
            return new URL(path, `${this.baseUrl.replace(/\/$/, '')}/`).toString();
        }
        catch {
            // Relative PUBLIC_API_URL values are valid behind a reverse proxy.
            return path;
        }
    }
    /** Inicializa lendo CSRF do cookie (chamado no boot da app) */
    async init() {
        try {
            await this.ensureCsrfToken();
        }
        catch {
            // ignora
        }
    }
    /** Sessão em três estados — o status HTTP decide, nunca a string do erro. */
    async checkSession() {
        try {
            // skipRateLimitRetry: um 429 já significa "indisponível" aqui — esperar
            // e reenviar só atrasaria o guarda de sessão sem mudar a resposta.
            await this.request('GET', '/api/v1/auth/me', undefined, undefined, { skipRateLimitRetry: true });
            return 'authenticated';
        }
        catch (error) {
            if (error instanceof ApiError && error.status === 401)
                return 'unauthenticated';
            // 429/5xx/rede: indisponibilidade transitória — a sessão continua viva.
            return 'unavailable';
        }
    }
    /** Sessão válida — verifica via /me (usa cookies HttpOnly automaticamente) */
    async isLoggedIn() {
        return (await this.checkSession()) === 'authenticated';
    }
    /**
     * Refresh PROATIVO do access token.
     *
     * O access token vence em 15min e só era renovado DEPOIS do primeiro 401.
     * O retorno à aba após esse tempo disparava ~20 requisições simultâneas,
     * todas com 401, cada uma reenviando: ~40 chamadas em <1s — quase metade
     * de um budget de rate limit gasto num único gesto.
     *
     * O cookie `session_expires_at` (emitido por /auth/login e /auth/refresh)
     * permite renovar ANTES do vencimento. Cookie ausente (API antiga) mantém
     * o comportamento legado: nada é renovado proativamente.
     */
    async ensureFreshSession() {
        const expiresAt = this.readSessionExpiry();
        if (!expiresAt || expiresAt - Date.now() > SESSION_REFRESH_MARGIN_MS)
            return;
        try {
            await this.refreshTokens();
        }
        catch {
            // Sem refresh possível: o caminho reativo (401 → refresh) continua de pé.
        }
    }
    /** Instala o refresh proativo uma vez por aba: boot + aba voltando ao foco. */
    installProactiveRefresh() {
        if (typeof document === 'undefined' || this.proactiveRefreshBound)
            return;
        this.proactiveRefreshBound = true;
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible')
                void this.ensureFreshSession();
        });
    }
    readSessionExpiry() {
        if (typeof document === 'undefined')
            return null;
        const match = document.cookie.match(/(?:^|;\s*)session_expires_at=([^;]+)/);
        if (!match?.[1])
            return null;
        const parsed = Date.parse(decodeURIComponent(match[1]));
        return Number.isNaN(parsed) ? null : parsed;
    }
    /** Obtém tenantId do backend via /me */
    async getTenantId() {
        try {
            const data = await this.request('GET', '/api/v1/auth/me');
            return data.tenantId ?? null;
        }
        catch {
            return null;
        }
    }
    /** Obtém locale do usuário logado via /me/locale */
    async getUserLocale() {
        try {
            const data = await this.request('GET', '/api/v1/users/me/locale');
            return data.locale ?? 'pt-BR';
        }
        catch {
            return 'pt-BR';
        }
    }
    /** Salva locale do usuário via /me/locale */
    async setUserLocale(locale) {
        await this.request('PUT', '/api/v1/users/me/locale', { locale });
    }
    /** Sessão atual (/auth/me) — usuário + tenant + papéis (alimenta o admin bar) */
    async getMe() {
        return this.request('GET', '/api/v1/auth/me');
    }
    /** Auditoria recente — notificações reais do sino no admin bar */
    async getAuditLogs(limit = 8) {
        return this.request('GET', `/api/v1/audit-logs?limit=${limit}`);
    }
    async getAuditLogConfig() {
        return this.request('GET', '/api/v1/audit-logs/config');
    }
    async updateAuditLogConfig(retentionDays) {
        return this.request('PUT', '/api/v1/audit-logs/config', { retentionDays });
    }
    async listAuditLogs(options) {
        const params = new URLSearchParams();
        if (options?.limit)
            params.set('limit', String(options.limit));
        if (options?.action)
            params.set('action', options.action);
        if (options?.resourceType)
            params.set('resourceType', options.resourceType);
        return this.request('GET', `/api/v1/audit-logs?${params.toString()}`);
    }
    /** Login — o backend seta cookies HttpOnly e CSRF; retorna user + tenantId */
    async login(input) {
        await this.ensureCsrfToken();
        const response = await this.request('POST', '/api/v1/auth/login', input);
        return response;
    }
    /** Logout — limpa cookies no backend */
    async logout() {
        await this.request('POST', '/api/v1/auth/logout', {});
        this.csrfToken = null;
    }
    /** Refresh de access token via cookie refresh_token */
    async refreshTokens() {
        if (this.refreshPromise)
            return this.refreshPromise;
        this.refreshPromise = this.refreshWithCrossTabLock()
            .finally(() => { this.refreshPromise = null; });
        return this.refreshPromise;
    }
    async refreshWithCrossTabLock() {
        if (typeof window === 'undefined' || typeof localStorage === 'undefined') {
            await this.request('POST', '/api/v1/auth/refresh', {}, undefined, { skipRefresh: true });
            return;
        }
        const current = this.readRefreshLock();
        if (current?.owner && current.owner !== this.refreshOwner && Number(current.expiresAt) > Date.now()) {
            // Outra aba já está renovando. Os cookies são compartilhados entre
            // abas: quando ela libera o lock, o reenvio desta requisição usa o
            // access token novo — nada aqui precisa buscar token.
            await this.waitForOtherTabRefresh(Number(current.expiresAt));
            return;
        }
        if (!this.acquireRefreshLock()) {
            // Outra aba tomou o lock entre a leitura e a escrita — espera o dela.
            await this.waitForOtherTabRefresh(Date.now() + REFRESH_LOCK_TTL_MS);
            return;
        }
        try {
            await this.request('POST', '/api/v1/auth/refresh', {}, undefined, { skipRefresh: true });
        }
        finally {
            this.releaseRefreshLock();
        }
    }
    readRefreshLock() {
        try {
            return JSON.parse(localStorage.getItem(this.refreshLockKey) ?? 'null');
        }
        catch {
            return null;
        }
    }
    acquireRefreshLock() {
        try {
            localStorage.setItem(this.refreshLockKey, JSON.stringify({ owner: this.refreshOwner, expiresAt: Date.now() + REFRESH_LOCK_TTL_MS }));
            return true;
        }
        catch {
            return false;
        }
    }
    releaseRefreshLock() {
        try {
            if (this.readRefreshLock()?.owner === this.refreshOwner)
                localStorage.removeItem(this.refreshLockKey);
        }
        catch {
            // Storage pode ficar indisponível durante a navegação; o lock expira sozinho.
        }
    }
    /**
     * Espera a outra aba concluir o refresh.
     *
     * O `storage` event acorda esta aba na hora em que a dona libera a chave.
     * O polling anterior (100ms, TTL de 10s) fazia uma aba órfã travar todas
     * as demais pelo tempo inteiro, e o deadline era herdado do lock vencido.
     */
    async waitForOtherTabRefresh(expiresAt) {
        const deadline = Math.max(0, Math.min(expiresAt, Date.now() + REFRESH_LOCK_TTL_MS) - Date.now());
        await new Promise((resolve) => {
            let settled = false;
            const finish = () => {
                if (settled)
                    return;
                settled = true;
                window.removeEventListener('storage', onStorage);
                clearTimeout(timer);
                resolve();
            };
            const onStorage = (event) => {
                if (event.key === this.refreshLockKey)
                    finish();
            };
            window.addEventListener('storage', onStorage);
            const timer = setTimeout(finish, deadline);
        });
    }
    /**
     * Requisição com as recuperações de sessão/segurança centralizadas:
     *
     *  - auto-refresh em 401 (exceto /refresh e /logout);
     *  - rebootstrap do CSRF quando outra aba renovou o token (403);
     *  - retry de leitura em 429 respeitando o `Retry-After` curto.
     *
     * Um 429 SEMPRE significa "nada aconteceu" (o limiter responde antes do
     * handler), então repetir a chamada é seguro até para escritas.
     *
     * `request()` e `requestRaw()` compartilham este caminho — antes a lógica
     * estava duplicada, e qualquer correção de resiliência teria que ser feita
     * em dois lugares (o que explica por que não havia tratamento de 429).
     */
    async sendWithRecovery(method, path, body, headers, options) {
        const url = joinApiUrl(this.baseUrl, path);
        const send = async () => {
            const requestHeaders = { ...headers };
            const hasBody = options?.bodyInit !== undefined || body !== undefined;
            // Sem corpo não há o que serializar — e enviar Content-Type: json em GET
            // forçava um preflight CORS por requisição no modo cross-origin.
            // bodyInit (FormData no upload de mídia) NÃO recebe o header: o fetch
            // precisa gerar o multipart boundary sozinho — forçar application/json
            // fazia a API cair no branch JSON e responder 400.
            if (hasBody && options?.bodyInit === undefined)
                requestHeaders['Content-Type'] = 'application/json';
            if (!['GET', 'HEAD', 'OPTIONS'].includes(method.toUpperCase())) {
                const csrf = await this.ensureCsrfToken();
                if (csrf)
                    requestHeaders['x-csrf-token'] = csrf;
            }
            return fetch(url, {
                method,
                headers: requestHeaders,
                credentials: 'include',
                body: options?.bodyInit ?? (body !== undefined ? JSON.stringify(body) : undefined),
            });
        };
        let response = await send();
        // Auto-refresh em 401 (exceto em /refresh e /logout)
        if (response.status === 401 && !options?.skipRefresh && !path.includes('/auth/refresh') && !path.includes('/auth/logout')) {
            await this.refreshTokens();
            response = await send();
        }
        // Um token CSRF pode ter sido renovado por outra aba. Rebootstrapa e
        // repete uma única vez; falha de Origin continua sendo rejeitada.
        if (response.status === 403 && !options?.skipCsrfRecovery) {
            let errorCode = '';
            try {
                const probe = typeof response.clone === 'function' ? response.clone() : response;
                const data = await probe.json();
                errorCode = data.error ?? '';
            }
            catch {
                // resposta não JSON: segue para o erro original
            }
            if (errorCode === 'CSRF_TOKEN_INVALID') {
                await this.ensureCsrfToken(true);
                response = await send();
            }
        }
        // 429: sinaliza globalmente (aviso na UI) e, em espera curta, reenvia
        // uma única vez. Nada aqui trava a interface esperando dezenas de segundos.
        if (response.status === 429 && !options?.skipRateLimitRetry) {
            const retryAfterHeader = response.headers?.get?.('Retry-After') ?? '';
            const retryAfter = Number(retryAfterHeader);
            const waitMs = (Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : 1) * 1000;
            emitRateLimited(Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : 1);
            if (waitMs <= MAX_RATE_LIMIT_WAIT_MS) {
                await sleep(waitMs + 50);
                response = await send();
            }
        }
        return response;
    }
    /** Requisição JSON: dispara ApiError com status quando a resposta falha. */
    async request(method, path, body, headers, options) {
        const response = await this.sendWithRecovery(method, path, body, headers, options);
        if (!response.ok) {
            throw await ApiError.fromResponse(response);
        }
        return response.json();
    }
    /** Requisição genérica que retorna o Response bruto (para blobs, downloads, etc.). */
    async requestRaw(method, path, body, headers, options) {
        return this.sendWithRecovery(method, path, body, headers, options);
    }
    /** Garante um token CSRF sincronizado com o cookie do browser. */
    async ensureCsrfToken(force = false) {
        const cookieToken = this.readCsrfCookie();
        if (!force && cookieToken) {
            this.csrfToken = cookieToken;
            return cookieToken;
        }
        // Cookie ilegível: usa o token em memória por até 60s em vez de bater em
        // /auth/csrf a cada mutação (mais uma requisição por PUT/POST/DELETE).
        if (!force && this.csrfToken && Date.now() - this.csrfFetchedAt < CSRF_TTL_MS)
            return this.csrfToken;
        try {
            const response = await fetch(joinApiUrl(this.baseUrl, '/api/v1/auth/csrf'), {
                credentials: 'include',
                headers: { Accept: 'application/json' },
            });
            if (!response.ok)
                return this.csrfToken;
            const data = await response.json();
            this.csrfToken = data.csrfToken ?? this.readCsrfCookie();
            this.csrfFetchedAt = Date.now();
        }
        catch {
            // O endpoint pode estar indisponível durante o boot; a API responderá
            // com erro explícito em vez de enviar uma mutação sem proteção.
        }
        return this.csrfToken;
    }
    readCsrfCookie() {
        if (typeof document !== 'undefined') {
            const match = document.cookie.match(/(?:^|;\s*)csrf_token=([^;]+)/);
            if (match?.[1])
                return match[1];
        }
        return this.csrfToken;
    }
    // Content
    async getContent(options) {
        const params = new URLSearchParams();
        if (options?.page)
            params.set('page', String(options.page));
        if (options?.limit)
            params.set('limit', String(options.limit));
        if (options?.type)
            params.set('type', options.type);
        if (options?.status)
            params.set('status', options.status);
        if (options?.search)
            params.set('search', options.search);
        if (options?.includeAuthor)
            params.set('include', 'author');
        return this.request('GET', `/api/v1/content?${params.toString()}`);
    }
    async getContentById(id) {
        return this.request('GET', `/api/v1/content/${id}`);
    }
    async getSingletonContent(type) {
        const response = await this.request('GET', `/api/v1/content/singleton/${encodeURIComponent(type)}`);
        return 'content' in response ? response.content : response;
    }
    async createContent(data) {
        return this.request('POST', `/api/v1/content`, data);
    }
    async updateContent(id, data) {
        return this.request('PUT', `/api/v1/content/${id}`, data);
    }
    async deleteContent(id) {
        await this.request('DELETE', `/api/v1/content/${id}`);
    }
    /** A2: publica via rota real do publisher (eventBus + cache + revisions). */
    async publishContent(id) {
        const response = await this.request('POST', `/api/v1/content/${id}/publish`);
        return 'content' in response ? response.content : response;
    }
    /** A2: despublica via rota real do publisher. */
    async unpublishContent(id) {
        const response = await this.request('POST', `/api/v1/content/${id}/unpublish`);
        return 'content' in response ? response.content : response;
    }
    /** Atalho usado pela ContentList: publish/unpublish conforme status atual. */
    async publishToggle(id, isPublished) {
        return isPublished ? this.unpublishContent(id) : this.publishContent(id);
    }
    // Content Types (CPTs)
    async getContentTypes() {
        return this.request('GET', '/api/v1/content-types');
    }
    async createContentType(data) {
        return this.request('POST', '/api/v1/content-types', data);
    }
    async updateContentType(slug, data) {
        return this.request('PUT', `/api/v1/content-types/${slug}`, data);
    }
    async deleteContentType(slug) {
        await this.request('DELETE', `/api/v1/content-types/${slug}`);
    }
    // Taxonomies
    async getTaxonomies() {
        return this.request('GET', '/api/v1/taxonomies');
    }
    async createTaxonomy(data) {
        return this.request('POST', '/api/v1/taxonomies', data);
    }
    async attachTaxonomy(slug, contentType) {
        await this.request('POST', `/api/v1/taxonomies/${slug}/attach`, { contentType });
    }
    async detachTaxonomy(slug, contentType) {
        await this.request('POST', `/api/v1/taxonomies/${slug}/detach`, { contentType });
    }
    async deleteTaxonomy(slug) {
        await this.request('DELETE', `/api/v1/taxonomies/${slug}`);
    }
    async getTaxonomyTerms(slug) {
        return this.request('GET', `/api/v1/taxonomies/${encodeURIComponent(slug)}/terms`);
    }
    async createTaxonomyTerm(slug, data) {
        return this.request('POST', `/api/v1/taxonomies/${encodeURIComponent(slug)}/terms`, data);
    }
    async updateTaxonomyTerm(slug, id, data) {
        return this.request('PUT', `/api/v1/taxonomies/${encodeURIComponent(slug)}/terms/${id}`, data);
    }
    async deleteTaxonomyTerm(slug, id) {
        await this.request('DELETE', `/api/v1/taxonomies/${encodeURIComponent(slug)}/terms/${id}`);
    }
    async getCategories() {
        return this.request('GET', '/api/v1/categories');
    }
    async createCategory(data) {
        return this.request('POST', '/api/v1/categories', data);
    }
    async updateCategory(id, data) {
        return this.request('PUT', `/api/v1/categories/${id}`, data);
    }
    async deleteCategory(id) {
        await this.request('DELETE', `/api/v1/categories/${id}`);
    }
    async getTags() {
        return this.request('GET', '/api/v1/tags');
    }
    async createTag(data) {
        return this.request('POST', '/api/v1/tags', data);
    }
    async updateTag(id, data) {
        return this.request('PUT', `/api/v1/tags/${id}`, data);
    }
    async deleteTag(id) {
        await this.request('DELETE', `/api/v1/tags/${id}`);
    }
    async getMenus() {
        return this.request('GET', '/api/v1/menus');
    }
    async createMenu(data) {
        return this.request('POST', '/api/v1/menus', data);
    }
    async updateMenu(id, data) {
        return this.request('PUT', `/api/v1/menus/${id}`, data);
    }
    async deleteMenu(id) {
        await this.request('DELETE', `/api/v1/menus/${id}`);
    }
    // Field Groups & Types
    async getFieldGroups(context) {
        if (context?.type) {
            const qs = new URLSearchParams({ type: context.type });
            for (const [key, value] of Object.entries(context)) {
                if (key !== 'type' && value)
                    qs.set(key, value);
            }
            return this.request('GET', `/api/v1/field-groups?${qs.toString()}`);
        }
        return this.request('GET', '/api/v1/field-groups');
    }
    async getFieldGroup(id) {
        return this.request('GET', `/api/v1/field-groups/${id}`);
    }
    async exportFieldGroup(id) {
        const response = await this.requestRaw('GET', `/api/v1/field-groups/${id}/export`);
        if (!response.ok)
            throw new Error(await response.text());
        return response.blob();
    }
    async importFieldGroups(data) {
        return this.request('POST', '/api/v1/field-groups/import', data);
    }
    async createFieldGroup(data) {
        return this.request('POST', '/api/v1/field-groups', data);
    }
    async updateFieldGroup(id, data) {
        return this.request('PUT', `/api/v1/field-groups/${id}`, data);
    }
    async deleteFieldGroup(id) {
        await this.request('DELETE', `/api/v1/field-groups/${id}`);
    }
    async getFieldTypes(category) {
        const query = category ? `?category=${encodeURIComponent(category)}` : '';
        return this.request('GET', `/api/v1/field-types${query}`);
    }
    async getWebhooks() {
        return this.request('GET', '/api/v1/webhooks');
    }
    async getWebhookEvents() {
        const response = await this.request('GET', '/api/v1/webhooks/events');
        return response.data;
    }
    async createWebhook(data) {
        return this.request('POST', '/api/v1/webhooks', data);
    }
    async updateWebhook(id, data) {
        return this.request('PUT', `/api/v1/webhooks/${id}`, data);
    }
    async deleteWebhook(id) {
        await this.request('DELETE', `/api/v1/webhooks/${id}`);
    }
    // API keys (login via API para clientes externos)
    async getApiKeys() {
        return this.request('GET', '/api/v1/api-keys');
    }
    /** A resposta traz `plaintext` — único momento em que o valor claro existe. */
    async createApiKey(data) {
        return this.request('POST', '/api/v1/api-keys', data);
    }
    async deleteApiKey(id) {
        await this.request('DELETE', `/api/v1/api-keys/${id}`);
    }
    // Media (upload real: multipart → disco → URL pública)
    async listMedia(options) {
        const params = new URLSearchParams();
        if (options?.page)
            params.set('page', String(options.page));
        if (options?.limit)
            params.set('limit', String(options.limit));
        if (options?.mimeType)
            params.set('mimeType', options.mimeType);
        if (options?.search)
            params.set('search', options.search);
        return this.request('GET', `/api/v1/media?${params.toString()}`);
    }
    async getMedia(id) {
        return this.request('GET', `/api/v1/media/${id}`);
    }
    /** Upload multipart — NÃO seta Content-Type (o fetch precisa do boundary). */
    async uploadMedia(file, options) {
        const formData = new FormData();
        formData.append('file', file);
        if (options?.alt)
            formData.append('alt', options.alt);
        if (options?.caption)
            formData.append('caption', options.caption);
        const response = await this.sendWithRecovery('POST', '/api/v1/media/upload', undefined, {}, { bodyInit: formData });
        if (!response.ok)
            throw await ApiError.fromResponse(response);
        return response.json();
    }
    async updateMedia(id, data) {
        return this.request('PUT', `/api/v1/media/${id}`, data);
    }
    async replaceMediaFile(id, file) {
        const formData = new FormData();
        formData.append('file', file);
        const response = await this.sendWithRecovery('PUT', `/api/v1/media/${id}/file`, undefined, {}, { bodyInit: formData });
        if (!response.ok)
            throw await ApiError.fromResponse(response);
        return response.json();
    }
    async deleteMedia(id) {
        await this.request('DELETE', `/api/v1/media/${id}`);
    }
    // Users & roles
    async listUsers(options) {
        const params = new URLSearchParams();
        if (options?.page)
            params.set('page', String(options.page));
        if (options?.limit)
            params.set('limit', String(options.limit));
        if (options?.search)
            params.set('search', options.search);
        if (options?.status)
            params.set('status', options.status);
        return this.request('GET', `/api/v1/users?${params.toString()}`);
    }
    async getUser(id) {
        return this.request('GET', `/api/v1/users/${id}`);
    }
    async createUser(data) {
        return this.request('POST', '/api/v1/users', data);
    }
    async updateUser(id, data) {
        return this.request('PUT', `/api/v1/users/${id}`, data);
    }
    async deleteUser(id) {
        await this.request('DELETE', `/api/v1/users/${id}`);
    }
    async setUserPassword(id, password) {
        await this.request('PUT', `/api/v1/users/${id}/password`, { password });
    }
    async assignRole(userId, roleId) {
        return this.request('POST', `/api/v1/users/${userId}/roles`, { roleId });
    }
    async removeRole(userId, roleId) {
        return this.request('DELETE', `/api/v1/users/${userId}/roles/${roleId}`);
    }
    async listRoles() {
        return this.request('GET', '/api/v1/roles');
    }
    async createRole(data) {
        return this.request('POST', '/api/v1/roles', data);
    }
    async updateRole(id, data) {
        return this.request('PUT', `/api/v1/roles/${id}`, data);
    }
    async deleteRole(id) {
        await this.request('DELETE', `/api/v1/roles/${id}`);
    }
    async listTenants(options) {
        const params = new URLSearchParams();
        if (options?.page)
            params.set('page', String(options.page));
        if (options?.limit)
            params.set('limit', String(options.limit));
        if (options?.search)
            params.set('search', options.search);
        return this.request('GET', `/api/v1/tenants?${params.toString()}`);
    }
    async createTenant(data) {
        return this.request('POST', '/api/v1/tenants', data);
    }
    async updateTenant(id, data) {
        return this.request('PUT', `/api/v1/tenants/${id}`, data);
    }
    async deleteTenant(id) {
        await this.request('DELETE', `/api/v1/tenants/${id}`);
    }
    // Settings (KV por grupo — ?group=general no GET; PUT em lote)
    async getSettings(group) {
        const query = group ? `?group=${encodeURIComponent(group)}` : '';
        return this.request('GET', `/api/v1/settings${query}`);
    }
    async updateSettings(items) {
        await this.request('PUT', '/api/v1/settings', items);
    }
    // Health
    async healthCheck() {
        return this.request('GET', '/health');
    }
    // Themes (para layout override no editor)
    async getThemes() {
        const themes = await this.request('GET', '/api/v1/themes');
        return themes.map((theme) => ({
            id: String(theme['id'] ?? ''),
            name: String(theme['name'] ?? ''),
            version: theme['version'] ? String(theme['version']) : undefined,
            status: String(theme['status'] ?? 'INSTALLED'),
            config: theme['config'] ?? {},
            manifest: theme['manifest'] ?? null,
        }));
    }
    /** Sincroniza o diretório de temas com o banco e retorna o estado completo. */
    async syncThemes() {
        const themes = await this.request('POST', '/api/v1/themes/sync');
        return themes.map((theme) => ({
            id: String(theme['id'] ?? ''),
            name: String(theme['name'] ?? ''),
            version: theme['version'] ? String(theme['version']) : undefined,
            status: String(theme['status'] ?? 'INSTALLED'),
            config: theme['config'] ?? {},
            manifest: theme['manifest'] ?? null,
        }));
    }
    async activateTheme(id) {
        return this.request('POST', `/api/v1/themes/${id}/activate`);
    }
    async deactivateTheme(id) {
        return this.request('POST', `/api/v1/themes/${id}/deactivate`);
    }
    async updateThemeConfig(id, config) {
        return this.request('PATCH', `/api/v1/themes/${id}/config`, { config });
    }
    async installTheme(data) {
        return this.request('POST', '/api/v1/themes/install', data);
    }
    async uninstallTheme(id) {
        await this.request('DELETE', `/api/v1/themes/${id}`);
    }
    // Plugins
    async getPlugins() {
        const plugins = await this.request('GET', '/api/v1/plugins');
        return plugins.map((plugin) => ({
            id: String(plugin['id'] ?? ''),
            name: String(plugin['name'] ?? ''),
            version: String(plugin['version'] ?? ''),
            status: String(plugin['status'] ?? 'INSTALLED'),
            enabled: plugin['enabled'] === true,
            manifest: plugin['manifest'] ?? null,
        }));
    }
    async activatePlugin(id, tenantId) {
        return this.request('POST', `/api/v1/plugins/${id}/activate`, { tenantId });
    }
    async deactivatePlugin(id, tenantId) {
        return this.request('POST', `/api/v1/plugins/${id}/deactivate`, { tenantId });
    }
    async uninstallPlugin(id) {
        await this.request('DELETE', `/api/v1/plugins/${id}`);
    }
    /** Estado de runtime dos plugins (WP2) — por escopo platform/tenant. */
    async getPluginsRuntime() {
        return this.request('GET', '/api/v1/plugins/runtime');
    }
}
export const apiClient = new ApiClient();
//# sourceMappingURL=api.js.map