// @oktis-works/cms - uninstallExtension (REQU-022-004)

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  loadExtensionsState,
  markInstalled,
  uninstallExtension,
} from './extensions-state.js';

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'bl-uninstall-'));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('uninstallExtension', () => {
  it('remove registro e arquivos do plugin', () => {
    const pluginDir = join(dir, 'plugins', 'seo');
    mkdirSync(pluginDir, { recursive: true });
    writeFileSync(join(pluginDir, 'manifest.json'), '{"name":"seo"}');
    markInstalled('plugin', 'seo', dir);

    const result = uninstallExtension('plugin', 'seo', dir);

    expect(result.removed).toBe(true);
    expect(existsSync(pluginDir)).toBe(false);
    const state = loadExtensionsState(dir);
    expect(state.plugins['seo']).toBeUndefined();
  });

  it('tema inexistente retorna removed=false sem lançar', () => {
    const result = uninstallExtension('theme', 'fantasma', dir);
    expect(result.removed).toBe(false);
  });
});
