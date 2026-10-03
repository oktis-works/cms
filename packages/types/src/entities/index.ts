// Entity Types for OkCMS

export type UUID = string;

export interface Timestamps {
  createdAt: Date;
  updatedAt: Date;
}

// ============================================================
// Tenant
// ============================================================

export type TenantStatus = 'ACTIVE' | 'SUSPENDED' | 'DELETED';

export interface Tenant extends Timestamps {
  id: UUID;
  name: string;
  slug: string;
  domain?: string;
  subdomain?: string;
  status: TenantStatus;
  settings?: Record<string, unknown>;
}

// ============================================================
// User
// ============================================================

export type UserStatus = 'ACTIVE' | 'INACTIVE' | 'LOCKED';

export interface User extends Timestamps {
  id: UUID;
  email: string;
  name: string;
  /** Omitido nas respostas da API (sanitizado pelo AuthService/UserService) */
  passwordHash?: string;
  avatar?: string;
  status: UserStatus;
  lastLoginAt?: Date;
  /** Papéis no tenant atual (preenchido pelas rotas /users) */
  roles?: string[];
}

// ============================================================
// TenantUser
// ============================================================

export type TenantUserStatus = 'ACTIVE' | 'INACTIVE';

export interface TenantUser {
  id: UUID;
  tenantId: UUID;
  userId: UUID;
  roleId: UUID;
  status: TenantUserStatus;
  createdAt: Date;
}

// ============================================================
// Role
// ============================================================

export interface Role {
  id: UUID;
  tenantId?: UUID;
  name: string;
  slug: string;
  isSystem: boolean;
  permissions: string[];
  createdAt: Date;
}

// ============================================================
// Permission
// ============================================================

export interface Permission {
  id: UUID;
  name: string;
  slug: string;
  description?: string;
  scope: string;
}

// ============================================================
// Content
// ============================================================

export type ContentStatus = 'DRAFT' | 'PUBLISHED' | 'ARCHIVED' | 'TRASHED';

export interface Content extends Timestamps {
  id: UUID;
  tenantId: UUID;
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
  /** Override de layout/template escolhido no editor (TASK-058). */
  layout?: string | null;
  publishedAt?: Date;
  version: number;
}

// ============================================================
// ContentVersion
// ============================================================

export interface ContentVersion {
  id: UUID;
  contentId: UUID;
  version: number;
  title: string;
  slug?: string | null;
  excerpt?: string | null;
  featuredImageId?: string | null;
  seoTitle?: string | null;
  seoDescription?: string | null;
  body?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  authorId: UUID;
  createdAt: Date;
}

// ============================================================
// Media
// ============================================================

export interface Media extends Timestamps {
  id: UUID;
  tenantId: UUID;
  filename: string;
  mimeType: string;
  size: number;
  path: string;
  url: string;
  alt?: string;
  caption?: string;
  metadata?: Record<string, unknown>;
  uploadedBy: UUID;
}

// ============================================================
// Category
// ============================================================

export interface Category extends Timestamps {
  id: UUID;
  tenantId: UUID;
  name: string;
  slug: string;
  description?: string;
  parentId?: UUID;
}

// ============================================================
// Tag
// ============================================================

export interface Tag extends Timestamps {
  id: UUID;
  tenantId: UUID;
  name: string;
  slug: string;
}

// ============================================================
// Menu
// ============================================================

export interface MenuItem {
  id: UUID;
  label: string;
  url?: string;
  contentId?: UUID;
  parentId?: UUID;
  order: number;
  metadata?: Record<string, unknown>;
}

export interface Menu extends Timestamps {
  id: UUID;
  tenantId: UUID;
  name: string;
  slug: string;
  items: MenuItem[];
}

// ============================================================
// Setting
// ============================================================

export interface Setting extends Timestamps {
  id: UUID;
  tenantId?: UUID;
  key: string;
  value: unknown;
  group: string;
  type: string;
}

// ============================================================
// Plugin
// ============================================================

export type PluginStatus =
  | 'DISCOVERED'
  | 'VALIDATED'
  | 'INSTALLED'
  | 'MIGRATED'
  | 'ACTIVATED'
  | 'RUNNING'
  | 'DEACTIVATED'
  | 'UNINSTALLED'
  | 'INSTALL_FAILED'
  | 'MIGRATION_FAILED'
  | 'ACTIVATION_FAILED'
  | 'INCOMPATIBLE'
  | 'QUARANTINED';

/** RULE-tenant-plugin-scope: platform = global para todos os tenants; tenant = restrito ao tenant. */
export type PluginScope = 'platform' | 'tenant';

export interface PluginManifest {
  name: string;
  version: string;
  cmsVersion: string;
  sdkVersion?: string;
  scope?: PluginScope;
  compatibility?: { okcms: string };
  description?: string;
  author?: string;
  permissions: string[];
  dependencies: PluginDependency[];
  entrypoints: {
    server?: string;
    admin?: string;
  };
  config?: Record<string, unknown>;
}

export interface PluginDependency {
  name: string;
  versionRange: string;
  optional: boolean;
}

export interface Plugin extends Timestamps {
  id: UUID;
  tenantId?: UUID;
  name: string;
  version: string;
  status: PluginStatus;
  manifest: PluginManifest;
  permissions: string[];
  config?: Record<string, unknown>;
  installedAt?: Date;
  activatedAt?: Date;
  error?: string;
}

// ============================================================
// Theme
// ============================================================

export type ThemeStatus = 'ACTIVE' | 'INACTIVE' | 'INSTALLED';

export interface ThemeManifest {
  name: string;
  version: string;
  cmsVersion: string;
  description?: string;
  author?: string;
  entrypoints: {
    astro?: string;
    config?: string;
  };
}

export interface Theme extends Timestamps {
  id: UUID;
  tenantId?: UUID;
  name: string;
  version: string;
  status: ThemeStatus;
  manifest: ThemeManifest;
  config?: Record<string, unknown>;
  installedAt?: Date;
  activatedAt?: Date;
}

// ============================================================
// Deployment
// ============================================================

export type DeploymentStatus =
  | 'PENDING'
  | 'QUEUED'
  | 'BUILDING'
  | 'TESTING'
  | 'PACKAGING'
  | 'PUSHING'
  | 'DEPLOYING'
  | 'HEALTH_CHECK'
  | 'ACTIVE'
  | 'FAILED'
  | 'CANCELLED'
  | 'ROLLED_BACK';

export interface Deployment extends Timestamps {
  id: UUID;
  tenantId: UUID;
  buildId: UUID;
  status: DeploymentStatus;
  coreVersion: string;
  themeVersion?: string;
  pluginVersions: Record<string, string>;
  dockerImage?: string;
  checksum: string;
  rollbackToId?: UUID;
  healthCheckStatus?: 'PASSING' | 'FAILING' | 'PENDING';
  startedAt?: Date;
  completedAt?: Date;
  error?: string;
  createdBy: UUID;
}

// ============================================================
// Build
// ============================================================

export type BuildStatus = 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED';

export interface Build extends Timestamps {
  id: UUID;
  tenantId: UUID;
  status: BuildStatus;
  coreVersion: string;
  plugins: Record<string, string>;
  theme: { name: string; version: string };
  dockerImage?: string;
  checksum?: string;
  buildLog?: string;
  startedAt?: Date;
  completedAt?: Date;
  error?: string;
}

// ============================================================
// Event
// ============================================================

export interface Event {
  id: UUID;
  type: string;
  aggregateType: string;
  aggregateId: UUID;
  payload: Record<string, unknown>;
  tenantId?: UUID;
  processed: boolean;
  createdAt: Date;
}

// ============================================================
// AuditLog
// ============================================================

export interface AuditLog {
  id: UUID;
  tenantId?: UUID;
  userId?: UUID;
  action: string;
  resourceType: string;
  resourceId?: UUID;
  changes?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
  createdAt: Date;
}

// ============================================================
// Migration
// ============================================================

export type MigrationOwnerType = 'CORE' | 'PLUGIN';

export interface Migration {
  id: UUID;
  tenantId: UUID;
  owner: string;
  ownerType: MigrationOwnerType;
  version: string;
  name: string;
  appliedAt: Date;
  checksum: string;
}

// ============================================================
// PluginDependency
// ============================================================

export interface PluginDependencyEntry {
  id: UUID;
  pluginId: UUID;
  dependencyId: UUID;
  versionRange: string;
  optional: boolean;
}

// ============================================================
// Session
// ============================================================

export interface Session {
  id: UUID;
  userId: UUID;
  tenantId: UUID;
  token: string;
  ipAddress?: string;
  userAgent?: string;
  expiresAt: Date;
  createdAt: Date;
}

// ============================================================
// Webhook
// ============================================================

export interface Webhook {
  id: UUID;
  tenantId: UUID;
  url: string;
  events: string[];
  secret: string;
  active: boolean;
  createdAt: Date;
}

// ============================================================
// ContentType
// ============================================================

export type ContentTypeSource = 'CORE' | 'PLUGIN';

export interface ContentType {
  id: UUID;
  name: string;
  slug: string;
  source: ContentTypeSource;
  sourceId?: UUID;
  schema: Record<string, unknown>;
  pluralLabel: string;
  singularLabel: string;
  createdAt: Date;
}

// ============================================================
// Component
// ============================================================

export type ComponentSource = 'CORE' | 'THEME' | 'PLUGIN';

export interface Component {
  id: UUID;
  name: string;
  source: ComponentSource;
  sourceId?: UUID;
  version: string;
  schema: Record<string, unknown>;
  priority: number;
  createdAt: Date;
}
