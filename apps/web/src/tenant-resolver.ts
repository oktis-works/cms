// @oktis-works/web - Resolução de tenant a partir do header Host

import { getConnection } from '@oktis-works/database';

type TenantRow = Record<string, unknown>;

/**
 * Resolve o tenant ativo a partir do header Host.
 *
 * - Normaliza `host:porta` (localhost:3002 → localhost) — domínios nunca guardam porta.
 * - Loopback (localhost / 127.x / ::1) usa o tenant `default`: dev zero-config
 *   sem configurar domínio no banco.
 * - Demais hosts: subdomain (apenas host com ponto, ignorando www/api) → domain exato.
 *
 * Retorna `null` quando nenhum tenant casa (→ 404 "Tenant not found").
 */
export async function resolveTenantFromHost(rawHost: string): Promise<TenantRow | null> {
  const host = rawHost.replace(/:\d+$/, '');
  const sql = getConnection();

  const isLoopback = host === 'localhost' || host === '::1' || host === '[::1]' || /^127\./.test(host);

  if (isLoopback) {
    // Dev zero-config: tenant padrão criado no primeiro db:migrate
    const defaults = await sql.unsafe('SELECT * FROM tenants WHERE slug = $1 AND status = $2', [
      'default',
      'ACTIVE',
    ]);
    if (defaults.length > 0) return defaults[0] as TenantRow;

    // Sem tenant default: aceita domain 'localhost' configurado manualmente
    const byDomain = await sql.unsafe('SELECT * FROM tenants WHERE domain = $1 AND status = $2', [
      host,
      'ACTIVE',
    ]);
    return byDomain.length > 0 ? (byDomain[0] as TenantRow) : null;
  }

  // Subdomain primeiro (apenas host com ponto: loja.exemplo.com)
  const subdomain = host.split('.')[0];
  if (host.includes('.') && subdomain && subdomain !== 'www' && subdomain !== 'api') {
    const tenants = await sql.unsafe('SELECT * FROM tenants WHERE subdomain = $1 AND status = $2', [
      subdomain,
      'ACTIVE',
    ]);
    if (tenants.length > 0) return tenants[0] as TenantRow;
  }

  // Domain exato (já sem porta)
  const tenants = await sql.unsafe('SELECT * FROM tenants WHERE domain = $1 AND status = $2', [
    host,
    'ACTIVE',
  ]);
  return tenants.length > 0 ? (tenants[0] as TenantRow) : null;
}
