// @oktis-works/core - Application Bootstrap

import { loadConfig } from '@oktis-works/config';
import { ApplicationLifecycle } from '../lifecycle/index.js';
import { establishTenantContext } from '../tenant/context.js';
import { syncEnabledPlugins } from '../plugin/load.js';
import { installHookRuntimeWiring } from '../hooks/wiring.js';
import { okForceUtcRuntime } from '../timezone/index.js';

export interface BootstrapOptions {
  configPath?: string;
}

export async function bootstrap(_options: BootstrapOptions = {}): Promise<ApplicationLifecycle> {
  // WordPress-style: força UTC no runtime ANTES de qualquer operação de data
  okForceUtcRuntime();

  const config = loadConfig();
  const lifecycle = new ApplicationLifecycle(config);

  await lifecycle.start();

  // Fiação do runtime de hooks: catálogo oficial (allowlist em dev) + resolução
  // de registry por tenant. Antes de qualquer carga de plugin.
  installHookRuntimeWiring();

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

