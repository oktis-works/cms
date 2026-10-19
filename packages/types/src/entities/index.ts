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
  /** Locale preferido do usuário (i18n do admin) — coluna users.locale */
  locale?: string | null;
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
  title?: string;
  mimeType: string;
  size: number;
  path: string;
  url: string;
  alt?: string;
  caption?: string;
  description?: string;
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

export type MenuItemType = 'custom' | 'home' | 'page' | 'post' | 'content' | 'archive' | 'taxonomy';

export interface MenuItem {
  id: UUID;
  type?: MenuItemType;
  label: string;
  url?: string;
  objectId?: UUID;
  objectType?: string;
  contentId?: UUID;
  parentId?: UUID | null;
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

export interface Menu extends Timestamps {
  id: UUID;
  tenantId: UUID;
  name: string;
  slug: string;
  items: MenuItem[];
  settings?: MenuSettings;
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
  | 'QUARANTINED'
  /** Sumiu do disco na última sync (vínculos por tenant preservados). */
  | 'MISSING'
  /** Falhou ao executar register()/carregar (mensagem em `error`). */
  | 'LOAD_FAILED';

/** RULE-tenant-plugin-scope: platform = artefato global; tenant = escopo declarado. */
export type PluginScope = 'platform' | 'tenant';

/**
 * Manifesto canônico de plugin (fonte única — `@oktis-works/plugin-sdk`
 * re-exporta este tipo). Campos de compatibilidade/formato são opcionais:
 * um manifesto real nem sempre traz `cmsVersion`/`entrypoints` (formato npm
 * usa `main`).
 */
export interface PluginManifest {
  name: string;
  version: string;
  /** Entrpoint no formato npm/OkCMS (`index.js`). */
  main?: string;
  type?: 'plugin' | 'theme';
  cmsVersion?: string;
  sdkVersion?: string;
  scope?: PluginScope;
  compatibility?: { okcms: string };
  description?: string;
  author?: string;
  permissions?: string[];
  dependencies?: PluginDependency[];
  entrypoints?: {
    server?: string;
    admin?: string;
  };
  config?: Record<string, unknown>;
  /** Tipos de campo customizados registrados pelo plugin. */
  fieldTypes?: PluginFieldTypeManifest[];
  /** Versão do schema do manifesto. Ausente = v1 (retrocompatível). */
  manifestVersion?: 1 | 2;
  /** Blocos customizados do editor (manifesto v2). */
  blocks?: PluginBlockManifest[];
  /** Custom Post Types declarados (manifesto v2). */
  postTypes?: PluginPostTypeDeclaration[];
  /** Custom Taxonomies declaradas (manifesto v2). */
  taxonomies?: PluginTaxonomyDeclaration[];
  /** Jobs/cron declarados no manifesto (manifesto v2). */
  scheduleJobs?: PluginJobDeclaration[];
  /** Política HTTP para api.http (manifesto v2). */
  httpPolicy?: PluginHttpPolicy;
  /** Rate-limit das rotas do plugin (manifesto v2). */
  rateLimit?: { rpm?: number };
  /** Arquivos de migração SQL (relativos ao plugin), aplicados em ordem. */
  migrations?: string[];
}

/**
 * Bloco customizado do editor de blocos (manifesto v2).
 * Espelha o formato já consolidado de `fieldTypes`.
 */
export interface PluginBlockManifest {
  /** Identificador único do bloco (ex: 'product-card'). */
  type: string;
  /** Label amigável exibido na paleta de blocos. */
  label: string;
  /** Ícone Lucide (ex: 'credit-card'). */
  icon: string;
  /** Categoria de organização na paleta. */
  category?: string;
  /** JSON Schema dos atributos do bloco (gera o inspector automaticamente). */
  attrsSchema?: Record<string, unknown>;
  /** Componente React/Solid do bloco no editor. */
  adminComponentPath: string;
  /** Renderizador SSR no front-end (opcional — default: HTML serializado). */
  rendererPath?: string;
  /** Suporta campos customizados dentro do bloco. Default: false. */
  supports?: { fields?: boolean };
}

/** Custom Post Type declarado no manifesto (manifesto v2). */
export interface PluginPostTypeDeclaration {
  key: string;
  label: string;
  plural?: string;
  icon?: string;
  hierarchy?: boolean;
  revisions?: boolean;
  restBase?: string;
}

/** Custom Taxonomy declarada no manifesto (manifesto v2). */
export interface PluginTaxonomyDeclaration {
  key: string;
  label: string;
  postTypes: string[];
  hierarchical?: boolean;
}

/** Job declarado no manifesto (manifesto v2). */
export interface PluginJobDeclaration {
  name: string;
  /** Intervalo fixo em milissegundos. */
  every?: number;
  /** Expressão cron (conflita com `every`). */
  cron?: string;
}

/** Política HTTP do plugin (manifesto v2). */
export interface PluginHttpPolicy {
  /** Allowlist estrita de hosts — se presente, só estes são permitidos. */
  allowHosts?: string[];
}

/**
 * Definição de tipo de campo customizado no manifesto do plugin.
 */
export interface PluginFieldTypeManifest {
  /** Identificador único do tipo (ex: 'mermaid', 'chart'). Deve ser único globalmente. */
  type: string;
  /** Label amigável exibido no admin. */
  label: string;
  /** Categoria do campo (basico, conteudo, escolha, relacional, estrutura). */
  category: 'basico' | 'conteudo' | 'escolha' | 'relacional' | 'estrutura';
  /** Ícone Lucide (ex: 'git-merge', 'chart-bar'). */
  icon: string;
  /** Se suporta lógica condicional. Default: true. */
  supportsConditions?: boolean;
  /** Se é um tipo de layout (message, accordion, tab). Default: false. */
  isLayout?: boolean;
  /** Caminho para o componente de configuração no admin (ex: '@/plugins/meu-plugin/admin/components/MermaidField.tsx'). */
  adminComponentPath: string;
  /** Caminho para o componente de renderização na edição de conteúdo (opcional). */
  adminRendererPath?: string;
  /** JSON Schema para validação da configuração do campo. */
  configSchema?: Record<string, unknown>;
}

export interface PluginDependency {
  name: string;
  /** Range semver da dependência (formato npm usa `version`). */
  versionRange?: string;
  version?: string;
  optional?: boolean;
  required?: boolean;
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
  authType: WebhookAuthType;
  authConfig: WebhookAuthConfig;
  /** Campo legado mantido para compatibilidade com instalações anteriores. */
  secret?: string;
  active: boolean;
  createdAt: Date;
}

export type WebhookAuthType = 'none' | 'bearer' | 'basic' | 'api_key' | 'hmac_sha256';

export interface WebhookAuthConfig {
  token?: string;
  username?: string;
  password?: string;
  headerName?: string;
  value?: string;
  secret?: string;
  signatureHeader?: string;
}

// ============================================================
// ApiKey
// ============================================================

/**
 * Credencial de login para clientes API-first. A key NUNCA autoriza requests:
 * é trocada por access JWT + refresh token em POST /api/v1/auth/api-key-login.
 * O valor claro existe apenas na criação (campo `plaintext` da resposta).
 */
export interface ApiKey {
  id: UUID;
  tenantId: UUID;
  /** Identidade que o login via key assume. */
  userId: UUID;
  name: string;
  /** Trecho em claro usado para localizar a row (não é segredo). */
  keyPrefix: string;
  /** Revoga a key após o primeiro uso no login. */
  oneTime: boolean;
  expiresAt?: Date | null;
  lastUsedAt?: Date | null;
  useCount: number;
  revokedAt?: Date | null;
  createdBy?: UUID | null;
  createdAt: Date;
}

/** Resposta do POST /api-keys — única vez que o valor claro aparece. */
export interface ApiKeyCreated extends ApiKey {
  plaintext: string;
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
