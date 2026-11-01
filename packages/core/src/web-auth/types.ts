// @oktis-works/core - Web Auth Types

export interface UserContext {
  userId: string;
  userEmail: string;
  tenantId: string;
  userRoles: string[];
}

export interface UserPayload {
  sub: string;
  email: string;
  tenantId: string;
  roles: string[];
}

export interface WebAuthMiddlewareOptions {
  optional?: boolean;
}