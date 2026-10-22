// @oktis-works/theme-runtime - Runtime Routing (catch-all SSR + targeted revalidation)

import type { TemplateHierarchyResolver, TemplateContext } from './template-resolver.js';

export interface RouteResolution {
  matched: boolean;
  template?: string;
  contentType?: string;
  slug?: string;
  /**
   * Dados do conteúdo resolvido (já enriquecidos com mídia real e _terms).
   * O app web usa este payload diretamente — sem re-consultar a row crua.
   */
  data?: Record<string, unknown>;
  /** Row completa do conteúdo (colunas + body) para a API contextual do SDK. */
  record?: Record<string, unknown>;
  /** True quando a rota resolveu para a página configurada como page_for_posts. */
  isPageForPosts?: boolean;
}

export interface ContentLookup {
  /** Retorna o tipo de conteúdo e dados para um caminho de URL. */
  findByPath(path: string): Promise<{ type: string; slug: string; data: Record<string, unknown>; layout?: string | null; record?: Record<string, unknown> } | null>;
  /** Retorna conteúdo por ID (usado para Static Front Page). */
  findById(id: string): Promise<{ type: string; slug: string; data: Record<string, unknown>; layout?: string | null; record?: Record<string, unknown> } | null>;
  /** Retorna valor de uma setting pública por chave (ex: static_front_page, page_for_posts). */
  getSetting(key: string): Promise<string | null>;
  listTypes(): Promise<Array<{ slug: string; hasArchive: boolean }>>;
}

/** Contrato mínimo do barramento de eventos (@oktis-works/core). */
export interface EventEmitLike {
  emit(event: {
    id: string;
    type: string;
    aggregateType: string;
    aggregateId: string;
    payload: Record<string, unknown> | { paths: string[]; tags: string[] };
    processed: boolean;
    createdAt: Date;
  }): Promise<void>;
}

export class RuntimeRouter {
  constructor(
    private readonly lookup: ContentLookup,
    private readonly resolver: TemplateHierarchyResolver
  ) {}

  /**
   * Lê uma setting pública tratando string vazia como ausente (o formulário
   * do admin salva `''` quando nenhum valor foi escolhido).
   */
  private async setting(key: string): Promise<string | null> {
    const value = await this.lookup.getSetting(key);
    return value && value.length > 0 ? value : null;
  }

  /**
   * Resolve um caminho arbitrário (catch-all [...slug]) para um template.
   * Ordem: Static Front Page → content-type archive → conteúdo por slug.
   */
  async resolve(path: string): Promise<RouteResolution> {
    const normalized = path.replace(/^\/+|\/+$/g, '');
    const segments = normalized.split('/').filter(Boolean);

    if (segments.length === 0) {
      // Static Front Page: a página configurada como home. As chaves canônicas
      // são as que o admin salva (frontPageDisplays/frontPage); as chaves
      // legadas do seed (static_front_page) permanecem como fallback para
      // instalações que nunca salvaram o formulário. 'latest' desativa a
      // página estática explicitamente (o usuário pediu lista de posts).
      const displays = await this.setting('frontPageDisplays');
      const staticFrontPageId =
        displays === 'static'
          ? await this.setting('frontPage')
          : displays === 'latest'
            ? null
            : await this.setting('static_front_page');
      if (staticFrontPageId) {
        const page = await this.lookup.findById(staticFrontPageId);
        if (page && page.type === 'page') {
          const resolved = await this.resolver.resolve({
            type: page.type,
            slug: page.slug,
            layoutOverride: page.layout ?? undefined
          });
          return {
            matched: true,
            template: resolved.file,
            contentType: page.type,
            slug: page.slug,
            data: page.data,
            record: page.record
          };
        }
      }

      // Fallback: página de posts (postsPage do admin, depois a legada page_for_posts)
      const pageForPostsId = (await this.setting('postsPage')) ?? (await this.setting('page_for_posts'));
      if (pageForPostsId) {
        const page = await this.lookup.findById(pageForPostsId);
        if (page && page.type === 'page') {
          const resolved = await this.resolver.resolve({
            type: page.type,
            slug: page.slug,
            layoutOverride: page.layout ?? undefined
          });
          return {
            matched: true,
            template: resolved.file,
            contentType: page.type,
            slug: page.slug,
            data: page.data,
            record: page.record,
            // Sinaliza que é a página de posts para o template receber items
            isPageForPosts: true
          } as RouteResolution & { isPageForPosts?: boolean };
        }
      }

      // Fallback final: archive de posts (estilo "latest posts")
      const types = await this.lookup.listTypes();
      const postType = types.find((t) => t.slug === 'post' && t.hasArchive);
      if (postType) {
        const resolved = await this.resolver.resolve({ type: postType.slug, isArchive: true });
        return { matched: true, template: resolved.file, contentType: postType.slug };
      }

      // Último recurso: home.astro se existir no tema
      const resolved = await this.resolver.resolve({ type: 'page', isHome: true });
      return { matched: true, template: resolved.file };
    }

    const [firstSegmentRaw] = segments;
    const firstSegment = firstSegmentRaw ?? '';

    if (segments.length === 1) {
      // Tenta conteúdo primeiro (slug único), depois arquivo do tipo.
      const content = await this.lookup.findByPath(firstSegment);
      if (content) {
        const resolved = await this.resolver.resolve({ type: content.type, slug: content.slug, layoutOverride: content.layout ?? undefined });
        return { matched: true, template: resolved.file, contentType: content.type, slug: content.slug, data: content.data, record: content.record };
      }

      const types = await this.lookup.listTypes();
      const matchingType = types.find((type) => type.slug === firstSegment && type.hasArchive);
      if (matchingType) {
        const resolved = await this.resolver.resolve({ type: matchingType.slug, isArchive: true });
        return { matched: true, template: resolved.file, contentType: matchingType.slug };
      }
    } else {
      // URL aninhada: /{tipo}/{slug} — o primeiro segmento deve casar com o tipo.
      const typeSegment = segments[0] ?? '';
      const slug = segments[segments.length - 1] ?? '';
      const content = await this.lookup.findByPath(slug);
      if (content && content.type === typeSegment) {
        const resolved = await this.resolver.resolve({ type: content.type, slug: content.slug, layoutOverride: content.layout ?? undefined });
        return { matched: true, template: resolved.file, contentType: content.type, slug: content.slug, data: content.data, record: content.record };
      }
    }

    return { matched: false };
  }
}

/**
 * Revalidação direcionada: publica um evento que os workers do app web
 * consomem para invalidar apenas as rotas afetadas pelo conteúdo alterado.
 */
export async function targetedRevalidate(
  bus: EventEmitLike,
  input: {
    paths: string[];
    tags: string[];
    tenantId: string;
  }
): Promise<void> {
  await bus.emit({
    id: crypto.randomUUID(),
    type: 'theme.route.revalidate',
    aggregateType: 'route',
    aggregateId: input.tenantId,
    payload: {
      paths: input.paths,
      tags: input.tags,
    },
    processed: false,
    createdAt: new Date(),
  });
}

export type { TemplateContext };
