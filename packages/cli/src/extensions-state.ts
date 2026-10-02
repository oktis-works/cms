// @oktis-works/cms - Extensions State (plugins/themes instalados + flags)

import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { loadProjectConfig } from './project-config.js';

export interface ExtensionEntry {
  enabled: boolean;
  installedAt: string;
}

export interface ExtensionsState {
  plugins: Record<string, ExtensionEntry>;
  themes: Record<string, ExtensionEntry>;
}

function stateFile(cwd = process.cwd()): string {
  return join(cwd, '.okcms', 'extensions.json');
}

export function loadExtensionsState(cwd = process.cwd()): ExtensionsState {
  const file = stateFile(cwd);

  if (!existsSync(file)) {
    return { plugins: {}, themes: {} };
  }

  try {
    const parsed = JSON.parse(readFileSync(file, 'utf-8')) as Partial<ExtensionsState>;
    return { plugins: parsed.plugins ?? {}, themes: parsed.themes ?? {} };
  } catch {
    return { plugins: {}, themes: {} };
  }
}

export function saveExtensionsState(state: ExtensionsState, cwd = process.cwd()): void {
  mkdirSync(join(cwd, '.okcms'), { recursive: true });
  writeFileSync(stateFile(cwd), JSON.stringify(state, null, 2));
}

export function markInstalled(
  kind: 'plugin' | 'theme',
  name: string,
  cwd = process.cwd()
): void {
  const state = loadExtensionsState(cwd);
  const bucket = kind === 'plugin' ? state.plugins : state.themes;
  if (!Object.hasOwn(bucket, name)) {
    bucket[name] = { enabled: true, installedAt: new Date().toISOString() };
  }
  saveExtensionsState(state, cwd);
}

export function setEnabled(
  kind: 'plugin' | 'theme',
  name: string,
  enabled: boolean,
  cwd = process.cwd()
): boolean {
  const state = loadExtensionsState(cwd);
  const bucket = kind === 'plugin' ? state.plugins : state.themes;

  if (!Object.hasOwn(bucket, name)) return false;

  const entry = bucket[name];
  if (!entry) return false;

  entry.enabled = enabled;
  saveExtensionsState(state, cwd);
  return true;
}

/**
 * REQU-022-004: remove a extensão do registro local e do disco.
 * Retorna false quando a extensão não está registrada.
 */
export function uninstallExtension(
  kind: 'plugin' | 'theme',
  name: string,
  cwd = process.cwd()
): { removed: boolean; targetDir: string } {
  const config = loadProjectConfig(cwd);
  const baseDir = join(cwd, kind === 'plugin' ? config.pluginsDir : config.themesDir);
  const targetDir = join(baseDir, name);

  const state = loadExtensionsState(cwd);
  const bucket = kind === 'plugin' ? state.plugins : state.themes;
  const registered = Object.hasOwn(bucket, name);

  if (registered) {
    delete bucket[name];
    saveExtensionsState(state, cwd);
  }

  if (existsSync(targetDir)) {
    rmSync(targetDir, { recursive: true, force: true });
    return { removed: true, targetDir };
  }

  return { removed: registered, targetDir };
}
