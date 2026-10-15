// @oktis-works/plugin-runtime - Bootstrap de plugins em runtime
//
// Cumpre a promessa do PLUGIN.md: `register(registry)` é chamado quando o
// plugin é carregado. Testa carga, descarga (unload), idempotência e
// isolamento de falha contra um HookRegistry real.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { bootstrapPlugins, resetLoadedPlugins } from './bootstrap.js';
import { HookRegistry } from './hook-registry.js';

let pluginsDir: string;
let registry: HookRegistry;

function writePlugin(
  name: string,
  files: Record<string, string>,
  manifest?: Record<string, unknown>
): void {
  const dir = join(pluginsDir, name);
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, 'manifest.json'),
    JSON.stringify({ name, version: '1.0.0', main: 'index.js', ...manifest })
  );
  for (const [file, content] of Object.entries(files)) {
    const target = join(dir, file);
    mkdirSync(join(target, '..'), { recursive: true });
    writeFileSync(target, content);
  }
}

function sqlWith(rows: Array<{ name: string }>) {
  return { unsafe: vi.fn(async (_text: string, _params?: unknown[]) => rows) };
}

beforeEach(() => {
  pluginsDir = mkdtempSync(join(tmpdir(), 'bl-plugin-boot-'));
  registry = new HookRegistry();
  resetLoadedPlugins(registry);
});

afterEach(() => {
  resetLoadedPlugins(registry);
  rmSync(pluginsDir, { recursive: true, force: true });
});

describe('bootstrapPlugins', () => {
  it('carrega habilitados (ESM e CJS, manifest.json) e registra hooks reais', async () => {
    writePlugin('plugin-esm', {
      'index.js':
        "export default { register(registry) { registry.addFilter('bootstrap:demo', (v) => v + '!'); } };",
    });
    writePlugin('plugin-cjs', {
      'index.js':
        "module.exports.register = function (registry) { registry.addFilter('bootstrap:cjs', (v) => v + '?'); };",
    });
    // Descoberto no diretório mas AUSENTE no banco → não pode carregar
    writePlugin('plugin-desabilitado', {
      'index.js':
        "export default { register(registry) { registry.addFilter('bootstrap:nao-deve', (v) => 'NUNCA'); } };",
    });

    const sql = sqlWith([{ name: 'plugin-esm' }, { name: 'plugin-cjs' }]);
    const result = await bootstrapPlugins({ pluginsDir, sql, registry });

    expect(result.enabled.sort()).toEqual(['plugin-cjs', 'plugin-esm']);
    expect(result.loaded.sort()).toEqual(['plugin-cjs', 'plugin-esm']);
    expect(result.failed).toEqual([]);

    // Hooks funcionam no registry real (promessa do PLUGIN.md)
    expect(registry.applyFilters('bootstrap:demo', 'oi')).toBe('oi!');
    expect(registry.applyFilters('bootstrap:cjs', 'oi')).toBe('oi?');
    expect(registry.hasFilter('bootstrap:nao-deve')).toBe(false);
  }, 30000);

  it('plugin quebrado ou sem register não derruba o lote (isolamento de falha)', async () => {
    writePlugin('plugin-quebrado', { 'index.js': "throw new Error('boom no import');" });
    writePlugin('plugin-sem-register', { 'index.js': 'export default { other: 1 };' });
    writePlugin('plugin-bom', {
      'index.js':
        "export default { register(registry) { registry.addFilter('bootstrap:bom', (v) => v); } };",
    });

    const sql = sqlWith([
      { name: 'plugin-quebrado' },
      { name: 'plugin-sem-register' },
      { name: 'plugin-bom' },
    ]);
    const result = await bootstrapPlugins({ pluginsDir, sql, registry });

    expect(result.loaded).toEqual(['plugin-bom']);
    expect(result.failed.map((f) => f.name).sort()).toEqual(['plugin-quebrado', 'plugin-sem-register']);
    expect(result.failed.find((f) => f.name === 'plugin-quebrado')!.error).toContain('boom no import');
    expect(result.failed.find((f) => f.name === 'plugin-sem-register')!.error).toContain('register');
  }, 30000);

  it('idempotência: segunda chamada não duplica hooks', async () => {
    writePlugin('plugin-ok', {
      'index.js':
        "export default { register(registry) { registry.addFilter('bootstrap:dup', (v) => v + '!'); } };",
    });
    const sql = sqlWith([{ name: 'plugin-ok' }]);

    const first = await bootstrapPlugins({ pluginsDir, sql, registry });
    const second = await bootstrapPlugins({ pluginsDir, sql, registry });

    expect(first.loaded).toEqual(['plugin-ok']);
    expect(second.loaded).toEqual([]);
    expect(registry.applyFilters('bootstrap:dup', 'x')).toBe('x!');
  }, 30000);

  it('descarrega hooks de plugin que saiu dos habilitados (unload)', async () => {
    writePlugin('plugin-x', {
      'index.js':
        "export default { register(registry) { registry.addFilter('bootstrap:x', (v) => v + '!'); registry.addAction('bootstrap:x-action', () => {}); } };",
    });

    await bootstrapPlugins({ pluginsDir, sql: sqlWith([{ name: 'plugin-x' }]), registry });
    expect(registry.hasFilter('bootstrap:x')).toBe(true);

    // Desativado no banco → próxima sincronização remove os hooks
    const result = await bootstrapPlugins({ pluginsDir, sql: sqlWith([]), registry });
    expect(result.unloaded).toEqual(['plugin-x']);
    expect(registry.hasFilter('bootstrap:x')).toBe(false);
    expect(registry.hasAction('bootstrap:x-action')).toBe(false);
  }, 30000);

  it('banco indisponível = estado desconhecido: não carrega NEM descarrega', async () => {
    writePlugin('plugin-y', {
      'index.js':
        "export default { register(registry) { registry.addFilter('bootstrap:y', (v) => v + '!'); } };",
    });
    await bootstrapPlugins({ pluginsDir, sql: sqlWith([{ name: 'plugin-y' }]), registry });
    expect(registry.hasFilter('bootstrap:y')).toBe(true);

    const failingSql = {
      unsafe: vi.fn(async () => {
        throw new Error('db down');
      }),
    };
    const result = await bootstrapPlugins({ pluginsDir, sql: failingSql, registry });

    expect(result.enabled).toEqual([]);
    expect(result.unloaded).toEqual([]);
    expect(registry.hasFilter('bootstrap:y')).toBe(true); // hooks preservados
  }, 30000);

  it('diretório inexistente não é erro', async () => {
    const result = await bootstrapPlugins({
      pluginsDir: join(pluginsDir, 'nao-existe'),
      sql: sqlWith([{ name: 'qualquer' }]),
      registry,
    });
    expect(result).toEqual({ enabled: ['qualquer'], loaded: [], unloaded: [], failed: [] });
  });

  it('incompatibilidade semântica (compatibility.okcms) vira failed isolado', async () => {
    writePlugin(
      'plugin-incompativel',
      { 'index.js': 'export default { register() {} };' },
      { compatibility: { okcms: '^99.0.0' } }
    );

    const result = await bootstrapPlugins({
      pluginsDir,
      sql: sqlWith([{ name: 'plugin-incompativel' }]),
      registry,
    });

    expect(result.loaded).toEqual([]);
    expect(result.failed).toHaveLength(1);
    expect(result.failed[0]!.error).toContain('requer OkCMS');
  }, 30000);
});
