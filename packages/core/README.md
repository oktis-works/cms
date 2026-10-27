# @oktis-works/core

Core domain logic — content management, events, hooks, cache, tenants, plugins.

## Content Service (`ContentService`)

Manages content lifecycle: create, update, publish, delete, revisions.

### Inputs (Phase 1: Hierarchical URLs)

```typescript
interface CreateContentInput {
  type: string;
  title: string;
  tenantId: string;
  slug?: string;
  body?: Record<string, unknown>;
  excerpt?: string;
  status?: ContentStatus;
  authorId: string;
  featuredImageId?: string;
  seoTitle?: string;
  seoDescription?: string;
  metadata?: Record<string, unknown>;
  layout?: string | null;
  parentId?: string;          // NEW: hierarchical parent (same type, same tenant)
}

interface UpdateContentInput {
  title?: string;
  slug?: string;
  body?: Record<string, unknown>;
  excerpt?: string;
  status?: ContentStatus;
  featuredImageId?: string;
  seoTitle?: string;
  seoDescription?: string;
  metadata?: Record<string, unknown>;
  layout?: string | null;
  parentId?: string | null;   // NEW: null = remove parent
}
```

### Parent Chain Validation (`validateParentChain`)

Called before INSERT/UPDATE:

1. **Same type** — parent must be same content type
2. **Same tenant** — enforced by query
3. **No cycles** — walks up from new parent, rejects if childId encountered
4. **Max depth 5** — prevents excessive nesting

### Path Helpers

```typescript
// Build parent chain slugs (root → immediate parent)
buildItemPathSegments(sql, tenantId, itemId): Promise<string[]>
// → ['cliente-a'] for item whose parent is 'cliente-a'

// Full path without hub base
buildFullPath(sql, tenantId, type, slug, parentId): Promise<string>
// → 'cliente-a/projeto-1'
```

### Persistent Redirects (`url_redirects` table)

Recorded automatically on mutations:

| Trigger | Redirect Type | Source | Target | Reason |
|---------|---------------|--------|--------|--------|
| slug change | exact | old-path | new-path | `slug_change` |
| parent change | exact | old-path | new-path | `parent_change` |
| hub page slug change | prefix | `old-base/*` | `new-base/*` | `base_rename` |

Queried by router for 301s when walk-up validation fails.

### Post Type Registry (`postTypeRegistry`)

```typescript
interface ContentTypeDefinition {
  slug: string;           // 'post', 'page', 'project'
  name: string;           // 'Post'
  pluralLabel: string;    // 'Posts'
  singularLabel: string;  // 'Post'
  hasArchive: boolean;    // enables /{base}/ listing
  singleton: boolean;     // only one instance allowed
  public: boolean;        // visible in admin/API
  menuIcon: string;       // admin icon
  supports: string[];     // ['title', 'editor', 'excerpt', 'thumbnail']
  source: 'CORE' | 'PLUGIN' | 'ADMIN';
}
```

### Hooks

- `before_save_content:{type}` — filter input body before save
- `after_save_content:{type}` — react to create/update
- `content_query` — filter list queries (tenant, status, etc.)

### Events

Emitted via `EventBus` (persisted in `EventStore`):

- `content.created` — `{ content }`
- `content.updated` — `{ content, previousVersion }`
- `content.published` — `{ content, previousStatus }`
- `content.unpublished` — `{ content, previousStatus }`

Idempotent by event ID (UUID v4). Dead-letter queue for failed handlers.

### Multi-tenant

All queries run inside `runWithTenantTransaction(tenantId, fn)` or `runWithTenantContext({ tenantId }, fn)`. RLS enforces tenant isolation at DB level.

## Phase 1 Integration

| Feature | Implementation |
|---------|----------------|
| `parent_id` column | Migration V027, `Content` type |
| Cycle validation | `validateParentChain()` in `create()`/`update()` |
| Path building | `buildItemPathSegments()`, `buildFullPath()` |
| Redirect recording | `recordExactRedirect()`, `recordPrefixRedirect()` in `update()` |
| Hub page detection | `metadata.hub_type` on page update |

## Related Packages

- `@oktis-works/theme-runtime` — router consumes `ContentLookup`
- `@oktis-works/database` — migrations, connections, RLS
- `@oktis-works/plugin-runtime` — hook registry, event bus
- `@oktis-works/validation` — field groups, logical values