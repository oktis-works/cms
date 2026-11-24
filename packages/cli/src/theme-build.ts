// @oktis-works/cms - Build de tema (estilos + artefato compilado)
//
// `themes/<n>/dist/` é lido PRONTO pelo web — nada compila dentro do
// container. Este módulo orquestra o build no host: estilos (SCSS/Tailwind/
// CSS) e, para temas React/Solid, o bundle SSR + `dist/theme-build.json`.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join } from 'node:path';

import { buildThemeStyles, resolveStyleEngine } from '@oktis-works/theme-runtime';
import { buildTheme, type ThemeBuildResult } from '@oktis-works/theme-builder';

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
 * `theme.json` é o nome canônico único. O legado `manifest.json` é unificado
 * pelos entry points do CLI (ver theme-migrate.ts) antes de qualquer leitura.
 */
export function themeManifestPath(themesDir: string, theme: string): string | null {
  const path = join(themesDir, theme, 'theme.json');
  return existsSync(path) ? path : null;
}

export interface ThemeStyleResolution {
  manifestPath: string;
  manifest: any;
  report: ReturnType<typeof resolveStyleEngine>;
}

/**
 * Lê o manifesto (`theme.json`) e resolve engine/entrada/saída.
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
  /** Bytes gravados em dist/theme.css. `null` = nada foi escrito (no-op seguro). */
  bytes: number | null;
  isolated: boolean;
  entry: string | null;
  warnings: string[];
  /** true quando não havia entrada para compilar — dist/theme.css permanece intacto. */
  skipped: boolean;
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
  if (report.output.includes('..') || report.output.includes('\\') || isAbsolute(report.output)) {
    throw new Error(`Invalid stylesConfig.output in ${manifestPath}: ${report.output}`);
  }

  // Sem entrada não existe o que compilar. Gravar `""` APAGARIA o
  // dist/theme.css servido pelo web (o tema default é exatamente esse caso:
  // engine css com o CSS direto em dist/, sem entry convencional). No-op
  // seguro: preserva o artefato e avisa por warning em vez de destruir.
  if (!report.entry) {
    return {
      theme: themeName,
      engine: report.engine,
      output: report.output,
      bytes: null,
      isolated: report.isolated,
      entry: null,
      warnings: [
        ...report.warnings,
        `no style entry found for theme "${themeName}" — dist/theme.css left untouched (nothing to compile)`,
      ],
      skipped: true,
    };
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
    skipped: false,
  };
}

export interface ThemeBuildBundleOutcome {
  styles: ThemeBuildOutcome;
  /** Present for react/solid themes; `null` for template themes. */
  render: ThemeBuildResult | null;
}

/**
 * Full host build: CSS pipeline + compiled server artifact.
 * Template themes keep the legacy style-only behavior.
 */
export async function buildThemeOnDisk(
  themesDir: string,
  themeName: string
): Promise<ThemeBuildBundleOutcome> {
  const styles = await buildThemeStylesOnDisk(themesDir, themeName);
  const render = await buildTheme({ themesRoot: themesDir, themeName, mode: 'js' });
  return {
    styles,
    render: render.engine === 'template' ? null : render,
  };
}
