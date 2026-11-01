// @oktis-works/core - Web Auth Module

export { webAuthMiddleware, resolveUserFromToken } from './middleware.js';
export { runWithUserContext, getCurrentUserContextSync, getCurrentUserIdSync, getCurrentUserEmailSync, getCurrentUserRolesSync, getCurrentUserTenantIdSync, setFallbackUserContext, clearFallbackUserContext, requireUserContext } from './context.js';
export type { UserContext, UserPayload, WebAuthMiddlewareOptions } from './types.js';