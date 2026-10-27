import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const checks = [];
const assertCheck = (name, ok, detail) => {
  checks.push({ name, ok, detail });
  if (!ok) throw new Error(`${name}: ${detail}`);
};

const migrationDir = join(root, 'migrations');
const migrationFiles = readdirSync(migrationDir).filter((file) => /^V\d+__.*\.sql$/.test(file));
assertCheck('migration metadata headers', migrationFiles.length > 0 && migrationFiles.every((file) => {
  const source = readFileSync(join(migrationDir, file), 'utf8');
  return /^-- @okcms .*domain=(core_schema|tenant_data|plugin_schema).*provider=postgres/m.test(source);
}), `${migrationFiles.length} migration files checked`);

const schema = readFileSync(join(root, 'packages/database/src/schema/schema.sql'), 'utf8');
for (const table of ['core_schema_migrations', 'tenant_data_migrations', 'plugin_schema_migrations', 'schema_bootstrap']) {
  assertCheck(`schema table ${table}`, schema.includes(`CREATE TABLE IF NOT EXISTS ${table}`), 'canonical snapshot contains the table');
}
assertCheck('shared command registry', existsSync(join(root, 'packages/cli/src/command-registry.ts')), 'registry source is present');
assertCheck('migration recovery guide', existsSync(join(root, 'docs/migration-recovery.md')), 'operator recovery guide is present');
assertCheck('Portuguese Node policy', readFileSync(join(root, 'docs/operator-guide.pt-BR.md'), 'utf8').includes('Node 22.23+'), 'operator guide documents Node 22.23+');
assertCheck('provider matrix', existsSync(join(root, 'docs/provider-matrix.md')) && existsSync(join(root, 'docs/provider-matrix.pt-BR.md')), 'provider matrix documentation is present');
assertCheck('provider migration sets', ['mysql', 'mariadb'].every((provider) => existsSync(join(root, 'migrations', provider))), 'provider migration directories are present');
for (const provider of ['mysql', 'mariadb']) {
  const files = readdirSync(join(root, 'migrations', provider)).filter((file) => file.endsWith('.sql'));
  assertCheck(`${provider} migration metadata`, files.length === 27 && files.every((file) => readFileSync(join(root, 'migrations', provider, file), 'utf8').includes(`provider=${provider}`)), `${files.length} ${provider} files checked`);
}

console.log(JSON.stringify({ ok: true, checks }, null, 2));
