// @oktis-works/web - JSON-LD structured data helpers
// Generates Schema.org JSON-LD for SEO/GEO (BlogPosting, WebPage, CreativeWork, BreadcrumbList)

export interface JsonLdContext {
  /** The canonical URL of the page */
  canonicalUrl: string;
  /** The site name */
  siteName: string;
  /** The site URL */
  siteUrl: string;
  /** Hub base (e.g., 'blog', 'projects') */
  hubBase?: string;
  /** Item path relative to hub (e.g., 'cliente-a/projeto-1') */
  itemPath?: string;
  /** Parent chain slugs from root to immediate parent */
  parentChain?: string[];
  /** Page title */
  title: string;
  /** Page description */
  description?: string;
  /** Published date (ISO string) */
  datePublished?: string;
  /** Modified date (ISO string) */
  dateModified?: string;
  /** Author name */
  authorName?: string;
  /** Featured image URL */
  imageUrl?: string;
  /** Content type slug */
  contentType?: string;
}

/**
 * Builds BreadcrumbList JSON-LD from hub base and parent chain.
 * Home → Hub Base → Parent1 → Parent2 → Current Item
 */
export function buildBreadcrumbList(
  context: JsonLdContext
): Record<string, unknown> {
  const items: Record<string, unknown>[] = [];
  let position = 1;

  // Home
  items.push({
    '@type': 'ListItem',
    position: position++,
    item: {
      '@id': context.siteUrl,
      name: context.siteName,
    },
  });

  // Hub base (e.g., /blog/, /projects/)
  if (context.hubBase) {
    const hubUrl = new URL(`/${context.hubBase}/`, context.siteUrl).toString();
    items.push({
      '@type': 'ListItem',
      position: position++,
      item: {
        '@id': hubUrl,
        name: context.hubBase.charAt(0).toUpperCase() + context.hubBase.slice(1),
      },
    });
  }

  // Parent chain
  if (context.parentChain && context.parentChain.length > 0) {
    for (let i = 0; i < context.parentChain.length; i++) {
      const parentSlug = context.parentChain[i];
      if (!parentSlug) continue;
      // Build path up to this parent
      const parentPath = context.hubBase
        ? `/${context.hubBase}/${context.parentChain.slice(0, i + 1).join('/')}/`
        : `/${context.parentChain.slice(0, i + 1).join('/')}/`;
      const parentUrl = new URL(parentPath, context.siteUrl).toString();
      items.push({
        '@type': 'ListItem',
        position: position++,
        item: {
          '@id': parentUrl,
          name: parentSlug.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
        },
      });
    }
  }

  // Current item (no @id for the last item per Schema.org best practice)
  items.push({
    '@type': 'ListItem',
    position: position,
    item: {
      '@id': context.canonicalUrl,
      name: context.title,
    },
  });

  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items,
  };
}

/**
 * Determines the Schema.org type for a content type.
 */
function getSchemaOrgType(contentType: string): string {
  switch (contentType) {
    case 'post':
      return 'BlogPosting';
    case 'page':
      return 'WebPage';
    default:
      return 'CreativeWork';
  }
}

/**
 * Builds the main entity JSON-LD (BlogPosting, WebPage, CreativeWork, etc.)
 */
export function buildMainEntity(context: JsonLdContext): Record<string, unknown> {
  const schemaType = getSchemaOrgType(context.contentType ?? 'post');

  const entity: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': schemaType,
    '@id': context.canonicalUrl,
    headline: context.title,
    name: context.title,
    url: context.canonicalUrl,
  };

  if (context.description) {
    entity['description'] = context.description;
  }

  if (context.datePublished) {
    entity['datePublished'] = context.datePublished;
  }

  if (context.dateModified) {
    entity['dateModified'] = context.dateModified;
  }

  if (context.authorName) {
    entity['author'] = {
      '@type': 'Person',
      name: context.authorName,
    };
  }

  if (context.imageUrl) {
    entity['image'] = context.imageUrl;
  }

  if (context.contentType === 'post') {
    entity['articleSection'] = context.hubBase ?? 'blog';
  }

  // Publisher (site)
  entity['publisher'] = {
    '@type': 'Organization',
    name: context.siteName,
    url: context.siteUrl,
    logo: {
      '@type': 'ImageObject',
      url: new URL('/logo.png', context.siteUrl).toString(), // fallback
    },
  };

  return entity;
}

/**
 * Builds complete JSON-LD array (main entity + breadcrumb list)
 * ready for injection into <script type="application/ld+json">.
 */
export function buildJsonLd(context: JsonLdContext): Record<string, unknown>[] {
  const mainEntity = buildMainEntity(context);
  const breadcrumbList = buildBreadcrumbList(context);

  return [mainEntity, breadcrumbList];
}

/**
 * Renders JSON-LD as a script tag string for Astro templates.
 */
export function renderJsonLdScript(jsonLd: Record<string, unknown>[]): string {
  return `<script type="application/ld+json">${JSON.stringify(jsonLd, null, 2)}</script>`;
}