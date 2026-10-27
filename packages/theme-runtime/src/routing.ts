// @oktis-works/theme-runtime - Runtime Routing (catch-all SSR + targeted revalidation)

import type { TemplateHierarchyResolver, TemplateContext } from './template-resolver.js';

export interface HubInfo {
  type: string;
  base: string;        // slug da página hub (ex: 'blog', 'projects')
  hubPageId: string;   // ID da página hub
}

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
  /** True quando a rota é a front page estática (Reading Settings → homepage). */
  isFrontPage?: boolean;
  // NOVO: suporte a bases dinâmicas e aninhamento
  hubBase?: string | null;        // base do tipo (ex: 'blog', 'projects')
  itemPath?: string | null;       // path relativo ao base (ex: 'cliente-a/projeto-1')
  redirectTo?: string | null;     // se não nulo, web emite 301 para este path (com leading slash)
  canonicalPath?: string | null;  // path canônico completo (ex: '/projects/cliente-a/projeto-1')
}

export interface ContentLookup {
  /** Retorna o tipo de conteúdo e dados para um caminho de URL (slug final). */
  findByPath(path: string): Promise<{ type: string; slug: string; data: Record<string, unknown>; layout?: string | null; record?: Record<string, unknown> } | null>;
  /** Retorna conteúdo por ID (usado para Static Front Page). */
  findById(id: string): Promise<{ type: string; slug: string; data: Record<string, unknown>; layout?: string | null; record?: Record<string, unknown> } | null>;
  /** Retorna valor de uma setting pública por chave (ex: static_front_page, page_for_posts). */
  getSetting(key: string): Promise<string | null>;
  listTypes(): Promise<Array<{ slug: string; hasArchive: boolean }>>;
  // NOVO: mapa de hubs (base → tipo) para o tenant atual
  getHubPages(): Promise<Array<{ type: string; base: string; hubPageId: string }>>;
  // NOVO: buscar pai direto (para walk-up validation)
  findParent(parentId: string): Promise<{ id: string; slug: string; type: string } | null>;
  // NOVO: consultar store de redirects
  findRedirect(sourcePath: string): Promise<{ targetPath: string; redirectType: number } | null>;
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
  private hubMapCache: Map<string, HubInfo> | null = null;
  private hubMapCacheTime = 0;
  private readonly HUB_MAP_TTL = 30000; // 30s cache

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
   * ID da página configurada como página de posts — canônica `postsPage`
   * (o que o admin salva em Reading Settings) com fallback legado
   * `page_for_posts` (chave do seed em instalações que nunca salvaram o
   * formulário).
   */
  private async postsPageId(): Promise<string | null> {
    return (await this.setting('postsPage')) ?? (await this.setting('page_for_posts'));
  }

  /**
   * True quando o conteúdo É a página configurada como página de posts: a
   * listagem do blog precisa do template dedicado (`posts.astro`, WP
   * `home.php`) e do feed de itens publicados (`isPageForPosts`) — em
   * qualquer profundidade de URL, não só no fallback de `/`.
   */
  private async matchesPostsPage(content: {
    type: string;
    record?: Record<string, unknown>;
  }): Promise<boolean> {
    if (content.type !== 'page') return false;
    const rawId = content.record?.['id'];
    if (typeof rawId !== 'string' && typeof rawId !== 'number') return false;
    const postsPageId = await this.postsPageId();
    return postsPageId !== null && postsPageId === String(rawId);
  }

  /**
   * Constrói o mapa base → tipo a partir de hub pages dinâmicas + postsPage legado.
   * Cacheado por 30s.
   */
  private async buildHubMap(): Promise<Map<string, HubInfo>> {
    const now = Date.now();
    if (this.hubMapCache && now - this.hubMapCacheTime < this.HUB_MAP_TTL) {
      return this.hubMapCache;
    }

    const map = new Map<string, HubInfo>();

    // 1) Hub pages dinâmicas (metadata.hub_type nas páginas publicadas)
    const hubPages = await this.lookup.getHubPages();
    for (const hp of hubPages) {
      if (hp.base && hp.type) {
        map.set(hp.base, { type: hp.type, base: hp.base, hubPageId: hp.hubPageId });
      }
    }

    // 2) Legado: postsPage / page_for_posts → tipo 'post'
    const postsPageId = await this.postsPageId();
    if (postsPageId) {
      const page = await this.lookup.findById(postsPageId);
      if (page && page.type === 'page' && page.slug) {
        // Hub dinâmico para 'post' tem precedência (fonte única de verdade)
        if (!map.has(page.slug)) {
          map.set(page.slug, { type: 'post', base: page.slug, hubPageId: postsPageId });
        }
      }
    }

    this.hubMapCache = map;
    this.hubMapCacheTime = now;
    return map;
  }

  /**
   * Invalida o cache do hub map (chamado quando uma página hub é salva/atualizada).
   */
  invalidateHubMapCache(): void {
    this.hubMapCache = null;
  }

  /**
   * Resolve um caminho arbitrário (catch-all [...slug]) para um template.
   * Ordem de precedência:
   *  1. Hub page exata: /{base} → listing do tipo do hub
   *  2. Item sob hub: /{base}/{...path} → walk-up validation → single
   *  3. Legacy /{type}/{slug} → 301 para hub se hub existir para o tipo
   *  4. Root single /{slug} → 301 para hub se hub existir para o tipo
   *  5. Static front page (existing)
   *  6. Fallbacks (archive, home)
   */
  async resolve(path: string): Promise<RouteResolution> {
    const normalized = path.replace(/^\/+|\/+$/g, '');
    const segments = normalized.split('/').filter(Boolean);

    const hubMap = await this.buildHubMap();

    // 0) Raiz
    if (segments.length === 0) {
      return this.resolveRoot();
    }

    // 1) Hub page exata: /{base}
    if (segments.length === 1) {
      const first = segments[0]!;
      const hub = hubMap.get(first);
      if (hub) {
        return this.resolveHubListing(hub, first);
      }
    }

    // 1b) Type archive (legacy): /{type} where type has hasArchive=true
    // Only if no hub page claimed this segment
    if (segments.length === 1) {
      const first = segments[0]!;
      if (!hubMap.has(first)) {
        const types = await this.lookup.listTypes();
        const matchingType = types.find((type) => type.slug === first && type.hasArchive);
        if (matchingType) {
          const resolved = await this.resolver.resolve({ type: matchingType.slug, isArchive: true });
          return { matched: true, template: resolved.file, contentType: matchingType.slug };
        }
      }
    }

    // 2) Item sob hub: /{base}/{...path}
    if (segments.length >= 2) {
      const first = segments[0]!;
      const hub = hubMap.get(first);
      if (hub) {
        return await this.resolveUnderHub(hub, segments.slice(1));
      }
    }

    // 3) Legacy /{type}/{slug} (type literal) — fallback
    if (segments.length === 2) {
      return await this.resolveLegacyTypeSlug(segments[0]!, segments[1]!, hubMap);
    }

    // 4) Single global /{slug} (único segmento) — já coberto pelo caso 1, mas mantido para clareza
    if (segments.length === 1) {
      return await this.resolveGlobalSlug(segments[0]!, hubMap);
    }

    return { matched: false };
  }

  /**
   * Raiz: static front page → posts page → posts archive → home.astro
   */
  private async resolveRoot(): Promise<RouteResolution> {
    // Static Front Page
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
          isFrontPage: true,
          layoutOverride: page.layout ?? undefined
        });
        return {
          matched: true,
          template: resolved.file,
          contentType: page.type,
          slug: page.slug,
          data: page.data,
          record: page.record,
          isFrontPage: true
        };
      }
    }

    // Fallback: página de posts (postsPage do admin, depois a legada page_for_posts)
    const pageForPostsId = await this.postsPageId();
    if (pageForPostsId) {
      const page = await this.lookup.findById(pageForPostsId);
      if (page && page.type === 'page') {
        const resolved = await this.resolver.resolve({
          type: page.type,
          slug: page.slug,
          isPostsPage: true,
          layoutOverride: page.layout ?? undefined
        });
        return {
          matched: true,
          template: resolved.file,
          contentType: page.type,
          slug: page.slug,
          data: page.data,
          record: page.record,
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

  /**
   * Hub page exata: /{base} → listing do tipo do hub (template archive do tipo).
   */
  private async resolveHubListing(hub: HubInfo, base: string): Promise<RouteResolution> {
    const resolved = await this.resolver.resolve({ type: hub.type, isArchive: true });
    const hubPage = await this.lookup.findById(hub.hubPageId);
    return {
      matched: true,
      template: resolved.file,
      contentType: hub.type,
      slug: base,
      data: hubPage?.data ?? {},
      record: hubPage?.record ?? {},
      hubBase: hub.base,
      itemPath: '',
      canonicalPath: `/${hub.base}/`,
      // Sinaliza que é a página de listagem do tipo para o web buscar items
      isPageForPosts: hub.type === 'post'
    } as RouteResolution & { isPageForPosts?: boolean };
  }

  /**
   * Item sob hub: /{base}/{...path}
   * Valida a cadeia de pais via walk-up.
   */
  private async resolveUnderHub(
    hub: HubInfo,
    pathSegments: string[]
  ): Promise<RouteResolution> {
    // Último segmento = slug do item (já validado length >= 2 no caller)
    const itemSlug = pathSegments[pathSegments.length - 1]!;
    const parentSegments = pathSegments.slice(0, -1); // pode ser vazio

    const item = await this.lookup.findByPath(itemSlug);
    if (!item || item.type !== hub.type) {
      // Tentar redirect store antes de desistir
      const fullPath = normalizedPathFromSegments([hub.base, ...pathSegments]);
      const redirect = await this.lookup.findRedirect(fullPath);
      if (redirect) {
        return {
          matched: true,
          redirectTo: `/${redirect.targetPath}`,
          canonicalPath: `/${redirect.targetPath}`
        };
      }
      return { matched: false };
    }

    // Validar cadeia de pais bate com parentSegments (walk-up)
    const valid = await this.validateParentChain(item.record?.['id'] as string | undefined, parentSegments);
    if (!valid) {
      // Tentar redirect store
      const fullPath = normalizedPathFromSegments([hub.base, ...pathSegments]);
      const redirect = await this.lookup.findRedirect(fullPath);
      if (redirect) {
        return {
          matched: true,
          redirectTo: `/${redirect.targetPath}`,
          canonicalPath: `/${redirect.targetPath}`
        };
      }
      return { matched: false };
    }

    const resolved = await this.resolver.resolve({
      type: hub.type,
      slug: item.slug,
      layoutOverride: item.layout ?? undefined
    });

    const itemPath = pathSegments.join('/');
    return {
      matched: true,
      template: resolved.file,
      contentType: hub.type,
      slug: item.slug,
      data: item.data,
      record: item.record,
      hubBase: hub.base,
      itemPath,
      canonicalPath: `/${hub.base}/${itemPath}`
    };
  }

  /**
   * Legacy /{type}/{slug}: se existe hub para este tipo, 301 para /{base}/{slug}.
   * Senão, resolve direto (formato antigo ainda funciona para tipos sem hub).
   */
  private async resolveLegacyTypeSlug(
    typeSegment: string,
    slug: string,
    hubMap: Map<string, HubInfo>
  ): Promise<RouteResolution> {
    // Se existe hub para este tipo, 301 para /{base}/{slug}
    const hub = Array.from(hubMap.values()).find((h) => h.type === typeSegment);
    if (hub) {
      return {
        matched: true,
        redirectTo: `/${hub.base}/${slug}`,
        canonicalPath: `/${hub.base}/${slug}`
      };
    }
    // Sem hub → resolve direto (formato antigo ainda funciona)
    return this.resolveDirectTypeSlug(typeSegment, slug);
  }

  /**
   * Resolve direto /{type}/{slug} sem hub (compatibilidade).
   */
  private async resolveDirectTypeSlug(
    typeSegment: string,
    slug: string
  ): Promise<RouteResolution> {
    const content = await this.lookup.findByPath(slug);
    if (content && content.type === typeSegment) {
      const isPostsPage = await this.matchesPostsPage(content);
      const resolved = await this.resolver.resolve({
        type: content.type,
        slug: content.slug,
        isPostsPage,
        layoutOverride: content.layout ?? undefined
      });
      return {
        matched: true,
        template: resolved.file,
        contentType: content.type,
        slug: content.slug,
        data: content.data,
        record: content.record,
        ...(isPostsPage ? { isPageForPosts: true } : {})
      };
    }
    return { matched: false };
  }

  /**
   * Single global /{slug}: busca por slug único.
   * Se o tipo do conteúdo tem hub, 301 para /{base}/{slug}.
   */
  private async resolveGlobalSlug(
    slug: string,
    hubMap: Map<string, HubInfo>
  ): Promise<RouteResolution> {
    const content = await this.lookup.findByPath(slug);
    if (!content) {
      // Tentar redirect store
      const redirect = await this.lookup.findRedirect(slug);
      if (redirect) {
        return {
          matched: true,
          redirectTo: `/${redirect.targetPath}`,
          canonicalPath: `/${redirect.targetPath}`
        };
      }
      return { matched: false };
    }

    // Se tipo tem hub, 301 para canonical
    const hub = Array.from(hubMap.values()).find((h) => h.type === content.type);
    if (hub) {
      // Precisa construir o path completo do item (pode ter pais)
      const parentSegments = await this.buildItemParentSegments(content.record?.['id'] as string | undefined);
      const itemPath = parentSegments.length > 0
        ? [...parentSegments, content.slug].join('/')
        : content.slug;
      return {
        matched: true,
        redirectTo: `/${hub.base}/${itemPath}`,
        canonicalPath: `/${hub.base}/${itemPath}`
      };
    }

    // Sem hub → renderiza direto (formato antigo)
    const isPostsPage = await this.matchesPostsPage(content);
    const resolved = await this.resolver.resolve({
      type: content.type,
      slug: content.slug,
      isPostsPage,
      layoutOverride: content.layout ?? undefined
    });
    return {
      matched: true,
      template: resolved.file,
      contentType: content.type,
      slug: content.slug,
      data: content.data,
      record: content.record,
      ...(isPostsPage ? { isPageForPosts: true } : {})
    };
  }

  /**
   * Valida se a cadeia de pais do item bate com os segmentos esperados.
   * Walk-up: sobe do item até root coletando slugs, compara com parentSegments.
   */
  private async validateParentChain(
    itemId: string | undefined,
    expectedParentSegments: string[]
  ): Promise<boolean> {
    if (!itemId) return expectedParentSegments.length === 0;

    const actualSegments: string[] = [];
    let currentId: string | null = itemId;
    const visited = new Set<string>();

    while (true) {
      const parent = await this.lookup.findParent(currentId);
      if (!parent || !parent.id) break;
      if (visited.has(parent.id)) break;
      visited.add(parent.id);
      actualSegments.unshift(parent.slug);
      currentId = parent.id;
    }

    // Comparar (ignorando o base, que já foi validado pelo hubMap)
    if (actualSegments.length !== expectedParentSegments.length) return false;
    for (let i = 0; i < actualSegments.length; i++) {
      if (actualSegments[i] !== expectedParentSegments[i]) return false;
    }
    return true;
  }

  /**
   * Constrói segmentos de pais do item (para canonical path no global slug fallback).
   */
  private async buildItemParentSegments(itemId: string | undefined): Promise<string[]> {
    if (!itemId) return [];
    const segments: string[] = [];
    let currentId: string | null = itemId;
    const visited = new Set<string>();

    while (true) {
      const parent = await this.lookup.findParent(currentId);
      if (!parent || !parent.id) break;
      if (visited.has(parent.id)) break;
      visited.add(parent.id);
      segments.unshift(parent.slug);
      currentId = parent.id;
    }
    return segments;
  }
}

function normalizedPathFromSegments(segments: string[]): string {
  return segments.join('/');
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