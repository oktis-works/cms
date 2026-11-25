// @oktis-works/theme-builder - Artifact helpers

import { renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { computeThemeBuildId } from '@oktis-works/theme-runtime';
import type { ThemeBuildManifest } from '@oktis-works/theme-runtime';
import type { ThemeManifest, ThemeRenderEngine } from '@oktis-works/theme-sdk';

export { THEME_BUILDER_VERSION } from '@oktis-works/theme-runtime';

/** Stable content hash of the theme sources + render config + builder version. */
export const computeBuildId = computeThemeBuildId;

/** Writes `dist/theme-build.json` atomically (temp file + rename). */
export function writeThemeBuild(themeDir: string, build: ThemeBuildManifest): void {
  const target = join(themeDir, 'dist', 'theme-build.json');
  const temp = `${target}.tmp`;
  writeFileSync(temp, `${JSON.stringify(build, null, 2)}\n`, 'utf-8');
  renameSync(temp, target);
}

export function engineOf(manifest: ThemeManifest): ThemeRenderEngine {
  const engine = manifest.render?.engine;
  return engine === 'react' || engine === 'solid' ? engine : 'template';
}
