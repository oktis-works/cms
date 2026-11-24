// @oktis-works/theme-runtime - Compiled theme artifacts (React/Solid)
//
// A compiled theme is discovered exclusively through `dist/theme-build.json`.
// The runtime never knows which framework produced the server bundle: it
// imports the artifact, calls `render(templateKey, data, ctx)` and validates
// the returned shape. Framework code stays in the theme build.

import { existsSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { isAbsolute, join, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import type {
  ThemePageData,
  ThemeRenderContext,
  ThemeRenderEngine,
  ThemeRenderOutput,
  ThemeServerModule,
} from '@oktis-works/theme-sdk';
import { runWithCurrentContent } from '@oktis-works/theme-sdk';

export const THEME_BUILD_SCHEMA_VERSION = 1;

export interface ThemeBuildManifest {
  schemaVersion: number;
  engine: ThemeRenderEngine;
  apiVersion: number;
  buildId: string;
  entry: string;
  templates: string[];
  client: Record<string, string>;
  styles: string[];
  hydration: 'none' | 'islands';
}

const VALID_ENGINES: readonly ThemeRenderEngine[] = ['template', 'react', 'solid'];

/** Resolves a theme-relative path, rejecting anything that escapes the theme. */
export function safeThemePath(themeDir: string, relativePath: string): string | null {
  if (!relativePath || typeof relativePath !== 'string') return null;
  if (relativePath.includes('..') || relativePath.includes('\\') || relativePath.includes('://')) return null;
  if (isAbsolute(relativePath) || relativePath.startsWith('/') || relativePath.startsWith('~')) return null;

  const root = resolve(themeDir);
  const target = resolve(root, relativePath);
  if (target !== root && !target.startsWith(root + sep)) return null;
  return target;
}

/** Reads `dist/theme-build.json`; returns null when absent or invalid JSON. */
export function readThemeBuild(themeDir: string): ThemeBuildManifest | null {
  const file = join(themeDir, 'dist', 'theme-build.json');
  if (!existsSync(file)) return null;
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf-8')) as Partial<ThemeBuildManifest>;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    return parsed as ThemeBuildManifest;
  } catch {
    return null;
  }
}

/** Structural + filesystem validation for an artifact. */
export function validateThemeBuild(
  themeDir: string,
  build: ThemeBuildManifest,
  expectedEngine?: ThemeRenderEngine
): string[] {
  const issues: string[] = [];

  if (build.schemaVersion !== THEME_BUILD_SCHEMA_VERSION) {
    issues.push(`unsupported theme build schemaVersion: ${String(build.schemaVersion)}`);
  }
  if (!VALID_ENGINES.includes(build.engine)) {
    issues.push(`invalid theme build engine: ${String(build.engine)}`);
  }
  if (expectedEngine && build.engine !== expectedEngine) {
    issues.push(`theme build engine "${build.engine}" does not match theme.json engine "${expectedEngine}"`);
  }
  if (build.apiVersion !== 1) {
    issues.push(`unsupported theme build apiVersion: ${String(build.apiVersion)}`);
  }
  if (build.hydration !== 'none' && build.hydration !== 'islands') {
    issues.push(`invalid theme build hydration: ${String(build.hydration)}`);
  }
  if (typeof build.buildId !== 'string' || build.buildId.length === 0) {
    issues.push('theme build is missing buildId');
  }
  if (!Array.isArray(build.templates) || build.templates.some((key) => typeof key !== 'string' || !key)) {
    issues.push('theme build templates must be a non-empty string array');
  } else if (new Set(build.templates).size !== build.templates.length) {
    issues.push('theme build templates contains duplicates');
  }
  if (!Array.isArray(build.styles) || build.styles.some((style) => typeof style !== 'string')) {
    issues.push('theme build styles must be a string array');
  }
  if (!build.client || typeof build.client !== 'object' || Array.isArray(build.client)) {
    issues.push('theme build client must be an object');
  }

  const entry = safeThemePath(themeDir, build.entry);
  if (!entry) {
    issues.push('theme build entry escapes the theme directory');
  } else if (!existsSync(entry) || !statSync(entry).isFile()) {
    issues.push(`theme build entry does not exist: ${build.entry}`);
  } else {
    const root = realpathSync(resolve(themeDir));
    const realEntry = realpathSync(entry);
    if (realEntry !== root && !realEntry.startsWith(root + sep)) {
      issues.push('theme build entry resolves outside the theme directory');
    }
  }

  for (const style of Array.isArray(build.styles) ? build.styles : []) {
    if (!safeThemePath(themeDir, style)) {
      issues.push(`theme build style escapes the theme directory: ${style}`);
    }
  }
  const clientAssets =
    build.client && typeof build.client === 'object' && !Array.isArray(build.client)
      ? Object.values(build.client)
      : [];
  for (const client of clientAssets) {
    if (typeof client === 'string' && !safeThemePath(themeDir, client)) {
      issues.push(`theme build client asset escapes the theme directory: ${client}`);
    }
  }

  return issues;
}

const moduleCache = new Map<string, ThemeServerModule>();

/** Clears the compiled module cache (tests and hot activation). */
export function clearCompiledThemeCache(): void {
  moduleCache.clear();
}

/**
 * Imports the server entry once per theme + buildId. The query string busts
 * Node's ESM cache when a theme is rebuilt in place.
 */
export async function importCompiledTheme(
  themeDir: string,
  build: ThemeBuildManifest
): Promise<ThemeServerModule> {
  const entry = safeThemePath(themeDir, build.entry);
  if (!entry) {
    throw new Error(`Theme build entry escapes the theme directory: ${build.entry}`);
  }
  const cacheKey = `${realpathSync(resolve(themeDir))}::${build.buildId}`;
  const cached = moduleCache.get(cacheKey);
  if (cached) return cached;

  const module = (await import(`${pathToFileURL(entry).href}?v=${encodeURIComponent(build.buildId)}`)) as Partial<ThemeServerModule>;
  if (typeof module.render !== 'function') {
    throw new Error(`Theme server entry does not export render(): ${build.entry}`);
  }
  moduleCache.set(cacheKey, module as ThemeServerModule);
  return module as ThemeServerModule;
}

function safeAssetList(values: unknown, field: string): string[] {
  if (values === undefined) return [];
  if (!Array.isArray(values) || values.some((value) => typeof value !== 'string')) {
    throw new Error(`Theme render output ${field} must be a string array`);
  }
  for (const value of values) {
    if (
      value.includes('..') ||
      value.includes('\\') ||
      value.includes('://') ||
      value.startsWith('/') ||
      value.startsWith('~')
    ) {
      throw new Error(`Theme render output ${field} contains an unsafe path: ${value}`);
    }
  }
  return values as string[];
}

export interface RenderCompiledThemeInput {
  themeDir: string;
  build: ThemeBuildManifest;
  templateKey: string;
  data: ThemePageData;
  record: Record<string, unknown>;
  context: ThemeRenderContext;
}

/**
 * Renders a compiled theme inside the current-content context so
 * `getField()`/`getFields()` keep working without props.
 */
export async function renderCompiledTheme(input: RenderCompiledThemeInput): Promise<ThemeRenderOutput> {
  const module = await importCompiledTheme(input.themeDir, input.build);
  const output = await runWithCurrentContent(input.record ?? {}, () =>
    module.render(input.templateKey, input.data, input.context)
  );

  if (!output || typeof output !== 'object' || typeof output.html !== 'string') {
    throw new Error(`Theme render() must return { html: string } (template: ${input.templateKey})`);
  }

  return {
    html: output.html,
    ...(typeof output.head === 'string' ? { head: output.head } : {}),
    styles: safeAssetList(output.styles, 'styles'),
    scripts: safeAssetList(output.scripts, 'scripts'),
  };
}
