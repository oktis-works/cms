// @oktis-works/database - Main Entry Point

export {
  createConnection,
  getConnection,
  getReadConnection,
  closeConnection,
  healthCheck,
  assertSupportedServerVersion,
  getDatabaseCapabilities,
  runInTransaction,
  runWithTenantTransaction,
  isTenantTransactionActive,
} from './connection.js';
export type { DatabaseAdapter, DatabaseCapabilities, RepoSql } from './connection.js';
export { setTenantContext, clearTenantContext, getCurrentTenantId, enableRLS } from './rls/index.js';
export {
  loadMigrationsFromDir,
  getAppliedMigrations,
  applyMigration,
  rollbackMigration,
  runMigrations,
  runPluginMigrations,
  rollbackPluginMigrations,
  buildMigrationManifest,
  parseMigrationMetadata,
  type MigrationFile,
  type MigrationManifest,
  type MigrationMetadata,
} from './migrations/runner.js';
export { preflightMigration, type MigrationPreflightReport, type MigrationConflict } from './migrations/preflight.js';
export { ensureCoreSchema, resolveTenantId, type EnsureCoreSchemaOptions } from './migrations/bootstrap.js';
export {
  seedCoreData,
  seedDemoContent,
  seedActivateDefaultTheme,
  seedDefaultFieldGroups,
  seedDefaultRoles,
  seedDefaultSettings,
  DEFAULT_ROLES,
  DEFAULT_SETTINGS,
} from './migrations/seed.js';
export { schema, getSchema } from './schema/index.js';
