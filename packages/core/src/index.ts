// @oktis-works/core - Main Entry Point

// Bootstrap & Lifecycle
export { bootstrap, bootstrapForTenant } from './bootstrap/index.js';
export type { BootstrapOptions } from './bootstrap/index.js';
export { ApplicationLifecycle } from './lifecycle/index.js';
export type { LifecycleHook } from './lifecycle/index.js';

// Events
export { EventBus, createEventBus, getEventBus } from './events/bus.js';
export type { EventHandler, EventBusConfig } from './events/bus.js';

// Queue (produção de jobs — fila opcional, degrada sem Redis)
export { QueueProducer, queueProducer, enqueueJob } from './queue/producer.js';
export type { JobType, EnqueueOptions, JobEnvelope } from './queue/producer.js';
export { registerWebhookDispatch, registerCacheInvalidation } from './events/webhooks.js';

// Observability
export { metrics, trackDeploymentProgress, MetricsRegistry, registerEventAuditLog } from './observability/index.js';
export { createLogger, AuditService, auditService } from './observability/index.js';
export type { Logger, LogLevel, AuditEntry, AuditFilter } from './observability/index.js';

// Cache
export { MemoryCache, createCache, getCache } from './cache/index.js';
export type { CacheEntry } from './cache/index.js';

// Tenant Context
export { establishTenantContext, getCurrentContext, clearCurrentContext, requireTenantContext } from './tenant/context.js';
export type { TenantContext } from './tenant/context.js';

// Core Services
export { tenantService, TenantService } from './tenant/service.js';
export { userService, UserService } from './user/service.js';
export { roleService, RoleService } from './role/service.js';
export { contentService, ContentService } from './content/service.js';
export type { CreateContentInput, UpdateContentInput } from './content/service.js';
export { postTypeRegistry, PostTypeRegistry } from './content/post-types.js';
export type { ContentTypeDefinition } from './content/post-types.js';
export { taxonomyService, TaxonomyService } from './taxonomies/service.js';
export type { CustomTaxonomy, TaxonomyTerm } from './taxonomies/service.js';
export {
  fieldTypeRegistry,
  getFieldType,
  listFieldTypes,
  listFieldTypesByCategory,
  registerFieldType,
  FIELD_TYPE_CATEGORIES,
} from './fields/types/registry.js';
export type { FieldCategory } from './fields/types/registry.js';
export {
  evaluateConditionalLogic,
  isVisibleField,
  findConditionalIssues,
} from './fields/conditional.js';
export type { ConditionalLogic, ConditionalRule, ConditionalGroup, ConditionOperator } from './fields/conditional.js';
export {
  validateContentData,
  validateFieldValue,
  validateFields,
} from './fields/validation.js';
export type { FieldError, ValidationResult } from './fields/validation.js';
export { matchLocationRules } from './fields/location-rules.js';
export type { LocationRule, LocationContext, LocationParam } from './fields/location-rules.js';
export { fieldGroupService, FieldGroupService } from './fields/service.js';
export type { FieldGroup, FieldGroupInput, FieldDefinitionInput, FlexibleLayoutInput } from './fields/service.js';

// Storage
export { createStorageDriver, storage, StorageMigrator, createMigrator } from './storage/index.js';
export type { StorageDriver, StorageDriverName, StorageObject, MigrationResult } from './storage/index.js';
export { LocalStorageDriver } from './storage/drivers/local.js';
export { S3StorageDriver } from './storage/drivers/s3.js';

// Hooks
export { HOOK_POINTS, hooks } from './hooks/points.js';
export { getHookCatalog, type HookCatalog, type HookCatalogEntry } from './hooks/catalog.js';

// Field delivery
export { contentFieldResolver, ContentFieldResolver } from './content/field-resolver.js';
export type { ContentFieldsResult } from './content/field-resolver.js';
export { contentPublisher, ContentPublisher } from './content/publisher.js';
export type { PublishResult } from './content/publisher.js';
export { mediaService, MediaService } from './media/service.js';
export { menuService, MenuService } from './menu/service.js';
export { settingsService, SettingsService } from './settings/service.js';
export { categoryService, CategoryService } from './category/service.js';
export { tagService, TagService } from './tag/service.js';
export { pluginService, PluginService } from './plugin/service.js';
export { themeService, ThemeService } from './theme/service.js';
export { resolveExtensionDirectory } from './extensions/project-directories.js';
export { buildService, BuildService } from './build/service.js';
export { deploymentService, DeploymentService } from './deployment/service.js';
