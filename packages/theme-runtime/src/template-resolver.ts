// @oktis-works/theme-runtime - Template Hierarchy Resolver

export interface TemplateContext {
  type: string;
  slug?: string;
  isArchive?: boolean;
  isHome?: boolean;
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

  return [...layoutHead, ...chain];
}

export interface TemplateFileChecker {
  exists(file: string): Promise<boolean> | boolean;
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
