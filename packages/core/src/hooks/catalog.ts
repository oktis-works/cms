// @oktis-works/core - Catálogo de hooks gerado a partir do registry (REQ-REQU-035-002)

import { getHookRegistry } from '@oktis-works/plugin-runtime';
import { HOOK_POINTS } from './points.js';


export interface HookCatalogEntry {
  hook: string;
  type: 'action' | 'filter';
  registered: boolean;
  priorities: number[];
  sources: string[];
  total: number;
}

export interface HookCatalog {
  generatedAt: string;
  total: number;
  entries: HookCatalogEntry[];
}

/**
 * Gera o catálogo completo de hooks: todos os pontos conhecidos do core
 * (HOOK_POINTS) mais qualquer hook registrado dinamicamente por plugins,
 * com o estado atual de registros no HookRegistry.
 */
export function getHookCatalog(): HookCatalog {
  const registry = getHookRegistry();
  const registered = registry.listRegistered();
  /** Mapa de hook -> registro (tipado explicitamente para evitar 'unknown'). */
  const byHook = new Map<string, { hook: string; type: 'action' | 'filter'; priorities: number[]; sources: string[]; total: number }>(
    registered.map((entry) => [entry.hook, entry])
  );

  const known = new Set<string>();

  // Pontos estáticos entram direto; parametrizados são materializados com um
  // valor de exemplo ('post') para aparecerem no catálogo.
  for (const value of Object.values(HOOK_POINTS)) {
    if (typeof value === 'string') known.add(value);
    else if (typeof value === 'function') {
      try {
        known.add((value as (...args: unknown[]) => string)('post'));
      } catch {
        known.add(String(value));
      }
    }
  }

  const entries: HookCatalogEntry[] = [];

  for (const hook of known) {
    if (!hook) continue;
    const base = hook.split('{')[0]!;
    const reg = byHook.get(hook) ?? byHook.get(base);
    entries.push({
      hook,
      type: (reg?.type ?? (hook.startsWith('theme:data:') ? 'filter' : 'action')) as 'action' | 'filter',
      registered: Boolean(reg),
      priorities: reg?.priorities ?? [],
      sources: reg?.sources ?? [],
      total: reg?.total ?? 0,
    });
    byHook.delete(hook);
    if (reg) byHook.delete(base);
  }

  for (const reg of byHook.values()) {
    entries.push({
      hook: reg.hook,
      type: reg.type,
      registered: true,
      priorities: reg.priorities,
      sources: reg.sources,
      total: reg.total,
    });
  }

  entries.sort((a, b) => a.hook.localeCompare(b.hook));

  return { generatedAt: new Date().toISOString(), total: entries.length, entries };
}
