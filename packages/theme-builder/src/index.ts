// @oktis-works/theme-builder - Builds compiled React/Solid themes
//
// The output is a self-contained server bundle plus `dist/theme-build.json`.
// Framework code is bundled into the artifact; @oktis-works/theme-runtime does
// not depend on React or Solid.

import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { join, relative, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { PluginOption } from 'vite';
import {
  buildThemeStyles,
  scopeCss,
  validateThemeBuild,
  type ThemeBuildManifest,
  type ThemeStyleReport,
} from '@oktis-works/theme-runtime';
import type { ThemeManifest, ThemeRenderEngine } from '@oktis-works/theme-sdk';
import { validateThemeManifestRender } from '@oktis-works/theme-sdk';
import { computeBuildId, engineOf, writeThemeBuild } from './artifact.js';

export { THEME_BUILDER_VERSION, computeBuildId, writeThemeBuild, engineOf } from './artifact.js';

export interface BuildThemeOptions {
  themesRoot: string;
  themeName: string;
  manifest?: ThemeManifest;
  /** `all` also compiles styles; `js` only builds the server artifact. */
  mode?: 'all' | 'js';
}

export interface ThemeBuildResult {
  theme: string;
  engine: ThemeRenderEngine;
  themeDir: string;
  buildId: string | null;
  templates: string[];
  entry: string | null;
  styles: string[];
  styleReport?: ThemeStyleReport;
  warnings: string[];
}

function readManifest(themeDir: string): ThemeManifest {
  const file = join(themeDir, 'theme.json');
  if (!existsSync(file)) throw new Error(`Theme manifest not found: ${file}`);
  const manifest = JSON.parse(readFileSync(file, 'utf-8')) as ThemeManifest;
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
    throw new Error(`Invalid theme manifest: ${file}`);
  }
  return manifest;
}

function assertInside(themeDir: string, file: string): string {
  const root = resolve(themeDir);
  const target = resolve(root, file);
  if (target !== root && !target.startsWith(root + sep)) {
    throw new Error(`Path escapes the theme directory: ${file}`);
  }
  return target;
}

function listCss(dir: string, acc: string[] = []): string[] {
  if (!existsSync(dir)) return acc;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) listCss(full, acc);
    else if (entry.isFile() && entry.name.endsWith('.css')) acc.push(full);
  }
  return acc;
}

/**
 * Themes may live outside the project (or in /tmp during tests). Vite resolves
 * bare imports from the theme root, so provide the builder's own framework
 * copies as an explicit fallback. A theme-local node_modules still wins when
 * the alias is absent.
 */
function frameworkAliases(
  engine: Exclude<ThemeRenderEngine, 'template'>
): Array<{ find: RegExp; replacement: string }> {
  const require = createRequire(import.meta.url);
  const ids =
    engine === 'react'
      ? ['react', 'react/jsx-runtime', 'react/jsx-dev-runtime', 'react-dom', 'react-dom/server', 'react-dom/client']
      : ['solid-js', 'solid-js/web', 'solid-js/store', 'solid-js/html'];
  const aliases: Array<{ find: RegExp; replacement: string }> = [];
  for (const id of ids) {
    try {
      aliases.push({ find: new RegExp(`^${id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`), replacement: require.resolve(id) });
    } catch {
      // Optional peer not installed in this environment; leave it unresolved.
    }
  }
  return aliases;
}

/**
 * `@vitejs/plugin-react` reads NODE_ENV directly to choose jsx-runtime vs
 * jsx-dev-runtime. Builds may run under NODE_ENV=test (Vitest) and must still
 * emit production JSX, so scope the override to the build call.
 */
async function withProductionEnv<T>(fn: () => Promise<T>): Promise<T> {
  const previous = process.env['NODE_ENV'];
  process.env['NODE_ENV'] = 'production';
  try {
    return await fn();
  } finally {
    if (previous === undefined) delete process.env['NODE_ENV'];
    else process.env['NODE_ENV'] = previous;
  }
}

async function loadFrameworkPlugins(
  engine: Exclude<ThemeRenderEngine, 'template'>
): Promise<PluginOption[]> {
  if (engine === 'react') {
    const { default: react } = await import('@vitejs/plugin-react');
    return [react()];
  }
  const { default: solid } = await import('vite-plugin-solid');
  return [solid({ ssr: true })];
}

async function buildClientBundle(
  themeDir: string,
  engine: Exclude<ThemeRenderEngine, 'template'>,
  entry: string,
  outputDir: string
): Promise<void> {
  const { build } = await import('vite');
  const plugins = await loadFrameworkPlugins(engine);
  await withProductionEnv(() =>
    build({
      configFile: false,
      mode: 'production',
      root: themeDir,
      logLevel: 'warn',
      plugins,
      resolve: { alias: frameworkAliases(engine) },
      build: {
        outDir: outputDir,
        emptyOutDir: true,
        target: 'node22',
        minify: true,
        rollupOptions: {
          input: entry,
          output: {
            format: 'es',
            entryFileNames: 'entry.js',
            assetFileNames: 'assets/[name][extname]',
          },
        },
      },
      define: { 'process.env.NODE_ENV': '"production"' },
    })
  );
}

async function buildServerBundle(
  themeDir: string,
  engine: Exclude<ThemeRenderEngine, 'template'>,
  entry: string,
  outputDir: string
): Promise<void> {
  const { build } = await import('vite');
  const plugins = await loadFrameworkPlugins(engine);

  await withProductionEnv(() =>
    build({
      configFile: false,
      mode: 'production',
      root: themeDir,
      logLevel: 'warn',
      plugins,
      resolve: { alias: frameworkAliases(engine) },
      build: {
        ssr: entry,
        outDir: outputDir,
        emptyOutDir: true,
        target: 'node22',
        minify: false,
        sourcemap: false,
        cssCodeSplit: false,
        rollupOptions: {
          output: {
            format: 'esm',
            entryFileNames: 'entry.js',
          },
        },
      },
      ssr: { noExternal: true },
      define: { 'process.env.NODE_ENV': '"production"' },
    })
  );
}

async function readTemplateKeys(entryFile: string): Promise<string[]> {
  const module = (await import(`${pathToFileURL(entryFile).href}?t=${Date.now()}`)) as {
    templateKeys?: unknown;
  };
  if (!Array.isArray(module.templateKeys) || module.templateKeys.length === 0) {
    throw new Error(
      'The compiled theme entry must export `templateKeys: string[]` (one key per template).'
    );
  }
  const keys = module.templateKeys.filter((key): key is string => typeof key === 'string' && key.length > 0);
  if (keys.length !== module.templateKeys.length) {
    throw new Error('The compiled theme `templateKeys` export must contain only non-empty strings.');
  }
  return keys;
}

/**
 * Builds a theme on the host.
 *
 * - template themes: styles only (legacy behavior, no artifact);
 * - react/solid themes: styles (unless mode `js`) + Vite SSR bundle + artifact.
 */
export async function buildTheme(opts: BuildThemeOptions): Promise<ThemeBuildResult> {
  const themeName = opts.themeName;
  if (!/^[A-Za-z0-9_-]+$/.test(themeName)) {
    throw new Error(`Invalid theme name: "${themeName}"`);
  }

  const themeDir = resolve(opts.themesRoot, themeName);
  if (!themeDir.startsWith(resolve(opts.themesRoot) + sep)) {
    throw new Error(`Theme path escapes themes root: ${themeName}`);
  }
  if (!existsSync(themeDir)) throw new Error(`Theme not found: ${themeName}`);

  const manifest = opts.manifest ?? readManifest(themeDir);
  const engine = engineOf(manifest);
  const warnings: string[] = [];

  const manifestIssues = validateThemeManifestRender(manifest);
  if (manifestIssues.length > 0) {
    throw new Error(`Invalid theme manifest: ${manifestIssues.join('; ')}`);
  }

  let styleReport: ThemeStyleReport | undefined;

  const buildId = engine === 'template' ? null : computeBuildId(themeDir, manifest);
  const generation = buildId ? buildId.replace(/[^A-Za-z0-9_-]/g, '_') : null;
  const generationRoot = generation ? join(themeDir, 'dist', '.versions', generation) : null;
  const stagingRoot = generation
    ? join(themeDir, 'dist', `.staging-${generation}-${randomUUID()}`)
    : null;
  if (stagingRoot) mkdirSync(stagingRoot, { recursive: true });
  const discardStaging = (): void => {
    if (stagingRoot) rmSync(stagingRoot, { recursive: true, force: true });
  };

  if (opts.mode !== 'js') {
    let css: string;
    let report: ThemeStyleReport;
    try {
      ({ css, report } = await buildThemeStyles({
        themesRoot: resolve(opts.themesRoot),
        themeName,
        manifest,
      }));
    } catch (error) {
      discardStaging();
      throw error;
    }
    styleReport = report;
    warnings.push(...report.warnings);

    if (report.entry) {
      const output = stagingRoot
        ? join(stagingRoot, 'theme.css')
        : assertInside(themeDir, report.output);
      mkdirSync(resolve(output, '..'), { recursive: true });
      writeFileSync(output, css, 'utf-8');
    } else if (report.engine !== 'css') {
      discardStaging();
      throw new Error(`No style entry found for ${report.engine} theme "${themeName}"`);
    }
  }

  if (engine === 'template') {
    return {
      theme: themeName,
      engine,
      themeDir,
      buildId: null,
      templates: [],
      entry: null,
      styles: [],
      ...(styleReport ? { styleReport } : {}),
      warnings,
    };
  }

  const entrySource = manifest.render?.entry ?? 'src/entry-server.tsx';
  const entryPath = assertInside(themeDir, entrySource);
  if (!existsSync(entryPath)) {
    discardStaging();
    throw new Error(`Compiled theme entry not found: ${entrySource}`);
  }

  const serverOutput = join(stagingRoot!, 'server');
  try {
    await buildServerBundle(themeDir, engine, entryPath, serverOutput);
  } catch (error) {
    discardStaging();
    throw error;
  }

  const serverDir = serverOutput;
  const entryFile = join(serverDir, 'entry.js');
  if (!existsSync(entryFile)) {
    discardStaging();
    throw new Error(`Vite did not emit dist/server/entry.js for theme "${themeName}"`);
  }

  let templates: string[];
  try {
    templates = await readTemplateKeys(entryFile);
  } catch (error) {
    discardStaging();
    throw error;
  }
  const styles: string[] = [];
  if (stagingRoot && existsSync(join(stagingRoot, 'theme.css'))) {
    styles.push(`dist/.versions/${generation}/theme.css`);
  }

  // CSS imported by components is emitted by Vite; scope it with the same
  // [data-theme] contract and expose it as an extra stylesheet.
  const emittedCss = listCss(serverDir);
  if (emittedCss.length > 0) {
    const css = emittedCss
      .map((file) => readFileSync(file, 'utf-8'))
      .join('\n');
    const componentsCss = scopeCss(css, themeName);
    writeFileSync(join(stagingRoot!, 'theme-components.css'), componentsCss, 'utf-8');
    styles.push(`dist/.versions/${generation}/theme-components.css`);
    for (const file of emittedCss) rmSync(file, { force: true });
  }

  const hydration = manifest.render?.hydration === 'islands' ? 'islands' : 'none';
  const client: Record<string, string> = {};

  if (hydration === 'islands') {
    const clientEntrySource = 'src/entry-client.tsx';
    const clientEntryPath = assertInside(themeDir, clientEntrySource);
    if (!existsSync(clientEntryPath)) {
      discardStaging();
      throw new Error(
        `hydration="islands" requires ${clientEntrySource} (client entry that hydrates the page)`
      );
    }
    try {
      await buildClientBundle(themeDir, engine, clientEntryPath, join(stagingRoot!, 'client'));
    } catch (error) {
      discardStaging();
      throw error;
    }
    client['main'] = `dist/.versions/${generation}/client/entry.js`;
  }

  const build: ThemeBuildManifest = {
    schemaVersion: 1,
    engine,
    apiVersion: 1,
    buildId: buildId!,
    builtAt: new Date().toISOString(),
    entry: `dist/.versions/${generation}/server/entry.js`,
    templates,
    client,
    styles,
    hydration,
  };

  // Validate the complete staged set before making it visible to requests.
  // The staged paths are deliberately different from the published paths so
  // a failed build cannot replace the last valid artifact manifest.
  const stagedBuild: ThemeBuildManifest = {
    ...build,
    entry: `dist/${relative(join(themeDir, 'dist'), stagingRoot!)}/server/entry.js`,
    styles: build.styles.map((style) => style.replace(`dist/.versions/${generation}`, `dist/${relative(join(themeDir, 'dist'), stagingRoot!)}`)),
    client: Object.fromEntries(Object.entries(build.client).map(([key, asset]) => [
      key,
      asset.replace(`dist/.versions/${generation}`, `dist/${relative(join(themeDir, 'dist'), stagingRoot!)}`),
    ])),
  };
  const stagedIssues = validateThemeBuild(themeDir, stagedBuild, engine);
  if (stagedIssues.length > 0) {
    rmSync(stagingRoot!, { recursive: true, force: true });
    throw new Error(`Compiled theme staging validation failed: ${stagedIssues.join('; ')}`);
  }

  mkdirSync(join(themeDir, 'dist', '.versions'), { recursive: true });
  if (!existsSync(generationRoot!)) {
    try {
      renameSync(stagingRoot!, generationRoot!);
    } catch (error) {
      if (!existsSync(generationRoot!)) throw error;
      rmSync(stagingRoot!, { recursive: true, force: true });
    }
  } else {
    rmSync(stagingRoot!, { recursive: true, force: true });
  }

  mkdirSync(join(themeDir, 'dist'), { recursive: true });
  writeThemeBuild(themeDir, build);
  cleanupPublishedGenerations(join(themeDir, 'dist', '.versions'), generation!);

  return {
    theme: themeName,
    engine,
    themeDir,
    buildId: build.buildId,
    templates,
    entry: build.entry,
    styles,
    ...(styleReport ? { styleReport } : {}),
    warnings,
  };
}

/** Retain the current and immediately previous valid generation for rollback. */
function cleanupPublishedGenerations(versionsDir: string, current: string): void {
  if (!existsSync(versionsDir)) return;
  const generations = readdirSync(versionsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name !== current && !entry.name.startsWith('.staging-'))
    .sort((a, b) => statSync(join(versionsDir, b.name)).mtimeMs - statSync(join(versionsDir, a.name)).mtimeMs);
  for (const entry of generations.slice(1)) {
    rmSync(join(versionsDir, entry.name), { recursive: true, force: true });
  }
}

export interface WatchThemeOptions extends BuildThemeOptions {
  /** Debounce between a source change and the rebuild. Default 150ms. */
  debounceMs?: number;
  /** Source polling interval. Default 400ms (portable across Bun/Node). */
  pollMs?: number;
}

export interface ThemeWatchEvent {
  type: 'build' | 'error';
  result?: ThemeBuildResult;
  error?: Error;
}

/**
 * Fingerprint of the editable theme sources (dist and node_modules excluded)
 * so a rebuild never triggers itself.
 */
function sourceSnapshot(themeDir: string): string {
  const parts: string[] = [];
  const walk = (dir: string, rel: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === 'dist' || entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
      const full = join(dir, entry.name);
      const nextRel = rel ? `${rel}/${entry.name}` : entry.name;
      if (entry.isDirectory()) walk(full, nextRel);
      else if (entry.isFile()) {
        const stat = statSync(full);
        parts.push(`${nextRel}:${stat.size}:${stat.mtimeMs}`);
      }
    }
  };
  walk(themeDir, '');
  return parts.join('\n');
}

/**
 * Development watcher for compiled themes: rebuilds the SSR artifact (and
 * styles when `mode: 'all'`) whenever a source file changes. The web runtime
 * imports the new artifact by `buildId` on the next request, so no restart is
 * needed. Production keeps using a single `buildTheme` run.
 */
export async function watchTheme(
  opts: WatchThemeOptions,
  onChange: (event: ThemeWatchEvent) => void = () => {}
): Promise<() => void> {
  const themeDir = resolve(opts.themesRoot, opts.themeName);
  let building = false;
  let pending = false;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const run = async (): Promise<ThemeWatchEvent> => {
    try {
      const result = await buildTheme(opts);
      const event: ThemeWatchEvent = { type: 'build', result };
      onChange(event);
      return event;
    } catch (error) {
      const event: ThemeWatchEvent = { type: 'error', error: error instanceof Error ? error : new Error(String(error)) };
      onChange(event);
      return event;
    }
  };

  const initialEvent = await run();
  if (initialEvent.type === 'error' && process.env['OKCMS_THEME_DIAGNOSTIC_MODE'] !== '1') {
    throw initialEvent.error ?? new Error(`Initial build failed for theme "${opts.themeName}"`);
  }

  let snapshot: string;
  try {
    snapshot = sourceSnapshot(themeDir);
  } catch {
    snapshot = '';
  }

  const rebuild = (): void => {
    if (building) {
      pending = true;
      return;
    }
    building = true;
    void run().finally(() => {
      building = false;
      try {
        snapshot = sourceSnapshot(themeDir);
      } catch {
        // The theme may have been removed; the next poll reports the next error.
      }
      if (pending) {
        pending = false;
        rebuild();
      }
    });
  };

  const poll = setInterval(() => {
    let next: string;
    try {
      next = sourceSnapshot(themeDir);
    } catch {
      return;
    }
    if (next === snapshot) return;
    snapshot = next;
    if (timer) clearTimeout(timer);
    timer = setTimeout(rebuild, opts.debounceMs ?? 150);
  }, opts.pollMs ?? 400);
  poll.unref?.();

  return () => {
    clearInterval(poll);
    if (timer) clearTimeout(timer);
  };
}

/** Compares the stored artifact buildId with the current sources. */
export function verifyThemeBuild(themeDir: string, manifest?: ThemeManifest): { ok: boolean; expected?: string; actual?: string } {
  const file = join(themeDir, 'dist', 'theme-build.json');
  if (!existsSync(file)) return { ok: false };
  const actual = (JSON.parse(readFileSync(file, 'utf-8')) as ThemeBuildManifest).buildId;
  const loaded = manifest ?? readManifest(themeDir);
  const expected = computeBuildId(themeDir, loaded);
  return { ok: actual === expected, expected, actual };
}

/** Lists files under a theme (diagnostics/tests). */
export function listThemeFiles(themeDir: string): string[] {
  const out: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile() && statSync(full).size >= 0) out.push(relative(themeDir, full));
    }
  };
  if (existsSync(themeDir)) walk(themeDir);
  return out;
}
