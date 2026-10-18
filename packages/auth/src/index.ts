// @oktis-works/auth - Main Entry Point

export { AuthService } from './service.js';
export type { AuthResult, RegisterInput, LoginInput, ApiKeyLoginInput } from './service.js';
export { JWTService } from './jwt/index.js';
export type { TokenPayload, TokenPair } from './jwt/index.js';
export { RBACService } from './rbac/index.js';
export type { Permission, RolePermissions, RBACPolicy } from './rbac/index.js';
export { SessionService } from './sessions/index.js';
export type { Session } from './sessions/index.js';
export { ApiKeyService } from './api-keys/index.js';
export type { ApiKey, ApiKeyWithPlaintext, CreateApiKeyInput } from './api-keys/index.js';
export { hashPassword, verifyPassword } from './password/index.js';
