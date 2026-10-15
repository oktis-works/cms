// @oktis-works/api - Type extensions for Hono Context
// Declara as propriedades definidas pelo authMiddleware para type-safety.

declare module 'hono' {
  interface ContextVariableMap {
    userId: string;
    userEmail: string;
    tenantId: string;
    userRoles: string[];
  }
}

export {};