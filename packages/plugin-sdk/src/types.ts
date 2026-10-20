// @oktis-works/plugin-sdk - Tipos públicos para desenvolvimento de plugins

import type {
  PluginManifest as CanonicalPluginManifest,
  PluginDependency as CanonicalPluginDependency,
  PluginFieldTypeManifest,
  PluginBlockManifest,
  PluginPatternManifest,
  PluginPostTypeDeclaration,
  PluginTaxonomyDeclaration,
  PluginJobDeclaration,
  PluginHttpPolicy,
} from '@oktis-works/types';
import type { PluginAdminApi } from './admin.js';

export type {
  PluginFieldTypeManifest,
  PluginBlockManifest,
  PluginPatternManifest,
  PluginPostTypeDeclaration,
  PluginTaxonomyDeclaration,
  PluginJobDeclaration,
  PluginHttpPolicy,
};

/**
 * Plugin lifecycle hook types.
 * These map to internal action names fired by the core:
 * 
 * | HookType | Internal Action | Description |
 * |----------|----------------|-------------|
 * | BEFORE_CONTENT_CREATE | okcms.content.before-create | Fired before content is created |
 * | AFTER_CONTENT_CREATE | okcms.content.after-create | Fired after content is created |
 * | BEFORE_CONTENT_UPDATE | okcms.content.before-update | Fired before content is updated |
 * | AFTER_CONTENT_UPDATE | okcms.content.after-update | Fired after content is updated |
 * | BEFORE_CONTENT_DELETE | okcms.content.before-delete | Fired before content is deleted |
 * | AFTER_CONTENT_DELETE | okcms.content.after-delete | Fired after content is deleted |
 * | ON_CONTENT_PUBLISH | okcms.content.published | Fired when content is published |
 * | ON_CONTENT_UNPUBLISH | okcms.content.unpublished | Fired when content is unpublished |
 * | ON_INSTALL | plugin.install | Fired when plugin is installed |
 * | ON_ACTIVATE | plugin.activate | Fired when plugin is activated for a tenant |
 * | ON_DEACTIVATE | plugin.deactivate | Fired when plugin is deactivated for a tenant |
 * | ON_UNINSTALL | plugin.uninstall | Fired when plugin is uninstalled |
 * | ON_SETTINGS_PAGE | plugin.settings_page | Fired when plugin settings page is rendered |
 * | ON_ADMIN_MENU | okcms.admin.menu | Fired when admin menu is built |
 * 
 * @example
 * import { HookType, createPluginHooksApi } from '@oktis-works/plugin-sdk';
 * 
 * const api = createPluginHooksApi('my-plugin', registry);
 * api.addAction(HookType.ON_INSTALL, async (context, payload) => {
 *   // Handle plugin installation
 * });
 * 
 * // Or use registerHook on the full PluginAPI:
 * api.registerHook('onInstall', async (context, payload) => {
 *   // Same as above
 * });
 */
export enum HookType {
  BEFORE_CONTENT_CREATE = 'beforeContentCreate',
  AFTER_CONTENT_CREATE = 'afterContentCreate',
  BEFORE_CONTENT_UPDATE = 'beforeContentUpdate',
  AFTER_CONTENT_UPDATE = 'afterContentUpdate',
  BEFORE_CONTENT_DELETE = 'beforeContentDelete',
  AFTER_CONTENT_DELETE = 'afterContentDelete',
  ON_CONTENT_PUBLISH = 'onContentPublish',
  ON_CONTENT_UNPUBLISH = 'onContentUnpublish',
  ON_INSTALL = 'onInstall',
  ON_ACTIVATE = 'onActivate',
  ON_DEACTIVATE = 'onDeactivate',
  ON_UNINSTALL = 'onUninstall',
  ON_SETTINGS_PAGE = 'onSettingsPage',
  ON_ADMIN_MENU = 'onAdminMenu',
}

/**
 * Manifesto canônico (fonte única em `@oktis-works/types`) + o que o runtime
 * exige: `main` obrigatório e o bloco opcional `hooks` (lifecycle declarado).
 */
export type PluginManifest = CanonicalPluginManifest & {
  main: string;
  hooks?: PluginHook[];
  fieldTypes?: PluginFieldTypeManifest[];
};

export type PluginDependency = CanonicalPluginDependency;

export interface PluginHook {
  type: HookType;
  handler: PluginHookHandler;
}

export type PluginHookHandler = (context: PluginContext, payload: unknown) => void | Promise<void>;

export interface ContentField {
  name: string;
  type: string;
  label: string;
  required?: boolean;
  options?: Record<string, unknown>;
}

export interface PluginContext {
  tenantId: string;
  userId: string;
  requestId: string;
  api: PluginAPI;
}

export interface PluginAPI {
  registerHook(type: HookType, handler: PluginHookHandler): void;
  addRoute(route: RouteDefinition): void;
  addContentField(field: ContentField): void;
  addFieldType(definition: PluginFieldTypeManifest): void;
  addPostType(declaration: PluginPostTypeDeclaration): void;
  addTaxonomy(declaration: PluginTaxonomyDeclaration): void;
  /** Registers an editor block (permission blocks:register) — data plane, no table. */
  registerBlock(block: PluginBlockManifest): void;
  /** Registers an editor pattern (permission patterns:register) — data plane, no table. */
  registerPattern(pattern: PluginPatternManifest): void;
  /** Cache/transient por plugin (namespaced, permissão cache:read/cache:write). */
  cache: PluginCacheApi;
  /** Jobs/cron por plugin (permissão jobs:schedule). */
  jobs: PluginJobsApi;
  /** HTTP externo protegido contra SSRF (permissão http:outbound). */
  http: PluginHttpApi;
  /** Slots declarativos do admin (menu/widgets/metaboxes/notices/colunas) — FEAT-098. */
  admin: PluginAdminApi;
  /** Gestão de roles do tenant (Item 6 — escopo tenant, anti-escalada, audit). */
  roles: PluginRolesApi;
  /** Asset enqueue para o site público (Item 8 — permissão assets:enqueue). */
  assets: PluginAssetsApi;
  /** Traduções server-side (Item 9 — fallback chain locale → base → en). */
  i18n: PluginI18nApi;
  /** Health checks agregados no /health (Item 14 — permissão health:register). */
  health: PluginHealthApi;
  /** Envio de e-mail via outbox (Item 12 — permissão mail:send). */
  mail: PluginMailApi;
  getSetting(key: string): Promise<unknown>;
  setSetting(key: string, value: unknown): Promise<void>;
  getTenant(): Promise<TenantInfo>;
  getUser(): Promise<UserInfo>;
  query<T>(sql: string, params?: unknown[]): Promise<T[]>;
  emit(event: string, payload: unknown): Promise<void>;
}

/**
 * API de cache/transient do plugin (Item 2 do plano de paridade).
 * Chaves são namespaced por `plugin:{tenant}:{plugin}:{chave}` — um plugin não
 * lê chaves de outro nem de outro tenant (RLS de cache).
 */
export interface PluginCacheApi {
  /** Lê um valor; null se ausente/expirado. Permissão: cache:read. */
  get<T = unknown>(key: string): Promise<T | null>;
  /**
   * Grava um valor. Permissão: cache:write.
   * `tags` permitem invalidação em lote via {@link invalidateTags}.
   */
  set(key: string, value: unknown, options?: { ttlSeconds?: number; tags?: string[] }): Promise<void>;
  /** Remove uma chave. Permissão: cache:write. */
  delete(key: string): Promise<void>;
  /**
   * Lê; se ausente, executa `producer`, grava o resultado por `ttlSeconds` e
   * retorna. Permissão: cache:write.
   */
  wrap<T>(key: string, ttlSeconds: number, producer: () => Promise<T>): Promise<T>;
  /** Invalida todas as chaves associadas às tags. Permissão: cache:write. */
  invalidateTags(tags: string[]): Promise<void>;
}

/** Handler executado pelo worker quando um job do plugin roda. */
export type PluginJobHandler = (
  payload: unknown,
  context: { tenantId: string | null; plugin: string; jobName: string }
) => void | Promise<void>;

/**
 * API de jobs/cron do plugin (Item 3 do plano de paridade — parity com
 * WP-Cron / Action Scheduler). Fila dedicada `plugins`, teto de 10 agendas
 * por plugin, degradação silenciosa (retorna false) sem Redis.
 */
export interface PluginJobsApi {
  /** Declara o handler executado pelo worker para este job. */
  on(jobName: string, handler: PluginJobHandler): void;
  /**
   * Agenda execução recorrente — exatamente UM de `every` (ms) ou `cron`.
   * Permissão: jobs:schedule. Retorna false quando a fila está indisponível.
   */
  schedule(jobName: string, spec: { every?: number; cron?: string }): Promise<boolean>;
  /** Cancela a agenda recorrente do job. Permissão: jobs:schedule. */
  cancel(jobName: string): Promise<boolean>;
  /** Enfileira uma execução única imediata. Permissão: jobs:schedule. */
  enqueue(jobName: string, payload?: Record<string, unknown>): Promise<boolean>;
}

/** Resposta de api.http (Item 4 — HTTP externo protegido contra SSRF). */
export interface PluginHttpResponse {
  status: number;
  ok: boolean;
  /** Headers em lowercase. */
  headers: Record<string, string>;
  /** Corpo completo (teto configurável, default 5 MB). */
  body: string;
  /** Parseia o corpo como JSON (lança em corpo inválido). */
  json<T = unknown>(): T;
}

export interface PluginHttpOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD';
  headers?: Record<string, string>;
  /** Corpo textual (JSON.stringify antes de enviar). */
  body?: string;
  /** Timeout por tentativa (default 10s, máx 60s). */
  timeoutMs?: number;
  /** Teto do corpo em bytes (default 5 MB). */
  maxBytes?: number;
  /**
   * Retentativas em erro de rede/5xx. Default: 2 para GET/HEAD, 0 para os
   * demais métodos (não idempotentes não são repetidos por padrão).
   */
  retries?: number;
}

/**
 * HTTP externo seguro (Item 4 do plano de paridade + Item 16 egress).
 * Proteções: allowlist `httpPolicy.allowHosts` do manifesto, apenas http/https,
 * pré-validação DNS com IP público (bloqueia RFC1918/loopback/link-local
 * 169.254 = metadata cloud/CGNAT/multicast), DNS pinning via dispatcher,
 * redirects manuais com re-validação (máx 3), timeout e teto de corpo.
 * Permissão: http:outbound.
 */
export interface PluginHttpApi {
  request(url: string, options?: PluginHttpOptions): Promise<PluginHttpResponse>;
  get(url: string, options?: Omit<PluginHttpOptions, 'method' | 'body'>): Promise<PluginHttpResponse>;
  post(url: string, body: string, options?: Omit<PluginHttpOptions, 'method' | 'body'>): Promise<PluginHttpResponse>;
}

/**
 * Roles API for plugins (Item 6 — tenant-scoped, audited, anti-escalation).
 * All operations require `roles:create`, a tenant context and block
 * escalation: reserved/system role names, wildcard permissions and
 * platform-only operations (create/update/delete plugin) are rejected.
 */
export interface PluginRolesApi {
  /** Creates a tenant role. Permissions are `action:resource` strings. */
  add(input: { name: string; slug?: string; permissions?: string[] }): Promise<{ id: string; name: string; slug: string; permissions: string[] }>;
  /** Removes a non-system tenant role by slug. */
  remove(slug: string): Promise<boolean>;
  /** Grants one extra permission (`action:resource`) to a tenant role. */
  addPermission(slug: string, permission: string): Promise<boolean>;
}

/**
 * Stylesheet enqueued via api.assets.enqueueStyle (Item 8).
 * `integrity`/`crossOrigin` enable SRI; `version` is appended as `?ver=`.
 */
export interface EnqueuedStyle {
  kind: 'style';
  src: string;
  version?: string;
  media?: string;
  integrity?: string;
  crossOrigin?: string;
  pluginName: string;
}

/**
 * Script enqueued via api.assets.enqueueScript (Item 8).
 * `strategy` maps to defer/async; `placement` head (default) or footer.
 */
export interface EnqueuedScript {
  kind: 'script';
  src: string;
  version?: string;
  strategy?: 'blocking' | 'defer' | 'async';
  placement?: 'head' | 'footer';
  integrity?: string;
  crossOrigin?: string;
  pluginName: string;
}

export type EnqueuedAsset = EnqueuedStyle | EnqueuedScript;

/**
 * Asset enqueue API for plugins (Item 8 — permission assets:enqueue).
 * Assets are emitted on the public site: styles + head scripts in <head>,
 * footer scripts before </body>. Duplicate URLs are emitted once (dedupe by
 * URL hash across plugins).
 */
export interface PluginAssetsApi {
  /** Enqueues a stylesheet for the public site <head>. */
  enqueueStyle(style: Omit<EnqueuedStyle, 'kind' | 'pluginName'>): void;
  /** Enqueues a script for the public site (head by default, or footer). */
  enqueueScript(script: Omit<EnqueuedScript, 'kind' | 'pluginName'>): void;
}

/**
 * Server-side i18n for plugins (Item 9). Bundles are flat { key: string };
 * translate() resolves through the fallback chain (locale → base language →
 * 'en' → key) with {param} interpolation. Manifest `locales[]` JSON files
 * are loaded automatically at boot.
 */
export interface PluginI18nApi {
  /** Merges a flat bundle into a locale (later loads override keys). */
  load(locale: string, bundle: Record<string, string>): void;
  /** Translates a key; unknown keys return the key itself. */
  translate(key: string, params?: Record<string, unknown>, locale?: string): string;
  /** Current default locale used when translate() gets no explicit locale. */
  locale(): string;
  /** Sets the plugin default locale (e.g. from the tenant language). */
  setDefaultLocale(locale: string): void;
}

/**
 * Health check API for plugins (Item 14 — permission health:register).
 * Registered checks run aggregated in GET /api/v1/health with a 2s budget
 * each; failure/timeout never breaks the endpoint (reported as 'error').
 */
export interface PluginHealthCheckResult {
  ok: boolean;
  details?: Record<string, unknown>;
}

export type PluginHealthCheck = () => PluginHealthCheckResult | Promise<PluginHealthCheckResult>;

export interface PluginHealthApi {
  /** Registers a named health check for this plugin (duplicate names reject). */
  register(name: string, check: PluginHealthCheck): void;
}

/**
 * Mail template registered via api.mail.registerTemplate (Item 12).
 * Strings support {param} interpolation from send()'s params.
 */
export interface PluginMailTemplate {
  subject: string;
  html?: string;
  text?: string;
}

/**
 * Mail API for plugins (Item 12 — permission mail:send). Messages land in a
 * durable outbox (`mails`) and are delivered by the worker with a per-plugin
 * rate limit; the queue being unavailable keeps the outbox row (never lost).
 * Returns false when the send was refused (rate limit) or the queue is down.
 */
export interface PluginMailApi {
  /** Registers a named template (duplicate names reject). */
  registerTemplate(name: string, template: PluginMailTemplate): void;
  /** Enqueues a message — by template or explicit subject/body. */
  send(input: {
    to: string;
    template?: string;
    params?: Record<string, unknown>;
    subject?: string;
    html?: string;
    text?: string;
  }): Promise<boolean>;
}

export interface RouteDefinition {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  path: string;
  handler: (context: PluginContext, request: unknown) => Promise<unknown>;
}

export interface TenantInfo {
  id: string;
  name: string;
  slug: string;
}

export interface UserInfo {
  id: string;
  email: string;
  name: string;
}