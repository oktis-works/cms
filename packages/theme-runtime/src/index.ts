// @oktis-works/theme-runtime - Main Entry Point

export { ThemeRenderer } from './renderer.js';
export { ThemeResolver } from './resolver.js';
export type { ResolvedComponent } from './resolver.js';
export {
  TemplateHierarchyResolver,
  buildTemplateChain,
  buildTemplateKeyChain,
  templateKeyFromFile,
  createProjectTemplateResolver,
  resolveProjectThemeChain,
} from './template-resolver.js';
export type {
  TemplateContext,
  ResolvedTemplate,
  TemplateFileChecker,
  ProjectTemplateResolver,
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
