// @oktis-works/cms - Testes do build de estilo de tema (theme:build)
//
// Regressão crítica: sem entry, o build APAGAVA dist/theme.css (gravava "").
// O guard deve tornar o caso no-op seguro: nada é gravado e o artefato
// servido pelo web permanece intacto (o tema default do scaffold é exatamente
// esse caso — engine css com o CSS direto em dist/).

import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { buildThemeStylesOnDisk, themeManifestPath } from './theme-build.js';

const tmpRoots: string[] = [];

function makeThemesDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'okcms-theme-build-'));
  tmpRoots.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tmpRoots.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

const MANIFEST_CSS = JSON.stringify({
  name: 'meu-tema',
  version: '0.1.0',
  type: 'theme',
  provides: { assets: ['dist/theme.css'] },
  stylesConfig: { engine: 'css', isolation: true },
});

describe('buildThemeStylesOnDisk (no-op seguro entry-null)', () => {
  it('não apaga dist/theme.css quando engine css não tem entry convencional', async () => {
    const themesDir = makeThemesDir();
    const themeDir = join(themesDir, 'meu-tema');
    mkdirSync(join(themeDir, 'dist'), { recursive: true });
    writeFileSync(join(themeDir, 'theme.json'), MANIFEST_CSS, 'utf-8');
    const original = '/* tema css servido direto */\n.site { color: #000; }\n';
    writeFileSync(join(themeDir, 'dist', 'theme.css'), original, 'utf-8');

    const outcome = await buildThemeStylesOnDisk(themesDir, 'meu-tema');

    expect(outcome.skipped).toBe(true);
    expect(outcome.bytes).toBeNull();
    expect(outcome.entry).toBeNull();
    expect(outcome.engine).toBe('css');
    // o artefato servido pelo web permanece intacto
    expect(readFileSync(join(themeDir, 'dist', 'theme.css'), 'utf-8')).toBe(original);
    // e o warning explica o porquê
    expect(outcome.warnings.some((w) => w.includes('left untouched'))).toBe(true);
  });

  it('compila e grava dist/theme.css para tema scss com entry', async () => {
    const themesDir = makeThemesDir();
    const themeDir = join(themesDir, 'tema-scss');
    mkdirSync(join(themeDir, 'styles'), { recursive: true });
    writeFileSync(
      join(themeDir, 'theme.json'),
      JSON.stringify({
        name: 'tema-scss',
        version: '0.1.0',
        type: 'theme',
        stylesConfig: { engine: 'scss', entry: 'styles/main.scss', output: 'dist/theme.css', isolation: true },
      }),
      'utf-8'
    );
    writeFileSync(join(themeDir, 'styles', 'main.scss'), '$brand: #123456;\n.site { color: $brand; }\n', 'utf-8');

    const outcome = await buildThemeStylesOnDisk(themesDir, 'tema-scss');

    expect(outcome.skipped).toBe(false);
    expect(outcome.entry).toBe('styles/main.scss');
    expect(outcome.bytes).toBeGreaterThan(0);
    const css = readFileSync(join(themeDir, 'dist', 'theme.css'), 'utf-8');
    expect(css).toContain('#123456');
    // isolamento BUSI-040 aplicado
    expect(css).toContain('[data-theme="tema-scss"]');
  });

  it('lança erro amigável quando o manifest não existe', async () => {
    const themesDir = makeThemesDir();
    mkdirSync(join(themesDir, 'inexistente'), { recursive: true });

    await expect(buildThemeStylesOnDisk(themesDir, 'inexistente')).rejects.toThrow(/Theme manifest not found/);
  });

  it('themeManifestPath só encontra o nome canônico theme.json', () => {
    const themesDir = makeThemesDir();
    const themeDir = join(themesDir, 'tema');
    mkdirSync(themeDir, { recursive: true });
    writeFileSync(join(themeDir, 'manifest.json'), '{}', 'utf-8');

    expect(themeManifestPath(themesDir, 'tema')).toBeNull();

    writeFileSync(join(themeDir, 'theme.json'), '{}', 'utf-8');
    expect(themeManifestPath(themesDir, 'tema')).toBe(join(themeDir, 'theme.json'));
  });

  it('arquivo de saída fora do tema (path traversal em output) é rejeitado', async () => {
    const themesDir = makeThemesDir();
    const themeDir = join(themesDir, 'evill');
    mkdirSync(join(themeDir, 'styles'), { recursive: true });
    writeFileSync(
      join(themeDir, 'theme.json'),
      JSON.stringify({
        name: 'evill',
        version: '0.1.0',
        type: 'theme',
        stylesConfig: { engine: 'scss', entry: 'styles/main.scss', output: '../evil.css', isolation: true },
      }),
      'utf-8'
    );
    writeFileSync(join(themeDir, 'styles', 'main.scss'), '.x { color: red; }\n', 'utf-8');

    await expect(buildThemeStylesOnDisk(themesDir, 'evill')).rejects.toThrow(/Invalid stylesConfig.output/);
    expect(existsSync(join(themesDir, 'evil.css'))).toBe(false);
  });
});
