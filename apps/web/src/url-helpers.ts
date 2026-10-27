// @oktis-works/web - Shared URL helpers for canonical paths, sitemap, JSON-LD, RSS
// Single source of truth for building URLs from content items and hub bases.

/**
 * Builds the full canonical URL path for a content item under its hub base.
 * @param item - Content row (must have `slug` and optionally `parent_id` chain resolved)
 * @param hubBase - The hub page slug (e.g., 'blog', 'projects')
 * @param parentChain - Optional pre-computed parent slug chain (root to immediate parent)
 * @returns Full path starting with `/` (e.g., '/projects/cliente-a/projeto-1')
 */
export function buildItemUrl(
  item: { slug: string },
  hubBase: string,
  parentChain?: string[]
): string {
  const pathSegments = parentChain?.length ? [...parentChain, item.slug] : [item.slug];
  return `/${hubBase}/${pathSegments.join('/')}`;
}

/**
 * Builds the hub listing page URL (the archive for a content type).
 * @param base - The hub page slug (e.g., 'blog', 'projects')
 * @returns Path with trailing slash (e.g., '/blog/')
 */
export function _buildHubUrl(base: string): string {
  return `/${base}/`;
}

/**
 * Builds the RSS/Atom feed URL for a hub base.
 * @param base - The hub page slug
 * @returns Feed path (e.g., '/blog/feed')
 */
export function buildFeedUrl(base: string): string {
  return `/${base}/feed`;
}

/**
 * Extracts the parent chain slugs from a content record that has parent_id populated.
 * Walks up the parent chain and returns slugs from root to immediate parent.
 * @param record - Content record with parent_id (and joined parent data if available)
 * @returns Array of parent slugs from root to immediate parent
 */
export function extractParentChain(record: Record<string, unknown>): string[] {
  const chain: string[] = [];
  let current = record;

  // If the record has a parent chain pre-loaded (e.g., via recursive CTE or batch fetch)
  // we can extract it. For now, this is a placeholder for when parent data is embedded.
  // The router does walk-up via findParent, so this may not be needed in all contexts.
  while (current && (current as any).parent) {
    const parent = (current as any).parent;
    if (parent?.slug) {
      chain.unshift(parent.slug);
    }
    current = parent;
  }

  return chain;
}