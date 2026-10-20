// @oktis-works/admin - Shared plugin extension state
//
// Single fetch of `GET /api/v1/plugins/extensions` (FEAT-098 / DECI-027)
// shared by every island/slot — sidebar, dashboard widgets, meta boxes,
// columns and action links read the same state and trigger one request.
// Failure = empty state: extensions are optional and the admin works with no
// plugins installed.

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

/** Current state (signal shared between islands). */
export const getExtensions = extensions;

let pending: Promise<void> | null = null;

// ── Item 24: plugin chunk prefetch during idle time ──────────────────
// After the state loads, the declared components (widgets, meta boxes,
// editors, column renderers) are imported in requestIdleCallback — the chunk
// gets warm and the slot renders without a loading flash. Best-effort: an
// import failure is silent (the slot host reports the error again on render).
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
        // prefetch is best-effort — the slot host reports the error on render
      });
    });
  }
}

/**
 * Ensures the load (memoized — one call per page even with several islands).
 * Never rejects: an error becomes the empty state.
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
        // extensions are optional — keep the empty state
      });
  }
  return pending.then(() => extensions());
}

/** Reset for tests. */
export function resetExtensionsForTests(): void {
  pending = null;
  prefetchedChunks.clear();
  setExtensions(emptyExtensionsState());
}
