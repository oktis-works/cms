/**
 * Users Mapper
 * Maps wp_users + wp_usermeta → OkCMS users + tenant_users + roles
 */

import { WPMySQLConnector } from '../connectors/mysql';
import { WPMigrationConfig, MigrationPhase, PhaseStats, IDMaps, MigrationError, WPUser, WPUserMeta } from '../types';

export interface UsersMapperDeps {
  connector: WPMySQLConnector;
  config: WPMigrationConfig;
  idMaps: IDMaps;
  stats: Record<MigrationPhase, PhaseStats>;
  errors: MigrationError[];
  reportProgress: (phase: MigrationPhase, current: number, total: number) => void;
}

/**
 * WP Role to OkCMS Role mapping
 */
const WP_ROLE_MAP: Record<string, { slug: string; name: string; permissions: string[]; isSystem: boolean }> = {
  administrator: {
    slug: 'super-admin',
    name: 'Super Administrator',
    permissions: ['*'],
    isSystem: true,
  },
  editor: {
    slug: 'editor',
    name: 'Editor',
    permissions: [
      'content:create', 'content:read', 'content:update', 'content:delete',
      'content:publish', 'content:manage_others',
      'media:create', 'media:read', 'media:update', 'media:delete',
      'taxonomy:create', 'taxonomy:read', 'taxonomy:update', 'taxonomy:delete',
      'comments:moderate', 'comments:read',
      'users:read',
    ],
    isSystem: false,
  },
  author: {
    slug: 'author',
    name: 'Author',
    permissions: [
      'content:create', 'content:read', 'content:update', 'content:delete:own',
      'content:publish:own',
      'media:create', 'media:read', 'media:update:own',
      'taxonomy:read',
    ],
    isSystem: false,
  },
  contributor: {
    slug: 'contributor',
    name: 'Contributor',
    permissions: [
      'content:create', 'content:read', 'content:update:own', 'content:delete:own',
      'media:read',
      'taxonomy:read',
    ],
    isSystem: false,
  },
  subscriber: {
    slug: 'subscriber',
    name: 'Subscriber',
    permissions: [
      'content:read',
      'profile:update:own',
    ],
    isSystem: false,
  },
};

export class UsersMapper {
  private deps: UsersMapperDeps;
  private tenantId: string | null = null;
  private roleIdMap: Map<string, string> = new Map(); // WP role -> OkCMS role UUID

  constructor(deps: UsersMapperDeps) {
    this.deps = deps;
  }

  /**
   * Main entry point: migrate users and roles
   */
  async migrate(): Promise<string> {
    const phase: MigrationPhase = 'tenant-users';
    this.deps.stats[phase] = { created: 0, updated: 0, skipped: 0, errors: 0, durationMs: 0 };
    const startTime = Date.now();

    try {
      // 1. Ensure default tenant exists
      this.tenantId = await this.ensureDefaultTenant();
      this.deps.config.tenantSlug = this.tenantId;

      // 2. Create system roles
      await this.createSystemRoles();

      // 3. Migrate users
      await this.migrateUsers();

      this.deps.stats[phase].durationMs = Date.now() - startTime;
      return this.tenantId;
    } catch (error) {
      this.deps.stats[phase].errors++;
      this.addError(phase, 'users', 0, 'migrate', error instanceof Error ? error.message : 'Unknown error');
      throw error;
    }
  }

  /**
   * Ensure default tenant exists, create if needed
   */
  private async ensureDefaultTenant(): Promise<string> {
    const { connector, config } = this.deps;

    // Check if tenant exists
    const existing = await connector.queryOne<{ id: string }>(
      `SELECT id FROM tenants WHERE slug = ?`,
      [config.tenantSlug]
    );

    if (existing) {
      return existing.id;
    }

    // Create default tenant
    const tenantId = crypto.randomUUID();
    await connector.query(
      `INSERT INTO tenants (id, name, slug, status, settings, created_at, updated_at)
       VALUES (?, ?, ?, 'ACTIVE', '{}', NOW(), NOW())`,
      [tenantId, 'Default Tenant', config.tenantSlug]
    );

    this.deps.stats['tenant-users'].created++;
    return tenantId;
  }

  /**
   * Create system roles in OkCMS
   */
  private async createSystemRoles(): Promise<void> {
    const { connector, stats } = this.deps;

    // First, get existing roles to avoid duplicates
    const existingRoles = await connector.query<{ slug: string; id: string }>(
      `SELECT slug, id FROM roles WHERE tenant_id IS NULL OR tenant_id = ?`,
      [this.tenantId]
    );

    for (const role of existingRoles) {
      this.roleIdMap.set(role.slug, role.id);
    }

    // Create missing roles
    for (const [_wpRole, okcmsRole] of Object.entries(WP_ROLE_MAP)) {
      if (this.roleIdMap.has(okcmsRole.slug)) continue;

      const roleId = crypto.randomUUID();
      await connector.query(
        `INSERT INTO roles (id, tenant_id, name, slug, is_system, permissions, created_at)
         VALUES (?, ?, ?, ?, ?, ?, NOW())`,
        [
          roleId,
          okcmsRole.isSystem ? null : this.tenantId,
          okcmsRole.name,
          okcmsRole.slug,
          okcmsRole.isSystem ? 1 : 0,
          JSON.stringify(okcmsRole.permissions),
        ]
      );

      this.roleIdMap.set(okcmsRole.slug, roleId);
      stats['tenant-users'].created++;
    }
  }

  /**
   * Migrate all WP users to OkCMS
   */
  private async migrateUsers(): Promise<void> {
    const { connector, stats, reportProgress } = this.deps;

    // Get all WP users
    const wpUsers = await connector.getUsers();
    const total = wpUsers.length;

    // Get all usermeta in bulk
    const userIds = wpUsers.map(u => u.ID);
    const allUserMeta = await connector.getUserMetaBulk(userIds);
    const userMetaMap = new Map<number, WPUserMeta[]>();
    for (const meta of allUserMeta) {
      if (!userMetaMap.has(meta.user_id)) {
        userMetaMap.set(meta.user_id, []);
      }
      userMetaMap.get(meta.user_id)!.push(meta);
    }

    // Process each user
    let processed = 0;
    for (const wpUser of wpUsers) {
      const meta = userMetaMap.get(wpUser.ID) ?? [];

      try {
        await this.migrateUser(wpUser, meta);
        stats['tenant-users'].created++;
      } catch (error) {
        stats['tenant-users'].errors++;
        this.addError('tenant-users', 'users', wpUser.ID, 'migrate_user', error instanceof Error ? error.message : 'Unknown error');
      }

      processed++;
      reportProgress('tenant-users', processed, total);
    }
  }

  /**
   * Migrate a single WP user
   */
  private async migrateUser(wpUser: WPUser, meta: WPUserMeta[]): Promise<void> {
    const { connector, idMaps } = this.deps;

    // Check if user already exists (by email)
    const existing = await connector.queryOne<{ id: string }>(
      `SELECT id FROM users WHERE email = ?`,
      [wpUser.user_email]
    );

    let okcmsUserId: string;

    if (existing) {
      okcmsUserId = existing.id;
      this.deps.stats['tenant-users'].updated++;
    } else {
      // Create new user
      okcmsUserId = crypto.randomUUID();

      // Generate password hash placeholder (user will need to reset)
      const passwordHash = '$2b$10$' + 'x'.repeat(53); // bcrypt placeholder

      // Extract metadata from usermeta
      const metadata: Record<string, unknown> = {
        wp_user_id: wpUser.ID,
        wp_user_login: wpUser.user_login,
        wp_user_nicename: wpUser.user_nicename,
        wp_user_url: wpUser.user_url,
        wp_user_registered: wpUser.user_registered,
        wp_display_name: wpUser.display_name,
      };

      // Process usermeta
      for (const m of meta) {
        if (m.meta_key.startsWith('wp_') || m.meta_key.startsWith('_')) {
          // WP internal meta - store in metadata
          metadata[m.meta_key] = m.meta_value;
        } else {
          // Custom meta - store as-is
          metadata[m.meta_key] = m.meta_value;
        }
      }

      await connector.query(
        `INSERT INTO users (id, email, name, password_hash, avatar, status, locale, metadata, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 'ACTIVE', 'en', ?, NOW(), NOW())`,
        [
          okcmsUserId,
          wpUser.user_email,
          wpUser.display_name || wpUser.user_nicename || wpUser.user_login,
          passwordHash,
          wpUser.user_url || null,
          JSON.stringify(metadata),
        ]
      );

      this.deps.stats['tenant-users'].created++;
    }

    // Map WP user ID -> OkCMS user UUID
    idMaps.user.set(wpUser.ID, okcmsUserId);

    // Determine user role from capabilities
    const role = this.getUserRole(meta);
    const okcmsRoleSlug = WP_ROLE_MAP[role]?.slug ?? 'subscriber';
    const okcmsRoleId = this.roleIdMap.get(okcmsRoleSlug);

    if (okcmsRoleId) {
      // Link user to tenant with role
      await connector.query(
        `INSERT INTO tenant_users (id, tenant_id, user_id, role_id, status, created_at)
         VALUES (?, ?, ?, ?, 'ACTIVE', NOW())
         ON DUPLICATE KEY UPDATE role_id = ?, status = 'ACTIVE', updated_at = NOW()`,
        [crypto.randomUUID(), this.tenantId, okcmsUserId, okcmsRoleId, okcmsRoleId]
      );
    }
  }

  /**
   * Extract user role from usermeta capabilities
   */
  private getUserRole(meta: WPUserMeta[]): string {
    // Find capabilities meta
    const capsMeta = meta.find(m =>
      m.meta_key === 'wp_capabilities' ||
      m.meta_key === `${this.deps.config.prefix}capabilities` ||
      m.meta_key.endsWith('capabilities')
    );

    if (!capsMeta) return 'subscriber';

    try {
      const { safePhpUnserialize } = require('../transformers/serialized-php');
      const caps = safePhpUnserialize(capsMeta.meta_value);
      if (caps && typeof caps === 'object') {
        // Return first role found (highest priority)
        const rolePriority = ['administrator', 'editor', 'author', 'contributor', 'subscriber'];
        for (const role of rolePriority) {
          if (caps[role] === true || caps[role] === 1) {
            return role;
          }
        }
      }
    } catch {
      // Ignore parse errors
    }

    return 'subscriber';
  }

  /**
   * Add error to collection
   */
  private addError(
    phase: MigrationPhase,
    wpTable: string,
    wpId: number | string,
    field: string,
    message: string
  ): void {
    this.deps.errors.push({
      phase,
      wpTable,
      wpId,
      field,
      message,
      severity: 'error',
      timestamp: new Date().toISOString(),
    });
  }
}

/**
 * Factory function
 */
export async function migrateUsers(
  connector: WPMySQLConnector,
  config: WPMigrationConfig,
  idMaps: IDMaps,
  stats: Record<MigrationPhase, PhaseStats>,
  errors: MigrationError[],
  reportProgress: (phase: MigrationPhase, current: number, total: number) => void
): Promise<string> {
  const mapper = new UsersMapper({ connector, config, idMaps, stats, errors, reportProgress });
  return mapper.migrate();
}