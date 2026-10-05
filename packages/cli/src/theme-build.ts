// @oktis-works/cms - Build de estilo de tema (compartilhado por theme:build e redeploy)
//
// `themes/<n>/dist/theme.css` é lido PRONTO pelo web (`/themes/<tema>/dist/
// theme.css`) — ninguém compila SCSS/Tailwind dentro do container. Então o
// build roda no host, e o artefato só chega na imagem no rebuild. É exatamente
// isso que o `okcms redeploy` orquestra; este módulo é a parte "compilar um
// tema", usada pelo comando avulso e pelo redeploy, para não existirem dois
// caminhos ligeiramente diferentes do mesmo pipeline.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join } from 'node:path';

import { buildThemeStyles, resolveStyleEngine } from '@oktis-works/theme-runtime';

/** Manifesto cru: quem valida de verdade é o theme-runtime. */
export function readThemeManifest(path: string): any | null {
  if (!existsSync(path)) return null;
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf-8'));
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * `theme.json` é o canônico (ThemeLoader); `manifest.json` é aceito como
 * fallback para temas antigos que nasceram com esse nome.
 */
export function themeManifestPath(themesDir: string, theme: string): string | null {
  for (const file of ['theme.json', 'manifest.json']) {
    const path = join(themesDir, theme, file);
    if (existsSync(path)) return path;
  }
  return null;
}

export interface ThemeStyleResolution {
  manifestPath: string;
  manifest: any;
  report: ReturnType<typeof resolveStyleEngine>;
}

/**
 * Lê o manifesto (qualquer um dos dois nomes) e resolve engine/entrada/saída.
 * `null` = arquivo ausente ou JSON inválido.
 */
export function resolveThemeStyle(themesDir: string, theme: string): ThemeStyleResolution | null {
  const manifestPath = themeManifestPath(themesDir, theme);
  if (!manifestPath) return null;
  const manifest = readThemeManifest(manifestPath);
  if (!manifest) return null;
  return {
    manifestPath,
    manifest,
    report: resolveStyleEngine({ themesRoot: themesDir, themeName: theme, manifest }),
  };
}

export interface ThemeBuildOutcome {
  theme: string;
  engine: string;
  output: string;
  bytes: number;
  isolated: boolean;
  entry: string | null;
  warnings: string[];
}

/**
 * Compila o tema e grava `dist/theme.css`.
 *
 * Lança (em vez de `process.exit`) para o chamador decidir: o `theme:build`
 * avulso imprime e sai com 1; o redeploy aborta ANTES de tocar no Docker.
 */
export async function buildThemeStylesOnDisk(
  themesDir: string,
  themeName: string
): Promise<ThemeBuildOutcome> {
  const manifestPath = themeManifestPath(themesDir, themeName);
  if (!manifestPath) {
    throw new Error(
      `Theme manifest not found in ${join(themesDir, themeName)} (theme.json)`
    );
  }
  const manifest = readThemeManifest(manifestPath);
  if (!manifest) {
    throw new Error(`Invalid theme manifest (JSON): ${manifestPath}`);
  }

  const { css, report } = await buildThemeStyles({ themesRoot: themesDir, themeName, manifest });

  // `output` vem do manifesto: nunca escrever fora do diretório do tema.
  if (report.output.includes('..') || isAbsolute(report.output)) {
    throw new Error(`Invalid stylesConfig.output in ${manifestPath}: ${report.output}`);
  }

  const target = join(themesDir, themeName, report.output);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, css, 'utf-8');

  return {
    theme: themeName,
    engine: report.engine,
    output: report.output,
    bytes: Buffer.byteLength(css, 'utf-8'),
    isolated: report.isolated,
    entry: report.entry,
    warnings: report.warnings,
  };
}
