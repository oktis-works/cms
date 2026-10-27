import { readFileSync } from 'node:fs';
import postgres from 'postgres';

const url = process.env['OKCMS_ACCEPTANCE_DATABASE_URL'];
if (!url) {
  console.log('PostgreSQL upgrade acceptance skipped: set OKCMS_ACCEPTANCE_DATABASE_URL to enable it.');
  process.exit(0);
}

const { createConnection, closeConnection, ensureCoreSchema, runMigrations } = await import('../dist/index.js');
const adminUrl = new URL(url);
const admin = postgres(adminUrl.toString(), { max: 1 });
const manifest = JSON.parse(readFileSync(new URL('../fixtures/historical/manifest.json', import.meta.url), 'utf8'));
const schema = readFileSync(new URL('../dist/schema/schema.sql', import.meta.url), 'utf8');
const migrationsDir = new URL('../../../migrations/', import.meta.url).pathname;
const results = [];

for (const boundary of manifest.boundaries) {
  const database = `okcms_upgrade_${process.pid}_${boundary.id.replace(/[^a-z0-9]+/gi, '_')}`;
  await admin.unsafe(`CREATE DATABASE "${database}"`);
  const targetUrl = new URL(adminUrl.toString());
  targetUrl.pathname = `/${database}`;
  const target = postgres(targetUrl.toString(), { max: 2 });
  try {
    await target.unsafe(schema);
    await target.unsafe("INSERT INTO schema_bootstrap (id, schema_version, schema_checksum) VALUES (1, 'V027', 'historical-fixture') ON CONFLICT (id) DO NOTHING");
    await target.unsafe(readFileSync(new URL(`../fixtures/historical/${boundary.fixture}`, import.meta.url), 'utf8'));
    const tenant = await target`INSERT INTO tenants (name, slug) VALUES ('Acceptance', ${boundary.id}) RETURNING id`;

    // Each boundary needs its own pool pointed at the isolated database.
    // Close any pool from a previous boundary before creating a new one;
    // this ensures the session-level advisory lock acquired by runMigrations
    // is released (via pg_advisory_unlock in the runner's finally block) before
    // the pool is torn down — avoiding an infinite wait on the next boundary.
    await closeConnection().catch(() => undefined);
    createConnection({ driver: 'postgres', host: targetUrl.hostname, port: Number(targetUrl.port || 5432), database, user: decodeURIComponent(targetUrl.username), password: decodeURIComponent(targetUrl.password) });

    let migrationResult;
    if (boundary.baseline === 'legacy-pending') {
      await ensureCoreSchema();
      try {
        await runMigrations(tenant[0].id, migrationsDir);
        throw new Error(`${boundary.id}: legacy state was accepted without explicit adoption`);
      } catch (error) {
        if (!String(error?.message ?? error).toLowerCase().includes('legacy')) throw error;
      }
      await target.unsafe("UPDATE schema_bootstrap SET schema_version = 'V027' WHERE id = 1");
      migrationResult = await runMigrations(tenant[0].id, migrationsDir);
    } else {
      await ensureCoreSchema();
      migrationResult = await runMigrations(tenant[0].id, migrationsDir);
    }

    const state = await target`SELECT schema_version FROM schema_bootstrap WHERE id = 1`;
    if (state[0]?.schema_version !== 'V027') throw new Error(`${boundary.id}: expected V027, got ${state[0]?.schema_version}`);
    results.push({ id: boundary.id, applied: migrationResult.applied, state: state[0]?.schema_version });
  } finally {
    // Always close the global pool so the session-level advisory lock is
    // released before the next boundary opens a fresh pool.
    await closeConnection().catch(() => undefined);
    await target.end({ timeout: 5 }).catch(() => undefined);
    await admin.unsafe(`DROP DATABASE IF EXISTS "${database}"`).catch(() => undefined);
  }
}
await admin.end({ timeout: 5 });
console.log(JSON.stringify({ ok: true, boundaries: results }, null, 2));
