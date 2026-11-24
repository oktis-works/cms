// @oktis-works/theme-sdk - Theme manifest validation (render contract)
//
// The canonical implementation lives in @oktis-works/validation so core and
// the CLI can use it without depending on the theme SDK. This module is the
// public re-export for theme authors and runtime consumers.

export {
  validateThemeRenderConfig,
  validateThemeManifestRender,
  isSafeThemeRenderEntry,
} from '@oktis-works/validation';

export type {
  ThemeRenderEngine,
  ThemeRenderConfigLike,
  ThemeRenderManifestLike,
} from '@oktis-works/validation';
