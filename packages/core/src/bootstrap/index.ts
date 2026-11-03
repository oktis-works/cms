// @oktis-works/core - Application Bootstrap

import { loadConfig } from '@oktis-works/config';
import { ApplicationLifecycle } from '../lifecycle/index.js';
import { establishTenantContext } from '../tenant/context.js';
import { syncEnabledPlugins } from '../plugin/load.js';
import { installHookRuntimeWiring } from '../hooks/wiring.js';
import { okForceUtcRuntime } from '../timezone/index.js';
import { initRedisClient } from '../redis.js';

export interface BootstrapOptions {
  configPath?: string;
}

export async function bootstrap(_options: BootstrapOptions = {}): Promise<ApplicationLifecycle> {
  // WordPress-style: força UTC no runtime ANTES de qualquer operação de data
  okForceUtcRuntime();

  const config = loadConfig();
  const lifecycle = new ApplicationLifecycle(config);

  await lifecycle.start();

  await initRedisClient();

  // Fiação do runtime de hooks: catálogo oficial (allowlist em dev) + resolução
  // de registry por tenant. Antes de qualquer carga de plugin.
  installHookRuntimeWiring();

  // Establish default tenant context BEFORE syncing platform plugins
  // so that plugin operations have access to tenant context.
  const { resolveTenantId } = await import('@oktis-works/database');
  const { establishTenantContext } = await import('@oktis-works/core');
  try {
    const defaultTenantId = await resolveTenantId('default');
    await establishTenantContext(defaultTenantId);
  } catch (error) {
    console.warn('[bootstrap] Failed to establish default tenant context:', error instanceof Error ? error.message : String(error));
  }

  // Plugins habilitados da plataforma (plugin_tenants/ACTIVATED) entram no
  // registry platform. Internamente nunca lança: plugin quebrado ou banco
  // indisponível não impedem o boot (isolamento de falha). Os plugins por
  // tenant são carregados sob demanda (ensureTenantPluginsLoaded) quando a
  // requisição já tem contexto de tenant.
  await syncEnabledPlugins();

  return lifecycle;
}

export async function bootstrapForTenant(tenantId: string): Promise<ApplicationLifecycle> {
  const lifecycle = await bootstrap();
  await establishTenantContext(tenantId);
  return lifecycle;
}

