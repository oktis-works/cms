// @oktis-works/theme-runtime - Theme discovery via node_modules layout (TASK-038)

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { ThemeLoader } from './loader.js';

describe('NPM flow integration: ThemeLoader (node_modules layout)', () => {
  let themesDir: string;

  beforeEach(() => {
    themesDir = mkdtempSync(join(tmpdir(), 'bl-themes-'));
  });

  afterEach(() => {
    rmSync(themesDir, { recursive: true, force: true });
  });

  function writeTheme(name: string, manifest: Record<string, unknown>): void {
    const dir = join(themesDir, name);
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, 'theme.json'),
      JSON.stringify({ name, version: '1.0.0', ...manifest })
    );
  }

  it('descobre temas com theme.json válido e ignora inválidos', async () => {
    writeTheme('tema-base', {});
    writeTheme('tema-filho', { parent: 'tema-base' });
    mkdirSync(join(themesDir, 'quebrado'));
    writeFileSync(join(themesDir, 'quebrado', 'theme.json'), '{ json inválido');

    const loader = new ThemeLoader(themesDir);
    const discovered = await loader.discoverThemes();

    expect(discovered).toHaveLength(2);
    expect(discovered.map((entry) => entry.manifest.name).sort()).toEqual(['tema-base', 'tema-filho']);
  });

  it('loadTheme retorna null para tema inexistente', async () => {
    const loader = new ThemeLoader(themesDir);
    expect(await loader.loadTheme('fantasma')).toBeNull();
  });

  it('orderInheritanceChain coloca parent antes do filho', async () => {
    writeTheme('tema-base', {});
    writeTheme('tema-filho', { parent: 'tema-base' });
    writeTheme('neto', { parent: 'tema-filho' });

    const loader = new ThemeLoader(themesDir);
    const discovered = await loader.discoverThemes();
    const ordered = loader.orderInheritanceChain(discovered);
    const names = ordered.map((entry) => entry.manifest.name);

    expect(names.indexOf('tema-base')).toBeLessThan(names.indexOf('tema-filho'));
    expect(names.indexOf('tema-filho')).toBeLessThan(names.indexOf('neto'));
  });
});
