// @oktis-works/cms - Compiled theme dev watcher
//
// `okcms dev` starts one watcher per React/Solid theme. The watcher rebuilds
// a versioned server artifact plus `dist/theme-build.json` on source changes; the web
// runtime imports the new artifact by `buildId`, so no restart is required.
// Production never watches: `okcms theme:build` / `okcms redeploy` build once.

import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { loadProjectConfig } from './project-config.js';
import { migrateThemeManifests } from './theme-migrate.js';
import { readThemeManifest } from './theme-build.js';

export interface ThemeWatchersOptions {
  cwd?: string;
  log?: (message: string) => void;
}

/**
 * Builds compiled themes once and keeps watching their sources. Returns a
 * stop function that closes every watcher. Template themes are skipped.
 */
export async function startProjectThemeWatchers(
  opts: ThemeWatchersOptions = {}
): Promise<() => void> {
  const cwd = opts.cwd ?? process.cwd();
  const log = opts.log ?? ((message: string) => console.log(message));
  const config = loadProjectConfig(cwd);
  const themesDir = join(cwd, config.themesDir);
  if (!existsSync(themesDir)) return () => {};

  for (const migrated of migrateThemeManifests(themesDir)) {
    log(`[theme:dev] manifest migrated: ${migrated} -> theme.json`);
  }

  const entries = readdirSync(themesDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith('_') && !entry.name.startsWith('.'))
    .map((entry) => entry.name)
    .sort();

  const stops: Array<() => void> = [];
  const { watchTheme } = await import('@oktis-works/theme-builder');

  for (const name of entries) {
    const manifest = readThemeManifest(join(themesDir, name, 'theme.json'));
    const engine = manifest?.render?.engine;
    if (engine !== 'react' && engine !== 'solid') continue;

    log(`[theme:dev] watching ${name} (${engine})`);
    const stop = await watchTheme(
      { themesRoot: themesDir, themeName: name },
      (event) => {
        if (event.type === 'error') {
          log(`[theme:dev] ${name} build failed: ${event.error?.message ?? 'unknown error'}`);
          return;
        }
        const result = event.result;
        if (!result) return;
        log(
          `[theme:dev] ${name} rebuilt (${result.engine}, buildId ${result.buildId ?? 'n/a'}, templates=${result.templates.join(',')})`
        );
      }
    );
    stops.push(stop);
  }

  return () => {
    for (const stop of stops) stop();
  };
}
