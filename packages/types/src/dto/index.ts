// DTO Types for OkCMS

import type { UUID, TenantStatus, UserStatus, ContentStatus, PluginStatus, ThemeStatus, DeploymentStatus } from '../entities/index.js';

// ============================================================
// Auth DTOs
// ============================================================

export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  tokenType: 'Bearer';
}

export interface RefreshTokenRequest {
  refreshToken: string;
}

export interface RefreshTokenResponse {
  accessToken: string;
  expiresIn: number;
}

// ============================================================
// User DTOs
// ============================================================

export interface CreateUserRequest {
  email: string;
  name: string;
  password: string;
  tenantId?: UUID;
  roleId?: UUID;
}

export interface UpdateUserRequest {
  name?: string;
  email?: string;
  avatar?: string;
  status?: UserStatus;
}

export interface UserResponse {
  id: UUID;
  email: string;
  name: string;
  avatar?: string;
  status: UserStatus;
  lastLoginAt?: Date;
  createdAt: Date;
}

// ============================================================
// Tenant DTOs
// ============================================================

export interface CreateTenantRequest {
  name: string;
  slug: string;
  domain?: string;
  subdomain?: string;
}

export interface UpdateTenantRequest {
  name?: string;
  domain?: string;
  subdomain?: string;
  status?: TenantStatus;
  settings?: Record<string, unknown>;
}

export interface TenantResponse {
  id: UUID;
  name: string;
  slug: string;
  domain?: string;
  subdomain?: string;
  status: TenantStatus;
  createdAt: Date;
}

// ============================================================
// Role DTOs
// ============================================================

export interface CreateRoleRequest {
  name: string;
  slug: string;
  permissions: string[];
}

export interface UpdateRoleRequest {
  name?: string;
  permissions?: string[];
}

export interface RoleResponse {
  id: UUID;
  name: string;
  slug: string;
  isSystem: boolean;
  permissions: string[];
  createdAt: Date;
}

// ============================================================
// Content DTOs
// ============================================================

export interface CreateContentRequest {
  type: string;
  title: string;
  slug?: string;
  body?: Record<string, unknown>;
  excerpt?: string;
  status?: ContentStatus;
  featuredImageId?: UUID;
  seoTitle?: string;
  seoDescription?: string;
  metadata?: Record<string, unknown>;
}

export interface UpdateContentRequest {
  title?: string;
  slug?: string;
  body?: Record<string, unknown>;
  excerpt?: string;
  status?: ContentStatus;
  featuredImageId?: UUID;
  seoTitle?: string;
  seoDescription?: string;
  metadata?: Record<string, unknown>;
}

export interface ContentResponse {
  id: UUID;
  type: string;
  title: string;
  slug: string;
  body?: Record<string, unknown>;
  excerpt?: string;
  status: ContentStatus;
  authorId: UUID;
  featuredImageId?: UUID;
  seoTitle?: string;
  seoDescription?: string;
  metadata?: Record<string, unknown>;
  publishedAt?: Date;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

// ============================================================
// Media DTOs
// ============================================================

export interface MediaResponse {
  id: UUID;
  filename: string;
  mimeType: string;
  size: number;
  url: string;
  alt?: string;
  caption?: string;
  uploadedBy: UUID;
  createdAt: Date;
}

// ============================================================
// Category DTOs
// ============================================================

export interface CreateCategoryRequest {
  name: string;
  slug?: string;
  description?: string;
  parentId?: UUID;
}

export interface CategoryResponse {
  id: UUID;
  name: string;
  slug: string;
  description?: string;
  parentId?: UUID;
  createdAt: Date;
}

// ============================================================
// Tag DTOs
// ============================================================

export interface CreateTagRequest {
  name: string;
  slug?: string;
}

export interface TagResponse {
  id: UUID;
  name: string;
  slug: string;
  createdAt: Date;
}

// ============================================================
// Menu DTOs
// ============================================================

export interface CreateMenuItemRequest {
  label: string;
  url?: string;
  contentId?: UUID;
  parentId?: UUID;
  order?: number;
}

export interface CreateMenuRequest {
  name: string;
  slug?: string;
  items?: CreateMenuItemRequest[];
}

export interface MenuResponse {
  id: UUID;
  name: string;
  slug: string;
  items: Array<{
    id: UUID;
    label: string;
    url?: string;
    contentId?: UUID;
    order: number;
  }>;
  createdAt: Date;
}

// ============================================================
// Setting DTOs
// ============================================================

export interface UpdateSettingRequest {
  key: string;
  value: unknown;
  group?: string;
  type?: string;
}

export interface SettingResponse {
  id: UUID;
  key: string;
  value: unknown;
  group: string;
  type: string;
  createdAt: Date;
}

// ============================================================
// Plugin DTOs
// ============================================================

export interface InstallPluginRequest {
  name: string;
  version?: string;
}

export interface PluginResponse {
  id: UUID;
  name: string;
  version: string;
  status: PluginStatus;
  permissions: string[];
  installedAt?: Date;
  activatedAt?: Date;
  error?: string;
  createdAt: Date;
}

// ============================================================
// Theme DTOs
// ============================================================

export interface InstallThemeRequest {
  name: string;
  version?: string;
}

export interface ThemeResponse {
  id: UUID;
  name: string;
  version: string;
  status: ThemeStatus;
  installedAt?: Date;
  activatedAt?: Date;
  createdAt: Date;
}

// ============================================================
// Deployment DTOs
// ============================================================

export interface CreateDeploymentRequest {
  coreVersion: string;
  themeVersion?: string;
  pluginVersions?: Record<string, string>;
}

export interface DeploymentResponse {
  id: UUID;
  tenantId: UUID;
  buildId: UUID;
  status: DeploymentStatus;
  coreVersion: string;
  themeVersion?: string;
  pluginVersions: Record<string, string>;
  dockerImage?: string;
  checksum: string;
  healthCheckStatus?: 'PASSING' | 'FAILING' | 'PENDING';
  startedAt?: Date;
  completedAt?: Date;
  error?: string;
  createdBy: UUID;
  createdAt: Date;
}

// ============================================================
// Pagination
// ============================================================

export interface PaginationParams {
  page?: number;
  limit?: number;
  sort?: string;
  order?: 'asc' | 'desc';
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

// ============================================================
// Filter
// ============================================================

export interface FilterParams {
  search?: string;
  status?: string;
  type?: string;
  [key: string]: string | undefined;
}
