// @oktis-works/theme-runtime - Theme Style Engine (Tailwind XOR SCSS + Isolamento Fino)
// BUSI-039 Exclusive Style Engine | BUSI-040 Fine Isolation Scoping | DECI-029

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { ThemeManifest } from '@oktis-works/theme-sdk';
import type { StyleEngine } from '@oktis-works/theme-sdk';

export type ThemeStyleReport = {
  engine: StyleEngine;
  entry: string | null;
  output: string;
  isolated: boolean;
  warnings: string[];
  errors: string[];
};

export interface StyleEngineOptions {
  themesRoot: string;
  themeName: string;
  manifest: ThemeManifest;
}

const VALID_ENGINES: StyleEngine[] = ['tailwind', 'scss', 'css'];

function detectConventionEntry(themePath: string): { engine: StyleEngine; entry: string } | null {
  const candidates: Array<[StyleEngine, string]> = [
    ['scss', 'styles/main.scss'],
    ['scss', 'style.scss'],
    ['scss', 'src/main.scss'],
    ['scss', 'assets/main.scss'],
    ['tailwind', 'src/input.css'],
    ['tailwind', 'styles/input.css'],
    ['tailwind', 'src/tailwind.css'],
    ['css', 'style.css'],
    ['css', 'styles/main.css'],
    ['css', 'assets/main.css'],
  ];
  for (const [engine, rel] of candidates) {
    if (existsSync(join(themePath, rel))) return { engine, entry: rel };
  }
  // heuristic: any .scss => scss, any tailwind.config.* => tailwind
  if (existsSync(join(themePath, 'tailwind.config.js')) || existsSync(join(themePath, 'tailwind.config.cjs')) || existsSync(join(themePath, 'tailwind.config.mjs'))) {
    return { engine: 'tailwind', entry: 'src/input.css' };
  }
  const files = listFilesRecursive(themePath);
  if (files.some((f) => f.endsWith('.scss'))) return { engine: 'scss', entry: files.find((f) => f.endsWith('.scss'))!.replace(themePath + '/', '') };
  return null;
}

function listFilesRecursive(dir: string, acc: string[] = []): string[] {
  if (!existsSync(dir)) return acc;
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) listFilesRecursive(full, acc);
    else acc.push(full);
  }
  return acc;
}

export function resolveStyleEngine(opts: StyleEngineOptions): ThemeStyleReport & { themePath: string } {
  const themePath = resolve(opts.themesRoot, opts.themeName);
  const cfg = opts.manifest.stylesConfig ?? {};
  const warnings: string[] = [];
  const errors: string[] = [];
  let engine: StyleEngine = (cfg.engine as StyleEngine) ?? 'css';
  if (!VALID_ENGINES.includes(engine)) {
    warnings.push(`styleEngine "${engine}" inválido, usando css`);
    engine = 'css';
  }
  const convention = detectConventionEntry(themePath);
  // BUSI-039: exclusividade
  const hasTailwindConfig = existsSync(join(themePath, 'tailwind.config.js')) || existsSync(join(themePath, 'tailwind.config.cjs')) || existsSync(join(themePath, 'tailwind.config.mjs'));
  const hasScss = listFilesRecursive(themePath).some((f) => f.endsWith('.scss'));
  if (engine === 'tailwind' && hasScss && !cfg.entry) {
    // se declarou tailwind mas há scss, avisa; se engine scss mas há tailwind config, avisa
    warnings.push('Tema declarado como tailwind mas contém arquivos .scss — use apenas um engine');
  }
  if (engine === 'scss' && hasTailwindConfig) {
    warnings.push('Tema declarado como scss mas contém tailwind.config.* — use apenas um engine');
  }
  if (!cfg.entry && convention && convention.engine !== engine) {
    warnings.push(`Convenção detectada ${convention.engine} mas manifest declara ${engine}; respeitando manifest`);
  }
  // BUSI-040: isolamento obrigatório — sempre true, false é erro
  if ((cfg as any).isolation === false) errors.push('stylesConfig.isolation=false proibido — [data-theme="nome"] é obrigatório');
  const entry = cfg.entry ?? convention?.entry ?? null;
  if (entry && entry.includes('..')) errors.push('entry com path traversal não permitido');
  const isolated = true;
  const output = cfg.output ?? 'dist/theme.css';
  if (engine !== 'css' && !entry) {
    warnings.push(`Engine ${engine} declarado mas nenhuma entrada encontrada; fallback para css`);
  }
  return { engine, entry, output, isolated, warnings, errors, themePath };
}

/**
 * Escopa CSS sob [data-theme="name"] — isolamento fino BUSI-040.
 * Evita leaking para admin e entre temas.
 * Exclui @keyframes, @font-face, :root, html, body -> prefixa com o atributo no seletor quando possível.
 */
export function scopeCss(css: string, themeName: string, prefix = `[data-theme="${themeName}"]`): string {
  const isExcludedAtRule = (selector: string) => {
    const s = selector.trim();
    return s.startsWith('@keyframes') || s.startsWith('@font-face') || s.startsWith('@import');
  };
  const shouldKeepRootAlone = (sel: string) => /:root|\bhtml\b|\bbody\b/.test(sel);
  let out = '';
  let i = 0;
  const len = css.length;
  while (i < len) {
    // pula whitespace/comments
    if (css[i]?.trim() === '' ) { out += css[i++]; continue; }
    if (css.startsWith('/*', i)) {
      const end = css.indexOf('*/', i + 2);
      const comment = end === -1 ? css.slice(i) : css.slice(i, end + 2);
      out += comment;
      i += comment.length;
      continue;
    }
    // at-rule sem bloco (termina com ;)
    if (css[i] === '@') {
      const semi = css.indexOf(';', i);
      const brace = css.indexOf('{', i);
      // se ; vem antes de { ou não há {, é at-rule sem bloco
      if (semi !== -1 && (brace === -1 || semi < brace)) {
        const atRule = css.slice(i, semi + 1);
        out += atRule;
        i = semi + 1;
        continue;
      }
    }
    const braceIdx = css.indexOf('{', i);
    if (braceIdx === -1) { out += css.slice(i); break; }
    const selectorPart = css.slice(i, braceIdx).trim();
    // encontra } correspondente com aninhamento
    let depth = 0;
    let endIdx = -1;
    for (let k = braceIdx; k < len; k++) {
      if (css[k] === '{') depth++;
      else if (css[k] === '}') {
        depth--;
        if (depth === 0) { endIdx = k; break; }
      }
    }
    if (endIdx === -1) { out += css.slice(i); break; }
    const block = css.slice(i, endIdx + 1);
    const bodyStart = braceIdx;
    const body = css.slice(bodyStart, endIdx + 1); // includes { ... }
    if (isExcludedAtRule(selectorPart)) {
      out += block;
    } else if (selectorPart.startsWith('@media') || selectorPart.startsWith('@supports') || selectorPart.startsWith('@layer')) {
      const inner = css.slice(braceIdx + 1, endIdx);
      const scopedInner = scopeCss(inner, themeName, prefix);
      out += `${selectorPart} {${scopedInner}}`;
    } else if (selectorPart.startsWith('@')) {
      // @tailwind etc já tratado, mas outros @ com bloco
      const inner = css.slice(braceIdx + 1, endIdx);
      out += `${selectorPart} {${inner}}`;
    } else {
      const selectors = selectorPart.split(',').map((s) => s.trim()).filter(Boolean);
      const scopedSelectors = selectors.map((sel) => {
        if (sel.startsWith('@')) return sel;
        if (sel.includes(prefix)) return sel;
        if (shouldKeepRootAlone(sel)) {
          if (sel === ':root' || sel === 'html' || sel === 'body') return prefix;
          return sel.replace(':root', prefix).replace(/\bhtml\b/, prefix).replace(/\bbody\b/, prefix);
        }
        return `${prefix} ${sel}`;
      });
      out += `${scopedSelectors.join(', ')}${body}`;
    }
    i = endIdx + 1;
  }
  if (!out.trim() && css.trim()) return `${prefix} { ${css} }`;
  return out || css;
}

/** Compila SCSS para CSS (usa sass se disponível, fallback erro amigável). */
export async function compileScss(entryAbs: string): Promise<string> {
  try {
    const mod: any = await import('sass').catch(() => null);
    if (!mod) throw new Error('Dependência "sass" não instalada. Instale com bun add -d sass');
    const sass = mod.default ?? mod;
    if (typeof sass.compile === 'function') {
      const res = sass.compile(entryAbs);
      return res.css as string;
    }
    if (typeof sass.compileAsync === 'function') {
      const res = await sass.compileAsync(entryAbs);
      return res.css as string;
    }
    // legacy render
    const res = sass.renderSync({ file: entryAbs });
    return res.css.toString();
  } catch (e: any) {
    throw new Error(`Falha ao compilar SCSS ${entryAbs}: ${e.message}`);
  }
}

/** Compila Tailwind: lê input.css, aplica tailwindcss via postcss se disponível. Fallback: retorna input + escopo. */
export async function compileTailwind(entryAbs: string, themePath: string): Promise<string> {
  const raw = readFileSync(entryAbs, 'utf-8');
  try {
    const postcssMod: any = await import('postcss').catch(() => null);
    const tailwindMod: any = await import('tailwindcss').catch(() => null);
    const autoprefixMod: any = await import('autoprefixer').catch(() => null);
    if (!postcssMod || !tailwindMod) {
      // sem tailwind instalado, retorna raw (dev pode instalar)
      return raw;
    }
    const postcss = postcssMod.default ?? postcssMod;
    const tailwindcss = tailwindMod.default ?? tailwindMod;
    const tailwindConfigPath =
      [join(themePath, 'tailwind.config.js'), join(themePath, 'tailwind.config.cjs'), join(themePath, 'tailwind.config.mjs')].find((p) => existsSync(p)) ?? null;
    let tailwindConfig: any = {
      content: [join(themePath, 'templates/**/*.{astro,html,js,ts}'), join(themePath, 'src/**/*.{astro,html,js,ts}'), join(themePath, 'components/**/*.{astro,html,js,ts}')],
      corePlugins: { preflight: false },
    };
    if (tailwindConfigPath) tailwindConfig = tailwindConfigPath;
    const plugins: any[] = [tailwindcss(tailwindConfig)];
    if (autoprefixMod) plugins.push((autoprefixMod.default ?? autoprefixMod)());
    const result = await postcss(plugins).process(raw, { from: entryAbs });
    return result.css;
  } catch (e: any) {
    throw new Error(`Falha ao compilar Tailwind ${entryAbs}: ${e.message}`);
  }
}

/**
 * Pipeline completo: detecta engine, compila e escopa.
 * Retorna css final isolado pronto para escrita em dist/theme.css
 */
export async function buildThemeStyles(opts: StyleEngineOptions): Promise<{ css: string; report: ThemeStyleReport & { themePath: string } }> {
  const report = resolveStyleEngine(opts);
  if (report.errors.length) throw new Error(report.errors.join('; '));
  if (!report.entry) return { css: '', report };
  const entryAbs = join(report.themePath, report.entry);
  if (!existsSync(entryAbs)) return { css: '', report };
  let css = '';
  if (report.engine === 'scss') {
    css = await compileScss(entryAbs);
  } else if (report.engine === 'tailwind') {
    css = await compileTailwind(entryAbs, report.themePath);
  } else {
    css = readFileSync(entryAbs, 'utf-8');
  }
  // autoprefixer genérico se não tailwind
  if (report.engine !== 'tailwind') {
    try {
      const postcssMod: any = await import('postcss').catch(() => null);
      const autoprefixMod: any = await import('autoprefixer').catch(() => null);
      if (postcssMod && autoprefixMod) {
        const postcss = postcssMod.default ?? postcssMod;
        const autoprefixer = autoprefixMod.default ?? autoprefixMod;
        const result = await postcss([autoprefixer()]).process(css, { from: entryAbs });
        css = result.css;
      }
    } catch (e: any) {
      // Silently skip autoprefixer if not available, but log for debugging
      if (process.env['DEBUG']) console.warn(`Autoprefixer skipped: ${e.message}`);
    }
  }
  // isolamento obrigatório — sempre escopa
  css = scopeCss(css, opts.manifest.name);
  return { css, report };
}

/** Valida manifest contra BUSI-039/BUSI-040: retorna erros se ambíguo ou isolamento desativado. */
export function validateStyleManifest(manifest: ThemeManifest, themePath: string): string[] {
  const errors: string[] = [];
  const engine = manifest.stylesConfig?.engine;
  if (engine && !VALID_ENGINES.includes(engine)) errors.push(`stylesConfig.engine inválido: ${engine}`);
  if ((manifest.stylesConfig as any)?.isolation === false) errors.push('stylesConfig.isolation=false proibido — [data-theme="nome"] é obrigatório (BUSI-040)');
  const hasTailwind = existsSync(join(themePath, 'tailwind.config.js')) || existsSync(join(themePath, 'tailwind.config.cjs'));
  const hasScss = listFilesRecursive(themePath).some((f) => f.endsWith('.scss'));
  if (hasTailwind && hasScss) errors.push('Tema contém ambos tailwind.config e .scss — escolha apenas um engine (tailwind XOR scss)');
  if (manifest.stylesConfig?.entry?.includes('..')) errors.push('stylesConfig.entry com path traversal');
  return errors;
}

export function getThemeScopeAttribute(themeName: string): { attr: string; selector: string } {
  return { attr: `data-theme="${themeName}"`, selector: `[data-theme="${themeName}"]` };
}
