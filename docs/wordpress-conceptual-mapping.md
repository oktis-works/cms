# WordPress → OkCMS Conceptual Mapping

> **Reference for developers migrating from WordPress or building WP-compatible tools.**
>
> This document maps WordPress core concepts to their OkCMS equivalents, explaining architectural differences and providing code examples for common operations.

---

## Table of Contents

1. [Core Philosophy](#core-philosophy)
2. [Entity Mapping Table](#entity-mapping-table)
3. [Field-Level Mapping](#field-level-mapping)
4. [Taxonomy System](#taxonomy-system)
5. [User & Permission Model](#user--permission-model)
6. [Media & Files](#media--files)
7. [Settings & Options](#settings--options)
8. [Menus & Navigation](#menus--navigation)
9. [Comments](#comments)
10. [Extensibility: Plugins → Field Types](#extensibility-plugins--field-types)
11. [Query API Comparison](#query-api-comparison)
12. [Common Migration Gotchas](#common-migration-gotchas)

---

## Core Philosophy

### WordPress: "Everything is a Post + Meta (EAV)"

WordPress uses a **denormalized Entity-Attribute-Value (EAV)** pattern:
- **`wp_posts`** table stores all content types (posts, pages, attachments, revisions, menu items, custom post types) differentiated by `post_type` column
- **`wp_postmeta`** stores ALL custom fields as key/value pairs (serialized PHP strings)
- **`wp_terms` + `wp_term_taxonomy` + `wp_term_relationships`** for taxonomies (terms shared across taxonomies)
- **`wp_users` + `wp_usermeta`** for users and capabilities
- **Multisite** = table prefixes per site (not true multi-tenancy)

**Trade-offs**: Simple schema, maximum flexibility, but performance issues at scale (meta table scans, no FKs, no typing).

---

### OkCMS: "Domain-Driven Normalized + JSONB + Structured EAV"

OkCMS uses a **hybrid approach** combining relational integrity with flexible JSONB:
- **Explicit content type registry** (`content_types` table) — types are registered, not just strings
- **Structured content storage**: `content.body` (JSONB blocks), `content.data` (extra JSONB), `content.metadata` (SEO/technical JSONB)
- **Typed custom fields**: `field_definitions` (schema + JSON Schema validation) + `field_values` (EAV with FK to definition)
- **First-class taxonomies**: `taxonomies` (registry) + `taxonomy_terms` (bound to ONE taxonomy) + `content_taxonomy_terms` (M:N)
- **Native multi-tenancy**: `tenant_id` on ALL tables + Row Level Security (RLS) policies
- **Plugin/Theme as entities**: `plugins`, `themes`, `plugin_tenants`, migrations per domain

**Advantages**: Type safety, referential integrity, query performance, multi-tenant isolation, extensibility via TypeScript/React.

---

## Entity Mapping Table

| WordPress Concept | OkCMS Equivalent | Key Differences |
|-------------------|------------------|-----------------|
| `wp_posts` (all `post_type`) | `content` + `content_types` registry | Types registered explicitly; revisions in separate table `content_versions` |
| `wp_postmeta` | `field_values` (typed) + `body`/`data`/`metadata` (JSONB) | Typed, validated, indexed; not pure EAV |
| `wp_terms` + `wp_term_taxonomy` | `taxonomies` (registry) + `taxonomy_terms` (instances) | Taxonomy is first-class entity; terms belong to ONE taxonomy |
| `wp_term_relationships` | `content_taxonomy_terms` | Direct M:N, no intermediate `taxonomy_id` |
| `wp_users` + `wp_usermeta` | `users` + `tenant_users` + `roles` | RBAC with JSONB permissions; multi-tenant native |
| `wp_comments` + `wp_commentmeta` | `comments` + `comment_meta` | Threaded, moderated, RLS |
| `wp_options` | `settings` | Typed, grouped, tenant-scoped |
| `wp_links` | — | Deprecated in WP; not migrated |
| `wp_posts` (`post_type='attachment'`) | `media` | Dedicated table, structured metadata in `metadata` JSONB |
| `wp_posts` (`post_type='nav_menu_item'`) + `nav_menu` taxonomy | `menus` + `menus.items` JSONB | Hierarchical JSONB instead of flat posts |
| `wp_postmeta` (`_wp_page_template`) | `content.layout` + `metadata.template` | Template → layout field |
| `wp_postmeta` (`_thumbnail_id`) | `content.featured_image_id` | FK to `media` |
| `wp_usermeta` (`wp_capabilities`) | `roles.permissions` | Capabilities → permission slugs |
| `wp_usermeta` (ACF fields on user) | `field_values` (entity_type='user' — future) | Currently: `users.metadata` |

---

## Field-Level Mapping

### WP Post Columns → OkCMS Content Columns

| WP Column | OkCMS Column | Transform |
|-----------|--------------|-----------|
| `ID` | — (generate UUID) | Store mapping `wp_post_id → okcms_content_id` |
| `post_author` | `author_id` | Map via WP user ID → OkCMS user ID |
| `post_date` / `post_date_gmt` | `created_at` / `published_at` | Parse to `TIMESTAMPTZ` (UTC) |
| `post_modified` / `post_modified_gmt` | `updated_at` | Parse to `TIMESTAMPTZ` |
| `post_content` | `body` (JSONB) | HTML → structured blocks (Gutenberg) or classic wrapper |
| `post_title` | `title` | Direct |
| `post_excerpt` | `excerpt` | Direct |
| `post_status` | `status` | `publish`→`PUBLISHED`, `draft`→`DRAFT`, `trash`→`TRASHED`, `private`→`PUBLISHED`+meta |
| `comment_status` | `metadata.comment_status` | `open`/`closed` |
| `ping_status` | `metadata.ping_status` | `open`/`closed` |
| `post_password` | `metadata.password_protected` | Boolean + store hash if needed |
| `post_name` | `slug` | Sanitize + ensure unique per tenant+type |
| `to_ping` / `pinged` | `metadata.pings` | Array |
| `post_content_filtered` | `data.filtered_content` | JSONB |
| `post_parent` | `parent_id` | Map via WP ID → OkCMS ID |
| `guid` | `metadata.guid` | Keep for reference |
| `menu_order` | `metadata.menu_order` | Integer |
| `post_type` | `type` | Via `content_types` registry |
| `post_mime_type` | `metadata.mime_type` | For attachments |

### Common Meta Keys → OkCMS Targets

| WP Meta Key | OkCMS Target | Notes |
|-------------|--------------|-------|
| `_thumbnail_id` | `content.featured_image_id` | FK to `media` (map attachment ID) |
| `_wp_page_template` | `content.layout` + `metadata.template` | Page template → layout |
| `_wp_old_slug` | `url_redirects` | Generate redirect from old slug |
| `_edit_lock`, `_edit_last` | `metadata.editorial` | Editorial tracking |
| `_yoast_wpseo_*` | `content.seo_*` + `metadata.seo` | Yoast SEO meta |
| `_rank_math_*` | `content.seo_*` + `metadata.seo` | RankMath SEO meta |
| `_aioseo_*` | `content.seo_*` + `metadata.seo` | All in One SEO meta |
| `field_XXXXXX` (ACF) | `field_values` (preferred) | Requires field definition |
| Custom meta (non-`_` prefix) | `field_values` or `data` JSONB | Typed if field definition exists |

---

## Taxonomy System

### Structural Differences

| Aspect | WordPress | OkCMS |
|--------|-----------|-------|
| **Term storage** | `wp_terms` (shared across taxonomies) | `taxonomy_terms` (bound to single taxonomy via `taxonomy_id`) |
| **Taxonomy definition** | `wp_term_taxonomy` (taxonomy per term) | `taxonomies` table (registry) |
| **Hierarchy** | `parent` in `wp_term_taxonomy` | `parent_id` in `taxonomy_terms` (per taxonomy) |
| **Term meta** | `wp_termmeta` (EAV) | `taxonomy_terms.meta` JSONB + `field_values` |
| **Content linking** | `wp_term_relationships` (object_id + term_taxonomy_id) | `content_taxonomy_terms` (content_id + term_id) |

### Core Taxonomy Mapping

| WP Taxonomy | OkCMS Taxonomy | Configuration |
|-------------|----------------|---------------|
| `category` | `taxonomies` with `hierarchical=true`, `attach_to=['post']` | Core |
| `post_tag` | `taxonomies` with `hierarchical=false`, `attach_to=['post']` | Core |
| `nav_menu` | → `menus` table (not a taxonomy) | Special handling |
| `link_category` | → not migrated (deprecated) | — |
| Custom taxonomy | `taxonomies` with inferred `hierarchical`, `attach_to` from object types | Admin/Plugin |

### Term Migration Logic

```typescript
// WP: term can belong to multiple taxonomies (same term_id)
// OkCMS: term belongs to ONE taxonomy

// For each wp_term_taxonomy row:
const taxonomyId = taxonomyMap.get(taxonomySlug); // taxonomy_slug → taxonomy UUID
const termId = createTerm({
  taxonomy_id: taxonomyId,
  name: term.name,
  slug: term.slug,
  description: termTaxonomy.description,
  parent_id: parentTermIdMap.get(termTaxonomy.parent), // parent is term_taxonomy_id
  meta: { wp_term_id: term.term_id, wp_term_taxonomy_id: termTaxonomy.term_taxonomy_id },
});
termTaxonomyIdMap.set(termTaxonomy.term_taxonomy_id, termId);
```

---

## User & Permission Model

### WordPress
- **Users**: `wp_users` + `wp_usermeta` (capabilities, profile fields)
- **Roles**: Hardcoded (Administrator, Editor, Author, Contributor, Subscriber) + `wp_usermeta` capabilities
- **Capabilities**: Flat strings (`edit_posts`, `publish_posts`, `manage_options`)
- **Multisite**: Separate user tables per site OR shared users with site-specific capabilities

### OkCMS
- **Users**: `users` table (email, name, password_hash, status, locale)
- **Tenants**: `tenants` table (multi-tenancy root)
- **Roles**: `roles` table with `permissions` JSONB array + `is_system` flag
- **User-Tenant-Role**: `tenant_users` (many-to-many: user ↔ tenant ↔ role)
- **Permissions**: Structured slugs (`content:create`, `media:delete`, `settings:update`)

### Role Mapping

| WP Role | OkCMS Role | Permissions (subset) |
|---------|------------|---------------------|
| Administrator | `super-admin` (system) | `*` (all permissions) |
| Editor | `editor` | `content:*`, `media:*`, `taxonomy:*`, `comments:moderate` |
| Author | `author` | `content:create`, `content:update:own`, `content:publish:own`, `media:create` |
| Contributor | `contributor` | `content:create`, `content:update:own`, `media:read` |
| Subscriber | `subscriber` | `content:read`, `profile:update:own` |

### Capability → Permission Mapping

```typescript
// WP capability string → OkCMS permission slug
const CAPABILITY_MAP: Record<string, string> = {
  'edit_posts': 'content:update',
  'edit_published_posts': 'content:publish',
  'publish_posts': 'content:publish',
  'delete_posts': 'content:delete',
  'edit_pages': 'content:update',
  'edit_others_posts': 'content:manage_others',
  'manage_options': 'settings:update',
  'upload_files': 'media:create',
  'moderate_comments': 'comments:moderate',
  // ... etc
};
```

### API Keys vs Application Passwords

| Feature | WP Application Passwords | OkCMS API Keys |
|---------|-------------------------|----------------|
| **Auth flow** | Basic auth with generated password | Exchange key for JWT + refresh token |
| **Rotation** | Manual | Built-in (`webhook_secrets` pattern) |
| **Scopes** | None (full user permissions) | Planned (per-key scopes) |
| **Storage** | `wp_usermeta` (hashed) | `api_keys` table (prefix + hash) |

---

## Media & Files

### WordPress
- **Storage**: `wp_posts` (`post_type='attachment'`) + `wp_postmeta`
- **Metadata**: `_wp_attachment_metadata` (serialized PHP array with sizes, EXIF, etc.)
- **Files**: `wp-content/uploads/` (local) or plugins for S3/cloud
- **Variants**: Generated on upload (thumbnail, medium, large) + custom sizes

### OkCMS
- **Storage**: `media` table (dedicated)
- **Metadata**: `metadata` JSONB (structured: sizes, image_meta, focal_point, etc.)
- **Files**: Configurable drivers (local, S3, R2, MinIO, Azure, GCS) via `media:migrate`
- **Variants**: Defined in `metadata.sizes` + on-demand generation

### Migration Mapping

| WP Field | OkCMS Field |
|----------|-------------|
| `post_title` | `title` |
| `post_content` | `description` |
| `post_excerpt` | `caption` |
| `post_mime_type` | `mime_type` |
| `guid` | `url` (may need filesystem resolution) |
| `_wp_attached_file` | `path` / `filename` |
| `_wp_attachment_metadata` | `metadata` (unserialized) |
| `post_parent` | `metadata.attached_to` (content UUID) |
| `post_author` | `uploaded_by` (user UUID) |

### External Files Handling

```bash
# Copy files from WP uploads to OkCMS storage
okcms wp import --wp-host localhost --wp-database wp_db \
  --tenant mysite --copy-files

# Without --copy-files: stores original WP URL, marks metadata.external=true
```

---

## Settings & Options

### WordPress `wp_options`
- **Structure**: EAV (`option_name`, `option_value` serialized, `autoload`)
- **Scope**: Site (or network in multisite)
- **Autoload**: `yes`/`no` controls automatic loading on every request

### OkCMS `settings`
- **Structure**: Typed (`key`, `value` JSONB, `group`, `type`, `tenant_id`)
- **Scope**: Global (`tenant_id=NULL`) or per-tenant
- **No autoload**: Loaded on demand via API

### Core Option Mapping

| WP Option | OkCMS Setting | Group | Type |
|-----------|---------------|-------|------|
| `siteurl` | `siteurl` | `general` | `url` |
| `home` | `home` | `general` | `url` |
| `blogname` | `blogname` | `general` | `string` |
| `blogdescription` | `blogdescription` | `general` | `string` |
| `admin_email` | `admin_email` | `general` | `email` |
| `timezone_string` | `timezone_string` | `general` | `string` |
| `date_format` | `date_format` | `general` | `string` |
| `permalink_structure` | `permalink_structure` | `permalink` | `string` |
| `posts_per_page` | `posts_per_page` | `reading` | `integer` |
| `default_category` | `default_category` | `writing` | `integer` (term ID) |
| `thumbnail_size_w` | `thumbnail_size_w` | `media` | `integer` |
| Plugin options | `plugin:{slug}:{key}` | `plugin:{slug}` | inferred |
| Theme options | `theme:{slug}:{key}` | `theme:{slug}` | inferred |

---

## Menus & Navigation

### WordPress
- **Menu**: Term in `nav_menu` taxonomy
- **Menu Items**: Posts with `post_type='nav_menu_item'`
- **Item Meta**: `_menu_item_type`, `_menu_item_object_id`, `_menu_item_object`, `_menu_item_target`, `_menu_item_classes`, `_menu_item_xfn`, `_menu_item_url`
- **Locations**: `theme_mods_{theme}` or `nav_menu_locations` option

### OkCMS
- **Menu**: `menus` table (`name`, `slug`, `items` JSONB, `settings` JSONB)
- **Items**: Hierarchical array in `items` JSONB
- **Locations**: `settings.themeLocations` object

### Menu Item Mapping

```typescript
// WP nav_menu_item post → OkCMS menu item
{
  id: uuid(),
  type: meta['_menu_item_type'], // 'custom' | 'post_type' | 'taxonomy'
  title: post.post_title,
  url: type === 'custom' ? meta['_menu_item_url'] : undefined,
  target: meta['_menu_item_target'] || undefined,
  classes: meta['_menu_item_classes'] || [],
  xfn: meta['_menu_item_xfn'] || '',
  objectId: resolveObjectId(type, meta['_menu_item_object_id']), // content/term UUID
  objectType: meta['_menu_item_object'], // post type or taxonomy slug
  parentId: parentMenuItemId,
  order: post.menu_order,
}
```

### Theme Locations

```typescript
// WP: get_nav_menu_locations() → { 'primary': menu_term_id }
// OkCMS: menu.settings.themeLocations = { 'primary': menuUuid }
```

---

## Comments

### Near Parity

| Feature | WordPress | OkCMS |
|---------|-----------|-------|
| Threading | `comment_parent` | `parent_id` |
| Status | `comment_approved` (0/1/spam/trash) | `status` (PENDING/APPROVED/SPAM/TRASHED) |
| Author | `user_id` + `comment_author`/`email`/url | `author_id` (FK) + `author_name`/`email`/`url` for anonymous |
| Meta | `wp_commentmeta` (EAV) | `comment_meta` (key/value JSONB) |
| Multi-tenant | Multisite (complex) | Native RLS (tenant from parent content) |

### Migration Notes
- Anonymous comments: `author_id=NULL`, store name/email/url in comment columns
- Registered comments: `author_id` mapped via user migration
- Threaded: Two-pass migration (parents first, then replies)
- Meta: Direct key/value migration to `comment_meta`

---

## Extensibility: Plugins → Field Types

### WordPress Plugin Model
- **PHP files** in `wp-content/plugins/`
- **Registration**: Hooks (`init`, `admin_init`, `add_meta_boxes`, etc.)
- **Custom Fields**: ACF, Meta Box, Pods, CMB2 (meta boxes saving to `wp_postmeta`)
- **Admin UI**: PHP-rendered meta boxes, settings pages
- **Data**: Stored in `wp_postmeta` / custom tables

### OkCMS Field Type System
- **Registration**: `field_type_extensions` table via `api.addFieldType(definition)` in plugin `register()`
- **Manifest**: `manifest.json` declares `fieldTypes[]` with `type`, `label`, `category`, `icon`, `adminComponentPath`, `adminRendererPath`, `configSchema`
- **Admin Components**: React components (`adminComponentPath` for config, `adminRendererPath` for display)
- **Renderer**: Self-contained component receiving `{ value, config, field }`
- **Config Validation**: JSON Schema (draft-07) in `configSchema`
- **Storage**: `field_values.value` (JSONB) + `field_values.config` (field definition config)

### ACF → OkCMS Migration Path

| ACF Concept | OkCMS Equivalent |
|-------------|------------------|
| Field Group | `field_groups` (location_rules, position, style) |
| Field | `field_definitions` (type, key, label, config, required) |
| Repeater | `field_definitions` with `parent_field_id` + `flexible_layouts` |
| Flexible Content | `flexible_layouts` (layouts with sub_fields) |
| Gallery | `field_definitions` type `gallery` → `field_values.value = { images: mediaUuid[] }` |
| Relationship | `field_definitions` type `relationship` → `field_values.value = { items: contentUuid[] }` |
| Location Rules | `field_groups.location_rules` (JSONB array of rules) |

### Creating a Custom Field Type Plugin

```typescript
// plugin/src/register.ts
export function register(api: PluginAPI) {
  api.addFieldType({
    type: 'my-custom-field',
    label: 'My Custom Field',
    category: 'custom',
    icon: 'CustomIcon',
    adminComponentPath: '@/plugins/my-plugin/admin/MyFieldConfig',
    adminRendererPath: '@/plugins/my-plugin/admin/MyFieldRenderer',
    configSchema: {
      type: 'object',
      properties: {
        placeholder: { type: 'string' },
        options: { type: 'array', items: { type: 'string' } },
      },
    },
  });
}

// plugin/admin/MyFieldConfig.tsx
export function MyFieldConfig({ config, onChange }: FieldConfigProps) {
  return (
    <div>
      <input
        placeholder="Placeholder text"
        value={config.placeholder}
        onChange={e => onChange({ ...config, placeholder: e.target.value })}
      />
    </div>
  );
}

// plugin/admin/MyFieldRenderer.tsx
export function MyFieldRenderer({ value, config, field }: FieldRendererProps) {
  return <div className="my-field">{value?.text ?? 'Empty'}</div>;
}
```

---

## Query API Comparison

### WP_Query → ContentService

| WP_Query | OkCMS ContentService |
|----------|---------------------|
| `new WP_Query({ post_type: 'post', posts_per_page: 10 })` | `contentService.query({ type: 'post', limit: 10 })` |
| `'post_status' => 'publish'` | `{ status: 'PUBLISHED' }` |
| `'meta_query' => [{ key: 'color', value: 'red' }]` | `{ fieldValues: { color: 'red' } }` |
| `'tax_query' => [{ taxonomy: 'category', field: 'slug', terms: 'news' }]` | `{ taxonomies: { category: ['news'] } }` |
| `'orderby' => 'date', 'order' => 'DESC'` | `{ orderBy: 'published_at', order: 'DESC' }` |
| `get_posts()` | `contentService.findByType('post')` |
| `get_post_meta($post_id, 'key', true)` | `fieldValueService.getByEntity('content', contentId, 'key')` |

### Meta Query → JSONB Operators

```typescript
// WP meta_query
'meta_query' => [
  'relation' => 'AND',
  [ 'key' => 'price', 'value' => 100, 'compare' => '>' ],
  [ 'key' => 'color', 'value' => ['red', 'blue'], 'compare' => 'IN' ],
]

// OkCMS field_values with JSONB
const results = await sql`
  SELECT c.* FROM content c
  JOIN field_values fv1 ON fv1.entity_id = c.id AND fv1.field_definition_id = ${priceFieldId}
  JOIN field_values fv2 ON fv2.entity_id = c.id AND fv2.field_definition_id = ${colorFieldId}
  WHERE (fv1.value->>'price')::numeric > 100
    AND (fv2.value->>'color') IN ('red', 'blue')
    AND c.tenant_id = ${tenantId}
    AND c.type = 'product'
`;
```

### Tax Query → Direct Joins

```typescript
// WP tax_query
'tax_query' => [
  'relation' => 'AND',
  [ 'taxonomy' => 'category', 'field' => 'slug', 'terms' => 'news' ],
  [ 'taxonomy' => 'product_tag', 'field' => 'term_id', 'terms' => [1,2,3], 'operator' => 'NOT IN' ],
]

// OkCMS
const results = await sql`
  SELECT c.* FROM content c
  JOIN content_taxonomy_terms ctt1 ON ctt1.content_id = c.id
  JOIN taxonomy_terms tt1 ON tt1.id = ctt1.term_id
  JOIN taxonomies tx1 ON tx1.id = tt1.taxonomy_id
  WHERE tx1.slug = 'category' AND tt1.slug = 'news'
    AND c.tenant_id = ${tenantId}
    AND c.type = 'post'
  EXCEPT
  SELECT c.* FROM content c
  JOIN content_taxonomy_terms ctt2 ON ctt2.content_id = c.id
  JOIN taxonomy_terms tt2 ON tt2.id = ctt2.term_id
  WHERE tt2.id IN (${sql.join(tagIds, ',')})
`;
```

---

## Common Migration Gotchas

### 1. Serialized PHP Strings in Meta
**Problem**: WP stores arrays/objects as serialized PHP (`a:2:{i:0;s:5:"hello";...}`)
**Solution**: Use `safePhpUnserialize()` transformer — handles nested serialization, WP objects (`WP_Post`, `WP_Term`)

```typescript
import { safePhpUnserialize, deepUnserialize } from './transformers/serialized-php';

const value = deepUnserialize(meta.meta_value);
// Recursively unserializes nested strings
```

### 2. Gutenberg Block Comments in `post_content`
**Problem**: Block editor stores `<!-- wp:paragraph --><p>Hello</p><!-- /wp:paragraph -->`
**Solution**: `htmlToStructuredContent()` parses blocks → structured JSON; fallback to classic wrapper

```typescript
import { htmlToStructuredContent, structuredContentToBody } from './transformers/html-to-json';

const structured = htmlToStructuredContent(wpPost.post_content);
const body = structuredContentToBody(structured);
// Result: { type: 'blocks', blocks: [...] } or { type: 'classic', html: '...' }
```

### 3. `_wp_old_slug` Meta → URL Redirects
**Problem**: WP stores previous slugs in `_wp_old_slug` meta for redirects
**Solution**: Extract during content migration, create `url_redirects` entries

```typescript
const oldSlugs = metaMap.get('_wp_old_slug');
if (oldSlugs) {
  for (const oldSlug of oldSlugs.split(',')) {
    await createRedirect({
      source_path: `/${oldSlug.trim()}`,
      target_path: `/${newSlug}`,
      redirect_type: 301,
    });
  }
}
```

### 4. Orphaned Postmeta
**Problem**: Meta rows for deleted posts remain in `wp_postmeta`
**Solution**: Skip meta where `post_id` not in migrated content map (log warning)

### 5. Duplicate Slugs Across Post Types
**Problem**: WP allows same slug for different post types; OkCMS unique per `(tenant_id, type, slug)`
**Solution**: `SlugManager` appends `-2`, `-3` on collision; record mapping for redirects

### 6. Term Slug Collisions Across Taxonomies
**Problem**: WP allows same term slug in different taxonomies; OkCMS unique per `(taxonomy_id, slug)`
**Solution**: `SlugManager` per taxonomy namespace (`taxonomy:{slug}`)

### 7. Missing Media Files
**Problem**: Referenced files don't exist on filesystem
**Solution**: Create media record with `metadata.missing=true`, `metadata.external=true`, log warning — don't fail migration

### 8. Multisite Not Supported (v1)
**Limitation**: WP Multisite → OkCMS multi-tenant not implemented
**Workaround**: Migrate each subsite as separate tenant manually

### 9. Polylang/WPML Translations
**Problem**: Translation plugins create linked posts with language codes
**Solution**: Map to separate content entries with `metadata.locale` + future i18n linking (not yet implemented)

### 10. Widget Migration
**Not in v1**: WP widgets → OkCMS components/blocks requires manual recreation

---

## Code Examples

### Query Posts by Custom Field (WP vs OkCMS)

```php
// WordPress
$posts = get_posts([
  'post_type' => 'product',
  'meta_query' => [
    ['key' => 'price', 'value' => 50, 'compare' => '>'],
    ['key' => 'in_stock', 'value' => 'yes'],
  ],
]);
```

```typescript
// OkCMS
const products = await contentService.query({
  type: 'product',
  fieldValues: {
    price: { operator: 'gt', value: 50 },
    in_stock: 'yes',
  },
  limit: 20,
});
```

### Get Post Meta (WP vs OkCMS)

```php
// WordPress
$price = get_post_meta($post_id, 'price', true);
$colors = get_post_meta($post_id, 'colors', false); // array
```

```typescript
// OkCMS
const price = await fieldValueService.getByEntity('content', contentId, 'price');
// Returns typed value (number)

const colors = await fieldValueService.getByEntity('content', contentId, 'colors');
// Returns array
```

### Register Custom Post Type (WP vs OkCMS)

```php
// WordPress (functions.php or plugin)
register_post_type('product', [
  'labels' => ['name' => 'Products', 'singular_name' => 'Product'],
  'public' => true,
  'has_archive' => true,
  'supports' => ['title', 'editor', 'thumbnail', 'custom-fields'],
  'taxonomies' => ['category', 'product_tag'],
]);
```

```typescript
// OkCMS (plugin register or admin)
await contentTypeService.create({
  slug: 'product',
  name: 'Product',
  pluralLabel: 'Products',
  singularLabel: 'Product',
  source: 'PLUGIN',
  schema: {
    type: 'object',
    properties: {
      title: { type: 'string' },
      slug: { type: 'string' },
      content: { type: 'string', format: 'html' },
      price: { type: 'number' },
      in_stock: { type: 'boolean' },
      gallery: { type: 'array', items: { type: 'string', format: 'uuid' } },
    },
    required: ['title', 'slug'],
  },
  defaultFields: ['title', 'slug', 'content', 'price', 'in_stock', 'gallery', 'featured_image', 'seo_title', 'seo_description', 'status', 'author'],
});
```

---

## Summary

| Category | WordPress | OkCMS |
|----------|-----------|-------|
| **Content Model** | Single table + EAV | Typed registry + JSONB + Structured EAV |
| **Taxonomies** | Terms shared across taxonomies | Terms bound to single taxonomy |
| **Users/Permissions** | Flat capabilities + usermeta | RBAC with JSONB + multi-tenant |
| **Media** | Attachment posts + serialized meta | Dedicated table + structured JSONB |
| **Settings** | Serialized options + autoload | Typed, grouped, tenant-scoped |
| **Menus** | Taxonomy + posts + meta | Hierarchical JSONB |
| **Extensibility** | PHP hooks + meta boxes | Field Types + React components + JSON Schema |
| **Multi-tenancy** | Table prefixes (Multisite) | Native RLS (single DB) |
| **Migrations** | `db_version` option | 4 ledgers (core/tenant/plugin/schema) |

---

## Next Steps

1. **Run validation**: `okcms wp validate --wp-host localhost --wp-database wp_db --wp-user root --wp-password pass`
2. **Dry-run import**: `okcms wp import --wp-host localhost --wp-database wp_db --tenant mysite --dry-run`
3. **Full import**: `okcms wp import --wp-host localhost --wp-database wp_db --tenant mysite --output-report report.json`
4. **Review unmapped keys** in report, create field definitions as needed
5. **Verify content** in OkCMS admin panel
6. **Configure media storage** if using `--copy-files` or external URLs

---

*Generated as part of OkCMS WordPress Migration Toolkit*