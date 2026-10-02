import type {
  UUID,
  LoginResponse,
  RefreshTokenResponse,
  UserResponse,
  TenantResponse,
  RoleResponse,
  ContentResponse,
  MediaResponse,
  CategoryResponse,
  TagResponse,
  MenuResponse,
  SettingResponse,
  PluginResponse,
  ThemeResponse,
  DeploymentResponse,
  PaginatedResponse,
  PaginationParams,
  FilterParams,
  CreateUserRequest,
  UpdateUserRequest,
  CreateTenantRequest,
  UpdateTenantRequest,
  CreateRoleRequest,
  UpdateRoleRequest,
  CreateContentRequest,
  UpdateContentRequest,
  CreateCategoryRequest,
  CreateTagRequest,
  CreateMenuRequest,
  UpdateSettingRequest,
  CreateDeploymentRequest,
} from '@oktis-works/types';

export interface OkCMSClientOptions {
  headers?: Record<string, string>;
}

interface TokenState {
  accessToken: string | null;
  refreshToken: string | null;
}

export class OkCMSClient {
  private baseUrl: string;
  private headers: Record<string, string>;
  private tokens: TokenState = { accessToken: null, refreshToken: null };

  constructor(baseUrl: string, options?: OkCMSClientOptions) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.headers = { 'Content-Type': 'application/json', ...options?.headers };
  }

  setTokens(accessToken: string, refreshToken: string): void {
    this.tokens.accessToken = accessToken;
    this.tokens.refreshToken = refreshToken;
  }

  clearTokens(): void {
    this.tokens.accessToken = null;
    this.tokens.refreshToken = null;
  }

  async refreshToken(): Promise<RefreshTokenResponse> {
    if (!this.tokens.refreshToken) throw new Error('No refresh token available');
    const res = await fetch(`${this.baseUrl}/api/v1/auth/refresh`, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify({ refreshToken: this.tokens.refreshToken }),
    });
    if (!res.ok) throw new Error(`Refresh failed: ${res.status}`);
    const data = (await res.json()) as RefreshTokenResponse;
    this.tokens.accessToken = data.accessToken;
    return data;
  }

  async login(email: string, password: string, tenantId?: string): Promise<LoginResponse> {
    const res = await this.request<LoginResponse>('POST', '/api/v1/auth/login', { email, password, tenantId });
    this.setTokens(res.accessToken, res.refreshToken);
    return res;
  }

  async register(email: string, password: string, name: string): Promise<UserResponse> {
    return this.request<UserResponse>('POST', '/api/v1/auth/register', { email, password, name });
  }

  async logout(): Promise<void> {
    try {
      await this.request('POST', '/api/v1/auth/logout');
    } finally {
      this.clearTokens();
    }
  }

  async listContent(options?: PaginationParams & FilterParams): Promise<PaginatedResponse<ContentResponse>> {
    return this.request('GET', `/api/v1/content${this.queryString(options)}`);
  }

  async getContent(id: UUID): Promise<ContentResponse> {
    return this.request('GET', `/api/v1/content/${id}`);
  }

  async getContentBySlug(slug: string, type?: string): Promise<ContentResponse> {
    const params = type ? `?type=${encodeURIComponent(type)}` : '';
    return this.request('GET', `/api/v1/content/slug/${slug}${params}`);
  }

  async createContent(data: CreateContentRequest): Promise<ContentResponse> {
    return this.request('POST', '/api/v1/content', data);
  }

  async updateContent(id: UUID, data: UpdateContentRequest): Promise<ContentResponse> {
    return this.request('PUT', `/api/v1/content/${id}`, data);
  }

  async deleteContent(id: UUID): Promise<void> {
    return this.request('DELETE', `/api/v1/content/${id}`);
  }

  async listUsers(options?: PaginationParams & FilterParams): Promise<PaginatedResponse<UserResponse>> {
    return this.request('GET', `/api/v1/users${this.queryString(options)}`);
  }

  async getUser(id: UUID): Promise<UserResponse> {
    return this.request('GET', `/api/v1/users/${id}`);
  }

  async createUser(data: CreateUserRequest): Promise<UserResponse> {
    return this.request('POST', '/api/v1/users', data);
  }

  async updateUser(id: UUID, data: UpdateUserRequest): Promise<UserResponse> {
    return this.request('PUT', `/api/v1/users/${id}`, data);
  }

  async deleteUser(id: UUID): Promise<void> {
    return this.request('DELETE', `/api/v1/users/${id}`);
  }

  async listTenants(): Promise<TenantResponse[]> {
    return this.request('GET', '/api/v1/tenants');
  }

  async getTenant(id: UUID): Promise<TenantResponse> {
    return this.request('GET', `/api/v1/tenants/${id}`);
  }

  async createTenant(data: CreateTenantRequest): Promise<TenantResponse> {
    return this.request('POST', '/api/v1/tenants', data);
  }

  async updateTenant(id: UUID, data: UpdateTenantRequest): Promise<TenantResponse> {
    return this.request('PUT', `/api/v1/tenants/${id}`, data);
  }

  async deleteTenant(id: UUID): Promise<void> {
    return this.request('DELETE', `/api/v1/tenants/${id}`);
  }

  async listRoles(): Promise<RoleResponse[]> {
    return this.request('GET', '/api/v1/roles');
  }

  async getRole(id: UUID): Promise<RoleResponse> {
    return this.request('GET', `/api/v1/roles/${id}`);
  }

  async createRole(data: CreateRoleRequest): Promise<RoleResponse> {
    return this.request('POST', '/api/v1/roles', data);
  }

  async updateRole(id: UUID, data: UpdateRoleRequest): Promise<RoleResponse> {
    return this.request('PUT', `/api/v1/roles/${id}`, data);
  }

  async deleteRole(id: UUID): Promise<void> {
    return this.request('DELETE', `/api/v1/roles/${id}`);
  }

  async listMedia(options?: PaginationParams & FilterParams): Promise<PaginatedResponse<MediaResponse>> {
    return this.request('GET', `/api/v1/media${this.queryString(options)}`);
  }

  async getMedia(id: UUID): Promise<MediaResponse> {
    return this.request('GET', `/api/v1/media/${id}`);
  }

  async uploadMedia(file: File): Promise<MediaResponse> {
    const formData = new FormData();
    formData.append('file', file);
    const res = await fetch(`${this.baseUrl}/api/v1/media/upload`, {
      method: 'POST',
      headers: this.authHeaders(),
      body: formData,
    });
    if (!res.ok) throw new Error(`Upload failed: ${res.status}`);
    return res.json() as Promise<MediaResponse>;
  }

  async deleteMedia(id: UUID): Promise<void> {
    return this.request('DELETE', `/api/v1/media/${id}`);
  }

  async listCategories(): Promise<CategoryResponse[]> {
    return this.request('GET', '/api/v1/categories');
  }

  async getCategory(id: UUID): Promise<CategoryResponse> {
    return this.request('GET', `/api/v1/categories/${id}`);
  }

  async createCategory(data: CreateCategoryRequest): Promise<CategoryResponse> {
    return this.request('POST', '/api/v1/categories', data);
  }

  async updateCategory(id: UUID, data: Partial<CreateCategoryRequest>): Promise<CategoryResponse> {
    return this.request('PUT', `/api/v1/categories/${id}`, data);
  }

  async deleteCategory(id: UUID): Promise<void> {
    return this.request('DELETE', `/api/v1/categories/${id}`);
  }

  async listTags(): Promise<TagResponse[]> {
    return this.request('GET', '/api/v1/tags');
  }

  async createTag(data: CreateTagRequest): Promise<TagResponse> {
    return this.request('POST', '/api/v1/tags', data);
  }

  async deleteTag(id: UUID): Promise<void> {
    return this.request('DELETE', `/api/v1/tags/${id}`);
  }

  async listMenus(): Promise<MenuResponse[]> {
    return this.request('GET', '/api/v1/menus');
  }

  async getMenu(id: UUID): Promise<MenuResponse> {
    return this.request('GET', `/api/v1/menus/${id}`);
  }

  async createMenu(data: CreateMenuRequest): Promise<MenuResponse> {
    return this.request('POST', '/api/v1/menus', data);
  }

  async updateMenu(id: UUID, data: Partial<CreateMenuRequest>): Promise<MenuResponse> {
    return this.request('PUT', `/api/v1/menus/${id}`, data);
  }

  async deleteMenu(id: UUID): Promise<void> {
    return this.request('DELETE', `/api/v1/menus/${id}`);
  }

  async getSettings(group?: string): Promise<SettingResponse[]> {
    const params = group ? `?group=${encodeURIComponent(group)}` : '';
    return this.request('GET', `/api/v1/settings${params}`);
  }

  async updateSettings(data: UpdateSettingRequest[]): Promise<SettingResponse[]> {
    return this.request('PUT', '/api/v1/settings', { settings: data });
  }

  async listPlugins(): Promise<PluginResponse[]> {
    return this.request('GET', '/api/v1/plugins');
  }

  async installPlugin(name: string): Promise<PluginResponse> {
    return this.request('POST', '/api/v1/plugins/install', { name });
  }

  async activatePlugin(id: UUID): Promise<PluginResponse> {
    return this.request('POST', `/api/v1/plugins/${id}/activate`);
  }

  async deactivatePlugin(id: UUID): Promise<PluginResponse> {
    return this.request('POST', `/api/v1/plugins/${id}/deactivate`);
  }

  async uninstallPlugin(id: UUID): Promise<void> {
    return this.request('DELETE', `/api/v1/plugins/${id}`);
  }

  async listThemes(): Promise<ThemeResponse[]> {
    return this.request('GET', '/api/v1/themes');
  }

  async installTheme(name: string): Promise<ThemeResponse> {
    return this.request('POST', '/api/v1/themes/install', { name });
  }

  async activateTheme(id: UUID): Promise<ThemeResponse> {
    return this.request('POST', `/api/v1/themes/${id}/activate`);
  }

  async uninstallTheme(id: UUID): Promise<void> {
    return this.request('DELETE', `/api/v1/themes/${id}`);
  }

  async listDeployments(): Promise<DeploymentResponse[]> {
    return this.request('GET', '/api/v1/deployments');
  }

  async getDeployment(id: UUID): Promise<DeploymentResponse> {
    return this.request('GET', `/api/v1/deployments/${id}`);
  }

  async createDeployment(data: CreateDeploymentRequest): Promise<DeploymentResponse> {
    return this.request('POST', '/api/v1/deployments', data);
  }

  async rollbackDeployment(id: UUID): Promise<DeploymentResponse> {
    return this.request('POST', `/api/v1/deployments/${id}/rollback`);
  }

  async healthCheck(): Promise<{ status: string }> {
    return this.request('GET', '/api/v1/health');
  }

  private authHeaders(): Record<string, string> {
    const h = { ...this.headers };
    if (this.tokens.accessToken) {
      h['Authorization'] = `Bearer ${this.tokens.accessToken}`;
    }
    return h;
  }

  private queryString(params?: Record<string, unknown>): string {
    if (!params) return '';
    const entries = Object.entries(params).filter(([, v]) => v !== undefined && v !== null);
    if (entries.length === 0) return '';
    const sp = new URLSearchParams();
    for (const [k, v] of entries) sp.set(k, String(v));
    return '?' + sp.toString();
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: this.authHeaders(),
      body: body ? JSON.stringify(body) : undefined,
    });

    if (res.status === 401 && this.tokens.refreshToken) {
      try {
        await this.refreshToken();
        const retryRes = await fetch(`${this.baseUrl}${path}`, {
          method,
          headers: this.authHeaders(),
          body: body ? JSON.stringify(body) : undefined,
        });
        if (!retryRes.ok) throw new Error(`Request failed: ${retryRes.status}`);
        if (retryRes.status === 204) return undefined as T;
        return retryRes.json() as Promise<T>;
      } catch {
        this.clearTokens();
        throw new Error('Authentication failed');
      }
    }

    if (!res.ok) throw new Error(`Request failed: ${res.status}`);
    if (res.status === 204) return undefined as T;
    return res.json() as Promise<T>;
  }
}
