// @oktis-works/theme-sdk - Hydration payload contract
//
// The web runtime serializes the SSR data into a non-executable JSON script.
// A theme's `src/entry-client.tsx` reads it and hydrates the matching root.
// Keeping the id/parser here means React and Solid themes share one contract.

import type { ThemePageData, ThemeRenderContext } from './types.js';

export const THEME_HYDRATION_ELEMENT_ID = 'okcms-theme-hydration';

export interface ThemeHydrationPayload {
  buildId: string;
  templateKey: string;
  data: ThemePageData;
  context?: ThemeRenderContext;
}

type HydrationDocument = {
  getElementById(id: string): { textContent: string | null } | null;
};

/** Browser/client helper: returns null outside a hydrated document. */
export function readThemeHydrationPayload(
  doc?: HydrationDocument
): ThemeHydrationPayload | null {
  const target =
    doc ?? (globalThis as { document?: HydrationDocument }).document;
  if (!target) return null;
  const element = target.getElementById(THEME_HYDRATION_ELEMENT_ID);
  if (!element?.textContent) return null;
  try {
    const parsed = JSON.parse(element.textContent) as Partial<ThemeHydrationPayload>;
    if (
      !parsed ||
      typeof parsed !== 'object' ||
      typeof parsed.buildId !== 'string' ||
      typeof parsed.templateKey !== 'string' ||
      !parsed.data ||
      typeof parsed.data !== 'object'
    ) {
      return null;
    }
    return parsed as ThemeHydrationPayload;
  } catch {
    return null;
  }
}
