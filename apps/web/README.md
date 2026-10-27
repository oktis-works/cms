# @oktis-works/web

Theme Engine Runtime — public HTTP server that renders sites via themes.

## Public Routes

| Route | Handler | Description |
|-------|---------|-------------|
| `GET /health` | health check | DB connectivity |
| `GET /themes/*` | theme assets | Static files from active theme `dist/` |
| `GET /sitemap.xml` | sitemap | Hub pages + published items (canonical URLs) |
| `GET /{hubBase}/feed` | RSS/Atom | Feed for hub type (RSS 2.0 default, `?format=atom` for Atom 1.0) |
| `GET *` | catch-all | Theme rendering via `RuntimeRouter` |

## Core Helpers (exported from `apps/web/src/`)

### `url-helpers.ts`

```typescript
// Build canonical item URL from hub base + parent chain
buildItemUrl(item: { slug: string }, hubBase: string, parentChain?: string[]): string
// → '/projects/cliente-a/projeto-1'

// Build hub listing URL
buildHubUrl(base: string): string
// → '/projects/'

// Build feed URL
buildFeedUrl(base: string): string
// → '/projects/feed'

// Extract parent chain from record (if pre-loaded)
extractParentChain(record: Record<string, unknown>): string[]
```

### `jsonld.ts`

```typescript
// Build JSON-LD array: [mainEntity, breadcrumbList]
buildJsonLd(context: JsonLdContext): Record<string, unknown>[]
```

**JsonLdContext:**
```typescript
{
  canonicalUrl: string;      // full canonical URL
  siteName: string;          // site title
  siteUrl: string;           // base site URL (e.g., 'https://example.com')
  hubBase?: string;          // 'blog', 'projects'
  itemPath?: string;         // 'cliente-a/projeto-1'
  parentChain?: string[];    // ['cliente-a']
  title: string;
  description?: string;
  datePublished?: string;    // ISO
  dateModified?: string;     // ISO
  authorName?: string;
  imageUrl?: string;
  contentType?: string;      // 'post', 'page', custom
}
```

**Output:** `[BlogPosting|WebPage|CreativeWork, BreadcrumbList]`

**Template usage:** `<script type="application/ld+json">{{{jsonLd}}}</script>`

### `rss.ts`

```typescript
// Generate both RSS 2.0 and Atom 1.0
generateFeeds(context: FeedContext): { rss: string; atom: string }
```

**FeedContext:**
```typescript
{
  hubBase: string;
  hubTitle: string;
  hubDescription?: string;
  siteName: string;
  siteUrl: string;
  contentType: string;
  items: Array<Record<string, unknown>>; // published items
  feedUrl: string;           // e.g., '/blog/feed'
}
```

**Route:** `GET /{hubBase}/feed` — auto-discovers hub type via `metadata.hub_type`.

## Template Context (injected by `renderContentPage`)

| Variable | Type | Description |
|----------|------|-------------|
| `page.url` | string | Canonical URL (e.g., `/projects/cliente-a/projeto-1`) |
| `page.hubBase` | string | Hub base slug |
| `page.itemPath` | string | Path relative to hub |
| `page.canonicalPath` | string | Same as `page.url` |
| `page.isPageForPosts` | boolean | Is posts listing |
| `page.isFrontPage` | boolean | Is static front page |
| `items[].url` | string | Canonical URL for each listing item |
| `jsonLd` | string | Pre-rendered JSON-LD script tag (single pages only) |
| `pagination` | object | `{ page, perPage, total, pages, hasPrevious, hasNext }` |

## SEO Integration (Phase 2)

- `<link rel="canonical" href="...">` — from `resolution.canonicalPath`
- `<meta property="og:url" content="...">` — same
- `<meta name="description">` — `page.seo_description` → `page.excerpt` → `siteDescription`

## Phase Summary

| Phase | Feature | Files |
|-------|---------|-------|
| 1 | Dynamic hierarchy (hub pages, parent_id, redirects) | `rendering.ts`, `index.ts`, `url-helpers.ts` |
| 2 | Head SEO (canonical, og:url, meta description fix) | `rendering.ts` (`wrapDocument`) |
| 3 | Sitemap | `index.ts` (`GET /sitemap.xml`) |
| 4 | JSON-LD + Breadcrumbs | `jsonld.ts`, `index.ts`, templates |
| 5 | RSS/Atom feeds | `rss.ts`, `index.ts` (`GET /{base}/feed`) |

## Multi-tenant

All queries scoped to `current_setting('app.current_tenant_id')` via RLS.
Theme activation stored in DB (status='ACTIVE'), read per-request — no restart needed.