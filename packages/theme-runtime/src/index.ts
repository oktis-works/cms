// @oktis-works/theme-runtime - Main Entry Point

export { ThemeRenderer } from './renderer.js';
export { ThemeResolver } from './resolver.js';
export type { ResolvedComponent } from './resolver.js';
export {
  TemplateHierarchyResolver,
  buildTemplateChain,
} from './template-resolver.js';
export type { TemplateContext, ResolvedTemplate, TemplateFileChecker } from './template-resolver.js';
export { ThemeLoader } from './loader.js';
export { prerenderStatic, routeToOutputFile, type PrerenderRoute, type PrerenderResult } from './prerender.js';
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
