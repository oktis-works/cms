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

export interface PluginManifest {
  name: string;
  version: string;
  description?: string;
  main: string;
  hooks?: PluginHook[];
  permissions?: string[];
  dependencies?: PluginDependency[];
}

export interface PluginDependency {
  name: string;
  version: string;
  required?: boolean;
}

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
