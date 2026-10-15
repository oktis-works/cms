// @oktis-works/core - Application Bootstrap

import { loadConfig } from '@oktis-works/config';
import { ApplicationLifecycle } from '../lifecycle/index.js';
import { establishTenantContext } from '../tenant/context.js';
import { syncEnabledPlugins } from '../plugin/load.js';

export interface BootstrapOptions {
  configPath?: string;
}

export async function bootstrap(_options: BootstrapOptions = {}): Promise<ApplicationLifecycle> {
  const config = loadConfig();
  const lifecycle = new ApplicationLifecycle(config);

  await lifecycle.start();

  // Plugins habilitados (ACTIVATED/RUNNING) entram no registry compartilhado
  // de hooks. Internamente nunca lança: plugin quebrado ou banco indisponível
  // não impedem o boot (isolamento de falha).
  await syncEnabledPlugins();

  return lifecycle;
}

export async function bootstrapForTenant(tenantId: string): Promise<ApplicationLifecycle> {
  const lifecycle = await bootstrap();
  await establishTenantContext(tenantId);
  return lifecycle;
}

