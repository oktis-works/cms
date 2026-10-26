// @oktis-works/cms - Default theme embedded in the CLI
//
// `okcms init` must write a `themes/default/` identical to the monorepo's
// `themes/default/`. The published package cannot read that directory at
// runtime (it ships only `dist/`), so the files travel as strings:
//
//   * preferred source — the REAL directory copied into `dist/themes/default`
//     by `scripts/copy-theme-assets.mjs` (see `getThemeAssetDir` in
//     `scaffold.ts`), used whenever it resolves;
//   * generated fallback — `src/generated/theme-assets.ts`, produced from the
//     same directory by `scripts/generate-theme-assets.mjs`.
//
// Both are derived from `themes/default/`, which is the single source of
// truth: editing the theme and running `bun run build` keeps them in step,
// and `theme-assets.test.ts` fails if the generated copy drifts.
//
// The renderer supports: {{var}} / {{{raw}}} / {{#if x}} / {{#each path}} —
// templates are written within that syntax.

export {
  DEFAULT_THEME_FILES,
  DEFAULT_THEME_BINARY_FILES,
  DEFAULT_THEME_MANIFEST,
  DEFAULT_THEME_CSS,
  THEME_TEMPLATE_FILES,
} from './generated/theme-assets.js';

import { DEFAULT_THEME_BINARY_FILES } from './generated/theme-assets.js';

/**
 * True when a theme asset must be written as raw bytes (PNG and friends).
 *
 * Classification lives in the generated binary map — the generator decides
 * once, from `themes/default/`, so the disk copy and the embedded fallback
 * always write the same file the same way.
 */
export function isBinaryThemeAsset(relativePath: string): boolean {
  return Object.prototype.hasOwnProperty.call(DEFAULT_THEME_BINARY_FILES, relativePath);
}
