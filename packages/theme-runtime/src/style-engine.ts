// @oktis-works/theme-runtime - Theme Style Engine (Tailwind XOR SCSS + Isolamento Fino)
// BUSI-039 Exclusive Style Engine | BUSI-040 Fine Isolation Scoping | DECI-029

import { existsSync, readFileSync, readdirSync, realpathSync, statSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';
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
  // BUSI-040: isolamento obrigatório — false é proibido; 'manual' significa
  // que o AUTOR entregou o CSS já isolado — válido apenas para engine css.
  if ((cfg as any).isolation === false) errors.push('stylesConfig.isolation=false proibido — [data-theme="nome"] é obrigatório');
  if ((cfg as any).isolation === 'manual' && engine !== 'css') {
    errors.push('stylesConfig.isolation="manual" é válido apenas com engine css — engines com build sempre escopam');
  }
  const entry = cfg.entry ?? convention?.entry ?? null;
  if (entry && (entry.includes('..') || entry.startsWith('/') || entry.includes('\\'))) errors.push('style entry path must stay inside the theme');
  // 'manual': nada é escopado no build — a responsabilidade é do tema
  const isolated = (cfg as any).isolation !== 'manual';
  const output = cfg.output ?? 'dist/theme.css';
  if (output.includes('..') || output.startsWith('/') || output.includes('\\')) errors.push('Invalid stylesConfig.output: style output path must stay inside the theme');
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
    if (css[i] === '@' && /^@(import|charset|namespace)\b/i.test(css.slice(i))) {
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
    let depth = 1;
    let endIdx = -1;
    let quote: '"' | "'" | null = null;
    let comment = false;
    let k = braceIdx + 1;
    while (k < len) {
      if (comment) {
        if (css[k] === '*' && css[k + 1] === '/') {
          comment = false;
          k += 2;
        } else {
          k += 1;
        }
        continue;
      }
      if (!quote && css[k] === '/' && css[k + 1] === '*') {
        comment = true;
        k += 2;
        continue;
      }
      if (quote) {
        if (css[k] === '\\') k += 2;
        else if (css[k] === quote) quote = null;
        k += 1;
        continue;
      }
      if (css[k] === '"' || css[k] === "'") {
        quote = css[k] as '"' | "'";
        k += 1;
        continue;
      }
      if (css[k] === '{') depth++;
      else if (css[k] === '}') {
        depth--;
        if (depth === 0) { endIdx = k; break; }
      }
      k += 1;
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
    // Sass compatibility API for older installed Sass versions.
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
      throw new Error('Tailwind theme build requires postcss and tailwindcss to be installed');
    }
    const postcss = postcssMod.default ?? postcssMod;
    const tailwindcss = tailwindMod.default ?? tailwindMod;
    const tailwindConfigPath =
      [join(themePath, 'tailwind.config.js'), join(themePath, 'tailwind.config.cjs'), join(themePath, 'tailwind.config.mjs')].find((p) => existsSync(p)) ?? null;
    let tailwindConfig: any = {
      content: [join(themePath, '**/*.{html,js,jsx,ts,tsx}')],
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
  if (report.engine !== 'css' && !report.entry) {
    throw new Error(`No style entry found for ${report.engine} theme "${opts.themeName}"`);
  }
  if (!report.entry) return { css: '', report };
  const entryAbs = join(report.themePath, report.entry);
  if (!existsSync(entryAbs)) {
    throw new Error(`Style entry does not exist for theme "${opts.themeName}": ${report.entry}`);
  }
  let css = '';
  if (report.engine === 'scss') {
    css = await compileScss(entryAbs);
  } else if (report.engine === 'tailwind') {
    css = await compileTailwind(entryAbs, report.themePath);
  } else {
    css = readFileSync(entryAbs, 'utf-8');
  }
  if (report.engine === 'tailwind' && /@tailwind\s+(?:base|components|utilities|screens)\b/.test(css)) {
    throw new Error(`Tailwind output still contains unresolved @tailwind directives for ${opts.themeName}`);
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
  // isolamento obrigatório — sempre escopa, exceto quando o tema assumiu o
  // isolamento manual (isolation: 'manual', permitido só com engine css)
  if (report.isolated) {
    css = scopeCss(css, opts.manifest.name);
  }
  return { css, report };
}

/** Valida manifest contra BUSI-039/BUSI-040: retorna erros se ambíguo, isolamento desativado ou 'manual' fora do css. */
export function validateStyleManifest(manifest: ThemeManifest, themePath: string): string[] {
  const errors: string[] = [];
  const engine = manifest.stylesConfig?.engine;
  if (engine && !VALID_ENGINES.includes(engine)) errors.push(`stylesConfig.engine inválido: ${engine}`);
  if ((manifest.stylesConfig as any)?.isolation === false) errors.push('stylesConfig.isolation=false proibido — [data-theme="nome"] é obrigatório (BUSI-040)');
  if ((manifest.stylesConfig as any)?.isolation === 'manual' && (engine ?? 'css') !== 'css') {
    errors.push('stylesConfig.isolation="manual" é válido apenas com engine css — engines com build sempre escopam (BUSI-040)');
  }
  const hasTailwind = existsSync(join(themePath, 'tailwind.config.js')) || existsSync(join(themePath, 'tailwind.config.cjs')) || existsSync(join(themePath, 'tailwind.config.mjs'));
  const hasScss = listFilesRecursive(themePath).some((f) => f.endsWith('.scss'));
  if (hasTailwind && hasScss) errors.push('Tema contém ambos tailwind.config e .scss — escolha apenas um engine (tailwind XOR scss)');
  if (manifest.stylesConfig?.entry?.includes('..')) errors.push('stylesConfig.entry com path traversal');
  if (manifest.stylesConfig?.output && (manifest.stylesConfig.output.includes('..') || manifest.stylesConfig.output.startsWith('/') || manifest.stylesConfig.output.includes('\\'))) {
    errors.push('stylesConfig.output must remain inside the theme');
  }
  const themeRoot = resolve(themePath);
  const isRealPathInside = (target: string): boolean => {
    try {
      const realRoot = requireRealpath(themeRoot);
      const realTarget = requireRealpath(target);
      return realTarget === realRoot || realTarget.startsWith(realRoot + sep);
    } catch {
      return false;
    }
  };
  if (manifest.stylesConfig?.entry) {
    const entry = resolve(themePath, manifest.stylesConfig.entry);
    if (!entry.startsWith(themeRoot + sep) || !existsSync(entry)) {
      errors.push(`stylesConfig.entry does not exist: ${manifest.stylesConfig.entry}`);
    } else if (!isRealPathInside(entry)) {
      errors.push(`stylesConfig.entry resolves outside the theme: ${manifest.stylesConfig.entry}`);
    }
  }
  if (manifest.stylesConfig?.output) {
    const output = resolve(themePath, manifest.stylesConfig.output);
    if (!output.startsWith(themeRoot + sep)) {
      errors.push(`stylesConfig.output must remain inside the theme: ${manifest.stylesConfig.output}`);
    } else if (existsSync(output) && !isRealPathInside(output)) {
      errors.push(`stylesConfig.output resolves outside the theme: ${manifest.stylesConfig.output}`);
    } else if (!existsSync(output)) {
      errors.push(`stylesConfig.output does not exist: ${manifest.stylesConfig.output}`);
    }
  }
  const declaredAssets = [
    ...(manifest.provides?.assets ?? []),
    ...(manifest.provides?.styles ?? []),
  ];
  for (const asset of declaredAssets) {
    const target = resolve(themePath, asset);
    if (!asset || asset.includes('..') || asset.includes('\\') || asset.startsWith('/') ||
      !target.startsWith(resolve(themePath) + sep) || !existsSync(target)) {
      errors.push(`declared theme asset does not exist or escapes the theme: ${asset}`);
    } else if (!isRealPathInside(target)) {
      errors.push(`declared theme asset resolves outside the theme: ${asset}`);
    }
  }
  return errors;
}

function requireRealpath(target: string): string {
  return realpathSync(target);
}

export function getThemeScopeAttribute(themeName: string): { attr: string; selector: string } {
  return { attr: `data-theme="${themeName}"`, selector: `[data-theme="${themeName}"]` };
}
