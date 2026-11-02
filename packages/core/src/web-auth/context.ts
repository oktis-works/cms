// @oktis-works/core - User Context (AsyncLocalStorage)

import { AsyncLocalStorage } from 'node:async_hooks';
import type { UserContext } from './types.js';

const contextStorage = new AsyncLocalStorage<UserContext>();

export async function runWithUserContext<T>(context: UserContext, fn: () => T): Promise<T> {
  return contextStorage.run(context, fn);
}

export function getCurrentUserContextSync(): UserContext {
  const context = contextStorage.getStore();
  if (!context) {
    throw new Error('User context not established. Call runWithUserContext() first.');
  }
  return context;
}

export function getCurrentUserIdSync(): string {
  const context = contextStorage.getStore();
  if (!context) {
    throw new Error('User context not established. Call runWithUserContext() first.');
  }
  return context.userId;
}

export function getCurrentUserEmailSync(): string {
  const context = contextStorage.getStore();
  if (!context) {
    throw new Error('User context not established. Call runWithUserContext() first.');
  }
  return context.userEmail;
}

export function getCurrentUserRolesSync(): string[] {
  const context = contextStorage.getStore();
  if (!context) {
    throw new Error('User context not established. Call runWithUserContext() first.');
  }
  return context.userRoles;
}

export function getCurrentUserTenantIdSync(): string {
  const context = contextStorage.getStore();
  if (!context) {
    throw new Error('User context not established. Call runWithUserContext() first.');
  }
  return context.tenantId;
}

export function requireUserContext(): UserContext {
  const context = contextStorage.getStore();
  if (!context) {
    throw new Error('User context not established. Call runWithUserContext() first.');
  }
  return context;
}