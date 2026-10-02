// @oktis-works/auth - Authentication Service

import { randomUUID } from 'node:crypto';
import { getConnection } from '@oktis-works/database';
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
}

export interface RegisterInput {
  email: string;
  password: string;
  name: string;
}

export interface LoginInput {
  email: string;
  password: string;
  tenantId: string;
  ipAddress?: string;
  userAgent?: string;
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

    return result[0] as unknown as User;
  }

  async login(input: LoginInput): Promise<AuthResult> {
    const sql = getConnection();

    const users = await sql.unsafe(
      'SELECT * FROM users WHERE email = $1 AND status = $2',
      [input.email, 'ACTIVE']
    );
    if (users.length === 0) {
      throw new Error('Invalid credentials');
    }

    const user = users[0] as unknown as User;

    const valid = await verifyPassword(input.password, user.passwordHash);
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
      [user.id, input.tenantId]
    );

    const userRoles = roles.map((r: Record<string, unknown>) => r['slug'] as string);

    const tokens = await this.jwt.generateTokenPair({
      sub: user.id,
      email: user.email,
      tenantId: input.tenantId,
      roles: userRoles,
    });

    const session = await this.session.create(user.id, input.tenantId, {
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
    });

    await sql.unsafe('UPDATE users SET last_login_at = NOW() WHERE id = $1', [user.id]);

    return {
      user,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      sessionId: session.id,
    };
  }

  async refreshToken(refreshToken: string): Promise<{ accessToken: string; refreshToken: string } | null> {
    const payload = await this.jwt.verifyToken(refreshToken);
    if (!payload) return null;

    return this.jwt.refreshAccessToken(refreshToken);
  }

  async logout(token: string): Promise<void> {
    await this.session.delete(token);
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
