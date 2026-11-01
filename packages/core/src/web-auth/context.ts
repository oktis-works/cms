// @oktis-works/core - User Context (AsyncLocalStorage)

import { AsyncLocalStorage } from 'node:async_hooks';
import type { UserContext } from './types.js';

const contextStorage = new AsyncLocalStorage<UserContext>();
let _fallbackContext: UserContext | null = null;

export async function runWithUserContext<T>(context: UserContext, fn: () => T): Promise<T> {
  return contextStorage.run(context, fn);
}

export function getCurrentUserContextSync(): UserContext | null {
  return contextStorage.getStore() ?? _fallbackContext;
}

export function getCurrentUserIdSync(): string | null {
  return contextStorage.getStore()?.userId ?? _fallbackContext?.userId ?? null;
}

export function getCurrentUserEmailSync(): string | null {
  return contextStorage.getStore()?.userEmail ?? _fallbackContext?.userEmail ?? null;
}

export function getCurrentUserRolesSync(): string[] {
  return contextStorage.getStore()?.userRoles ?? _fallbackContext?.userRoles ?? [];
}

export function getCurrentUserTenantIdSync(): string | null {
  return contextStorage.getStore()?.tenantId ?? _fallbackContext?.tenantId ?? null;
}

export function setFallbackUserContext(context: UserContext | null): void {
  _fallbackContext = context;
}

export function clearFallbackUserContext(): void {
  _fallbackContext = null;
}

export function requireUserContext(): UserContext {
  const context = contextStorage.getStore() ?? _fallbackContext;
  if (!context) {
    throw new Error('User context not established. Call runWithUserContext() first.');
  }
  return context;
}