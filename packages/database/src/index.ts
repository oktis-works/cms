// @oktis-works/database - Main Entry Point

export { createConnection, getConnection, closeConnection, healthCheck } from './connection.js';
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
export { schema, getSchema } from './schema/index.js';
