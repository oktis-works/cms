# @oktis-works/theme-sdk

Theme SDK — rendering engine, template hierarchy, component rendering.

## Core Classes

### `ThemeRenderer`

Renders Astro templates to HTML with component support.

```typescript
const renderer = new ThemeRenderer(themesRoot, activeTheme);
const html = renderer.renderString(templateSource, context, globals);
```

- **Template scope** — wraps output in `data-theme="..."` for CSS isolation
- **Component rendering** — resolves `component:` imports via `TemplateComponentResolver`
- **Asset injection** — `<theme:assets>` placeholder replaced with plugin assets

### `TemplateHierarchyResolver`

Resolves template file from theme hierarchy:

```
active-theme/          → highest priority
_shared/               → shared across themes
default/               → fallback (bundled)
```

Resolution order:
1. Exact match: `post-hello.astro`
2. Type template: `single.astro` (content), `archive.astro` (listing)
3. Page template: `page.astro`, `page-blog.astro`, `page-home.astro`
4. Fallback: `index.astro`

### `TemplateContext`

Data passed to templates (from `renderContentPage`):

```typescript
interface TemplateContext {
  site: { title: string; description: string; theme: string };
  page: {
    title: string;
    description: string;
    template: string;
    type: string;
    slug: string;
    url: string;              // canonical URL
    hubBase: string;          // 'blog', 'projects'
    itemPath: string;         // 'cliente-a/projeto-1'
    canonicalPath: string;    // full canonical URL
    isPageForPosts: boolean;
    isFrontPage: boolean;
  };
  content: Record<string, unknown>;  // page fields + body
  fields: Record<string, unknown>;   // alias for content
  record: Record<string, unknown>;   // raw DB row + normalized
  items: Array<Record<string, unknown>>; // listing items (with .url)
  pagination: { page, perPage, total, pages, hasPrevious, hasNext };
  menus: { all: MenuItem[]; bySlug: Record<string, MenuItem> };
  contentTypes: ContentType[];
  taxonomies: Taxonomy[];
  terms: Record<string, Term[]>;
  settings: SiteSettings & { theme: Record<string, unknown> };
  themeData: ThemeRenderData;
  jsonLd?: string;           // pre-rendered <script type="application/ld+json"> (single pages)
}
```

### `ProjectTemplateResolver`

Watches theme files for changes (dev mode), resolves template source.

### Hooks (`theme:head`, `theme:before:render`, `theme:after:render`)

```typescript
// In plugin or theme
hooks.addFilter('theme:head', (html, { settings, activeTheme }) => {
  return html + '<meta name="custom" content="value">';
});

hooks.addFilter('theme:before:render', (data, context) => {
  return { ...data, computedField: 'value' };
});

hooks.addFilter('theme:after:render', (html, context) => {
  return html.replace('<!-- placeholder -->', 'replaced');
});
```

### `ThemeRenderData`

Aggregated data for theme rendering:

```typescript
interface ThemeRenderData {
  menus: { all: MenuItem[]; bySlug: Record<string, MenuItem> };
  contentTypes: ContentType[];
  taxonomies: Taxonomy[];
  terms: Record<string, Term[]>;
  settings: SiteSettings;
  blocks: PluginBlockCatalogEntry[];
  patterns: PluginPatternCatalogEntry[];
}
```

Loaded via `DatabaseThemeDataProvider` (tenant-scoped, cached).

## Phase 4/5 Integration

- **JSON-LD** — `jsonLd` injected into context, rendered via `<script type="application/ld+json">{{{jsonLd}}}</script>`
- **Feed auto-discovery** — not yet in `<head>`; add in theme's `<head>`:
  ```astro
  <link rel="alternate" type="application/rss+xml" title="RSS" href="/{page.hubBase}/feed" />
  <link rel="alternate" type="application/atom+xml" title="Atom" href="/{page.hubBase}/feed?format=atom" />
  ```

## Theme Development

### Manifest (`theme.json`)

```json
{
  "name": "my-theme",
  "version": "1.0.0",
  "parent": "default",           // optional parent theme
  "provides": {
    "layouts": ["single", "archive", "page"],
    "components": ["Header", "Footer"]
  },
  "settings": [
    { "name": "siteTitle", "type": "text", "default": "My Site" }
  ]
}
```

### Directory Structure

```
themes/my-theme/
├── theme.json
├── dist/                 # built by CLI (theme.css, components/)
├── src/
│   ├── components/       # .astro components
│   ├── layouts/          # layout wrappers
│   └── styles/           # CSS (compiled to dist/theme.css)
├── templates/
│   ├── index.astro
│   ├── single.astro
│   ├── archive.astro
│   ├── page.astro
│   ├── page-blog.astro
│   └── page-home.astro
└── assets/               # static files (copied to dist/)
```

### CLI Commands

```bash
okcms theme:create my-theme          # scaffold from default
okcms theme:build                    # build dist/ (CSS, components)
okcms theme:activate my-theme        # set as active in DB
```

## CSS Isolation

Theme CSS compiled to `dist/theme.css`, loaded via `<link rel="stylesheet" href="/themes/{name}/dist/theme.css" data-theme-style="{name}">`. Scoped by `data-theme="{name}"` on `<html>`.

## Plugin Blocks/Patterns

- **Blocks** — registered via `api.addBlock({ type, label, rendererPath })`, rendered in editor
- **Patterns** — pre-built block compositions, registered via `api.addPattern({ name, label, content })`

Both resolved via `resolveExtensionDirectory('plugin')` and rendered by `renderPluginBlocks()`.