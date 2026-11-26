// @oktis-works/theme-sdk - Main Entry Point

export type {
  ThemeManifest,
  StyleEngine,
  ThemeStyleConfig,
  ThemeRenderEngine,
  ThemeRenderConfig,
  ThemePageData,
  ThemeRenderContext,
  ThemeRenderOutput,
  ThemeServerModule,
} from "./types.js";

export {
  THEME_SDK_API_VERSION,
  createEmptyThemeSdkBridge,
} from './bridge.js';
export type {
  ThemeJsonPrimitive,
  ThemeJsonValue,
  ThemeValue,
  ThemeSdkContext,
  ThemeHookInput,
  ThemeActionResult,
  ThemePluginBlock,
  ThemePluginPattern,
  ThemePluginAsset,
  ThemeSdkBridge,
} from './bridge.js';

export {
  validateThemeRenderConfig,
  validateThemeManifestRender,
  isSafeThemeRenderEntry,
} from './manifest.js';

export {
  THEME_HYDRATION_ELEMENT_ID,
  readThemeHydrationPayload,
} from './hydrate.js';
export type { ThemeHydrationPayload } from './hydrate.js';

export type {
  ThemeMenuItem,
  ThemeMenu,
  ThemeContentType,
  ThemeTaxonomy,
  ThemeTerm,
  ThemeContentRecord,
  ThemeContentQuery,
  ThemeContentResult,
  ThemeDataProvider,
  ThemeRenderData,
  ThemeContentOrderBy,
  ThemeContentOrder,
} from './contracts.js';
export type {
  ThemeField,
  FlexibleRow,
  FieldTypeCatalogEntry,
} from './contracts.js';
