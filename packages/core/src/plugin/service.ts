import { randomUUID } from 'node:crypto';
import { getConnection, runPluginMigrations, rollbackPluginMigrations, type MigrationFile } from '@oktis-works/database';
import type { Plugin } from '@oktis-works/types';
import { satisfies, validRange } from 'semver';
import { CMS_VERSION } from '@oktis-works/validation';
import { auditService } from '../observability/index.js';
import { getEventBus } from '../events/bus.js';

export interface PluginDependencyInput {
  name: string;
  versionRange?: string;
  optional?: boolean;
}

export class PluginService {
  /**
   * RULE-tenant-plugin-scope: retorna plugins platform (globais) + os do tenant informado.
   * Sem tenantId, retorna apenas os de escopo platform.
   */
  async list(tenantId?: string): Promise<Plugin[]> {
    const sql = getConnection();
    const result = tenantId
      ? await sql.unsafe(
          "SELECT * FROM plugins WHERE manifest->>'scope' = 'platform' OR manifest->>'scope' IS NULL OR tenant_id = $1 ORDER BY name ASC",
          [tenantId]
        )
      : await sql.unsafe("SELECT * FROM plugins WHERE manifest->>'scope' = 'platform' OR manifest->>'scope' IS NULL ORDER BY name ASC");
    return result as unknown as Plugin[];
  }

  async getById(id: string): Promise<Plugin | null> {
    const sql = getConnection();
    const result = await sql.unsafe('SELECT * FROM plugins WHERE id = $1', [id]);
    return (result[0] as unknown as Plugin) ?? null;
  }

  async getByName(name: string): Promise<Plugin | null> {
    const sql = getConnection();
    const result = await sql.unsafe('SELECT * FROM plugins WHERE name = $1', [name]);
    return (result[0] as unknown as Plugin) ?? null;
  }

  async install(input: {
    name: string;
    version: string;
    manifest: Record<string, unknown>;
    permissions?: string[];
    config?: Record<string, unknown>;
    dependencies?: PluginDependencyInput[];
    migrations?: MigrationFile[];
    tenantId?: string | null;
  }): Promise<Plugin> {
    const sql = getConnection();

    // REQ-plugin-installation-002: dependências devem estar instaladas primeiro
    const missing: string[] = [];
    for (const dep of input.dependencies ?? []) {
      if (dep.optional) continue;
      const found = await sql.unsafe(
        "SELECT id FROM plugins WHERE name = $1 AND status IN ('INSTALLED','ACTIVATED') LIMIT 1",
        [dep.name]
      );
      if ((found as unknown[]).length === 0) missing.push(dep.name);
    }
    if (missing.length > 0) {
      throw new Error(`DEPENDENCY_MISSING: instale primeiro as dependências: ${missing.join(', ')}`);
    }

    const id = randomUUID();
    const now = new Date().toISOString();

    const result = await sql.unsafe(
      `INSERT INTO plugins (id, name, version, status, manifest, permissions, config, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7::jsonb, $8, $8)
       RETURNING *`,
      [
        id,
        input.name,
        input.version,
        'INSTALLED',
        JSON.stringify(input.manifest),
        input.permissions ?? [],
        input.config ? JSON.stringify(input.config) : null,
        now,
      ]
    );

    // Registra o grafo de dependências (plugin_dependencies)
    for (const dep of input.dependencies ?? []) {
      const depRow = await sql.unsafe('SELECT id FROM plugins WHERE name = $1 ORDER BY created_at DESC LIMIT 1', [dep.name]);
      const depId = (depRow as unknown as Array<{ id: string }>)[0]?.id;
      if (!depId) continue;
      await sql.unsafe(
        'INSERT INTO plugin_dependencies (plugin_id, dependency_id, version_range, optional) VALUES ($1, $2, $3, $4)',
        [id, depId, dep.versionRange ?? '*', dep.optional === true]
      );
    }

    // REQ-plugin-installation-003/005: migrations do plugin rodam transacionais;
    // falha => status MIGRATION_FAILED e erro propagado.
    if (input.migrations && input.migrations.length > 0) {
      try {
        await runPluginMigrations(input.tenantId ?? '', input.name, input.migrations);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        await sql.unsafe("UPDATE plugins SET status = 'MIGRATION_FAILED', updated_at = NOW() WHERE id = $1", [id]);
        throw new Error(`MIGRATION_FAILED: ${input.name} — ${message}`);
      }
    }

    await auditService.record({
      action: 'plugin.install',
      resourceType: 'plugin',
      resourceId: id,
      changes: { name: input.name, version: input.version },
    });

    return result[0] as unknown as Plugin;
  }

  async activate(id: string): Promise<Plugin | null> {
    const sql = getConnection();

    const existing = await this.getById(id);
    if (!existing) return null;
    if (!['INSTALLED', 'DEACTIVATED'].includes(existing.status)) {
      throw new Error(`Invalid plugin transition: ${existing.status} → ACTIVATED`);
    }

    // REQ-plugin-activation-004: range compatibility.okcms insatisfazível bloqueia ativação
    const raw = (existing as unknown as { manifest?: unknown }).manifest;
    let manifest: Record<string, unknown> = {};
    if (typeof raw === 'string') {
      try { manifest = JSON.parse(raw) as Record<string, unknown>; } catch { manifest = {}; }
    } else if (raw && typeof raw === 'object') {
      manifest = raw as Record<string, unknown>;
    }
    const compat = (manifest as { compatibility?: { okcms?: unknown } }).compatibility?.okcms;
    if (typeof compat === 'string' && validRange(compat) && !satisfies(CMS_VERSION, compat)) {
      throw new Error(`ACTIVATION_FAILED: plugin requer OkCMS ${compat}, versão atual é ${CMS_VERSION}`);
    }

    const result = await sql.unsafe(
      `UPDATE plugins
       SET status = $1, activated_at = NOW(), updated_at = NOW()
       WHERE id = $2
       RETURNING *`,
      ['ACTIVATED', id]
    );

    await auditService.record({ action: 'plugin.activate', resourceType: 'plugin', resourceId: id });

    return (result[0] as unknown as Plugin) ?? null;
  }

  async deactivate(id: string): Promise<Plugin | null> {
    const sql = getConnection();

    const existing = await this.getById(id);
    if (!existing) return null;
    if (existing.status !== 'ACTIVATED') {
      throw new Error(`Invalid plugin transition: ${existing.status} → DEACTIVATED`);
    }

    const result = await sql.unsafe(
      `UPDATE plugins
       SET status = $1, updated_at = NOW()
       WHERE id = $2
       RETURNING *`,
      ['DEACTIVATED', id]
    );

    // REQ-plugin-activation-003: dependentes ativos são notificados via evento de domínio
    const dependentsResult = await sql.unsafe(
      `SELECT p.id, p.name FROM plugins p
       JOIN plugin_dependencies pd ON pd.plugin_id = p.id
       JOIN plugins dep ON dep.id = pd.dependency_id
       WHERE dep.name = $1 AND p.status = 'ACTIVATED'`,
      [existing.name]
    );
    const dependents = (dependentsResult as unknown as Array<{ id: string; name: string }>).map((d) => d.name);

    await getEventBus().emit({
      id: randomUUID(),
      type: 'plugin.deactivated',
      aggregateType: 'plugin',
      aggregateId: id,
      payload: { pluginId: id, name: existing.name, dependents },
      processed: false,
      createdAt: new Date(),
    });

    await auditService.record({
      action: 'plugin.deactivate',
      resourceType: 'plugin',
      resourceId: id,
      changes: { notifiedDependents: dependents },
    });

    return (result[0] as unknown as Plugin) ?? null;
  }

  async uninstall(id: string): Promise<boolean> {
    const sql = getConnection();

    const existing = await this.getById(id);
    if (!existing) return false;

    // REQU-022-004: desinstalação remove dependências registradas e reverte migrations
    const tenantId = (existing as unknown as { tenant_id?: string | null }).tenant_id ?? '';
    let rolledBack = 0;
    try {
      rolledBack = await rollbackPluginMigrations(tenantId, existing.name);
    } catch {
      rolledBack = 0;
    }

    await sql.unsafe('DELETE FROM plugin_dependencies WHERE plugin_id = $1', [id]);

    await sql.unsafe(
      `UPDATE plugins SET status = $1, updated_at = NOW() WHERE id = $2`,
      ['UNINSTALLED', id]
    );

    await auditService.record({
      action: 'plugin.uninstall',
      resourceType: 'plugin',
      resourceId: id,
      changes: { migrationsRolledBack: rolledBack },
    });

    return true;
  }

  async updateConfig(id: string, config: Record<string, unknown>): Promise<Plugin | null> {
    const sql = getConnection();

    const existing = await this.getById(id);
    if (!existing) return null;

    const result = await sql.unsafe(
      `UPDATE plugins
       SET config = $1::jsonb, updated_at = NOW()
       WHERE id = $2
       RETURNING *`,
      [JSON.stringify(config), id]
    );

    return (result[0] as unknown as Plugin) ?? null;
  }
}

export const pluginService = new PluginService();
