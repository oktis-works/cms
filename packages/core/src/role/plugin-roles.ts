// @oktis-works/core - Plugin roles service (Item 6 do plugin-parity-plan)
//
// WordPress-parity item 6: `api.roles.add/remove/addPermission` for plugins.
// Every operation is tenant-scoped and audited; anti-escalation is BLOCKING:
//   - reserved/system role slugs can never be created or modified;
//   - wildcard permissions ('*') are rejected;
//   - platform-only operations (create/update/delete plugin) are rejected —
//     the TENANT_ADMIN ceiling (they are denied even to TENANT_ADMIN).
// Permissions are stored as `action:resource` strings (matching the
// requirePermission(action, resource) middleware vocabulary).

import type { Role } from '@oktis-works/types';
import { roleService } from './service.js';
import { auditService } from '../observability/audit.js';

/** Role slugs a plugin can never create or modify (built-ins). */
export const RESERVED_ROLE_SLUGS = new Set([
  'super-admin',
  'tenant-admin',
  'admin',
  'editor',
  'author',
  'viewer',
  'subscriber',
]);

/** Operations a tenant role may never receive (platform-level ceiling). */
const PLATFORM_ONLY_PERMISSIONS = new Set(['create:plugin', 'update:plugin', 'delete:plugin']);

/** Normalizes a role name into a URL-safe slug (kebab-case). */
export function roleSlugFromName(name: string): string {
  return (
    name
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'role'
  );
}

/** Parses `action:resource`; rejects wildcards and platform-only operations. */
export function parseRolePermission(permission: string): { action: string; resource: string } {
  if (typeof permission !== 'string') {
    throw new Error(`Permission must be an "action:resource" string, received ${typeof permission}`);
  }
  const parts = permission.split(':').map((part) => part.trim());
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    throw new Error(`Invalid permission "${permission}" (expected "action:resource")`);
  }
  const [action, resource] = parts as [string, string];
  if (action === '*' || resource === '*') {
    throw new Error(`Wildcard permission "${permission}" is not allowed for plugin roles (anti-escalation)`);
  }
  if (PLATFORM_ONLY_PERMISSIONS.has(`${action}:${resource}`)) {
    throw new Error(`Permission "${permission}" is platform-only and cannot be granted by plugins (anti-escalation)`);
  }
  return { action, resource };
}

/** Reads snake_case or camelCase keys off raw DB rows (roleService returns rows as-is). */
function roleFlag(row: Role, camel: 'isSystem' | 'tenantId'): unknown {
  const record = row as unknown as Record<string, unknown>;
  if (camel === 'isSystem') return record['isSystem'] ?? record['is_system'] ?? false;
  return record['tenantId'] ?? record['tenant_id'];
}

export class PluginRolesService {
  /** Creates a tenant role owned by the plugin flow (audited). */
  async add(input: {
    tenantId: string;
    pluginName: string;
    name: string;
    slug?: string;
    permissions?: string[];
  }): Promise<Role> {
    const name = input.name.trim();
    const slug = (input.slug?.trim() || roleSlugFromName(name)).toLowerCase();
    if (RESERVED_ROLE_SLUGS.has(slug)) {
      throw new Error(`Role slug "${slug}" is reserved (anti-escalation)`);
    }

    const permissions: string[] = [];
    for (const permission of input.permissions ?? []) {
      const parsed = parseRolePermission(permission);
      const serialized = `${parsed.action}:${parsed.resource}`;
      if (!permissions.includes(serialized)) permissions.push(serialized);
    }

    const existing = await this.findBySlug(input.tenantId, slug);
    if (existing) {
      throw new Error(`Role slug "${slug}" already exists in this tenant`);
    }

    const role = await roleService.create({
      tenantId: input.tenantId,
      name,
      slug,
      permissions,
    });
    if (!role || typeof role !== 'object') {
      throw new Error('Role creation failed (database returned no row)');
    }

    await this.audit(input.tenantId, 'plugin.role.create', 'role', role.id ?? undefined, {
      plugin: input.pluginName,
      name,
      slug,
      permissions,
    });
    return role;
  }

  /** Removes a non-system tenant role by slug (audited). */
  async remove(input: { tenantId: string; pluginName: string; slug: string }): Promise<boolean> {
    if (RESERVED_ROLE_SLUGS.has(input.slug.toLowerCase())) {
      throw new Error(`Role slug "${input.slug}" is reserved (anti-escalation)`);
    }
    const role = await this.findBySlug(input.tenantId, input.slug);
    if (!role) return false;
    if (roleFlag(role, 'isSystem')) {
      throw new Error(`Role "${input.slug}" is a system role and cannot be removed by plugins`);
    }

    const removed = await roleService.delete(role.id);
    if (removed) {
      await this.audit(input.tenantId, 'plugin.role.delete', 'role', role.id ?? undefined, {
        plugin: input.pluginName,
        slug: input.slug,
      });
    }
    return removed;
  }

  /** Grants one extra permission to a non-system tenant role (audited). */
  async addPermission(input: {
    tenantId: string;
    pluginName: string;
    slug: string;
    permission: string;
  }): Promise<boolean> {
    const parsed = parseRolePermission(input.permission);
    const serialized = `${parsed.action}:${parsed.resource}`;

    const role = await this.findBySlug(input.tenantId, input.slug);
    if (!role) return false;
    if (roleFlag(role, 'isSystem')) {
      throw new Error(`Role "${input.slug}" is a system role and cannot be modified by plugins`);
    }

    const current = Array.isArray(role.permissions) ? role.permissions.map(String) : [];
    if (current.includes(serialized)) return true;

    const updated = await roleService.update(role.id, { permissions: [...current, serialized] });
    if (!updated) return false;

    await this.audit(input.tenantId, 'plugin.role.add-permission', 'role', role.id ?? undefined, {
      plugin: input.pluginName,
      slug: input.slug,
      permission: serialized,
    });
    return true;
  }

  /** Tenant roles (own tenant) + platform roles — a plugin never collides with either. */
  private async findBySlug(tenantId: string, slug: string): Promise<Role | null> {
    const roles = await roleService.list(tenantId);
    const wanted = slug.toLowerCase();
    return roles.find((role) => role.slug.toLowerCase() === wanted) ?? null;
  }

  /** Append-only audit entry; failure is logged, never blocks the operation. */
  private async audit(
    tenantId: string,
    action: string,
    resourceType: string,
    resourceId: string | undefined,
    changes: Record<string, unknown>
  ): Promise<void> {
    try {
      await auditService.record({
        tenantId,
        action,
        resourceType,
        resourceId,
        changes,
      });
    } catch {
      // auditService.record already swallows + logs DB failures
    }
  }
}

export const pluginRolesService = new PluginRolesService();
