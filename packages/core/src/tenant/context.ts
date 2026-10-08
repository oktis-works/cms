// @oktis-works/core - Tenant Context

import { AsyncLocalStorage } from 'node:async_hooks';
import { setTenantContext, clearTenantContext, getCurrentTenantId } from '@oktis-works/database';

export interface TenantContext {
  tenantId: string;
  userId?: string;
}

const contextStorage = new AsyncLocalStorage<TenantContext>();
let _fallbackContext: TenantContext | null = null;

/**
 * O espelho para o RLS do Postgres é opcional: sem conexão inicializada
 * mantemos apenas o contexto em memória (útil em testes e boot antecipado).
 * Outros erros de banco são propagados normalmente.
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

  _fallbackContext = { tenantId, userId };
  return _fallbackContext;
}

/** Mantém o tenant isolado por requisição quando o processo atende concorrência. */
export function runWithTenantContext<T>(context: TenantContext, fn: () => T): T {
  return contextStorage.run(context, fn);
}

export async function getCurrentContext(): Promise<TenantContext | null> {
  const scopedContext = contextStorage.getStore();
  if (scopedContext) {
    return scopedContext;
  }

  if (_fallbackContext) {
    return _fallbackContext;
  }

  const tenantId = await tryGetTenantId();
  if (tenantId) {
    _fallbackContext = { tenantId };
    return _fallbackContext;
  }

  return null;
}

export async function clearCurrentContext(): Promise<void> {
  await tryClearTenantContext();
  _fallbackContext = null;
}

export function requireTenantContext(): TenantContext {
  const context = contextStorage.getStore() ?? _fallbackContext;
  if (!context) {
    throw new Error('Tenant context not established. Call establishTenantContext() first.');
  }
  return context;
}
