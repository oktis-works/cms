// @oktis-works/plugin-sdk - Tipos públicos para desenvolvimento de plugins

import type {
  PluginManifest as CanonicalPluginManifest,
  PluginDependency as CanonicalPluginDependency,
  PluginFieldTypeManifest,
  PluginBlockManifest,
  PluginPostTypeDeclaration,
  PluginTaxonomyDeclaration,
  PluginJobDeclaration,
  PluginHttpPolicy,
} from '@oktis-works/types';

export type {
  PluginFieldTypeManifest,
  PluginBlockManifest,
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
  getSetting(key: string): Promise<unknown>;
  setSetting(key: string, value: unknown): Promise<void>;
  getTenant(): Promise<TenantInfo>;
  getUser(): Promise<UserInfo>;
  query<T>(sql: string, params?: unknown[]): Promise<T[]>;
  emit(event: string, payload: unknown): Promise<void>;
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