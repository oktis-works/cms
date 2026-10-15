// @oktis-works/core - Fiação do runtime de hooks (catálogo oficial + tenant)
//
// O plugin-runtime não depende do core (seria ciclo de dependência), então ele
// não conhece o catálogo de pontos de extensão nem o contexto de tenant. Aqui o
// core injeta as duas coisas:
//
//   1. **Catálogo**: em modo dev o registry exige prefixo `okcms.`/`plugin.`;
//      sem isto, os próprios nomes oficiais (`content:query`, `theme:data:*`,
//      `after_publish_content_*`, `manage:*`) seriam reprovados e o plugin
//      cairia em falha isolada. O catálogo é injetado por nome/prefixo.
//   2. **Tenant**: `getHookRegistry()` resolve síncronamente o tenant ativo
//      (ALS) → registry daquele tenant; sem contexto → registry platform.

import {
  getHookRegistryStore,
  setHookTenantResolver,
} from '@oktis-works/plugin-runtime';
import { getCurrentTenantIdSync } from '../tenant/context.js';
import { HOOK_POINTS } from './points.js';

/**
 * Nomes oficiais do catálogo, incluindo prefixos de hooks parametrizados.
 *
 * - estáticos entram exatos (`content:query`);
 * - parametrizados viram `prefixo*` (`before_publish_content_*`,
 *   `theme:data:*`, `manage:*`, `rest:*`, `settings:defaults:*`) — cada tipo
 *   real de conteúdo continua casando com o mesmo prefixo.
 */
export function hookCatalogNames(): string[] {
  const names: string[] = [];

  for (const value of Object.values(HOOK_POINTS)) {
    if (typeof value === 'string') {
      names.push(value);
      continue;
    }
    if (typeof value !== 'function') continue;

    const fn = value as (...args: string[]) => string;
    try {
      const sample = fn.length >= 2 ? fn('post', 'field') : fn('post');
      names.push(sample);
      // `before_save_content_post` → prefixo `before_save_content_`
      const index = sample.indexOf('post');
      if (index >= 0 && sample.length > 'post'.length) {
        names.push(`${sample.slice(0, index)}*`);
      }
    } catch {
      // função parametrizada exigindo outro formato: não faz parte do allowlist
    }
  }

  return [...new Set(names)];
}

let installed = false;

/**
 * Instala a fiação do runtime de hooks. Idempotente — segura de chamar no boot
 * de qualquer processo (API, web, worker, CLI) e em testes.
 */
export function installHookRuntimeWiring(): void {
  const store = getHookRegistryStore();
  setHookTenantResolver(getCurrentTenantIdSync);
  store.setKnownHooks(hookCatalogNames());
  installed = true;
}

export function isHookRuntimeWiringInstalled(): boolean {
  return installed;
}
