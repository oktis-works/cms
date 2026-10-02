// @oktis-works/core - Tenant Context

import { setTenantContext, clearTenantContext, getCurrentTenantId } from '@oktis-works/database';

export interface TenantContext {
  tenantId: string;
  userId?: string;
}

let _currentContext: TenantContext | null = null;

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

  _currentContext = { tenantId, userId };
  return _currentContext;
}

export async function getCurrentContext(): Promise<TenantContext | null> {
  if (_currentContext) {
    return _currentContext;
  }

  const tenantId = await tryGetTenantId();
  if (tenantId) {
    _currentContext = { tenantId };
    return _currentContext;
  }

  return null;
}

export async function clearCurrentContext(): Promise<void> {
  await tryClearTenantContext();
  _currentContext = null;
}

export function requireTenantContext(): TenantContext {
  if (!_currentContext) {
    throw new Error('Tenant context not established. Call establishTenantContext() first.');
  }
  return _currentContext;
}
