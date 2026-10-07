// @oktis-works/auth - Authentication Service

import { randomUUID } from 'node:crypto';
import { getConnection, resolveTenantId, seedDefaultRoles, setTenantContext } from '@oktis-works/database';
import type { AuthConfig } from '@oktis-works/config';
import type { User } from '@oktis-works/types';
import { hashPassword, verifyPassword } from './password/index.js';
import { JWTService } from './jwt/index.js';
import { SessionService } from './sessions/index.js';
import { RBACService } from './rbac/index.js';

export interface AuthResult {
  user: User;
  accessToken: string;
  refreshToken: string;
  sessionId: string;
  /** UUID real do tenant (o form de login manda o slug, ex.: "default") */
  tenantId: string;
}

export interface RegisterInput {
  email: string;
  password: string;
  name: string;
  /** Slug ou UUID do tenant (default: "default") */
  tenantId?: string;
}

export interface LoginInput {
  email: string;
  password: string;
  tenantId: string;
  ipAddress?: string;
  userAgent?: string;
}

/** Remove credenciais de um usuário vindo de SELECT ou RETURNING * (o casing do driver varia). */
function sanitizeUser(user: User): User {
  const clone = { ...user } as Record<string, unknown>;
  delete clone['password_hash'];
  delete clone['passwordHash'];
  return clone as unknown as User;
}

export class AuthService {
  private jwt: JWTService;
  private session: SessionService;
  private rbac: RBACService;
  private config: AuthConfig;

  constructor(config: AuthConfig) {
    this.config = config;
    this.jwt = new JWTService(config);
    this.session = new SessionService();
    this.rbac = new RBACService();
  }

  async register(input: RegisterInput): Promise<User> {
    const sql = getConnection();

    const existing = await sql.unsafe('SELECT id FROM users WHERE email = $1', [input.email]);
    if (existing.length > 0) {
      throw new Error('User with this email already exists');
    }

    const passwordHash = await hashPassword(input.password);

    const result = await sql.unsafe(
      `INSERT INTO users (id, email, name, password_hash, status)
       VALUES ($1, $2, $3, $4, 'ACTIVE')
       RETURNING *`,
      [randomUUID(), input.email, input.name, passwordHash]
    );

    const user = result[0] as unknown as User;

    // Onboarding zero-config: sem vínculo em tenant_users o JWT nasce com
    // roles [] e TODO requirePermission responde 403. O primeiro usuário do
    // tenant vira TENANT_ADMIN; os demais recebem VIEWER (upgradeável no
    // admin via POST /users/:id/roles).
    await this.linkUserToTenant(user, input.tenantId ?? 'default');

    return sanitizeUser(user);
  }

  private async linkUserToTenant(user: User, tenantSlug: string): Promise<void> {
    const sql = getConnection();
    try {
      await seedDefaultRoles();
      const tenantId = await resolveTenantId(tenantSlug);

      const members = await sql.unsafe(
        'SELECT COUNT(*)::int AS count FROM tenant_users WHERE tenant_id = $1',
        [tenantId]
      );
      const isFirst = ((members[0] as Record<string, unknown> | undefined)?.['count'] ?? 0) === 0;
      const roleSlug = isFirst ? 'TENANT_ADMIN' : 'VIEWER';

      const roles = await sql.unsafe(
        `SELECT id FROM roles
         WHERE slug = $1 AND (tenant_id IS NULL OR tenant_id = $2)
         ORDER BY tenant_id NULLS LAST
         LIMIT 1`,
        [roleSlug, tenantId]
      );

      if (roles.length === 0) {
        console.warn(`[auth] role "${roleSlug}" não encontrada — usuário ${user.email} ficou sem papel`);
        return;
      }

      await sql.unsafe(
        `INSERT INTO tenant_users (tenant_id, user_id, role_id, status)
         VALUES ($1, $2, $3, 'ACTIVE')
         ON CONFLICT (tenant_id, user_id) DO NOTHING`,
        [tenantId, user.id, roles[0]!['id'] as string]
      );
    } catch (error) {
      // Registro não pode quebrar por causa do vínculo — mas o operador precisa ver.
      console.warn(
        `[auth] falha ao vincular papel de ${user.email}:`,
        error instanceof Error ? error.message : error
      );
    }
  }

  async login(input: LoginInput): Promise<AuthResult> {
    const sql = getConnection();

    // Slug ("default") → UUID real: sessions.tenant_id é FK UUID e o JWT
    // deve carregar o UUID para as rotas usarem c.get('tenantId') direto.
    const tenantId = await resolveTenantId(input.tenantId);
    await setTenantContext(tenantId);

    const users = await sql.unsafe(
      'SELECT * FROM users WHERE email = $1 AND status = $2',
      [input.email, 'ACTIVE']
    );
    if (users.length === 0) {
      throw new Error('Invalid credentials');
    }

    const user = users[0] as unknown as User;

    // SELECT * devolve password_hash (snake_case) — aceita os dois formatos
    // para não depender do casing do driver.
    const row = users[0] as unknown as Record<string, unknown>;
    const storedHash = (row['password_hash'] ?? row['passwordHash']) as string | undefined;
    if (typeof storedHash !== 'string') {
      throw new Error('Invalid credentials');
    }

    const valid = await verifyPassword(input.password, storedHash);
    if (!valid) {
      throw new Error('Invalid credentials');
    }

    const roles = await sql.unsafe(
      `SELECT r.slug
       FROM roles r
       JOIN tenant_users tu ON tu.role_id = r.id
       WHERE tu.user_id = $1
         AND tu.tenant_id = $2
         AND tu.status = 'ACTIVE'`,
      [user.id, tenantId]
    );

    const userRoles = roles.map((r: Record<string, unknown>) => r['slug'] as string);

    const accessToken = await this.jwt.generateAccessToken({
      sub: user.id,
      email: user.email,
      tenantId,
      roles: userRoles,
    });

    const session = await this.session.create(user.id, tenantId, {
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
      expiresInSeconds: this.config.cookie.refreshTokenMaxAge ?? 60 * 60 * 24 * 30,
    });

    await sql.unsafe('UPDATE users SET last_login_at = NOW() WHERE id = $1', [user.id]);

    return {
      user: sanitizeUser(user),
      accessToken,
      refreshToken: session.refreshToken,
      sessionId: session.id,
      tenantId,
    };
  }

  async refreshToken(
    refreshToken: string,
    options?: { ipAddress?: string; userAgent?: string }
  ): Promise<{ accessToken: string; refreshToken: string } | null> {
    const session = await this.session.rotate(refreshToken, {
      ...options,
      expiresInSeconds: this.config.cookie.refreshTokenMaxAge ?? 60 * 60 * 24 * 30,
    });
    if (!session) return null;

    const sql = getConnection();
    await setTenantContext(session.tenantId);
    const users = await sql.unsafe(
      'SELECT id, email, status FROM users WHERE id = $1 AND status = $2',
      [session.userId, 'ACTIVE']
    );
    if (!users.length) return null;

    const roles = await sql.unsafe(
      `SELECT r.slug
       FROM roles r
       JOIN tenant_users tu ON tu.role_id = r.id
       WHERE tu.user_id = $1 AND tu.tenant_id = $2 AND tu.status = 'ACTIVE'`,
      [session.userId, session.tenantId]
    );
    const accessToken = await this.jwt.generateAccessToken({
      sub: session.userId,
      email: String((users[0] as Record<string, unknown>)['email']),
      tenantId: session.tenantId,
      roles: roles.map((role: Record<string, unknown>) => String(role['slug'])),
    });

    return { accessToken, refreshToken: session.refreshToken };
  }

  async logout(refreshToken: string): Promise<void> {
    await this.session.revokeByRefreshToken(refreshToken);
  }

  async verifyToken(token: string) {
    return this.jwt.verifyToken(token);
  }

  hasPermission(userRoles: string[], action: string, resource: string, context?: Record<string, unknown>): boolean {
    return this.rbac.hasPermission(userRoles, action, resource, context);
  }

  getUserPermissions(userRoles: string[]) {
    return this.rbac.getUserPermissions(userRoles);
  }
}
