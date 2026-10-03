// API Client for Admin Dashboard

const API_BASE = (import.meta.env as Record<string, string>)['PUBLIC_API_URL'] ?? 'http://localhost:3000';

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
  tenantId: string;
}

export interface LoginResponse {
  user: {
    id: string;
    email: string;
    name: string;
  };
  accessToken: string;
  refreshToken: string;
  sessionId: string;
  /** UUID do tenant (retornado pelo login resolvido no backend) */
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

export interface Role {
  id: string;
  tenant_id?: string | null;
  name: string;
  slug: string;
  is_system?: boolean;
  permissions?: unknown[];
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
    provides?: { layouts?: string[] };
    parent?: string;
  } | null;
}

class ApiClient {
  private accessToken: string | null = null;
  private refreshTokenValue: string | null = null;

  constructor(private baseUrl: string = API_BASE) {}

  setTokens(accessToken: string, refreshToken: string, tenantId?: string) {
    this.accessToken = accessToken;
    this.refreshTokenValue = refreshToken;
    if (typeof window !== 'undefined') {
      localStorage.setItem('accessToken', accessToken);
      localStorage.setItem('refreshToken', refreshToken);
      if (tenantId) localStorage.setItem('tenantId', tenantId);
    }
  }

  /** Sessão válida sem tocar na rede (guarda de rota da admin). */
  isLoggedIn(): boolean {
    this.loadTokens();
    return this.accessToken !== null;
  }

  getTenantId(): string | null {
    if (typeof window !== 'undefined') return localStorage.getItem('tenantId');
    return null;
  }

  loadTokens() {
    if (typeof window !== 'undefined') {
      this.accessToken = localStorage.getItem('accessToken');
      this.refreshTokenValue = localStorage.getItem('refreshToken');
    }
  }

  clearTokens() {
    this.accessToken = null;
    this.refreshTokenValue = null;
    if (typeof window !== 'undefined') {
      localStorage.removeItem('accessToken');
      localStorage.removeItem('refreshToken');
    }
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
    headers?: Record<string, string>
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    
    const requestHeaders: Record<string, string> = {
      'Content-Type': 'application/json',
      ...headers,
    };

    if (this.accessToken) {
      requestHeaders['Authorization'] = `Bearer ${this.accessToken}`;
    }
    const tenantId = this.getTenantId();
    if (tenantId) {
      requestHeaders['X-Tenant-ID'] = tenantId;
    }

    const response = await fetch(url, {
      method,
      headers: requestHeaders,
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Request failed' }));
      throw new Error(error.error ?? 'Request failed');
    }

    return response.json() as Promise<T>;
  }

  // Auth
  async login(input: LoginInput): Promise<LoginResponse> {
    const response = await this.request<LoginResponse>('POST', '/api/v1/auth/login', input);
    this.setTokens(response.accessToken, response.refreshToken, response.tenantId);
    return response;
  }

  async logout() {
    if (this.refreshTokenValue) {
      await this.request('POST', '/api/v1/auth/logout', { token: this.refreshTokenValue });
    }
    this.clearTokens();
  }

  async refreshTokens(): Promise<void> {
    if (!this.refreshTokenValue) throw new Error('No refresh token');
    
    const response = await this.request<{ accessToken: string; refreshToken: string }>(
      'POST',
      '/api/v1/auth/refresh',
      { refreshToken: this.refreshTokenValue }
    );
    
    this.setTokens(response.accessToken, response.refreshToken);
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
    return this.request('POST', '/api/v1/content', data);
  }

  async updateContent(id: string, data: Partial<Content>): Promise<Content> {
    return this.request('PUT', `/api/v1/content/${id}`, data);
  }

  async deleteContent(id: string): Promise<void> {
    await this.request('DELETE', `/api/v1/content/${id}`);
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

  // Field Groups & Types
  async getFieldGroups(context?: { type?: string; taxonomy?: string; term?: string; userRole?: string; template?: string; status?: string }): Promise<FieldGroupSummary[]> {
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

  async getFieldTypes(category?: string): Promise<{ categories: FieldCategoryInfo[]; types: FieldTypeInfo[] }> {
    const query = category ? `?category=${encodeURIComponent(category)}` : '';
    return this.request('GET', `/api/v1/field-types${query}`);
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

    this.loadTokens();
    const headers: Record<string, string> = {};
    if (this.accessToken) headers['Authorization'] = `Bearer ${this.accessToken}`;
    const tenantId = this.getTenantId();
    if (tenantId) headers['X-Tenant-ID'] = tenantId;

    const response = await fetch(`${this.baseUrl}/api/v1/media/upload`, {
      method: 'POST',
      headers,
      body: formData,
    });
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

export interface FieldGroupSummary {
  id: string;
  title: string;
  key: string;
  active: boolean;
  fieldCount: number;
  locationRules?: unknown[];
}

export interface FieldGroup {
  id: string;
  title: string;
  key: string;
  fields: unknown[];
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
