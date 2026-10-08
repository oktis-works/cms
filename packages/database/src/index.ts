// @oktis-works/database - Main Entry Point

export {
  createConnection,
  getConnection,
  getReadConnection,
  closeConnection,
  healthCheck,
  runWithTenantTransaction,
  isTenantTransactionActive,
} from './connection.js';
export { setTenantContext, clearTenantContext, getCurrentTenantId, enableRLS } from './rls/index.js';
export {
  loadMigrationsFromDir,
  getAppliedMigrations,
  applyMigration,
  rollbackMigration,
  runMigrations,
  runPluginMigrations,
  rollbackPluginMigrations,
  type MigrationFile,
} from './migrations/runner.js';
export { ensureCoreSchema, resolveTenantId } from './migrations/bootstrap.js';
export {
  seedCoreData,
  seedDefaultRoles,
  seedDefaultSettings,
  DEFAULT_ROLES,
  DEFAULT_SETTINGS,
} from './migrations/seed.js';
export { schema, getSchema } from './schema/index.js';
