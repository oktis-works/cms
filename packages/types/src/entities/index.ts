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

/** Comment moderation states (WordPress-style queue). */
export type CommentStatus = 'PENDING' | 'APPROVED' | 'SPAM' | 'TRASHED';

/** Comment on a content item (Item 11 — threaded, moderated, tenant-scoped). */
export interface Comment {
  id: UUID;
  tenantId?: UUID;
  contentId: UUID;
  parentId?: UUID | null;
  authorName: string;
  authorEmail?: string | null;
  authorUrl?: string | null;
  authorId?: UUID | null;
  body: string;
  status: CommentStatus;
  ipAddress?: string | null;
  userAgent?: string | null;
  createdAt: Date;
  updatedAt: Date;
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
  patterns?: PluginPatternManifest[];
  /** Translation files (flat JSON) loaded at boot — filename is the locale. */
  locales?: string[];
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
  /**
   * Extensões de UI do admin — slots declarativos consumidos pelo shell via
   * `GET /api/v1/plugins/extensions` (FEAT-098 / DECI-027; manifesto v2).
   * Registrados também em runtime via `api.admin.*` — o endpoint mescla os dois.
   */
  admin?: PluginManifestAdmin;
}

// ============================================================
// Admin UI extensions (FEAT-098 / DECI-027) — slots declarativos
// ============================================================

/** Página de menu no admin (slot sidebar). */
export interface AdminMenuPage {
  slug: string;
  label: string;
  /** Capability obrigatória no manifesto — o slot só renderiza para quem tem. */
  capability?: string;
  icon?: string;
  position?: number;
}

/** Subpágina de menu no admin (filha de uma menuPage). */
export interface AdminSubmenuPage {
  parentSlug: string;
  slug: string;
  label: string;
  capability?: string;
  position?: number;
}

/** Widget de dashboard (slot dashboard). */
export interface DashboardWidget {
  id: string;
  title: string;
  render: 'component';
  componentId: string;
  columnsSpan?: 1 | 2 | 3 | 4;
}

/** Widget declarado no manifesto (render pode omitir — default "component" no merge). */
export type DashboardWidgetDeclaration = Omit<DashboardWidget, 'render'> & { render?: 'component' };

/** Meta box na tela de edição de conteúdo (slots normal/side/advanced). */
export interface AdminMetaBox {
  id: string;
  title: string;
  /** Tipos de conteúdo onde a caixa aparece (ex.: ['post', 'page']). */
  screens: string[];
  context: 'normal' | 'side' | 'advanced';
  priority: 'high' | 'default' | 'low';
  componentId: string;
}

/**
 * Meta box declarada no manifesto (context/priority podem omitir — defaults
 * "normal"/"default" aplicados no merge do endpoint).
 */
export type AdminMetaBoxDeclaration = Omit<AdminMetaBox, 'context' | 'priority'> & {
  context?: AdminMetaBox['context'];
  priority?: AdminMetaBox['priority'];
};

/** Notícia/admin notice exibida no topo do admin. */
export interface AdminNotice {
  id: string;
  level: 'info' | 'success' | 'warning' | 'error';
  message: string;
  dismissible?: boolean;
}

/** Coluna customizada na listagem de um content type. */
export interface AdminColumnDefinition {
  key: string;
  label: string;
  position?: 'before_title' | 'after_title' | 'end';
}

/** Coluna declarada no manifesto (forma flat; o merge agrupa por contentType). */
export interface AdminColumnDeclaration extends AdminColumnDefinition {
  contentType: string;
}

/** Renderizador de coluna declarado no manifesto (componentId por coluna). */
export interface AdminColumnRendererDeclaration {
  contentType: string;
  key: string;
  componentId: string;
}

/** Link de ação extra na listagem principal. */
export interface AdminActionLink {
  label: string;
  url: string;
}

/**
 * Registro de editor de conteúdo por plugin (slot de editor — FEAT-098).
 * Permite que um plugin assuma o corpo da tela de edição (ex.: editor de
 * blocos/Gutenberg implementado FORA do core, como plugin separado):
 *   - `mode: 'replace-body'` substitui a área de corpo clássica;
 *   - `mode: 'below'` renderiza a UI do plugin abaixo do corpo clássico.
 * O componente recebe `{ editorId, contentType, contentId, body, setBody,
 * disabled }` — `setBody(html)` grava no MESMO fluxo do editor clássico, então
 * o save continua sanitizando e persistindo `body.content` sem migração.
 */
export interface AdminEditorRegistration {
  /** Identificador único do editor (namespaced pelo plugin no merge). */
  id: string;
  /** Rótulo exibido (ex.: "Blocos"). */
  label?: string;
  /** Content types atendidos (ou `['*']` para todos). */
  screens: string[];
  mode: 'replace-body' | 'below';
  /** Precedência entre editores do mesmo screen (menor roda primeiro; default 0). */
  priority?: number;
  /** Componente que renderiza a UI do editor. */
  componentId: string;
}

/**
 * Bloco `admin` do manifesto v2 — declarações estáticas de slots.
 * Cada entrada é namespaced pelo nome do plugin no merge do endpoint
 * (ids/slugs ganham o prefixo `plugin:` quando não trouxerem).
 */
export interface PluginManifestAdmin {
  menuPages?: AdminMenuPage[];
  submenuPages?: AdminSubmenuPage[];
  dashboardWidgets?: DashboardWidgetDeclaration[];
  metaBoxes?: AdminMetaBoxDeclaration[];
  notices?: Array<Omit<AdminNotice, 'id'> & { id?: string }>;
  /** Forma flat por contentType; o merge agrupa em AdminExtensionsState.columns. */
  columns?: AdminColumnDeclaration[];
  columnRenderers?: AdminColumnRendererDeclaration[];
  actionLinks?: AdminActionLink[];
  /** Editores de conteúdo declarados no manifesto (slot de editor). */
  editors?: AdminEditorRegistration[];
}

/**
 * Estado declarativo agregado dos slots, servido por
 * `GET /api/v1/plugins/extensions` e consumido pelo admin (DECI-027).
 */
export interface AdminExtensionsState {
  menuPages: AdminMenuPage[];
  submenuPages: AdminSubmenuPage[];
  dashboardWidgets: DashboardWidget[];
  metaBoxes: AdminMetaBox[];
  notices: AdminNotice[];
  columns: Record<string, AdminColumnDefinition[]>;
  columnRenderers: Record<string, Record<string, string>>;
  actionLinks: AdminActionLink[];
  editors: AdminEditorRegistration[];
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

/**
 * Editor pattern declared in the manifest (v2) — WordPress-parity item 13.
 * Editor-agnostic data plane: `content` is opaque to the platform (HTML or a
 * serialized document), interpreted by the plugin-built editor. Bare names
 * are namespaced with the plugin name at merge time (`namespace/name`).
 */
export interface PluginPatternManifest {
  /** Unique pattern name (e.g. 'hero-section'; bare names get the plugin namespace). */
  name: string;
  /** Friendly label shown in the editor's pattern picker. */
  label: string;
  /** Lucide icon (e.g. 'layout'). */
  icon?: string;
  /** Grouping category in the picker. */
  category?: string;
  /** Pattern payload — opaque to the platform (HTML or serialized document). */
  content: string;
  /** Content types served (or `['*']` for all). */
  screens?: string[];
  /** Preview thumbnail path (optional). */
  previewPath?: string;
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
  /** Item 25: adia o sync ao registry até o primeiro uso (GET /field-types). */
  lazy?: boolean;
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
