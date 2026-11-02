# SEO Configuration

OkCMS includes complete SEO configuration: sitemap.xml, robots.txt, Open Graph meta tags, Twitter Cards, canonical URLs, and structured data (JSON-LD). All settings are tenant-aware and stored in the settings key-value store under the `seo` group.

## Admin UI

### Page: `/settings/seo`

Accessible from the sidebar under **Settings → SEO**. All SEO settings can be configured here:

| Section | Setting | Description |
|---------|---------|-------------|
| Site | Site Title | Title used in `<title>` and `og:site_name` |
| Site | Site Description | Default meta description |
| Site | Site URL | Base URL for canonical links, sitemap, robots.txt |
| Site | Language | Document language (`lang`, `og:locale`) |
| Robots | Enable robots.txt | Toggle robots.txt serving |
| Robots | Custom robots.txt rules | Raw robots.txt content |
| Robots | Default robots meta | `index,follow`, `noindex,follow`, etc. |
| Sitemap | Enable sitemap.xml | Toggle sitemap serving |
| Sitemap | Max items per sitemap | Limit (default: 50000) |
| Sitemap | Include content types | CSV of content type slugs (empty = all) |
| Sitemap | Default change frequency | `always`, `hourly`, `daily`, `weekly`, etc. |
| Sitemap | Default priority | `0.0` to `1.0` |
| Open Graph | Default type | `website`, `article`, `profile`, `book` |
| Open Graph | Default image | Fallback OG image URL |
| Twitter Cards | Card type | `summary` or `summary_large_image` |

Settings are saved via `PUT /api/v1/settings?group=seo` and read via `GET /api/v1/settings?group=seo`.

## Public Endpoints

### `GET /robots.txt`

Serves the robots.txt file based on tenant SEO settings:

- If `seo.robotsEnabled` is `false`: `User-agent: *\nDisallow:\n`
- If `seo.robotsRules` is set: returns the custom content
- Otherwise: generates default with `Allow: /` and `Sitemap: {siteUrl}/sitemap.xml`
- Content-Type: `text/plain; charset=utf-8`

Plugins can modify the output via the `okcms.seo.robots.txt` filter hook.

### `GET /sitemap.xml`

Serves the XML sitemap with:

- Hub pages (pages with `metadata.hub_type`)
- Published content items (excluding pages used as hubs)
- Configurable via settings: `seo.sitemapEnabled`, `seo.sitemapMaxItems`, `seo.sitemapIncludeTypes`, `seo.defaultChangefreq`, `seo.defaultPriority`
- Excludes redirect sources from `url_redirects`
- Content-Type: `application/xml`

Plugins can add/remove URLs via the `okcms.seo.sitemap.urls` filter hook.

## Meta Tags (Frontend Rendering)

All public pages render complete SEO meta tags via `wrapDocument()` in `apps/web/src/rendering.ts`:

```html
<meta name="robots" content="index,follow">
<link rel="canonical" href="https://example.com/page">
<meta property="og:title" content="...">
<meta property="og:description" content="...">
<meta property="og:image" content="...">
<meta property="og:type" content="website">
<meta property="og:site_name" content="...">
<meta property="og:url" content="...">
<meta property="og:locale" content="pt-BR">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="...">
<meta name="twitter:description" content="...">
<meta name="twitter:image" content="...">
```

Per-page overrides are supported via content fields: `seo_title`, `seo_description`, `seo_robots`, `seo_canonical_url`, `seo_og_image`.

## JSON-LD Structured Data

JSON-LD is injected on single content pages (`apps/web/src/jsonld.ts`):

- `BlogPosting` / `WebPage` / `CreativeWork` (main entity)
- `BreadcrumbList` (home → hub → parents → current)

## Plugin Extensibility

Plugins can hook into SEO via the hook registry (`packages/plugin-runtime/src/hook-registry.ts`):

| Hook | Type | Description |
|------|------|-------------|
| `okcms.seo.meta.tags` | filter | Inject additional `<meta>` tags in `<head>` |
| `okcms.seo.robots.txt` | filter | Modify robots.txt content |
| `okcms.seo.sitemap.urls` | filter | Add/remove sitemap URL entries |
| `theme:head` | filter | Inject arbitrary HTML into `<head>` (existing) |

Plugins can read/write SEO settings via `api.getSetting('key', 'seo')` and `api.setSetting('key', value, 'seo')`.

## Settings Storage

All SEO settings are stored in the `settings` table with `group = 'seo'`. Keys use dot notation:

- `seo.siteTitle`, `seo.siteDescription`, `seo.siteUrl`, `seo.language`
- `seo.robotsEnabled`, `seo.robotsRules`, `seo.defaultRobots`
- `seo.sitemapEnabled`, `seo.sitemapMaxItems`, `seo.sitemapIncludeTypes`
- `seo.defaultChangefreq`, `seo.defaultPriority`
- `seo.ogType`, `seo.ogImage`
- `seo.twitterCard`

The `seo` group is exposed to public themes via `PUBLIC_SETTING_GROUPS` in `apps/web/src/theme-data.ts`.

## i18n

SEO UI strings are translated in all supported admin locales under `settings.seo.*` in `apps/admin/src/i18n/locales/*.json`.
