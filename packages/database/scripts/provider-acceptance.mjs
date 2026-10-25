import { readFileSync } from 'node:fs';
import mysql from 'mysql2/promise';
import mariadb from 'mariadb';
import { closeConnection, createConnection, ensureCoreSchema, runMigrations } from '../dist/index.js';

const targets = [
  ['mysql', process.env['OKCMS_MYSQL_ACCEPTANCE_URL']],
  ['mariadb', process.env['OKCMS_MARIADB_ACCEPTANCE_URL']],
].filter((entry) => entry[1]);
if (targets.length === 0) {
  console.log('MySQL/MariaDB acceptance skipped: provider URLs are not configured.');
  process.exit(0);
}

const schemaDir = new URL('../dist/schema/', import.meta.url);
const results = [];
for (const [provider, url] of targets) {
  const parsed = new URL(url);
  const database = `okcms_acceptance_${provider}_${process.pid}`;
  const options = {
    host: parsed.hostname,
    port: Number(parsed.port || 3306),
    user: decodeURIComponent(parsed.username),
    password: decodeURIComponent(parsed.password),
    multipleStatements: true,
  };
  const admin = provider === 'mysql' ? await mysql.createConnection(options) : await mariadb.createConnection(options);
  try {
    await admin.query(`CREATE DATABASE \`${database}\``);
    const targetOptions = { ...options, database };
    const target = provider === 'mysql' ? await mysql.createConnection(targetOptions) : await mariadb.createConnection(targetOptions);
    try {
      await target.query(readFileSync(new URL(`schema.${provider}.sql`, schemaDir), 'utf8'));
      await target.query("INSERT INTO schema_bootstrap (id, schema_version, schema_checksum) VALUES (1, 'V025', REPEAT('0', 64))");
      const rows = await target.query('SELECT COUNT(*) AS count FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name IN (\'tenants\', \'core_schema_migrations\', \'tenant_data_migrations\', \'plugin_schema_migrations\')');
      const rowList = Array.isArray(rows) && Array.isArray(rows[0]) ? rows[0] : rows;
      const count = Number(rowList?.[0]?.count ?? 0);
      if (count !== 4) throw new Error(`${provider}: expected four provider ledger tables, got ${count}`);
      const lockRows = await target.query("SELECT GET_LOCK('okcms:provider:acceptance', 1) AS locked");
      const lockList = Array.isArray(lockRows) && Array.isArray(lockRows[0]) ? lockRows[0] : lockRows;
      const locked = Number(lockList?.[0]?.locked ?? 0);
      if (locked !== 1) throw new Error(`${provider}: lock acquisition failed`);
      createConnection({
        driver: provider,
        host: parsed.hostname,
        port: Number(parsed.port || 3306),
        database,
        user: decodeURIComponent(parsed.username),
        password: decodeURIComponent(parsed.password),
      });
      await ensureCoreSchema();
      const migrationResult = await runMigrations('acceptance-tenant', new URL('../../../migrations/', import.meta.url).pathname, { provider });
      if (migrationResult.applied.length !== 0) throw new Error(`${provider}: fresh baseline unexpectedly applied migrations`);
      await closeConnection();
      results.push({ provider, schema: 'ok', lock: 'ok', baseline: 'V025' });
    } finally {
      await closeConnection().catch(() => undefined);
      await target.end();
    }
  } finally {
    await admin.query(`DROP DATABASE IF EXISTS \`${database}\``);
    await admin.end();
  }
}
console.log(JSON.stringify({ ok: true, providers: results }, null, 2));
