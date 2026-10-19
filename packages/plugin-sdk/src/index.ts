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
  type PluginFieldTypeManifest,
  type PluginBlockManifest,
  type PluginPostTypeDeclaration,
  type PluginTaxonomyDeclaration,
  type PluginJobDeclaration,
  type PluginHttpPolicy,
  type PluginCacheApi,
  type PluginJobsApi,
  type PluginJobHandler,
  type PluginHttpApi,
  type PluginHttpOptions,
  type PluginHttpResponse,
} from './types.js';

export {
  createPluginHooksApi,
  ADMIN_HOOK_POINTS,
} from './hooks.js';
export type { PluginHooksApi, HookRegistration, HookRegistryLike } from './hooks.js';

export {
  PERMISSIONS,
  ALL_PERMISSIONS,
  validatePermissions,
  isKnownPermission,
} from './permissions.js';
export type { Permission } from './permissions.js';

export {
  createPluginAdminApi,
  emptyState as createEmptyAdminExtensionsState,
} from './admin.js';
export type {
  PluginAdminApi,
  AdminExtensionsState,
  AdminMenuPage,
  AdminSubmenuPage,
  DashboardWidget,
  DashboardWidgetDeclaration,
  MetaBox,
  AdminMetaBox,
  AdminMetaBoxDeclaration,
  AdminNotice,
  ColumnDefinition,
  AdminColumnDefinition,
  AdminActionLink,
  AdminColumnDeclaration,
  AdminColumnRendererDeclaration,
  PluginManifestAdmin,
} from './admin.js';

// Style isolation helpers (re-export do plugin-runtime para uso sem dependência circular)
export {
  scopePluginCss,
  getPluginScopeAttribute,
  wrapWithPluginScope,
} from './style-isolation.js';
