import { readFileSync } from 'node:fs';
import postgres from 'postgres';

const connectionString = process.env['OKCMS_ACCEPTANCE_DATABASE_URL'];
if (!connectionString) {
  console.log('PostgreSQL acceptance matrix skipped: set OKCMS_ACCEPTANCE_DATABASE_URL to enable it.');
  process.exit(0);
}

const adminUrl = new URL(connectionString);
const databaseName = `okcms_acceptance_${process.pid}_${Date.now()}`;
const admin = postgres(adminUrl.toString(), { max: 1 });
let target;
try {
  await admin.unsafe(`CREATE DATABASE "${databaseName}"`);
  const targetUrl = new URL(adminUrl.toString());
  targetUrl.pathname = `/${databaseName}`;
  target = postgres(targetUrl.toString(), { max: 2 });
  const schema = readFileSync(new URL('../src/schema/schema.sql', import.meta.url), 'utf8');
  await target.unsafe(schema);

  const tables = await target`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name IN ('migrations', 'core_schema_migrations', 'tenant_data_migrations', 'plugin_schema_migrations', 'schema_bootstrap')
    ORDER BY table_name
  `;
  const names = tables.map((row) => row.table_name);
  const expected = ['core_schema_migrations', 'migrations', 'plugin_schema_migrations', 'schema_bootstrap', 'tenant_data_migrations'];
  if (JSON.stringify(names) !== JSON.stringify(expected)) {
    throw new Error(`fresh schema ledger mismatch: ${names.join(', ')}`);
  }

  await target.begin(async (tx) => {
    await tx`SELECT pg_advisory_xact_lock(hashtext('okcms:acceptance:lock'))`;
    await tx`SELECT pg_advisory_xact_lock(hashtext('okcms:acceptance:lock'))`;
  });
  console.log(JSON.stringify({ ok: true, database: databaseName, checks: ['fresh-schema-ledgers', 'transaction-lock-reentrancy'] }));
} finally {
  await target?.end({ timeout: 5 }).catch(() => undefined);
  await admin.unsafe(`DROP DATABASE IF EXISTS "${databaseName}"`).catch(() => undefined);
  await admin.end({ timeout: 5 }).catch(() => undefined);
}
