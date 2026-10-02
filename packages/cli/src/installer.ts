// @oktis-works/cms - Plugin & Theme Installation

import { cpSync, existsSync, readdirSync, readFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { loadProjectConfig } from './project-config.js';
import { assertCompatible, CMS_VERSION } from '@oktis-works/validation';
import { loadExtensionsState, markInstalled } from './extensions-state.js';

export interface InstallerOptions {
  /** Diretório do projeto alvo (default: process.cwd()). Injetável para testes. */
  cwd?: string;
  /** Versão do CMS alvo para checagem de compatibilidade (default: versão atual). */
  cmsVersion?: string;
}

function readManifest(manifestPath: string): Record<string, unknown> | null {
  if (!existsSync(manifestPath)) return null;

  try {
    return JSON.parse(readFileSync(manifestPath, 'utf-8')) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export async function installExtension(
  kind: 'plugin' | 'theme',
  sourcePath: string,
  options: InstallerOptions = {}
): Promise<{ name: string; targetDir: string }> {
  const cwd = options.cwd ?? process.cwd();
  const config = loadProjectConfig(cwd);
  const source = resolve(cwd, sourcePath);
  const manifestFile = kind === 'plugin' ? 'manifest.json' : 'theme.json';

  const sourceManifest = join(source, manifestFile);
  const manifest = readManifest(sourceManifest);

  if (!manifest) {
    throw new Error(`Manifesto não encontrado ou inválido: ${sourceManifest} (esperado ${manifestFile})`);
  }

  let name = basename(source);

  if (typeof manifest['name'] === 'string' && manifest['name'].length > 0) {
    name = manifest['name'];
  }

  if (
    name.includes('..') ||
    name.startsWith('/') ||
    name.includes('\\') ||
    /[\0\r\n]/.test(name)
  ) {
    throw new Error(`Nome de extensão inválido: "${name}"`);
  }

  // BUSI-022 / RULE-semver-compatibility: manifest completo e compatível é pré-requisito
  assertCompatible(kind, { ...manifest, name, type: kind }, options.cmsVersion ?? CMS_VERSION);

  const baseDir = resolve(cwd, kind === 'plugin' ? config.pluginsDir : config.themesDir);
  const targetDir = resolve(baseDir, name);
  if (!targetDir.startsWith(baseDir + '/') || targetDir === baseDir) {
    throw new Error(`Caminho de instalação escapa do diretório de ${kind}s: ${name}`);
  }

  if (existsSync(targetDir)) {
    throw new Error(`${kind === 'plugin' ? 'Plugin' : 'Theme'} "${name}" já existe em ${targetDir}`);
  }

  cpSync(source, targetDir, { recursive: true });
  markInstalled(kind, name, cwd);

  console.log(`${kind === 'plugin' ? 'Plugin' : 'Theme'} "${name}" instalado em ${targetDir}`);

  return { name, targetDir };
}

export function listExtensions(kind: 'plugin' | 'theme', options: InstallerOptions = {}): void {
  const cwd = options.cwd ?? process.cwd();
  const config = loadProjectConfig(cwd);
  const dir = join(cwd, kind === 'plugin' ? config.pluginsDir : config.themesDir);

  if (!existsSync(dir)) {
    console.log(`Nenhum diretório de ${kind}s: ${dir}`);
    return;
  }

  const entries = readdirSync(dir, { withFileTypes: true }).filter((entry) => entry.isDirectory());

  if (entries.length === 0) {
    console.log(`Nenhum ${kind} instalado.`);
    return;
  }

  const state = loadExtensionsState(cwd);
  const bucket = kind === 'plugin' ? state.plugins : state.themes;

  console.log(`${kind === 'plugin' ? 'Plugins' : 'Themes'} instalados:`);
  for (const entry of entries) {
    const stateEntry = bucket[entry.name];
    const enabled = stateEntry?.enabled ?? true;
    console.log(`  - ${entry.name} [${enabled ? 'habilitado' : 'desabilitado'}]`);
  }
}
