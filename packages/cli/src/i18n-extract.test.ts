// @oktis-works/cli - i18n extract tests (Item 9)

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { extractKeysFromSource, extractPluginI18n } from './i18n-extract.js';

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'bl-i18n-extract-'));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

function scaffoldPlugin(): string {
  const pluginDir = join(dir, 'my-plugin');
  mkdirSync(join(pluginDir, 'src'), { recursive: true });
  mkdirSync(join(pluginDir, 'locales'), { recursive: true });
  writeFileSync(join(pluginDir, 'manifest.json'), JSON.stringify({ name: 'my-plugin', version: '1.0.0' }));
  writeFileSync(
    join(pluginDir, 'src', 'index.js'),
    `
    export async function register(api) {
      const a = api.i18n.translate('mail.welcome', { name: 'Ada' });
      const b = __('mail.bye');
      return a + b;
    }
    `
  );
  writeFileSync(join(pluginDir, 'locales', 'en.json'), JSON.stringify({ 'mail.welcome': 'Welcome {name}!' }));
  return pluginDir;
}

describe('extractKeysFromSource', () => {
  it('finds i18n.translate and __() keys without duplicates', () => {
    const keys = extractKeysFromSource(`
      api.i18n.translate('a.key', {});
      __('b.key');
      i18n.translate("c.key");
      api.i18n.translate('a.key');
    `);
    // keys appear grouped by pattern (i18n.translate first, then __)
    expect(keys).toEqual(['a.key', 'c.key', 'b.key']);
  });

  it('ignores non-string arguments', () => {
    expect(extractKeysFromSource('api.i18n.translate(someVar)')).toEqual([]);
  });
});

describe('extractPluginI18n', () => {
  it('merges extracted keys preserving existing translations', () => {
    const pluginDir = scaffoldPlugin();

    const result = extractPluginI18n(pluginDir, 'en');

    expect(result).toEqual({
      plugin: 'my-plugin',
      file: expect.stringContaining(join('locales', 'en.json')),
      added: 1, // mail.bye is new
      kept: 1, // mail.welcome already translated
      total: 2,
    });

    const merged = JSON.parse(readFileSync(join(pluginDir, 'locales', 'en.json'), 'utf8'));
    expect(merged).toEqual({ 'mail.welcome': 'Welcome {name}!', 'mail.bye': '' });
  });

  it('returns null for directories without a manifest', () => {
    expect(extractPluginI18n(join(dir, 'not-a-plugin'))).toBeNull();
  });

  it('creates the locales file when it does not exist yet', () => {
    const pluginDir = scaffoldPlugin();
    rmSync(join(pluginDir, 'locales', 'en.json'));

    extractPluginI18n(pluginDir, 'pt-BR');

    const file = join(pluginDir, 'locales', 'pt-BR.json');
    expect(existsSync(file)).toBe(true);
    expect(JSON.parse(readFileSync(file, 'utf8'))).toEqual({ 'mail.welcome': '', 'mail.bye': '' });
  });
});
