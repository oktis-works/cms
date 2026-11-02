// @oktis-works/core - Tenant Context

import { AsyncLocalStorage } from 'node:async_hooks';
import { setTenantContext, clearTenantContext, getCurrentTenantId } from '@oktis-works/database';

export interface TenantContext {
  tenantId: string;
  userId?: string;
  requestId?: string;
}

const contextStorage = new AsyncLocalStorage<TenantContext>();

/**
 * The RLS mirror for Postgres is optional: without an initialized connection
 * we keep only the in-memory context (useful in tests and early boot).
 * Other database errors are propagated normally.
 */
function ignoreIfNoConnection(error: unknown): void {
  if (
    error instanceof Error &&
    error.message.startsWith('Database connection not initialized')
  ) {
    return;
  }
  throw error;
}

async function trySetTenantContext(tenantId: string): Promise<void> {
  try {
    await setTenantContext(tenantId);
  } catch (error) {
    ignoreIfNoConnection(error);
  }
}

async function tryClearTenantContext(): Promise<void> {
  try {
    await clearTenantContext();
  } catch (error) {
    ignoreIfNoConnection(error);
  }
}

async function tryGetTenantId(): Promise<string | null> {
  try {
    return await getCurrentTenantId();
  } catch (error) {
    ignoreIfNoConnection(error);
    return null;
  }
}

export async function establishTenantContext(tenantId: string, userId?: string): Promise<TenantContext> {
  await trySetTenantContext(tenantId);

  return { tenantId, userId };
}

export function runWithTenantContext<T>(context: TenantContext, fn: () => T): T {
  return contextStorage.run(context, fn);
}

export async function getCurrentContext(): Promise<TenantContext | null> {
  const scopedContext = contextStorage.getStore();
  if (scopedContext) {
    return scopedContext;
  }

  const tenantId = await tryGetTenantId();
  if (tenantId) {
    return { tenantId };
  }

  return null;
}

export async function clearCurrentContext(): Promise<void> {
  await tryClearTenantContext();
}

/**
 * Synchronous access to the tenant ID from the current request context.
 * Reads strictly from AsyncLocalStorage — the module-level fallback is removed
 * to prevent cross-tenant leakage under concurrency.
 * Throws if called outside an established tenant context.
 */
export function getCurrentTenantIdSync(): string {
  const context = contextStorage.getStore();
  if (!context) {
    throw new Error('Tenant context not established. Call establishTenantContext() or runWithTenantContext() first.');
  }
  return context.tenantId;
}

/**
 * Synchronous access to the user ID from the current request context.
 * Reads strictly from AsyncLocalStorage.
 * Throws if called outside an established tenant context.
 */
export function getCurrentUserIdSync(): string {
  const context = contextStorage.getStore();
  if (!context) {
    throw new Error('Tenant context not established. Call establishTenantContext() or runWithTenantContext() first.');
  }
  if (!context.userId) {
    throw new Error('User ID not available in current context.');
  }
  return context.userId;
}

/**
 * Synchronous access to the request ID from the current request context.
 * Reads strictly from AsyncLocalStorage.
 * Throws if called outside an established tenant context.
 */
export function getCurrentRequestIdSync(): string {
  const context = contextStorage.getStore();
  if (!context) {
    throw new Error('Tenant context not established. Call establishTenantContext() or runWithTenantContext() first.');
  }
  if (!context.requestId) {
    throw new Error('Request ID not available in current context.');
  }
  return context.requestId;
}

export function requireTenantContext(): TenantContext {
  const context = contextStorage.getStore();
  if (!context) {
    throw new Error('Tenant context not established. Call establishTenantContext() or runWithTenantContext() first.');
  }
  return context;
}