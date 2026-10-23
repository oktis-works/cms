// @oktis-works/theme-runtime - Template Hierarchy Resolver

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export interface TemplateContext {
  type: string;
  slug?: string;
  isArchive?: boolean;
  isHome?: boolean;
  /**
   * Static front page (Reading Settings → homepage). Tries `front-page.astro`
   * BEFORE the regular page chain — WordPress-like `front-page.php` behavior.
   */
  isFrontPage?: boolean;
  /**
   * Override manual de layout (content.layout): template escolhido no editor.
   * Quando presente, é tentado ANTES de toda a cadeia automática (TASK-058).
   */
  layoutOverride?: string;
}

export interface ResolvedTemplate {
  /** Nome canônico do template na hierarquia. */
  name: string;
  /** Arquivo .astro resolvido (relativo ao tema). */
  file: string;
  /** Próximo fallback da cadeia (para debug/diagnóstico). */
  triedChain: string[];
}

/**
 * Cadeia de hierarquia WordPress-like (FEAT-094):
 *   {type}-{slug}.astro → {type}.astro → single/page.astro (ou archive.astro)
 *   → index.astro → 404
 *
 * Home: home.astro → index.astro → 404
 */
export function buildTemplateChain(context: TemplateContext): string[] {
  // Override manual vence a cadeia automática, mas mantém fallback.
  const layoutHead = context.layoutOverride
    ? [context.layoutOverride.endsWith('.astro') ? context.layoutOverride : `${context.layoutOverride}.astro`]
    : [];

  if (context.isHome) {
    return [...layoutHead, 'home.astro', 'index.astro', '404.astro'];
  }

  const chain: string[] = [];

  if (context.slug) {
    chain.push(`${context.type}-${context.slug}.astro`);
  }

  if (context.isArchive) {
    if (context.slug) chain.push(`taxonomy-${context.slug}.astro`);
    chain.push('archive.astro');
  } else {
    chain.push(`${context.type}.astro`);

    const generic = context.type === 'page' ? 'page.astro' : 'single.astro';
    if (generic !== `${context.type}.astro`) chain.push(generic);

    chain.push('index.astro');
  }

  chain.push('404.astro');

  // Static front page: try the dedicated front-page template first, then the
  // regular page chain (front-page.astro → {type}-{slug}.astro → {type}.astro
  // → index.astro → 404.astro).
  if (context.isFrontPage) {
    return [...layoutHead, 'front-page.astro', ...chain];
  }

  return [...layoutHead, ...chain];
}

export interface TemplateFileChecker {
  exists(file: string): Promise<boolean> | boolean;
}

export interface ProjectTemplateResolver {
  /** Cadeia de busca de temas: [tema ativo, _shared, default]. */
  templateChain: string[];
  /** true quando o arquivo existe em QUALQUER tema da cadeia. */
  exists(file: string): boolean;
  /** LÊ o arquivo do primeiro tema da cadeia que o tiver; null se nenhum tiver. */
  read(file: string): string | null;
  /** Caminho absoluto resolvido do primeiro candidato existente. */
  resolvePathFor(file: string): string | null;
}

/** Estados de tema aceitos na cadeia de fallback do projeto. */
const PROJECT_FALLBACKS = ['_shared', 'default'] as const;
const SAFE_THEME_NAME_RE = /^[A-Za-z0-9_-]+$/;

/**
 * Descoberta de templates do PROJETO — fonte única consumida pelo app web
 * (e qualquer outro runtime de projeto), no lugar de reimplementação local.
 *
 * Cadeia: [tema ativo, _shared, default] — "_shared" cobre partials de
 * projeto independentes do tema ativo e "default" é o piso final.
 *
 * Segurança: o `file` chega da hierarquia (sem nome de tema) e os nomes de
 * tema são validados — `..`/paths absolutos são negados explicitamente.
 */
export function createProjectTemplateResolver(
  themesRoot: string,
  activeTheme: string
): ProjectTemplateResolver {
  const chain: string[] = [];
  for (const theme of [activeTheme, ...PROJECT_FALLBACKS]) {
    // nome vazio/inválido OU já presente: dedupe e saneamento da cadeia
    if (!theme || !SAFE_THEME_NAME_RE.test(theme) || chain.includes(theme)) continue;
    chain.push(theme);
  }

  const all = (file: string): string[] =>
    chain
      .map((theme) => safeTarget(themesRoot, theme, file))
      .filter((target): target is string => target !== null);

  return {
    templateChain: chain,
    exists(file: string): boolean {
      return all(file).some((candidate) => existsSync(candidate));
    },
    read(file: string): string | null {
      for (const candidate of all(file)) {
        if (existsSync(candidate)) return readFileSync(candidate, 'utf-8');
      }
      return null;
    },
    resolvePathFor(file: string): string | null {
      return all(file).find((candidate) => existsSync(candidate)) ?? null;
    },
  } satisfies ProjectTemplateResolver;
}

function safeTarget(themesRoot: string, theme: string, file: string): string | null {
  if (!file || file.includes('..') || file.startsWith('/')) return null;
  const target = join(themesRoot, theme, file);
  return target === themesRoot || target.startsWith(themesRoot + '/') ? target : null;
}

export class TemplateHierarchyResolver {
  constructor(private readonly fileChecker: TemplateFileChecker) {}

  async resolve(context: TemplateContext): Promise<ResolvedTemplate> {
    const chain = buildTemplateChain(context);

    for (const candidate of chain) {
      if (await this.fileChecker.exists(candidate)) {
        return {
          name: candidate.replace(/\.astro$/, ''),
          file: candidate,
          triedChain: chain.slice(0, chain.indexOf(candidate) + 1),
        };
      }
    }

    return {
      name: '404',
      file: '404.astro',
      triedChain: chain,
    };
  }
}
