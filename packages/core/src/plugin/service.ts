import { randomUUID } from 'node:crypto';
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { getConnection, runPluginMigrations, rollbackPluginMigrations, type MigrationFile } from '@oktis-works/database';
import type { Plugin } from '@oktis-works/types';
import { satisfies, validRange } from 'semver';
import { CMS_VERSION, unknownPluginPermissions } from '@oktis-works/validation';
import { auditService } from '../observability/index.js';
import { getEventBus } from '../events/bus.js';
import { resolveExtensionDirectory } from '../extensions/project-directories.js';

// Dynamic import for circular dependency with plugin-runtime
const readPluginManifest = async (dir: string, options?: { strict?: boolean }) => {
  const mod = await import('@oktis-works/plugin-runtime');
  return mod.readPluginManifest(dir, options);
};

export interface PluginDependencyInput {
  name: string;
  versionRange?: string;
  optional?: boolean;
}

/** Vínculo plugin ↔ tenant (quem tem o plugin ligado). */
export interface PluginTenantLink {
  id: string;
  plugin_id: string;
  tenant_id: string;
  status: 'ENABLED' | 'DISABLED';
  error?: string | null;
  enabled_at?: string | null;
  disabled_at?: string | null;
}

export class PluginService {
  /**
   * O filesystem é a fonte da INSTALAÇÃO. Esta sincronização cadastra manifests
   * que chegaram em plugins/ via CLI, Git ou deploy:
   *
   *   - fonte única de leitura (`readPluginManifest`) — `manifest.json`
   *     canônico, `package.json` como fallback npm;
   *   - `type !== 'plugin'` (ex.: tema dentro de plugins/) é ignorado;
   *   - permissão fora do catálogo → row `QUARANTINED` com erro visível;
   *   - artefato que sumiu do disco → `MISSING` (vínculos são preservados);
   *   - nunca altera um plugin já ativado/desativado (ativação = vínculo).
   *
   * O artefato é platform: `tenant_id` fica NULL — quem tem o plugin é a linha
   * em `plugin_tenants`.
   */
  async syncFromDirectory(_tenantId?: string): Promise<Plugin[]> {
    const directory = resolveExtensionDirectory('plugin');
    let entries;
    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch {
      return [];
    }

    const discovered = new Set<string>();
    const sql = getConnection();

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const pluginPath = join(directory, entry.name);

      const { manifest: parsed, issues } = await readPluginManifest(pluginPath, { strict: true });
      if (!parsed) {
        // Diretório sem manifesto válido não é extensão instalável (ex.: tema)
        if (issues.some((issue) => issue.includes('não é "plugin"'))) {
          console.warn(`[plugins] ignorado em ${entry.name}: ${issues.join('; ')}`);
        }
        continue;
      }

      const name = typeof parsed.name === 'string' ? parsed.name.trim() : '';
      const version = typeof parsed.version === 'string' ? parsed.version.trim() : '';
      if (!name || !version) continue;

      discovered.add(name);
      const existing = await this.getByName(name);
      const manifest = parsed as unknown as Record<string, unknown>;
      const permissions = Array.isArray(manifest['permissions'])
        ? (manifest['permissions'] as string[]).filter((permission): permission is string => typeof permission === 'string')
        : [];

      // Política de permissões: fora do catálogo → quarentena visível (não some)
      const unknown = unknownPluginPermissions(permissions);
      if (unknown.length > 0) {
        const error = `permissões fora do catálogo: ${unknown.join(', ')}`;
        if (existing) {
          await sql.unsafe(
            `UPDATE plugins SET version = $1, manifest = $2::jsonb, permissions = $3::jsonb,
                    status = 'QUARANTINED', error = $4, updated_at = NOW()
             WHERE id = $5`,
            [version, manifest, permissions, error, existing.id]
          );
        } else {
          await sql.unsafe(
            `INSERT INTO plugins (id, tenant_id, name, version, status, manifest, permissions, error, installed_at)
             VALUES ($1, NULL, $2, $3, 'QUARANTINED', $4::jsonb, $5::jsonb, $6, NOW())`,
            [randomUUID(), name, version, manifest, permissions, error]
          );
        }
        continue;
      }

      if (existing) {
        // Reapareceu no disco? volta a ser instalável (MISSING/UNINSTALLED → INSTALLED)
        const status =
          existing.status === 'MISSING' || existing.status === 'UNINSTALLED' ? 'INSTALLED' : existing.status;
        await sql.unsafe(
          `UPDATE plugins SET version = $1, manifest = $2::jsonb, permissions = $3::jsonb,
                  status = $4, error = NULL, tenant_id = NULL, updated_at = NOW()
           WHERE id = $5`,
          [version, manifest, permissions, status, existing.id]
        );
      } else {
        await sql.unsafe(
          `INSERT INTO plugins (id, tenant_id, name, version, status, manifest, permissions, installed_at)
           VALUES ($1, NULL, $2, $3, 'INSTALLED', $4::jsonb, $5::jsonb, NOW())`,
          [randomUUID(), name, version, manifest, permissions]
        );
      }
    }

    // Some do disco → MISSING (state explícito; sem isso a row ficava ACTIVATED
    // órfã, invisível e intocável). Vínculos por tenant são preservados.
    if (entries.length > 0) {
      try {
        await sql.unsafe(
          `UPDATE plugins SET status = 'MISSING', updated_at = NOW()
           WHERE status NOT IN ('UNINSTALLED', 'MISSING')
             AND name <> ALL($1::text[])`,
          [[...discovered]]
        );
      } catch {
        // banco indisponível não pode apagar estado por engano
      }
    }

    if (discovered.size === 0) return [];
    const rows = await this.list(_tenantId);
    return rows.filter((plugin) => discovered.has(plugin.name));
  }

  /**
   * Lista os artefatos com o estado de vínculo do tenant informado:
   * `enabled` = plugin_tenants.status = 'ENABLED' para aquele tenant.
   * Sem tenantId (visão plataforma), `enabled` vem como false.
   */
  async list(tenantId?: string): Promise<Array<Plugin & { enabled?: boolean }>> {
    const sql = getConnection();
    if (tenantId) {
      const result = await sql.unsafe(
        `SELECT p.*, (pt.status = 'ENABLED') AS enabled
         FROM plugins p
         LEFT JOIN plugin_tenants pt ON pt.plugin_id = p.id AND pt.tenant_id = $1
         WHERE p.tenant_id IS NULL OR p.tenant_id = $1
         ORDER BY name ASC`,
        [tenantId]
      );
      return result as unknown as Array<Plugin & { enabled?: boolean }>;
    }
    const result = await sql.unsafe(
      `SELECT p.*, false AS enabled FROM plugins p ORDER BY name ASC`
    );
    return result as unknown as Array<Plugin & { enabled?: boolean }>;
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

  /** Vínculos de um plugin (todos os tenants — leitura exigindo contexto do dono ou platform). */
  async listLinks(pluginId: string): Promise<PluginTenantLink[]> {
    const sql = getConnection();
    const result = await sql.unsafe(
      'SELECT * FROM plugin_tenants WHERE plugin_id = $1 ORDER BY created_at ASC',
      [pluginId]
    );
    return result as unknown as PluginTenantLink[];
  }

  /** Plugins habilitados de um tenant (usado pelo bootstrap por tenant). */
  async listEnabledForTenant(tenantId: string): Promise<Plugin[]> {
    const sql = getConnection();
    const result = await sql.unsafe(
      `SELECT p.* FROM plugins p
       JOIN plugin_tenants pt ON pt.plugin_id = p.id
       WHERE pt.tenant_id = $1 AND pt.status = 'ENABLED'
       ORDER BY name ASC`,
      [tenantId]
    );
    return result as unknown as Plugin[];
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

    // Política de permissões: rejeita na instalação, não no boot (WP5)
    const declared = input.permissions ?? (Array.isArray(input.manifest['permissions'])
      ? (input.manifest['permissions'] as unknown[]).filter((value): value is string => typeof value === 'string')
      : []);
    const unknown = unknownPluginPermissions(declared);
    if (unknown.length > 0) {
      throw new Error(`PERMISSION_NOT_ALLOWED: fora do catálogo: ${unknown.join(', ')}`);
    }

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

    // Artefato é platform (tenant_id NULL); quem tem é plugin_tenants.
    const result = await sql.unsafe(
      `INSERT INTO plugins (id, tenant_id, name, version, status, manifest, permissions, config, installed_at, created_at, updated_at)
       VALUES ($1, NULL, $2, $3, $4, $5::jsonb, $6, $7::jsonb, $8, $8, $8)
       RETURNING *`,
      [
        id,
        input.name,
        input.version,
        'INSTALLED',
        input.manifest,
        declared,
        input.config ?? null,
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

  /**
   * Ativa (vincula) o plugin a um tenant: `plugin_tenants.status = ENABLED`.
   * Só SUPER_ADMIN (RBAC) chega aqui; a transação precisa estar no contexto do
   * tenant alvo (RLS de plugin_tenants).
   */
  async activate(id: string, tenantId: string): Promise<Plugin | null> {
    const sql = getConnection();

    const existing = await this.getById(id);
    if (!existing) return null;
    if (!tenantId) throw new Error('tenantId é obrigatório para ativar um plugin');
    if (['UNINSTALLED', 'MISSING'].includes(existing.status)) {
      throw new Error(`Invalid plugin transition: ${existing.status} → ACTIVATED`);
    }
    if (existing.status === 'QUARANTINED') {
      throw new Error(`ACTIVATION_FAILED: plugin em quarentena (${String((existing as { error?: string }).error ?? '')})`);
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

    // Validar dependências do plugin (versões semver)
    const depsResult = await sql.unsafe(
      `SELECT pd.dependency_id, pd.version_range, pd.optional, p.name, p.version
       FROM plugin_dependencies pd
       JOIN plugins p ON p.id = pd.dependency_id
       WHERE pd.plugin_id = $1`,
      [id]
    );
    const dependencies = depsResult as unknown as Array<{ dependency_id: string; version_range: string; optional: boolean; name: string; version: string }>;
    
    for (const dep of dependencies) {
      // Verificar se a dependência está habilitada para este tenant
      const depLink = await sql.unsafe(
        `SELECT status FROM plugin_tenants WHERE plugin_id = $1 AND tenant_id = $2`,
        [dep.dependency_id, tenantId]
      );
      const linkRows = depLink as unknown as Array<{ status: string }>;
      const isEnabled = linkRows.length > 0 && linkRows[0]!.status === 'ENABLED';
      
      if (!isEnabled) {
        if (!dep.optional) {
          throw new Error(`ACTIVATION_FAILED: dependência obrigatória "${dep.name}" não está ativada para este tenant`);
        }
        continue; // Dependência opcional não ativada - apenas avisa
      }

      // Validar range de versão semver
      if (dep.version_range && dep.version_range !== '*') {
        if (validRange(dep.version_range) && !satisfies(dep.version, dep.version_range)) {
          throw new Error(`ACTIVATION_FAILED: dependência "${dep.name}" versão ${dep.version} não satisfaz range requerido ${dep.version_range}`);
        }
      }
    }

    await sql.unsafe(
      `INSERT INTO plugin_tenants (id, plugin_id, tenant_id, status, enabled_at, disabled_at, created_at, updated_at)
       VALUES ($1, $2, $3, 'ENABLED', NOW(), NULL, NOW(), NOW())
       ON CONFLICT (plugin_id, tenant_id)
       DO UPDATE SET status = 'ENABLED', enabled_at = NOW(), disabled_at = NULL, updated_at = NOW()`,
      [randomUUID(), id, tenantId]
    );

    const result = await this.getById(id);

    // Audit por último (rastreabilidade da transição efetiva)
    await auditService.record({
      action: 'plugin.activate',
      resourceType: 'plugin',
      resourceId: id,
      changes: { tenantId },
    });

    return result;
  }

  /**
   * Desativa (desvincula) o plugin de um tenant: DISABLED + notificação dos
   * dependentes habilitados naquele tenant.
   */
  async deactivate(id: string, tenantId: string): Promise<Plugin | null> {
    const sql = getConnection();

    const existing = await this.getById(id);
    if (!existing) return null;
    if (!tenantId) throw new Error('tenantId é obrigatório para desativar um plugin');

    const before = await sql.unsafe(
      `SELECT status FROM plugin_tenants WHERE plugin_id = $1 AND tenant_id = $2`,
      [id, tenantId]
    );
    if ((before as unknown[]).length === 0) {
      throw new Error('Invalid plugin transition: plugin não está vinculado a este tenant');
    }

    await sql.unsafe(
      `UPDATE plugin_tenants
       SET status = 'DISABLED', disabled_at = NOW(), updated_at = NOW()
       WHERE plugin_id = $1 AND tenant_id = $2`,
      [id, tenantId]
    );

    // REQ-plugin-activation-003: dependentes habilitados são notificados via evento
    const dependentsResult = await sql.unsafe(
      `SELECT p.id, p.name FROM plugins p
       JOIN plugin_dependencies pd ON pd.plugin_id = p.id
       JOIN plugins dep ON dep.id = pd.dependency_id
       JOIN plugin_tenants pt ON pt.plugin_id = p.id AND pt.tenant_id = $3
       WHERE dep.name = $1 AND pt.status = 'ENABLED' AND p.id <> $2`,
      [existing.name, id, tenantId]
    );
    const dependents = (dependentsResult as unknown as Array<{ id: string; name: string }>).map((d) => d.name);

    const result = await this.getById(id);

    await getEventBus().emit({
      id: randomUUID(),
      type: 'plugin.deactivated',
      aggregateType: 'plugin',
      aggregateId: id,
      payload: { pluginId: id, name: existing.name, tenantId, dependents },
      processed: false,
      createdAt: new Date(),
    });

    // Audit por último (rastreabilidade da transição efetiva)
    await auditService.record({
      action: 'plugin.deactivate',
      resourceType: 'plugin',
      resourceId: id,
      changes: { tenantId, notifiedDependents: dependents },
    });

    return result;
  }

  async uninstall(id: string): Promise<boolean> {
    const sql = getConnection();

    const existing = await this.getById(id);
    if (!existing) return false;

    // REQU-022-004: desinstalação remove dependências, vínculos e reverte migrations
    const tenantId = (existing as unknown as { tenant_id?: string | null }).tenant_id ?? '';
    let rolledBack = 0;
    try {
      rolledBack = await rollbackPluginMigrations(tenantId, existing.name);
    } catch {
      rolledBack = 0;
    }

    await sql.unsafe('DELETE FROM plugin_dependencies WHERE plugin_id = $1', [id]);
    await sql.unsafe('DELETE FROM plugin_tenants WHERE plugin_id = $1', [id]);

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
      [config, id]
    );

    return (result[0] as unknown as Plugin) ?? null;
  }
}

export const pluginService = new PluginService();
