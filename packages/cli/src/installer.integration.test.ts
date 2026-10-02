// @oktis-works/cms - Integration tests do fluxo de instalação (TASK-038)

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { installExtension, listExtensions } from './installer.js';
import { loadExtensionsState, setEnabled } from './extensions-state.js';

describe('NPM flow integration: installer', () => {
  let projectDir: string;
  let pluginSource: string;

  beforeEach(() => {
    projectDir = mkdtempSync(join(tmpdir(), 'bl-project-'));
    pluginSource = mkdtempSync(join(tmpdir(), 'bl-plugin-'));

    mkdirSync(join(projectDir, '.config'), { recursive: true });
    writeFileSync(
      join(projectDir, 'okcms.config.json'),
      JSON.stringify({ name: 'projeto-teste', pluginsDir: 'plugins', themesDir: 'themes', activeTheme: '' })
    );

    writeFileSync(
      join(pluginSource, 'manifest.json'),
      JSON.stringify({ name: 'plugin-integração', version: '1.0.0', type: 'plugin', main: 'index.js', compatibility: { okcms: '>=0.1.0 <1.0.0' } })
    );
    writeFileSync(join(pluginSource, 'index.js'), 'export default () => "ok";');
  });

  afterEach(() => {
    rmSync(projectDir, { recursive: true, force: true });
    rmSync(pluginSource, { recursive: true, force: true });
  });

  it('instala plugin válido copiando arquivos e registrando estado', async () => {
    const result = await installExtension('plugin', pluginSource, { cwd: projectDir });

    expect(result.name).toBe('plugin-integração');
    expect(existsSync(join(projectDir, 'plugins', 'plugin-integração', 'manifest.json'))).toBe(true);
    expect(existsSync(join(projectDir, 'plugins', 'plugin-integração', 'index.js'))).toBe(true);

    const state = loadExtensionsState(projectDir);
    expect(state.plugins['plugin-integração']?.enabled).toBe(true);
  });

  it('bloqueia plugin incompatível com a versão do CMS (BUSI-022)', async () => {
    writeFileSync(
      join(pluginSource, 'manifest.json'),
      JSON.stringify({ name: 'plugin-integração', version: '1.0.0', type: 'plugin', main: 'index.js', compatibility: { okcms: '^99.0.0' } })
    );

    await expect(installExtension('plugin', pluginSource, { cwd: projectDir })).rejects.toThrow(/incompatível/);
    expect(existsSync(join(projectDir, 'plugins'))).toBe(false);
  });

  it('bloqueia manifest sem compatibility.okcms (BUSI-022)', async () => {
    writeFileSync(
      join(pluginSource, 'manifest.json'),
      JSON.stringify({ name: 'plugin-integração', version: '1.0.0', type: 'plugin', main: 'index.js' })
    );

    await expect(installExtension('plugin', pluginSource, { cwd: projectDir })).rejects.toThrow(/compatibility\.okcms/);
    expect(existsSync(join(projectDir, 'plugins'))).toBe(false);
  });

  it('rejeita plugin sem manifest com erro claro', async () => {
    rmSync(join(pluginSource, 'manifest.json'));

    await expect(installExtension('plugin', pluginSource, { cwd: projectDir })).rejects.toThrow(/Manifesto/);
    expect(existsSync(join(projectDir, 'plugins'))).toBe(false);
  });

  it('enable/disable atualiza o estado registrado', async () => {
    await installExtension('plugin', pluginSource, { cwd: projectDir });

    expect(setEnabled('plugin', 'plugin-integração', false, projectDir)).toBe(true);

    const state = loadExtensionsState(projectDir);
    expect(state.plugins['plugin-integração']?.enabled).toBe(false);
    expect(setEnabled('plugin', 'inexistente', true, projectDir)).toBe(false);
  });

  it('listExtensions lista o plugin instalado', async () => {
    await installExtension('plugin', pluginSource, { cwd: projectDir });

    const logs: string[] = [];
    const originalLog = console.log;
    console.log = (...args: unknown[]) => logs.push(args.join(' '));

    try {
      listExtensions('plugin', { cwd: projectDir });
    } finally {
      console.log = originalLog;
    }

    expect(logs.some((line) => line.includes('plugin-integração') && line.includes('habilitado'))).toBe(true);
  });
});
