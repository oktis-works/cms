// API Client for Admin Dashboard (HttpOnly cookies + CSRF + auto-refresh)

// Em produção, usar mesma origem por padrão (/api). No desenvolvimento,
// mantém a API separada na porta 3000 quando PUBLIC_API_URL não foi definida.
const API_BASE = import.meta.env.PUBLIC_API_URL ?? (import.meta.env.DEV ? 'http://localhost:3000' : '');

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
  mime_type: string;
  size: number;
  path: string;
  url: string;
  alt?: string | null;
  caption?: string | null;
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
  permissions?: unknown[];
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
}

export interface ThemeInfo {
  id: string;
  name: string;
  version?: string;
  status: string;
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
    provides?: { layouts?: string[] };
    parent?: string;
  } | null;
}

export interface PluginInfo {
  id: string;
  name: string;
  version: string;
  status: string;
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

class ApiClient {
  private baseUrl: string;
  private csrfToken: string | null = null;
  private refreshPromise: Promise<void> | null = null;
  private readonly refreshOwner = typeof globalThis.crypto?.randomUUID === 'function'
    ? globalThis.crypto.randomUUID()
    : Math.random().toString(36).slice(2);
  private readonly refreshLockKey = 'okcms:auth:refresh-lock';

  constructor(baseUrl: string = API_BASE) {
    this.baseUrl = baseUrl;
  }

  /** Inicializa lendo CSRF do cookie (chamado no boot da app) */
  async init(): Promise<void> {
    try {
      await this.ensureCsrfToken();
    } catch {
      // ignora
    }
  }

  /** Sessão válida — verifica via /me (usa cookies HttpOnly automaticamente) */
  async isLoggedIn(): Promise<boolean> {
    try {
      await this.request('GET', '/api/v1/auth/me');
      return true;
    } catch {
      return false;
    }
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

    const now = Date.now();
    let current: { owner?: string; expiresAt?: number } | null;
    try {
      current = JSON.parse(localStorage.getItem(this.refreshLockKey) ?? 'null') as { owner?: string; expiresAt?: number } | null;
    } catch {
      // Storage indisponível (privacidade): mantém o refresh seguro dentro da aba.
      await this.request('POST', '/api/v1/auth/refresh', {}, undefined, { skipRefresh: true });
      return;
    }

    if (current?.owner && current.owner !== this.refreshOwner && Number(current.expiresAt) > now) {
      await this.waitForOtherTabRefresh(Number(current.expiresAt));
      return;
    }

    try {
      localStorage.setItem(this.refreshLockKey, JSON.stringify({ owner: this.refreshOwner, expiresAt: now + 10000 }));
    } catch {
      await this.request('POST', '/api/v1/auth/refresh', {}, undefined, { skipRefresh: true });
      return;
    }
    try {
      await this.request('POST', '/api/v1/auth/refresh', {}, undefined, { skipRefresh: true });
    } finally {
      try {
        const lock = JSON.parse(localStorage.getItem(this.refreshLockKey) ?? 'null') as { owner?: string } | null;
        if (lock?.owner === this.refreshOwner) localStorage.removeItem(this.refreshLockKey);
      } catch {
        // Storage pode ficar indisponível durante a navegação; o lock expira sozinho.
      }
    }
  }

  private async waitForOtherTabRefresh(expiresAt: number): Promise<void> {
    while (Date.now() < Math.min(expiresAt, Date.now() + 10000)) {
      await new Promise((resolve) => setTimeout(resolve, 100));
      try {
        const lock = JSON.parse(localStorage.getItem(this.refreshLockKey) ?? 'null') as { expiresAt?: number } | null;
        if (!lock || Number(lock.expiresAt) <= Date.now()) return;
      } catch {
        return;
      }
    }
  }

  /** Requisição genérica com:
   * - credentials: 'include' (envia cookies HttpOnly)
   * - auto-refresh em 401
   * - CSRF header para mutações
   */
  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
    headers?: Record<string, string>,
    options?: { skipRefresh?: boolean; skipCsrfRecovery?: boolean }
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`;

    const send = async (): Promise<Response> => {
      const requestHeaders: Record<string, string> = {
        'Content-Type': 'application/json',
        ...headers,
      };

      if (!['GET', 'HEAD', 'OPTIONS'].includes(method.toUpperCase())) {
        const csrf = await this.ensureCsrfToken();
        if (csrf) requestHeaders['x-csrf-token'] = csrf;
      }

      return fetch(url, {
        method,
        headers: requestHeaders,
        credentials: 'include',
        body: body ? JSON.stringify(body) : undefined,
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

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Request failed' }));
      throw new Error(error.error ?? `Request failed: ${response.status}`);
    }

    return response.json() as Promise<T>;
  }

  /** Garante um token CSRF sincronizado com o cookie do browser. */
  private async ensureCsrfToken(force = false): Promise<string | null> {
    const cookieToken = this.readCsrfCookie();
    if (!force && cookieToken) {
      this.csrfToken = cookieToken;
      return cookieToken;
    }
    if (!force && this.csrfToken) return this.csrfToken;

    try {
      const response = await fetch(`${this.baseUrl}/api/v1/auth/csrf`, {
        credentials: 'include',
        headers: { Accept: 'application/json' },
      });
      if (!response.ok) return this.csrfToken;
      const data = await response.json() as { csrfToken?: string };
      this.csrfToken = data.csrfToken ?? this.readCsrfCookie();
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
  }): Promise<PaginatedResponse<Content>> {
    const params = new URLSearchParams();
    if (options?.page) params.set('page', String(options.page));
    if (options?.limit) params.set('limit', String(options.limit));
    if (options?.type) params.set('type', options.type);
    if (options?.status) params.set('status', options.status);
    if (options?.search) params.set('search', options.search);

    return this.request('GET', `/api/v1/content?${params.toString()}`);
  }

  async getContentById(id: string): Promise<Content> {
    return this.request('GET', `/api/v1/content/${id}`);
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

  async createWebhook(data: Partial<Webhook>): Promise<Webhook> {
    return this.request('POST', '/api/v1/webhooks', data);
  }

  async updateWebhook(id: string, data: Partial<Webhook>): Promise<Webhook> {
    return this.request('PUT', `/api/v1/webhooks/${id}`, data);
  }

  async deleteWebhook(id: string): Promise<void> {
    await this.request('DELETE', `/api/v1/webhooks/${id}`);
  }

  async getBuilds(options?: { page?: number; limit?: number; status?: string }): Promise<PaginatedResponse<Build>> {
    const params = new URLSearchParams();
    if (options?.page) params.set('page', String(options.page));
    if (options?.limit) params.set('limit', String(options.limit));
    if (options?.status) params.set('status', options.status);
    return this.request('GET', `/api/v1/builds?${params.toString()}`);
  }

  async createBuild(data: Partial<Build>): Promise<Build & { queued?: boolean }> {
    return this.request('POST', '/api/v1/builds', data);
  }

  async getDeployments(options?: { page?: number; limit?: number; status?: string }): Promise<PaginatedResponse<Deployment>> {
    const params = new URLSearchParams();
    if (options?.page) params.set('page', String(options.page));
    if (options?.limit) params.set('limit', String(options.limit));
    if (options?.status) params.set('status', options.status);
    return this.request('GET', `/api/v1/deployments?${params.toString()}`);
  }

  async createDeployment(data: Partial<Deployment>): Promise<Deployment> {
    return this.request('POST', '/api/v1/deployments', data);
  }

  async rollbackDeployment(id: string, rollbackToId: string): Promise<Deployment> {
    return this.request('POST', `/api/v1/deployments/${id}/rollback`, { rollbackToId });
  }

  async getEvents(options?: { page?: number; limit?: number; type?: string }): Promise<PaginatedResponse<Record<string, unknown>>> {
    const params = new URLSearchParams();
    if (options?.page) params.set('page', String(options.page));
    if (options?.limit) params.set('limit', String(options.limit));
    if (options?.type) params.set('type', options.type);
    return this.request('GET', `/api/v1/events?${params.toString()}`);
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

    const url = `${this.baseUrl}/api/v1/media/upload`;
    const send = async (): Promise<Response> => {
      const csrf = await this.ensureCsrfToken();
      const requestHeaders: Record<string, string> = {};
      if (csrf) requestHeaders['x-csrf-token'] = csrf;
      return fetch(url, {
        method: 'POST',
        headers: requestHeaders,
        credentials: 'include',
        body: formData,
      });
    };

    let response = await send();
    if (response.status === 401) {
      await this.refreshTokens();
      response = await send();
    }
    if (response.status === 403) {
      let errorCode = '';
      try {
        const data = await response.clone().json() as { error?: string };
        errorCode = data.error ?? '';
      } catch {
        // segue para o erro original
      }
      if (errorCode === 'CSRF_TOKEN_INVALID') {
        await this.ensureCsrfToken(true);
        response = await send();
      }
    }

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: `Upload failed: ${response.status}` }));
      throw new Error(error.error ?? `Upload failed: ${response.status}`);
    }
    return response.json() as Promise<Media>;
  }

  async updateMedia(id: string, data: { alt?: string; caption?: string }): Promise<Media> {
    return this.request('PUT', `/api/v1/media/${id}`, data);
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
      manifest: (theme['manifest'] as ThemeInfo['manifest']) ?? null,
    }));
  }

  async activateTheme(id: string): Promise<ThemeInfo> {
    return this.request('POST', `/api/v1/themes/${id}/activate`);
  }

  async deactivateTheme(id: string): Promise<ThemeInfo> {
    return this.request('POST', `/api/v1/themes/${id}/deactivate`);
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
      manifest: (plugin['manifest'] as PluginInfo['manifest']) ?? null,
    }));
  }

  async activatePlugin(id: string): Promise<PluginInfo> {
    return this.request('POST', `/api/v1/plugins/${id}/activate`);
  }

  async deactivatePlugin(id: string): Promise<PluginInfo> {
    return this.request('POST', `/api/v1/plugins/${id}/deactivate`);
  }

  async installPlugin(data: { name: string; version: string; manifest: Record<string, unknown> }): Promise<PluginInfo> {
    return this.request('POST', '/api/v1/plugins/install', data);
  }

  async uninstallPlugin(id: string): Promise<void> {
    await this.request('DELETE', `/api/v1/plugins/${id}`);
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

export interface Menu {
  id?: string;
  name: string;
  slug: string;
  items?: Record<string, unknown> | unknown[];
}

export interface Webhook {
  id?: string;
  url: string;
  events?: string[];
  secret?: string;
  active?: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface Build {
  id?: string;
  status?: string;
  core_version?: string;
  coreVersion?: string;
  plugins?: Record<string, string>;
  theme?: { name: string; version: string };
  docker_image?: string | null;
  checksum?: string | null;
  build_log?: string | null;
  error?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface Deployment {
  id?: string;
  status?: string;
  build_id?: string;
  buildId?: string;
  core_version?: string;
  theme_version?: string;
  plugin_versions?: Record<string, string>;
  checksum?: string;
  health_check_status?: string | null;
  rollback_to_id?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface FieldGroupSummary {
  id: string;
  title: string;
  key: string;
  active: boolean;
  fieldCount: number;
  locationRules?: LocationRule[][];
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
  position?: 'normal' | 'side' | 'acf_after_title';
  displayStyle?: 'standard' | 'seamless' | 'grouped';
  active?: boolean;
  fields: FieldDefinition[];
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
