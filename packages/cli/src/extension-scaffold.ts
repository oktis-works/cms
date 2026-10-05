// @oktis-works/cms - Scaffolds de plugin e tema (cli-devexp-004)

import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { CMS_VERSION, assertCompatible } from '@oktis-works/validation';

export interface ScaffoldExtensionResult {
  dir: string;
  manifest: Record<string, unknown>;
}

function assertSafeName(name: string): void {
  if (!/^[a-z0-9][a-z0-9-_]*$/i.test(name) || name.includes('..')) {
    throw new Error(`Invalid name: "${name}" (use [a-z0-9-_])`);
  }
}

/**
 * Gera um plugin mínimo: manifest.json compatível com a versão atual do CMS,
 * index.js de entrada e README. O self-check garante que o scaffold nasce válido.
 */
export function scaffoldPlugin(name: string, baseDir?: string): ScaffoldExtensionResult {
  assertSafeName(name);

  const manifest = {
    name,
    version: '0.1.0',
    description: `Plugin ${name} for OkCMS`,
    type: 'plugin',
    main: 'index.js',
    scope: 'tenant',
    permissions: [],
    compatibility: { okcms: `^${CMS_VERSION}` },
  };

  const selfCheck = { ...manifest };
  assertCompatible('plugin', selfCheck, CMS_VERSION);

  const dir = resolve(baseDir ?? join(process.cwd(), 'plugins'), name);
  if (existsSync(dir)) throw new Error(`Directory already exists: ${dir}`);

  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'manifest.json'), JSON.stringify(manifest, null, 2));
  writeFileSync(
    join(dir, 'index.js'),
    [
      `'use strict';`,
      ``,
      `/**`,
      ` * Plugin ${name}.`,
      ` * Hooks disponíveis: veja GET /api/v1/hooks/catalog.`,
      ` */`,
      `module.exports.register = function register(registry) {`,
      `  registry.addFilter('theme:data:posts', (value) => value);`,
      `};`,
      ``,
    ].join('\n')
  );
  writeFileSync(
    join(dir, 'README.md'),
    [`# ${name}`, '', `Plugin OkCMS.`, '', '- Manifest: manifest.json', '- Entry: index.js', ''].join('\n')
  );

  return { dir, manifest };
}

export type ScaffoldThemeStyle = 'css' | 'scss' | 'tailwind';

/**
 * Gera um tema mínimo: theme.json + templates essenciais da hierarquia
 * (index.html, single.html) e style.css/scss/tailwind conforme engine.
 * @param style escolha exclusiva: css | scss | tailwind (default css)
 */
export function scaffoldTheme(name: string, baseDir?: string, style: ScaffoldThemeStyle = 'css'): ScaffoldExtensionResult {
  assertSafeName(name);

  const styleConfig =
    style === 'css' ? undefined : style === 'scss' ? { engine: 'scss', entry: 'styles/main.scss', output: 'dist/theme.css', isolation: true } : { engine: 'tailwind', entry: 'src/input.css', output: 'dist/theme.css', isolation: true };

  const manifest: Record<string, unknown> = {
    name,
    version: '0.1.0',
    description: `Theme ${name} for OkCMS`,
    type: 'theme',
    compatibility: { okcms: `^${CMS_VERSION}` },
    ...(styleConfig ? { stylesConfig: styleConfig } : {}),
  };

  const selfCheck = { ...manifest };
  assertCompatible('theme', selfCheck, CMS_VERSION);

  const dir = resolve(baseDir ?? join(process.cwd(), 'themes'), name);
  if (existsSync(dir)) throw new Error(`Directory already exists: ${dir}`);

  mkdirSync(join(dir, 'templates'), { recursive: true });
  writeFileSync(join(dir, 'theme.json'), JSON.stringify(manifest, null, 2));
  writeFileSync(
    join(dir, 'templates', 'index.html'),
    ['<main class="site">', '  {{#each posts}}', '  <article>{{this.title}}</article>', '  {{/each}}', '</main>'].join('\n')
  );
  writeFileSync(
    join(dir, 'templates', 'single.html'),
    ['<main class="single">', '  <h1>{{title}}</h1>', '  <div>{{content}}</div>', '</main>'].join('\n')
  );
  if (style === 'scss') {
    mkdirSync(join(dir, 'styles'), { recursive: true });
    writeFileSync(join(dir, 'styles', 'main.scss'), `$brand: #6366f1;\n\n.site { color: $brand; }\n.single { max-width: 720px; margin: 0 auto; }\n`);
    writeFileSync(join(dir, 'styles', 'components.scss'), `// imports parciais\n`);
  } else if (style === 'tailwind') {
    mkdirSync(join(dir, 'src'), { recursive: true });
    writeFileSync(
      join(dir, 'src', 'input.css'),
      ['@tailwind base;', '@tailwind components;', '@tailwind utilities;', '', '/* escopado via [data-theme] em build */'].join('\n')
    );
    writeFileSync(
      join(dir, 'tailwind.config.js'),
      [
        `/** @type {import('tailwindcss').Config} */`,
        `module.exports = {`,
        `  content: ["./templates/**/*.{astro,html,js}", "./src/**/*.{astro,html,js}", "./components/**/*.{astro,html,js}"],`,
        `  corePlugins: { preflight: false },`,
        `  // isolamento fino: importante apenas dentro do tema pode ser ativado via important: '[data-theme="${name}"]'`,
        `};`,
        ``,
      ].join('\n')
    );
  } else {
    writeFileSync(join(dir, 'style.css'), ':root { --brand: #000; }\n');
  }
  writeFileSync(
    join(dir, 'README.md'),
    [`# ${name}`, '', `Tema OkCMS.`, '', `- Manifest: theme.json`, `- Templates: templates/`, `- Engine: ${style}`, ''].join('\n')
  );

  return { dir, manifest };
}
