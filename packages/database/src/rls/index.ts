// @oktis-works/database - Row Level Security

import { getConnection } from '../connection.js';

export async function setTenantContext(tenantId: string): Promise<void> {
  const sql = getConnection();
  // `SET` do Postgres não aceita placeholder (syntax error 42601); set_config
  // parametriza com segurança — o tenantId pode vir do header X-Tenant-ID.
  await sql`SELECT set_config('app.current_tenant_id', ${tenantId}, false)`;
}

export async function clearTenantContext(): Promise<void> {
  const sql = getConnection();
  await sql`RESET app.current_tenant_id`;
}

export async function getCurrentTenantId(): Promise<string | null> {
  const sql = getConnection();
  const result = await sql<{ app_current_tenant_id: string | null }[]>`
    SELECT current_setting('app.current_tenant_id', true) as app_current_tenant_id
  `;
  return result[0]?.app_current_tenant_id ?? null;
}

export async function enableRLS(): Promise<void> {
  const sql = getConnection();
  await sql`ALTER TABLE content ENABLE ROW LEVEL SECURITY`;
  await sql`ALTER TABLE media ENABLE ROW LEVEL SECURITY`;
  await sql`ALTER TABLE categories ENABLE ROW LEVEL SECURITY`;
  await sql`ALTER TABLE tags ENABLE ROW LEVEL SECURITY`;
  await sql`ALTER TABLE menus ENABLE ROW LEVEL SECURITY`;
  await sql`ALTER TABLE settings ENABLE ROW LEVEL SECURITY`;
  await sql`ALTER TABLE plugins ENABLE ROW LEVEL SECURITY`;
  await sql`ALTER TABLE themes ENABLE ROW LEVEL SECURITY`;
  await sql`ALTER TABLE builds ENABLE ROW LEVEL SECURITY`;
  await sql`ALTER TABLE deployments ENABLE ROW LEVEL SECURITY`;
  await sql`ALTER TABLE events ENABLE ROW LEVEL SECURITY`;
  await sql`ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY`;
  await sql`ALTER TABLE migrations ENABLE ROW LEVEL SECURITY`;
  await sql`ALTER TABLE sessions ENABLE ROW LEVEL SECURITY`;
  await sql`ALTER TABLE webhooks ENABLE ROW LEVEL SECURITY`;
}
