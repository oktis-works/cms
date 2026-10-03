// @oktis-works/auth - Role-Based Access Control

export interface Permission {
  action: string;
  resource: string;
  conditions?: Record<string, unknown>;
}

export interface RolePermissions {
  role: string;
  permissions: Permission[];
}

export interface RBACPolicy {
  roles: RolePermissions[];
  inheritance: Record<string, string[]>;
}

const DEFAULT_POLICY: RBACPolicy = {
  roles: [
    {
      role: 'SUPER_ADMIN',
      permissions: [{ action: '*', resource: '*' }],
    },
    {
      role: 'TENANT_ADMIN',
      // Administrador completo DENTRO do tenant (isolamento por RLS/JWT):
      // recursas explícitos perdiam recursos reais das rotas (ex.: rota
      // `roles` vs política `role`, taxonomy, content-type...) e davam 403
      // para o próprio dono do tenant.
      permissions: [{ action: '*', resource: '*' }],
    },
    {
      role: 'EDITOR',
      permissions: [
        { action: 'read', resource: 'content' },
        { action: 'create', resource: 'content' },
        { action: 'update', resource: 'content' },
        { action: 'read', resource: 'media' },
        { action: 'upload', resource: 'media' },
      ],
    },
    {
      role: 'AUTHOR',
      permissions: [
        { action: 'read', resource: 'content' },
        { action: 'create', resource: 'content' },
        { action: 'update', resource: 'content', conditions: { own: true } },
        { action: 'read', resource: 'media' },
        { action: 'upload', resource: 'media' },
      ],
    },
    {
      role: 'VIEWER',
      permissions: [
        { action: 'read', resource: 'content' },
        { action: 'read', resource: 'media' },
      ],
    },
  ],
  inheritance: {
    TENANT_ADMIN: ['EDITOR'],
    EDITOR: ['AUTHOR'],
    AUTHOR: ['VIEWER'],
  },
};

export class RBACService {
  private policy: RBACPolicy;

  constructor(policy?: RBACPolicy) {
    this.policy = policy ?? DEFAULT_POLICY;
  }

  hasPermission(userRoles: string[], action: string, resource: string, context?: Record<string, unknown>): boolean {
    const allPermissions = this.resolvePermissions(userRoles);

    return allPermissions.some(permission => {
      // Check action match
      const actionMatch = permission.action === '*' || permission.action === action;
      if (!actionMatch) return false;

      // Check resource match
      const resourceMatch = permission.resource === '*' || permission.resource === resource;
      if (!resourceMatch) return false;

      // Check conditions
      if (permission.conditions && context) {
        return this.checkConditions(permission.conditions, context);
      }

      return true;
    });
  }

  getUserPermissions(userRoles: string[]): Permission[] {
    return this.resolvePermissions(userRoles);
  }

  private resolvePermissions(roles: string[]): Permission[] {
    const permissions: Permission[] = [];
    const visited = new Set<string>();

    const resolve = (role: string) => {
      if (visited.has(role)) return;
      visited.add(role);

      const rolePerms = this.policy.roles.find(r => r.role === role);
      if (rolePerms) {
        permissions.push(...rolePerms.permissions);
      }

      // Resolve inherited roles
      const inherited = this.policy.inheritance[role] ?? [];
      for (const inheritedRole of inherited) {
        resolve(inheritedRole);
      }
    };

    for (const role of roles) {
      resolve(role);
    }

    return permissions;
  }

  private checkConditions(conditions: Record<string, unknown>, context: Record<string, unknown>): boolean {
    for (const [key, value] of Object.entries(conditions)) {
      if (key === 'own') {
        // Check if the user owns the resource
        if (value === true && context['userId'] !== context['resourceOwnerId']) {
          return false;
        }
      }
      // Add more condition checks as needed
    }
    return true;
  }
}
