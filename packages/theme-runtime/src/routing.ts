// @oktis-works/theme-runtime - Runtime Routing (catch-all SSR + targeted revalidation)

import type { TemplateHierarchyResolver, TemplateContext } from './template-resolver.js';

export interface RouteResolution {
  matched: boolean;
  template?: string;
  contentType?: string;
  slug?: string;
}

export interface ContentLookup {
  /** Retorna o tipo de conteúdo e dados para um caminho de URL. */
  findByPath(path: string): Promise<{ type: string; slug: string; data: Record<string, unknown>; layout?: string | null } | null>;
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
   * Resolve um caminho arbitrário (catch-all [...slug]) para um template.
   * Ordem: home → content-type archive → conteúdo por slug.
   */
  async resolve(path: string): Promise<RouteResolution> {
    const normalized = path.replace(/^\/+|\/+$/g, '');
    const segments = normalized.split('/').filter(Boolean);

    if (segments.length === 0) {
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
        return { matched: true, template: resolved.file, contentType: content.type, slug: content.slug };
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
        return { matched: true, template: resolved.file, contentType: content.type, slug: content.slug };
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
