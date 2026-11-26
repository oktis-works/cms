// @oktis-works/theme-runtime - Main Entry Point

export {
  ThemeTemplateResolver,
  buildTemplateChain,
  buildTemplateKeyChain,
  templateKeyFromFile,
  resolveProjectThemeChain,
} from './template-resolver.js';
export type {
  TemplateContext,
  ResolvedTemplate,
  ThemeKeyChecker,
} from './template-resolver.js';
export {
  THEME_BUILD_SCHEMA_VERSION,
  safeThemePath,
  readThemeBuild,
  validateThemeBuild,
  clearCompiledThemeCache,
  importCompiledTheme,
  renderCompiledTheme,
} from './compiled.js';
export type { ThemeBuildManifest, RenderCompiledThemeInput } from './compiled.js';
export { THEME_BUILDER_VERSION, computeThemeBuildId } from './build-id.js';
export {
  loadThemeCatalog,
  readThemeManifest,
  themeEngineOf,
  themeSupportsKey,
  findTemplateProvider,
  activeCatalogEntry,
} from './catalog.js';
export type { ThemeCatalog, ThemeCatalogEntry } from './catalog.js';
export { ThemeLoader } from './loader.js';
export type { DiscoveredTheme } from './loader.js';
export {
  RuntimeRouter,
  targetedRevalidate,
} from './routing.js';
export type {
  RouteResolution,
  ContentLookup,
  EventEmitLike,
} from './routing.js';
export {
  buildThemeStyles,
  compileScss,
  compileTailwind,
  resolveStyleEngine,
  scopeCss,
  validateStyleManifest,
  getThemeScopeAttribute,
} from './style-engine.js';
export type { ThemeStyleReport, StyleEngineOptions } from './style-engine.js';
