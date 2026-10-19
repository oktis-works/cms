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
  setExtensions(emptyExtensionsState());
}
