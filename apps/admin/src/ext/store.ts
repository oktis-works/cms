// @oktis-works/admin - Estado compartilhado das extensões de plugins
//
// Busca única de `GET /api/v1/plugins/extensions` (FEAT-098 / DECI-027)
// compartilhada por todas as ilhas/slots — sidebar, widgets de dashboard,
// metaboxes, colunas e action links leem o mesmo estado e disparam uma única
// requisição. Falha = estado vazio: extensões são opcionais e o admin funciona
// sem nenhum plugin instalado.

import { createSignal } from 'solid-js';
import type { AdminExtensionsState } from '@oktis-works/plugin-sdk';
import { apiClient } from '../lib/api';
import { resolvePluginComponentPath } from './slots.js';

export function emptyExtensionsState(): AdminExtensionsState {
  return {
    menuPages: [],
    submenuPages: [],
    dashboardWidgets: [],
    metaBoxes: [],
    notices: [],
    columns: {},
    columnRenderers: {},
    actionLinks: [],
    editors: [],
  };
}

const [extensions, setExtensions] = createSignal<AdminExtensionsState>(emptyExtensionsState());

/** Estado atual (sinal compartilhado entre ilhas). */
export const getExtensions = extensions;

let pending: Promise<void> | null = null;

// ── Item 24: prefetch de chunks de plugin em tempo ocioso ──────────────────
// Depois da carga do estado, os componentes declarados (widgets, metaboxes,
// editores, renderizadores de coluna) são importados em requestIdleCallback —
// o chunk fica quente e o slot renderiza sem flash de loading. Best-effort:
// falha de import é silenciosa (o host da slot trata o erro de novo).
const prefetchedChunks = new Set<string>();

function prefetchPluginChunks(state: AdminExtensionsState): void {
  const schedule =
    typeof window !== 'undefined' && typeof window.requestIdleCallback === 'function'
      ? (cb: () => void) => window.requestIdleCallback(() => cb())
      : (cb: () => void) => setTimeout(cb, 1) as unknown as number;

  const componentIds = [
    ...state.dashboardWidgets.map((widget) => widget.componentId),
    ...state.metaBoxes.map((box) => box.componentId),
    ...state.editors.map((editor) => editor.componentId),
    ...Object.values(state.columnRenderers).flatMap((renderers) => Object.values(renderers)),
  ];

  for (const componentId of componentIds) {
    if (!componentId || prefetchedChunks.has(componentId)) continue;
    prefetchedChunks.add(componentId);
    schedule(() => {
      void import(/* @vite-ignore */ resolvePluginComponentPath(componentId)).catch(() => {
        // prefetch é best-effort — o host da slot reporta o erro se renderizar
      });
    });
  }
}

/**
 * Garante o carregamento (memoizado — uma chamada por página mesmo com
 * várias ilhas). Nunca rejeita: erro vira estado vazio.
 */
export function loadExtensions(): Promise<AdminExtensionsState> {
  if (!pending) {
    pending = apiClient
      .getAdminExtensions()
      .then((state) => {
        setExtensions(state);
        prefetchPluginChunks(state);
      })
      .catch(() => {
        // extensões são opcionais — mantém estado vazio
      });
  }
  return pending.then(() => extensions());
}

/** Reset para testes. */
export function resetExtensionsForTests(): void {
  pending = null;
  prefetchedChunks.clear();
  setExtensions(emptyExtensionsState());
}
