# @oktis-works/theme-runtime

Runtime theme engine — resolves routes, renders templates, manages template hierarchy.

## Architecture

### Router (`RuntimeRouter`)

The `RuntimeRouter` resolves any path to a template using a **hub-based hierarchy**:

```typescript
interface ContentLookup {
  findByPath(path: string): Promise<RouteableContent | null>;
  findById(id: string): Promise<RouteableContent | null>;
  getSetting(key: string): Promise<string | null>;
  listTypes(): Promise<Array<{ slug: string; hasArchive: boolean }>>;
  // Hub pages (dynamic bases)
  getHubPages(): Promise<Array<{ type: string; base: string; hubPageId: string }>>;
  // Parent chain walk-up
  findParent(parentId: string): Promise<{ id: string; slug: string; type: string } | null>;
  // Persistent redirects
  findRedirect(sourcePath: string): Promise<{ targetPath: string; redirectType: number } | null>;
}

interface RouteResolution {
  matched: boolean;
  template: string | null;
  contentType: string | null;
  slug: string | null;
  data: Record<string, unknown> | null;
  record: Record<string, unknown> | null;
  isFrontPage?: boolean;
  isPageForPosts?: boolean;
  // Dynamic hierarchy
  hubBase?: string | null;        // e.g., 'blog', 'projects'
  itemPath?: string | null;       // e.g., 'cliente-a/projeto-1'
  redirectTo?: string | null;     // 301 target (with leading slash)
  canonicalPath?: string | null;  // full canonical path
}
```

### Resolution Precedence

1. **Hub page exact** (`/{base}`) → listing template for hub's type
2. **Item under hub** (`/{base}/{...path}`) → walk-up parent chain validation → single template
3. **Legacy type/slug** (`/{type}/{slug}`) → 301 to hub if hub exists for type
4. **Global single** (`/{slug}`) → 301 to hub if hub exists for content's type
5. **Static front page** (configured homepage)
6. **Fallbacks**: posts archive → home.astro

### Hub Map (`buildHubMap`)

Cached map `base → { type, hubPageId }` built from:
- Pages with `metadata.hub_type` (published, type='page')
- Legacy `postsPage` / `page_for_posts` settings for type 'post'

TTL: 30s, invalidated on page save.

### Redirect Store (`url_redirects` table)

| Type | Source | Target | Use Case |
|------|--------|--------|----------|
| Exact | `old-path` | `new-path` | slug change, parent change |
| Prefix | `old-base/*` | `new-base/*` | hub page slug rename |

Queried after walk-up validation fails.

### Template Resolver (`TemplateHierarchyResolver`)

Resolves template file from theme hierarchy: active theme → `_shared` → `default`.

Priority: specific template (e.g., `post-hello.astro`) → type template (`single.astro`, `archive.astro`) → fallback (`index.astro`, `page.astro`).

## Contract for Web App (`ContentLookup` implementation)

The web app must implement `ContentLookup` with:
- `findByPath(slug)` — published content by slug (global unique)
- `findById(id)` — for static front page
- `getSetting(key)` — site settings (with tenant fallback)
- `listTypes()` — public content types with `hasArchive`
- `getHubPages()` — pages with `metadata.hub_type`
- `findParent(parentId)` — single parent lookup
- `findRedirect(sourcePath)` — exact + prefix match

See `apps/web/src/rendering.ts:createContentLookup()`.