# @oktis-works/admin

Admin panel — content management, settings, themes, plugins, users.

## Reading Settings (`/settings/reading`)

Configures **Static Front Page** (WordPress-style) and **Hub Pages** (dynamic bases).

### Static Front Page

| Setting | Description |
|---------|-------------|
| **Your homepage displays** | `latest` (posts archive) or `static` (a page) |
| **Homepage** | Page to use as front page (when `static`) |
| **Posts page** | Page to use as posts listing (legacy `postsPage`, maps to hub for type `post`) |

Saves to `settings` table (group `reading`): `frontPageDisplays`, `frontPage`, `postsPage`.

### Hub Pages (Dynamic Bases) — Phase 1

Generalizes "Posts page" to **any content type with `hasArchive`**.

**UI:** Table with rows `[Content Type] [Page] [Remove]` + "Add Hub Page" button.

| Column | Description |
|--------|-------------|
| **Content Type** | Select from public types with `hasArchive=true` (Post, Project, custom) |
| **Page** | Published page (type=page) to act as hub |
| **Remove** | Deletes hub designation |

**Storage:** On page, `metadata.hub_type = 'project'` (or 'post', 'docs', etc.)

**Behavior:**
- Page slug becomes URL base for that type (`/projects/`, `/blog/`)
- Renaming page slug → auto-creates prefix redirect (`/old-base/*` → `/new-base/*`)
- Hub page renders listing template (`archive.astro` or type-specific) with `isPageForPosts` flag

**Back-compat:** `postsPage`/`page_for_posts` still work for type `post`; dynamic hub takes precedence.

## Content Editor (`/content/{type}`)

Classic editor with sidebar for meta fields.

### Parent Select (Hierarchical URLs) — Phase 1

For types that support hierarchy (not singleton):

| Field | Behavior |
|-------|----------|
| **Parent** | Select dropdown of published items of same type |
| **Excludes** | Self + descendants (prevents cycles) |
| **Empty** | No parent (root item) |

**Payload:** `parentId` sent to API on create/update.

**Validation (server-side):**
- Same type required
- Same tenant required
- No cycles (walk-up check)
- Max depth 5

### Save Payload

```typescript
{
  title: string,
  slug: string,
  excerpt?: string,
  featuredImageId?: string,
  seoTitle?: string,
  seoDescription?: string,
  status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED' | 'TRASHED',
  layout?: string | null,
  parentId?: string,    // NEW
  body: { /* logical values */ }
}
```

### Layout Selector

Shows layouts provided by active theme (`theme.manifest.provides.layouts`).

### Plugin Editor Slots

- **Replace-body** — plugin owns entire body editor
- **Below** — plugin UI under unified field tree
- **Metaboxes** — normal/side/advanced contexts

## i18n Keys (Phase 1 additions)

```json
{
  "content": {
    "editor": {
      "parent": "Parent",
      "parentPlaceholder": "Select parent (optional)"
    }
  },
  "settings": {
    "reading": {
      "hubPages": "Listing Pages (Hubs)",
      "hubPages": {
        "empty": "No listing pages configured yet.",
        "type": "Content Type",
        "page": "Page",
        "selectType": "— Select content type —",
        "selectPage": "— Select page —",
        "add": "Add Listing Page",
        "remove": "Remove",
        "description": "Each listing page acts as the base URL for a content type (e.g. /blog/ for posts, /projects/ for projects). The page's slug becomes the URL base."
      }
    }
  }
}
```

## Phase 1 Integration

| Feature | Component |
|---------|-----------|
| Hub pages UI | `ReadingSettings.tsx` — table + add/remove |
| Parent select | `ContentEditor.tsx` — dropdown in sidebar |
| i18n | `locales/en.json` (and others) |
| API | `apiClient.updateContent(pageId, { metadata: { hub_type } })` |