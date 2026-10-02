// @oktis-works/core - Application Bootstrap

import { loadConfig } from '@oktis-works/config';
import { ApplicationLifecycle } from '../lifecycle/index.js';
import { establishTenantContext } from '../tenant/context.js';

export interface BootstrapOptions {
  configPath?: string;
}

export async function bootstrap(_options: BootstrapOptions = {}): Promise<ApplicationLifecycle> {
  const config = loadConfig();
  const lifecycle = new ApplicationLifecycle(config);

  await lifecycle.start();

  return lifecycle;
}

export async function bootstrapForTenant(tenantId: string): Promise<ApplicationLifecycle> {
  const lifecycle = await bootstrap();
  await establishTenantContext(tenantId);
  return lifecycle;
}

