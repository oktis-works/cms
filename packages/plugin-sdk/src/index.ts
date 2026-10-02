export {
  HookType,
  type PluginManifest,
  type PluginDependency,
  type PluginHook,
  type PluginHookHandler,
  type ContentField,
  type PluginContext,
  type PluginAPI,
  type RouteDefinition,
  type TenantInfo,
  type UserInfo,
} from './types.js';

export {
  createPluginHooksApi,
  ADMIN_HOOK_POINTS,
} from './hooks.js';
export type { PluginHooksApi, HookRegistration } from './hooks.js';

export {
  createPluginAdminApi,
} from './admin.js';
export type {
  PluginAdminApi,
  AdminExtensionsState,
  AdminMenuPage,
  AdminSubmenuPage,
  DashboardWidget,
  MetaBox,
  AdminNotice,
  ColumnDefinition,
} from './admin.js';

// Style isolation helpers (re-export do plugin-runtime para uso sem dependência circular)
export {
  scopePluginCss,
  getPluginScopeAttribute,
  wrapWithPluginScope,
} from './style-isolation.js';
