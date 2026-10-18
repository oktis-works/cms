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
  readonly status: number;
  readonly code: string;
  /** Segundos do header Retry-After (presente em respostas 429). */
  readonly retryAfter?: number;

  constructor(status: number, code: string, message?: string, retryAfter?: number) {
    super(message ?? code);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.retryAfter = retryAfter;
  }

  static async fromResponse(response: Response): Promise<ApiError> {
    const rawRetryAfter = response.headers?.get?.('Retry-After') ?? '';
    const retryAfter = Number(rawRetryAfter);
    const body = await response.json().catch(() => null) as { error?: string; message?: string } | null;
    return new ApiError(
      response.status,
      body?.error ?? 'Request failed',
      body?.message ?? (body?.error ? undefined : `Request failed: ${response.status}`),
      rawRetryAfter && Number.isFinite(retryAfter) ? retryAfter : undefined
    );
  }
}

/**
 * Verificação de sessão em três estados. Só `unauthenticated` (401 depois do
 * refresh falhar) autoriza redirecionar para o login — `unavailable` cobre
 * 429/5xx/rede, que NÃO significam sessão inválida.
 */
export type SessionState = 'authenticated' | 'unauthenticated' | 'unavailable';

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

function emitRateLimited(retryAfter?: number): void {
  if (typeof window === 'undefined' || typeof CustomEvent === 'undefined') return;
  window.dispatchEvent(new CustomEvent(RATE_LIMITED_EVENT, { detail: { retryAfter: retryAfter ?? null } }));
}

function sleep(ms: number): Promise<void> {
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
function resolveApiBase(): string {
  const buildTimeUrl = import.meta.env.PUBLIC_API_URL?.trim();
  if (buildTimeUrl) {
    // Path relativo (ex.: '/api') → usa path relativo para proxy local
    if (buildTimeUrl.startsWith('/')) return buildTimeUrl.replace(/\/$/, '');
    return buildTimeUrl.replace(/\/$/, '');
  }

  if (typeof document !== 'undefined') {
    const runtimeUrl = document.querySelector('meta[name="okcms-api-url"]')?.getAttribute('content')?.trim();
    if (runtimeUrl) {
      if (runtimeUrl.startsWith('/')) return runtimeUrl.replace(/\/$/, '');
      return runtimeUrl.replace(/\/$/, '');
    }
  }

  // Desenvolvimento local sem PUBLIC_API_URL: API padrão do CLI.
  if (import.meta.env.DEV) return 'http://localhost:3000';

  // Em produção, /api deve ser encaminhado pelo proxy para a API.
  return '';
}

const API_BASE = resolveApiBase();

export interface ApiResponse<T> {
  data?: T;
  error?: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
}

export interface LoginInput {
  email: string;
  password: string;
}

export interface LoginResponse {
  user: {
    id: string;
    email: string;
    name: string;
  };
  tenantId?: string;
}

/** Linha crua da API — o backend devolve snake_case (SELECT * sem alias). */
export interface Media {
  id: string;
  filename: string;
  title?: string | null;
  mime_type: string;
  size: number;
  path: string;
  url: string;
  alt?: string | null;
  caption?: string | null;
  description?: string | null;
  metadata?: Record<string, unknown> | null;
  uploaded_by?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface AdminUser {
  id: string;
  email: string;
  name: string;
  avatar?: string | null;
  status: 'ACTIVE' | 'INACTIVE' | string;
  last_login_at?: string | null;
  created_at?: string;
  roles: string[];
}

export interface Tenant {
  id?: string;
  name: string;
  slug: string;
  domain?: string | null;
  subdomain?: string | null;
  status?: string;
  settings?: Record<string, unknown> | null;
  created_at?: string;
  updated_at?: string;
}

export interface Role {
  id: string;
  tenant_id?: string | null;
  name: string;
  slug: string;
  is_system?: boolean;
  /** Strings `ação:recurso` (ex.: `read:content`) — vocabulário da API. */
  permissions?: string[];
  created_at?: string;
}

/** Sessão atual — resposta de GET /api/v1/auth/me */
export interface CurrentUser {
  id: string;
  email: string;
  name: string;
  avatar?: string | null;
  status?: string;
  last_login_at?: string | null;
}

/** Linha de auditoria — resposta de GET /api/v1/audit-logs (alimenta o sino do admin bar) */
export interface AuditLogEntry {
  tenantId?: string | null;
  userId?: string | null;
  action: string;
  resourceType: string;
  resourceId?: string | null;
  changes?: Record<string, unknown> | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  created_at?: string;
}

export interface Setting {
  id?: string;
  key: string;
  value: unknown;
  group?: string | null;
  type?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface Content {
  id: string;
  tenantId: string;
  type: string;
  title: string;
  slug: string;
  body?: Record<string, unknown>;
  excerpt?: string;
  status: string;
  authorId: string;
  version: number;
  layout?: string | null;
  createdAt: string;
  updatedAt: string;
  /** Presente quando ?include=author (expandido pelo backend em uma query). */
  author?: { id: string; name: string; email: string; avatar?: string | null } | null;
}

export interface ThemeSettingField {
  name: string;
  type?: string;
  label?: string;
  default?: unknown;
  options?: Array<string | { value: string; label: string }>;
}

export interface ThemeInfo {
  id: string;
  name: string;
  version?: string;
  status: string;
  /** Config (customizador) salvo no banco — mesclado sobre os defaults do manifesto. */
  config?: Record<string, unknown> | null;
  manifest?: {
    name: string;
    version: string;
    cmsVersion: string;
    description?: string;
    author?: string;
    entrypoints: {
      astro?: string;
      config?: string;
    };
    provides?: { layouts?: string[]; assets?: string[] };
    parent?: string;
    /** Campos do customizador de tema (quando declarados no manifesto). */
    settings?: ThemeSettingField[];
    /** Preview exibido no card (caminho servido por /themes/<nome>/ ou URL). */
    preview?: string;
    screenshots?: string[];
  } | null;
}

export interface PluginInfo {
  id: string;
  name: string;
  version: string;
  status: string;
  /** Se o plugin está ativo para o tenant da sessão (true) ou não (false). */
  enabled?: boolean;
  manifest?: {
    name: string;
    version: string;
    description?: string;
    author?: string;
    entrypoints?: {
      server?: string;
      admin?: string;
    };
    config?: Record<string, unknown>;
  } | null;
}

export class ApiClient {
  private baseUrl: string;
  private csrfToken: string | null = null;
  private refreshPromise: Promise<void> | null = null;
  private proactiveRefreshBound = false;
  private csrfFetchedAt = 0;
  private readonly refreshOwner = typeof globalThis.crypto?.randomUUID === 'function'
    ? globalThis.crypto.randomUUID()
    : Math.random().toString(36).slice(2);
  private readonly refreshLockKey = 'okcms:auth:refresh-lock';

  constructor(baseUrl: string = API_BASE) {
    this.baseUrl = baseUrl;
  }

  /** Resolve a relative media URL against the API, not the Admin port. */
  public mediaUrl(path: string): string {
    if (/^(?:https?:)?\/\//i.test(path)) return path;
    if (!this.baseUrl) return path;
    try {
      return new URL(path, `${this.baseUrl.replace(/\/$/, '')}/`).toString();
    } catch {
      // Relative PUBLIC_API_URL values are valid behind a reverse proxy.
      return path;
    }
  }

  /** Inicializa lendo CSRF do cookie (chamado no boot da app) */
  async init(): Promise<void> {
    try {
      await this.ensureCsrfToken();
    } catch {
      // ignora
    }
  }

  /** Sessão em três estados — o status HTTP decide, nunca a string do erro. */
  async checkSession(): Promise<SessionState> {
    try {
      // skipRateLimitRetry: um 429 já significa "indisponível" aqui — esperar
      // e reenviar só atrasaria o guarda de sessão sem mudar a resposta.
      await this.request('GET', '/api/v1/auth/me', undefined, undefined, { skipRateLimitRetry: true });
      return 'authenticated';
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) return 'unauthenticated';
      // 429/5xx/rede: indisponibilidade transitória — a sessão continua viva.
      return 'unavailable';
    }
  }

  /** Sessão válida — verifica via /me (usa cookies HttpOnly automaticamente) */
  async isLoggedIn(): Promise<boolean> {
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
  async ensureFreshSession(): Promise<void> {
    const expiresAt = this.readSessionExpiry();
    if (!expiresAt || expiresAt - Date.now() > SESSION_REFRESH_MARGIN_MS) return;
    try {
      await this.refreshTokens();
    } catch {
      // Sem refresh possível: o caminho reativo (401 → refresh) continua de pé.
    }
  }

  /** Instala o refresh proativo uma vez por aba: boot + aba voltando ao foco. */
  installProactiveRefresh(): void {
    if (typeof document === 'undefined' || this.proactiveRefreshBound) return;
    this.proactiveRefreshBound = true;
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') void this.ensureFreshSession();
    });
  }

  private readSessionExpiry(): number | null {
    if (typeof document === 'undefined') return null;
    const match = document.cookie.match(/(?:^|;\s*)session_expires_at=([^;]+)/);
    if (!match?.[1]) return null;
    const parsed = Date.parse(decodeURIComponent(match[1]));
    return Number.isNaN(parsed) ? null : parsed;
  }

  /** Obtém tenantId do backend via /me */
  async getTenantId(): Promise<string | null> {
    try {
      const data = await this.request<{ tenantId?: string }>('GET', '/api/v1/auth/me');
      return data.tenantId ?? null;
    } catch {
      return null;
    }
  }

  /** Obtém locale do usuário logado via /me/locale */
  async getUserLocale(): Promise<string> {
    try {
      const data = await this.request<{ locale?: string }>('GET', '/api/v1/users/me/locale');
      return data.locale ?? 'pt-BR';
    } catch {
      return 'pt-BR';
    }
  }

  /** Salva locale do usuário via /me/locale */
  async setUserLocale(locale: string): Promise<void> {
    await this.request('PUT', '/api/v1/users/me/locale', { locale });
  }

  /** Sessão atual (/auth/me) — usuário + tenant + papéis (alimenta o admin bar) */
  async getMe(): Promise<{ user: CurrentUser; tenantId?: string; roles?: string[] }> {
    return this.request('GET', '/api/v1/auth/me');
  }

  /** Auditoria recente — notificações reais do sino no admin bar */
  async getAuditLogs(limit = 8): Promise<{ data: AuditLogEntry[]; count: number }> {
    return this.request('GET', `/api/v1/audit-logs?limit=${limit}`);
  }

  async getAuditLogConfig(): Promise<{ retentionDays: number }> {
    return this.request('GET', '/api/v1/audit-logs/config');
  }

  async updateAuditLogConfig(retentionDays: number): Promise<{ retentionDays: number; deleted: number }> {
    return this.request('PUT', '/api/v1/audit-logs/config', { retentionDays });
  }

  async listAuditLogs(options?: { limit?: number; action?: string; resourceType?: string }): Promise<{ data: AuditLogEntry[]; count: number }> {
    const params = new URLSearchParams();
    if (options?.limit) params.set('limit', String(options.limit));
    if (options?.action) params.set('action', options.action);
    if (options?.resourceType) params.set('resourceType', options.resourceType);
    return this.request('GET', `/api/v1/audit-logs?${params.toString()}`);
  }

  /** Login — o backend seta cookies HttpOnly e CSRF; retorna user + tenantId */
  async login(input: LoginInput): Promise<LoginResponse> {
    await this.ensureCsrfToken();
    const response = await this.request<LoginResponse>('POST', '/api/v1/auth/login', input);
    return response;
  }

  /** Logout — limpa cookies no backend */
  async logout(): Promise<void> {
    await this.request('POST', '/api/v1/auth/logout', {});
    this.csrfToken = null;
  }

  /** Refresh de access token via cookie refresh_token */
  async refreshTokens(): Promise<void> {
    if (this.refreshPromise) return this.refreshPromise;
    this.refreshPromise = this.refreshWithCrossTabLock()
      .finally(() => { this.refreshPromise = null; });
    return this.refreshPromise;
  }

  private async refreshWithCrossTabLock(): Promise<void> {
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
    } finally {
      this.releaseRefreshLock();
    }
  }

  private readRefreshLock(): { owner?: string; expiresAt?: number } | null {
    try {
      return JSON.parse(localStorage.getItem(this.refreshLockKey) ?? 'null') as { owner?: string; expiresAt?: number } | null;
    } catch {
      return null;
    }
  }

  private acquireRefreshLock(): boolean {
    try {
      localStorage.setItem(
        this.refreshLockKey,
        JSON.stringify({ owner: this.refreshOwner, expiresAt: Date.now() + REFRESH_LOCK_TTL_MS })
      );
      return true;
    } catch {
      return false;
    }
  }

  private releaseRefreshLock(): void {
    try {
      if (this.readRefreshLock()?.owner === this.refreshOwner) localStorage.removeItem(this.refreshLockKey);
    } catch {
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
  private async waitForOtherTabRefresh(expiresAt: number): Promise<void> {
    const deadline = Math.max(0, Math.min(expiresAt, Date.now() + REFRESH_LOCK_TTL_MS) - Date.now());
    await new Promise<void>((resolve) => {
      let settled = false;
      const finish = (): void => {
        if (settled) return;
        settled = true;
        window.removeEventListener('storage', onStorage);
        clearTimeout(timer);
        resolve();
      };
      const onStorage = (event: StorageEvent): void => {
        if (event.key === this.refreshLockKey) finish();
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
  private async sendWithRecovery(
    method: string,
    path: string,
    body?: unknown,
    headers?: Record<string, string>,
    options?: { skipRefresh?: boolean; skipCsrfRecovery?: boolean; skipRateLimitRetry?: boolean; bodyInit?: BodyInit }
  ): Promise<Response> {
    const url = joinApiUrl(this.baseUrl, path);

    const send = async (): Promise<Response> => {
      const requestHeaders: Record<string, string> = { ...headers };
      const hasBody = options?.bodyInit !== undefined || body !== undefined;
      // Sem corpo não há o que serializar — e enviar Content-Type: json em GET
      // forçava um preflight CORS por requisição no modo cross-origin.
      // bodyInit (FormData no upload de mídia) NÃO recebe o header: o fetch
      // precisa gerar o multipart boundary sozinho — forçar application/json
      // fazia a API cair no branch JSON e responder 400.
      if (hasBody && options?.bodyInit === undefined) requestHeaders['Content-Type'] = 'application/json';

      if (!['GET', 'HEAD', 'OPTIONS'].includes(method.toUpperCase())) {
        const csrf = await this.ensureCsrfToken();
        if (csrf) requestHeaders['x-csrf-token'] = csrf;
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
        const data = await probe.json() as { error?: string };
        errorCode = data.error ?? '';
      } catch {
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
  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
    headers?: Record<string, string>,
    options?: { skipRefresh?: boolean; skipCsrfRecovery?: boolean; skipRateLimitRetry?: boolean }
  ): Promise<T> {
    const response = await this.sendWithRecovery(method, path, body, headers, options);

    if (!response.ok) {
      throw await ApiError.fromResponse(response);
    }

    return response.json() as Promise<T>;
  }

  /** Requisição genérica que retorna o Response bruto (para blobs, downloads, etc.). */
  public async requestRaw(
    method: string,
    path: string,
    body?: unknown,
    headers?: Record<string, string>,
    options?: { skipRefresh?: boolean; skipCsrfRecovery?: boolean; skipRateLimitRetry?: boolean }
  ): Promise<Response> {
    return this.sendWithRecovery(method, path, body, headers, options);
  }

  /** Garante um token CSRF sincronizado com o cookie do browser. */
  private async ensureCsrfToken(force = false): Promise<string | null> {
    const cookieToken = this.readCsrfCookie();
    if (!force && cookieToken) {
      this.csrfToken = cookieToken;
      return cookieToken;
    }
    // Cookie ilegível: usa o token em memória por até 60s em vez de bater em
    // /auth/csrf a cada mutação (mais uma requisição por PUT/POST/DELETE).
    if (!force && this.csrfToken && Date.now() - this.csrfFetchedAt < CSRF_TTL_MS) return this.csrfToken;

    try {
      const response = await fetch(joinApiUrl(this.baseUrl, '/api/v1/auth/csrf'), {
        credentials: 'include',
        headers: { Accept: 'application/json' },
      });
      if (!response.ok) return this.csrfToken;
      const data = await response.json() as { csrfToken?: string };
      this.csrfToken = data.csrfToken ?? this.readCsrfCookie();
      this.csrfFetchedAt = Date.now();
    } catch {
      // O endpoint pode estar indisponível durante o boot; a API responderá
      // com erro explícito em vez de enviar uma mutação sem proteção.
    }
    return this.csrfToken;
  }

  private readCsrfCookie(): string | null {
    if (typeof document !== 'undefined') {
      const match = document.cookie.match(/(?:^|;\s*)csrf_token=([^;]+)/);
      if (match?.[1]) return match[1];
    }
    return this.csrfToken;
  }

  // Content
  async getContent(options?: {
    page?: number;
    limit?: number;
    type?: string;
    status?: string;
    search?: string;
    /** Anexa o autor de cada item numa única query no backend (anti N+1). */
    includeAuthor?: boolean;
  }): Promise<PaginatedResponse<Content>> {
    const params = new URLSearchParams();
    if (options?.page) params.set('page', String(options.page));
    if (options?.limit) params.set('limit', String(options.limit));
    if (options?.type) params.set('type', options.type);
    if (options?.status) params.set('status', options.status);
    if (options?.search) params.set('search', options.search);
    if (options?.includeAuthor) params.set('include', 'author');

    return this.request('GET', `/api/v1/content?${params.toString()}`);
  }

  async getContentById(id: string): Promise<Content> {
    return this.request('GET', `/api/v1/content/${id}`);
  }

  async getSingletonContent(type: string): Promise<Content | null> {
    const response = await this.request<Content | { content: Content | null }>(
      'GET',
      `/api/v1/content/singleton/${encodeURIComponent(type)}`
    );
    return 'content' in response ? response.content : response;
  }

  async createContent(data: Partial<Content>): Promise<Content> {
    return this.request('POST', `/api/v1/content`, data);
  }

  async updateContent(id: string, data: Partial<Content>): Promise<Content> {
    return this.request('PUT', `/api/v1/content/${id}`, data);
  }

  async deleteContent(id: string): Promise<void> {
    await this.request('DELETE', `/api/v1/content/${id}`);
  }

  /** A2: publica via rota real do publisher (eventBus + cache + revisions). */
  async publishContent(id: string): Promise<Content> {
    const response = await this.request<Content | { content: Content }>('POST', `/api/v1/content/${id}/publish`);
    return 'content' in response ? response.content : response;
  }

  /** A2: despublica via rota real do publisher. */
  async unpublishContent(id: string): Promise<Content> {
    const response = await this.request<Content | { content: Content }>('POST', `/api/v1/content/${id}/unpublish`);
    return 'content' in response ? response.content : response;
  }

  /** Atalho usado pela ContentList: publish/unpublish conforme status atual. */
  async publishToggle(id: string, isPublished: boolean): Promise<Content> {
    return isPublished ? this.unpublishContent(id) : this.publishContent(id);
  }

  // Content Types (CPTs)
  async getContentTypes(): Promise<ContentType[]> {
    return this.request('GET', '/api/v1/content-types');
  }

  async createContentType(data: Partial<ContentType>): Promise<ContentType> {
    return this.request('POST', '/api/v1/content-types', data);
  }

  async updateContentType(slug: string, data: Partial<ContentType>): Promise<ContentType> {
    return this.request('PUT', `/api/v1/content-types/${slug}`, data);
  }

  async deleteContentType(slug: string): Promise<void> {
    await this.request('DELETE', `/api/v1/content-types/${slug}`);
  }

  // Taxonomies
  async getTaxonomies(): Promise<Taxonomy[]> {
    return this.request('GET', '/api/v1/taxonomies');
  }

  async createTaxonomy(data: Partial<Taxonomy>): Promise<Taxonomy> {
    return this.request('POST', '/api/v1/taxonomies', data);
  }

  async attachTaxonomy(slug: string, contentType: string): Promise<void> {
    await this.request('POST', `/api/v1/taxonomies/${slug}/attach`, { contentType });
  }

  async detachTaxonomy(slug: string, contentType: string): Promise<void> {
    await this.request('POST', `/api/v1/taxonomies/${slug}/detach`, { contentType });
  }

  async deleteTaxonomy(slug: string): Promise<void> {
    await this.request('DELETE', `/api/v1/taxonomies/${slug}`);
  }

  async getTaxonomyTerms(slug: string): Promise<TaxonomyTerm[]> {
    return this.request('GET', `/api/v1/taxonomies/${encodeURIComponent(slug)}/terms`);
  }

  async createTaxonomyTerm(slug: string, data: Partial<TaxonomyTerm>): Promise<TaxonomyTerm> {
    return this.request('POST', `/api/v1/taxonomies/${encodeURIComponent(slug)}/terms`, data);
  }

  async updateTaxonomyTerm(slug: string, id: string, data: Partial<TaxonomyTerm>): Promise<TaxonomyTerm> {
    return this.request('PUT', `/api/v1/taxonomies/${encodeURIComponent(slug)}/terms/${id}`, data);
  }

  async deleteTaxonomyTerm(slug: string, id: string): Promise<void> {
    await this.request('DELETE', `/api/v1/taxonomies/${encodeURIComponent(slug)}/terms/${id}`);
  }

  async getCategories(): Promise<Category[]> {
    return this.request('GET', '/api/v1/categories');
  }

  async createCategory(data: Partial<Category>): Promise<Category> {
    return this.request('POST', '/api/v1/categories', data);
  }

  async updateCategory(id: string, data: Partial<Category>): Promise<Category> {
    return this.request('PUT', `/api/v1/categories/${id}`, data);
  }

  async deleteCategory(id: string): Promise<void> {
    await this.request('DELETE', `/api/v1/categories/${id}`);
  }

  async getTags(): Promise<Tag[]> {
    return this.request('GET', '/api/v1/tags');
  }

  async createTag(data: Partial<Tag>): Promise<Tag> {
    return this.request('POST', '/api/v1/tags', data);
  }

  async updateTag(id: string, data: Partial<Tag>): Promise<Tag> {
    return this.request('PUT', `/api/v1/tags/${id}`, data);
  }

  async deleteTag(id: string): Promise<void> {
    await this.request('DELETE', `/api/v1/tags/${id}`);
  }

  async getMenus(): Promise<Menu[]> {
    return this.request('GET', '/api/v1/menus');
  }

  async createMenu(data: Partial<Menu>): Promise<Menu> {
    return this.request('POST', '/api/v1/menus', data);
  }

  async updateMenu(id: string, data: Partial<Menu>): Promise<Menu> {
    return this.request('PUT', `/api/v1/menus/${id}`, data);
  }

  async deleteMenu(id: string): Promise<void> {
    await this.request('DELETE', `/api/v1/menus/${id}`);
  }

  // Field Groups & Types
  async getFieldGroups(context?: { type?: string; slug?: string; taxonomy?: string; term?: string; userRole?: string; template?: string; status?: string }): Promise<FieldGroupSummary[]> {
    if (context?.type) {
      const qs = new URLSearchParams({ type: context.type });
      for (const [key, value] of Object.entries(context)) {
        if (key !== 'type' && value) qs.set(key, value);
      }
      return this.request('GET', `/api/v1/field-groups?${qs.toString()}`);
    }
    return this.request('GET', '/api/v1/field-groups');
  }

  async getFieldGroup(id: string): Promise<FieldGroup> {
    return this.request('GET', `/api/v1/field-groups/${id}`);
  }

  async exportFieldGroup(id: string): Promise<Blob> {
    const response = await this.requestRaw('GET', `/api/v1/field-groups/${id}/export`);
    if (!response.ok) throw new Error(await response.text());
    return response.blob();
  }

  async importFieldGroups(data: unknown): Promise<{ results: Array<{ key: string; success: boolean; action?: string; error?: string; id?: string }> }> {
    return this.request('POST', '/api/v1/field-groups/import', data);
  }

  async createFieldGroup(data: Record<string, unknown>): Promise<FieldGroup> {
    return this.request('POST', '/api/v1/field-groups', data);
  }

  async updateFieldGroup(id: string, data: Record<string, unknown>): Promise<FieldGroup> {
    return this.request('PUT', `/api/v1/field-groups/${id}`, data);
  }

  async deleteFieldGroup(id: string): Promise<void> {
    await this.request('DELETE', `/api/v1/field-groups/${id}`);
  }

  async getFieldTypes(category?: string): Promise<{ categories: FieldCategoryInfo[]; types: FieldTypeInfo[] }> {
    const query = category ? `?category=${encodeURIComponent(category)}` : '';
    return this.request('GET', `/api/v1/field-types${query}`);
  }

  async getWebhooks(): Promise<Webhook[]> {
    return this.request('GET', '/api/v1/webhooks');
  }

  async getWebhookEvents(): Promise<WebhookEventOption[]> {
    const response = await this.request<{ data: WebhookEventOption[] }>('GET', '/api/v1/webhooks/events');
    return response.data;
  }

  async createWebhook(data: Partial<Webhook>): Promise<Webhook> {
    return this.request('POST', '/api/v1/webhooks', data);
  }

  async updateWebhook(id: string, data: Partial<Webhook>): Promise<Webhook> {
    return this.request('PUT', `/api/v1/webhooks/${id}`, data);
  }

  async deleteWebhook(id: string): Promise<void> {
    await this.request('DELETE', `/api/v1/webhooks/${id}`);
  }

  // API keys (login via API para clientes externos)
  async getApiKeys(): Promise<ApiKey[]> {
    return this.request('GET', '/api/v1/api-keys');
  }

  /** A resposta traz `plaintext` — único momento em que o valor claro existe. */
  async createApiKey(data: { name: string; userId?: string; oneTime?: boolean; expiresAt?: string }): Promise<ApiKeyCreated> {
    return this.request('POST', '/api/v1/api-keys', data);
  }

  async deleteApiKey(id: string): Promise<void> {
    await this.request('DELETE', `/api/v1/api-keys/${id}`);
  }

  // Media (upload real: multipart → disco → URL pública)
  async listMedia(options?: {
    page?: number;
    limit?: number;
    mimeType?: string;
    search?: string;
  }): Promise<PaginatedResponse<Media>> {
    const params = new URLSearchParams();
    if (options?.page) params.set('page', String(options.page));
    if (options?.limit) params.set('limit', String(options.limit));
    if (options?.mimeType) params.set('mimeType', options.mimeType);
    if (options?.search) params.set('search', options.search);
    return this.request('GET', `/api/v1/media?${params.toString()}`);
  }

  async getMedia(id: string): Promise<Media> {
    return this.request('GET', `/api/v1/media/${id}`);
  }

  /** Upload multipart — NÃO seta Content-Type (o fetch precisa do boundary). */
  async uploadMedia(
    file: File,
    options?: { alt?: string; caption?: string }
  ): Promise<Media> {
    const formData = new FormData();
    formData.append('file', file);
    if (options?.alt) formData.append('alt', options.alt);
    if (options?.caption) formData.append('caption', options.caption);

    const response = await this.sendWithRecovery('POST', '/api/v1/media/upload', undefined, {}, { bodyInit: formData });
    if (!response.ok) throw await ApiError.fromResponse(response);
    return response.json() as Promise<Media>;
  }

  async updateMedia(id: string, data: { title?: string; alt?: string; caption?: string; description?: string }): Promise<Media> {
    return this.request('PUT', `/api/v1/media/${id}`, data);
  }

  async replaceMediaFile(id: string, file: File): Promise<Media> {
    const formData = new FormData();
    formData.append('file', file);

    const response = await this.sendWithRecovery('PUT', `/api/v1/media/${id}/file`, undefined, {}, { bodyInit: formData });
    if (!response.ok) throw await ApiError.fromResponse(response);
    return response.json() as Promise<Media>;
  }

  async deleteMedia(id: string): Promise<void> {
    await this.request('DELETE', `/api/v1/media/${id}`);
  }

  // Users & roles
  async listUsers(options?: {
    page?: number;
    limit?: number;
    search?: string;
    status?: string;
  }): Promise<PaginatedResponse<AdminUser>> {
    const params = new URLSearchParams();
    if (options?.page) params.set('page', String(options.page));
    if (options?.limit) params.set('limit', String(options.limit));
    if (options?.search) params.set('search', options.search);
    if (options?.status) params.set('status', options.status);
    return this.request('GET', `/api/v1/users?${params.toString()}`);
  }

  async getUser(id: string): Promise<AdminUser> {
    return this.request('GET', `/api/v1/users/${id}`);
  }

  async createUser(data: {
    email: string;
    name: string;
    password: string;
    roleId?: string;
  }): Promise<AdminUser> {
    return this.request('POST', '/api/v1/users', data);
  }

  async updateUser(
    id: string,
    data: { name?: string; email?: string; status?: string; avatar?: string }
  ): Promise<AdminUser> {
    return this.request('PUT', `/api/v1/users/${id}`, data);
  }

  async deleteUser(id: string): Promise<void> {
    await this.request('DELETE', `/api/v1/users/${id}`);
  }

  async setUserPassword(id: string, password: string): Promise<void> {
    await this.request('PUT', `/api/v1/users/${id}/password`, { password });
  }

  async assignRole(userId: string, roleId: string): Promise<{ success: boolean; roles: string[] }> {
    return this.request('POST', `/api/v1/users/${userId}/roles`, { roleId });
  }

  async removeRole(userId: string, roleId: string): Promise<{ success: boolean; roles: string[] }> {
    return this.request('DELETE', `/api/v1/users/${userId}/roles/${roleId}`);
  }

  async listRoles(): Promise<Role[]> {
    return this.request('GET', '/api/v1/roles');
  }

  async createRole(data: Partial<Role>): Promise<Role> {
    return this.request('POST', '/api/v1/roles', data);
  }

  async updateRole(id: string, data: Partial<Role>): Promise<Role> {
    return this.request('PUT', `/api/v1/roles/${id}`, data);
  }

  async deleteRole(id: string): Promise<void> {
    await this.request('DELETE', `/api/v1/roles/${id}`);
  }

  async listTenants(options?: { page?: number; limit?: number; search?: string }): Promise<PaginatedResponse<Tenant>> {
    const params = new URLSearchParams();
    if (options?.page) params.set('page', String(options.page));
    if (options?.limit) params.set('limit', String(options.limit));
    if (options?.search) params.set('search', options.search);
    return this.request('GET', `/api/v1/tenants?${params.toString()}`);
  }

  async createTenant(data: Partial<Tenant>): Promise<Tenant> {
    return this.request('POST', '/api/v1/tenants', data);
  }

  async updateTenant(id: string, data: Partial<Tenant>): Promise<Tenant> {
    return this.request('PUT', `/api/v1/tenants/${id}`, data);
  }

  async deleteTenant(id: string): Promise<void> {
    await this.request('DELETE', `/api/v1/tenants/${id}`);
  }

  // Settings (KV por grupo — ?group=general no GET; PUT em lote)
  async getSettings(group?: string): Promise<Setting[]> {
    const query = group ? `?group=${encodeURIComponent(group)}` : '';
    return this.request('GET', `/api/v1/settings${query}`);
  }

  async updateSettings(
    items: Array<{ key: string; value: unknown; group?: string; type?: string }>
  ): Promise<void> {
    await this.request('PUT', '/api/v1/settings', items);
  }

  // Health
  async healthCheck(): Promise<{ status: string }> {
    return this.request('GET', '/health');
  }

  // Themes (para layout override no editor)
  async getThemes(): Promise<ThemeInfo[]> {
    const themes = await this.request<Array<Record<string, unknown>>>('GET', '/api/v1/themes');
    return themes.map((theme) => ({
      id: String(theme['id'] ?? ''),
      name: String(theme['name'] ?? ''),
      version: theme['version'] ? String(theme['version']) : undefined,
      status: String(theme['status'] ?? 'INSTALLED'),
      config: (theme['config'] as Record<string, unknown> | null) ?? {},
      manifest: (theme['manifest'] as ThemeInfo['manifest']) ?? null,
    }));
  }

  /** Sincroniza o diretório de temas com o banco e retorna o estado completo. */
  async syncThemes(): Promise<ThemeInfo[]> {
    const themes = await this.request<Array<Record<string, unknown>>>('POST', '/api/v1/themes/sync');
    return themes.map((theme) => ({
      id: String(theme['id'] ?? ''),
      name: String(theme['name'] ?? ''),
      version: theme['version'] ? String(theme['version']) : undefined,
      status: String(theme['status'] ?? 'INSTALLED'),
      config: (theme['config'] as Record<string, unknown> | null) ?? {},
      manifest: (theme['manifest'] as ThemeInfo['manifest']) ?? null,
    }));
  }

  async activateTheme(id: string): Promise<ThemeInfo> {
    return this.request('POST', `/api/v1/themes/${id}/activate`);
  }

  async deactivateTheme(id: string): Promise<ThemeInfo> {
    return this.request('POST', `/api/v1/themes/${id}/deactivate`);
  }

  async updateThemeConfig(id: string, config: Record<string, unknown>): Promise<ThemeInfo> {
    return this.request('PATCH', `/api/v1/themes/${id}/config`, { config });
  }

  async installTheme(data: { name: string; version: string; manifest: Record<string, unknown> }): Promise<ThemeInfo> {
    return this.request('POST', '/api/v1/themes/install', data);
  }

  async uninstallTheme(id: string): Promise<void> {
    await this.request('DELETE', `/api/v1/themes/${id}`);
  }

  // Plugins
  async getPlugins(): Promise<PluginInfo[]> {
    const plugins = await this.request<Array<Record<string, unknown>>>('GET', '/api/v1/plugins');
    return plugins.map((plugin) => ({
      id: String(plugin['id'] ?? ''),
      name: String(plugin['name'] ?? ''),
      version: String(plugin['version'] ?? ''),
      status: String(plugin['status'] ?? 'INSTALLED'),
      enabled: plugin['enabled'] === true,
      manifest: (plugin['manifest'] as PluginInfo['manifest']) ?? null,
    }));
  }

  async activatePlugin(id: string, tenantId: string): Promise<PluginInfo> {
    return this.request('POST', `/api/v1/plugins/${id}/activate`, { tenantId });
  }

  async deactivatePlugin(id: string, tenantId: string): Promise<PluginInfo> {
    return this.request('POST', `/api/v1/plugins/${id}/deactivate`, { tenantId });
  }

  async uninstallPlugin(id: string): Promise<void> {
    await this.request('DELETE', `/api/v1/plugins/${id}`);
  }

  /** Estado de runtime dos plugins (WP2) — por escopo platform/tenant. */
  async getPluginsRuntime(): Promise<{
    generatedAt: string;
    scopes: Array<{
      scope: string;
      tenantId: string | null;
      loadedAt: string;
      enabled: string[];
      loaded: string[];
      unloaded: string[];
      failed: Array<{ name: string; error: string }>;
    }>;
  }> {
    return this.request('GET', '/api/v1/plugins/runtime');
  }
}

export interface ContentType {
  name: string;
  slug: string;
  pluralLabel: string;
  singularLabel: string;
  source?: string;
  supports?: string[];
  hasArchive?: boolean;
  menuIcon?: string;
  singleton?: boolean;
  defaultFields?: string[];
}

export interface Taxonomy {
  id?: string;
  name: string;
  slug: string;
  hierarchical?: boolean;
  attachTo?: string[];
  labels?: Record<string, string>;
  source?: string;
}

export interface TaxonomyTerm {
  id?: string;
  taxonomyId?: string;
  taxonomy_id?: string;
  name: string;
  slug: string;
  description?: string | null;
  parentId?: string | null;
  parent_id?: string | null;
  meta?: Record<string, unknown>;
}

export interface Category {
  id?: string;
  name: string;
  slug: string;
  description?: string | null;
  parent_id?: string | null;
  parentId?: string | null;
}

export interface Tag {
  id?: string;
  name: string;
  slug: string;
}

export type MenuItemType = 'custom' | 'home' | 'page' | 'post' | 'content' | 'archive' | 'taxonomy';

export interface MenuItem {
  id: string;
  type?: MenuItemType;
  label: string;
  url?: string;
  objectId?: string;
  objectType?: string;
  contentId?: string;
  parentId?: string | null;
  order: number;
  target?: '_self' | '_blank';
  attrTitle?: string;
  cssClasses?: string;
  xfn?: string;
  description?: string;
  metadata?: Record<string, unknown>;
}

export interface MenuSettings {
  autoAddNewPages?: boolean;
  locations?: Record<string, boolean>;
}

export interface Menu {
  id?: string;
  name: string;
  slug: string;
  items?: MenuItem[];
  settings?: MenuSettings;
}

export interface Webhook {
  id?: string;
  url: string;
  events?: string[];
  auth_type?: 'none' | 'bearer' | 'basic' | 'api_key' | 'hmac_sha256';
  auth_config?: {
    username?: string;
    headerName?: string;
    signatureHeader?: string;
    token?: string;
    password?: string;
    value?: string;
    secret?: string;
  };
  auth_configured?: boolean;
  secret?: string;
  active?: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface WebhookEventOption {
  value: string;
  label: string;
}

export interface ApiKey {
  id?: string;
  tenant_id?: string;
  user_id?: string;
  name: string;
  key_prefix?: string;
  one_time?: boolean;
  expires_at?: string | null;
  last_used_at?: string | null;
  use_count?: number;
  revoked_at?: string | null;
  created_by?: string | null;
  created_at?: string;
}

export interface ApiKeyCreated extends ApiKey {
  /** Valor completo — guarde agora; a API nunca mais o devolve. */
  plaintext: string;
}

export interface FieldGroupSummary {
  id: string;
  title: string;
  key: string;
  active: boolean;
  fieldCount: number;
  locationRules?: LocationRule[][];
  metadata?: Record<string, unknown>;
}

export interface LocationRule {
  param: 'content_type' | 'content_slug' | 'taxonomy' | 'term' | 'user_role' | 'page_template' | 'post_status';
  operator: 'eq' | 'neq';
  value: string;
}

export interface FieldGroup {
  id: string;
  title: string;
  key: string;
  locationRules?: LocationRule[][];
  position?: 'normal' | 'side' | 'after_title';
  displayStyle?: 'standard' | 'seamless' | 'grouped';
  active?: boolean;
  fields: FieldDefinition[];
  metadata?: Record<string, unknown>;
}

export interface FieldDefinition {
  id?: string;
  type: string;
  name: string;
  key?: string;
  label: string;
  instructions?: string;
  required?: boolean;
  config?: Record<string, unknown>;
  conditionalLogic?: unknown;
  sortOrder?: number;
  subFields?: FieldDefinition[];
  layouts?: Array<{
    name: string;
    label: string;
    display?: string;
    min?: number;
    max?: number;
    subFields: FieldDefinition[];
  }>;
  isCoreField?: boolean;
  isLocked?: boolean;
  coreFieldKey?: string;
}

export interface FieldCategoryInfo {
  id: string;
  label: string;
  icon: string;
}

export interface FieldTypeInfo {
  type: string;
  category: FieldCategoryInfo['id'];
  label: string;
  icon: string;
  isLayout?: boolean;
  supportsConditions?: boolean;
}

export const apiClient = new ApiClient();
