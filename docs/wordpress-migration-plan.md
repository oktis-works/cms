# WordPress Migration Plan: Compatibility Layer & Conceptual Mapping

> **Status**: Planning Phase — No code changes yet  
> **Target**: BlackLotusCMS v2 (OkCMS)  
> **Scope**: Import WordPress content into BlackLotusCMS via CLI migrator + documentation

---

## 📋 Executive Summary

This document outlines a complete implementation plan for two deliverables:

1. **WP Migrator CLI Tool** (`okcms wp import`) — Imports WordPress database (MySQL/MariaDB) into BlackLotusCMS, mapping `wp_posts` → `content`, `wp_postmeta` → `field_values`/`body`/`data`, `wp_terms` → `taxonomies`/`taxonomy_terms`, etc.
2. **Conceptual Mapping Documentation** — Developer-facing reference: "WP concept ≈ OkCMS equivalent" with code examples.

Both deliverables live in the existing monorepo:
- Migrator: `packages/cli/src/wp-migrate.ts` (new command)
- Docs: `docs/wordpress-conceptual-mapping.md` (new file)

---

## 🎯 Phase 0 — Prerequisites & Discovery

### 0.1 Environment & Dependencies
- [ ] **Verify MySQL/MariaDB driver availability** — `@oktis-works/database` already depends on `mysql2` and `mariadb`; confirm versions support WP 8.0+ / MariaDB 10.5+
- [ ] **Check existing migration runner** — `packages/database/src/migrations/runner.ts` patterns for tenant-aware, idempotent operations
- [ ] **Review CLI command registry** — `packages/cli/src/command-registry.ts` + `packages/cli/src/commands.ts` for adding `wp import` subcommand
- [ ] **Confirm tenant bootstrap flow** — `packages/cli/src/db-init.ts` / `db-prepare.ts` for creating default tenant before import

### 0.2 WordPress Schema Analysis (Reference)
Document the exact WP tables/columns to map. Minimum required:
- [ ] `wp_posts` (all post_types: post, page, attachment, revision, nav_menu_item, custom)
- [ ] `wp_postmeta` (EAV for all post types)
- [ ] `wp_terms`, `wp_term_taxonomy`, `wp_term_relationships` (taxonomies)
- [ ] `wp_termmeta` (term meta EAV)
- [ ] `wp_users`, `wp_usermeta` (users + capabilities)
- [ ] `wp_comments`, `wp_commentmeta` (comments)
- [ ] `wp_options` (site settings)
- [ ] `wp_links` (blogroll — legacy, optional)
- [ ] Multisite tables (`wp_blogs`, `wp_site`, `wp_sitemeta`, `wp_registration_log`, etc.) — **out of scope for v1**

### 0.3 BlackLotusCMS Target Schema Review (Already Done)
Key target tables (from `packages/database/src/schema/schema.sql`):
- [ ] `tenants` — root isolation (create/ensure default tenant)
- [ ] `users` — core user fields (email, name, password_hash, status, locale)
- [ ] `tenant_users` — many-to-many user↔tenant↔role
- [ ] `roles` + `permissions` — RBAC
- [ ] `content_types` — registry of post types (post, page, custom)
- [ ] `content` — content instances (title, slug, body JSONB, status, author, parent, type, etc.)
- [ ] `content_versions` — revisions
- [ ] `field_groups` / `field_definitions` / `field_values` — custom fields (ACF-style)
- [ ] `taxonomies` / `taxonomy_terms` / `content_taxonomy_terms` — categories, tags, custom taxonomies
- [ ] `media` — attachments (images, files)
- [ ] `settings` — site options
- [ ] `menus` — navigation menus
- [ ] `comments` / `comment_meta` — comments
- [ ] `url_redirects` — redirects (if WP Redirection plugin data exists)

---

## 🏗️ Phase 1 — Core Migrator Architecture

### 1.1 Project Structure
```
packages/cli/src/
├── wp-migrate.ts              # Main entry: `okcms wp import`
├── wp-migrate/
│   ├── index.ts               # Barrel exports
│   ├── types.ts               # TypeScript interfaces for WP schema
│   ├── connectors/
│   │   ├── index.ts
│   │   ├── mysql.ts           # MySQL/MariaDB connection pool
│   │   └── wp-schema.ts       # WP table introspection
│   ├── mappers/
│   │   ├── index.ts
│   │   ├── users.ts           # wp_users → users + tenant_users
│   │   ├── content-types.ts   # post_type → content_types
│   │   ├── content.ts         # wp_posts → content + content_versions
│   │   ├── postmeta.ts        # wp_postmeta → field_values/body/data
│   │   ├── taxonomies.ts      # wp_terms/taxonomy → taxonomies/terms
│   │   ├── termmeta.ts        # wp_termmeta → taxonomy_terms.meta + field_values
│   │   ├── media.ts           # wp_posts (attachment) → media
│   │   ├── comments.ts        # wp_comments → comments + comment_meta
│   │   ├── options.ts         # wp_options → settings
│   │   └── menus.ts           # wp_posts (nav_menu_item) → menus
│   ├── transformers/
│   │   ├── index.ts
│   │   ├── html-to-json.ts    # WP block editor / classic editor HTML → JSONB body
│   │   ├── serialized-php.ts  # PHP serialized strings → JSON
│   │   ├── dates.ts           # WP date formats → ISO 8601 / timestamptz
│   │   └── slugs.ts           # WP sanitize_title → unique slugs per tenant+type
│   ├── validators/
│   │   ├── index.ts
│   │   ├── content.ts         # Validate mapped content against content_types schema
│   │   └── field-values.ts    # Validate field_values against field_definitions.config
│   ├── runners/
│   │   ├── index.ts
│   │   ├── sequential.ts      # Ordered migration with checkpoints
│   │   ├── parallel.ts        # Batch inserts for performance
│   │   └── resume.ts          # Resume from checkpoint (idempotent)
│   └── reporters/
│       ├── index.ts
│       ├── console.ts         # Pretty CLI output with progress bars
│       ├── json.ts            # Machine-readable report
│       └── summary.ts         # Final stats: created/updated/skipped/errors
```

### 1.2 CLI Command Registration
- [ ] Add `wp` command group in `commands.ts`
- [ ] Add `wp import` subcommand with flags:
  ```bash
  okcms wp import \
    --wp-host <host> \
    --wp-port <port> \
    --wp-user <user> \
    --wp-password <pass> \
    --wp-database <db> \
    --wp-prefix <wp_> \
    --tenant <tenant-slug> \
    --dry-run \
    --batch-size <1000> \
    --resume-from <checkpoint-id> \
    --skip-users \
    --skip-media \
    --map-author <wp-user-id>:<okcms-user-id> \
    --output-report <path.json>
  ```
- [ ] Add `wp validate` subcommand — connects to WP DB, runs schema introspection, reports table counts, potential issues (orphaned meta, missing terms, etc.)
- [ ] Add `wp map` subcommand — interactive mapping wizard for custom post types / taxonomies / ACF fields

### 1.3 Configuration & Credentials
- [ ] Support `.env.wp` file for WP credentials (never commit)
- [ ] Support reading WP `wp-config.php` for DB constants (DB_HOST, DB_NAME, DB_USER, DB_PASSWORD, $table_prefix)
- [ ] Validate connection before starting migration

---

## 🔄 Phase 2 — Mapping Implementation (Per Domain)

### 2.1 Tenant & User Migration
| WP Source | OkCMS Target | Notes |
|-----------|--------------|-------|
| `wp_users` | `users` + `tenant_users` | Create default tenant first; map WP roles → OkCMS roles |
| `wp_usermeta` (capabilities) | `roles.permissions` JSONB | `wp_capabilities` serialized array → permission slugs |
| `wp_usermeta` (nickname, first_name, last_name, description) | `users` fields + `metadata` JSONB | Merge into user profile |
| Super Admin (multisite) | `roles.is_system = true` | Special handling |

**Checklist:**
- [ ] Create `default` tenant if not exists (slug: `default`, name: `Default Tenant`)
- [ ] Create system roles: `super-admin`, `admin`, `editor`, `author`, `contributor`, `subscriber`
- [ ] Map WP user → OkCMS user (email as unique key, generate random password, mark `status=ACTIVE`)
- [ ] Link via `tenant_users` with mapped role
- [ ] Store WP user ID in `users.metadata.wp_user_id` for reference mapping

### 2.2 Content Types Registration
| WP Source | OkCMS Target | Notes |
|-----------|--------------|-------|
| Built-in: `post`, `page`, `attachment`, `revision`, `nav_menu_item` | Seed `content_types` with `source='CORE'` | Pre-seed in migration runner |
| Custom Post Types (from `wp_posts.post_type` distinct) | `content_types` with `source='ADMIN'` | Register dynamically during import |
| `register_post_type` args (labels, supports, hierarchical, etc.) | `content_types.schema` + `default_fields` | Extract from WP if possible; otherwise infer from data |

**Checklist:**
- [ ] Pre-seed core content types: `post`, `page`, `attachment`, `revision`, `nav_menu_item`
- [ ] Scan `wp_posts` for distinct `post_type` values
- [ ] For each custom post type, create `content_types` entry with:
  - `slug` = post_type
  - `name` / `plural_label` / `singular_label` from WP labels or humanized slug
  - `schema` = inferred from `wp_postmeta` keys + `post_content`/`post_excerpt`/`post_title`
  - `default_fields` = base fields + detected custom fields
- [ ] Support `--map-post-type <wp-type>:<okcms-type>` for renaming

### 2.3 Content Migration (`wp_posts` → `content` + `content_versions`)
**Core Field Mapping:**
| WP Column | OkCMS Column | Transform |
|-----------|--------------|-----------|
| `ID` | — (generate UUID) | Store mapping `wp_post_id → okcms_content_id` |
| `post_author` | `author_id` | Map via WP user ID → OkCMS user ID |
| `post_date` / `post_date_gmt` | `created_at` / `published_at` | Parse to timestamptz |
| `post_modified` / `post_modified_gmt` | `updated_at` | Parse to timestamptz |
| `post_content` | `body` (JSONB) | HTML → structured JSON (see 2.3.1) |
| `post_title` | `title` | Direct |
| `post_excerpt` | `excerpt` | Direct |
| `post_status` | `status` | Map: `publish`→`PUBLISHED`, `draft`→`DRAFT`, `trash`→`TRASHED`, `auto-draft`→`DRAFT`, `inherit`→`DRAFT` (revisions), `private`→`PUBLISHED` + meta |
| `comment_status` | `metadata.comment_status` | `open`/`closed` |
| `ping_status` | `metadata.ping_status` | `open`/`closed` |
| `post_password` | `metadata.password_protected` | Boolean + store hash if needed |
| `post_name` | `slug` | Sanitize + ensure unique per tenant+type |
| `to_ping` / `pinged` | `metadata.pings` | Array |
| `post_modified` | `updated_at` | Direct |
| `post_content_filtered` | `data.filtered_content` | JSONB |
| `post_parent` | `parent_id` | Map via WP ID → OkCMS ID |
| `guid` | `metadata.guid` | Keep for reference |
| `menu_order` | `metadata.menu_order` | Integer |
| `post_type` | `type` | Via content_types registry |
| `post_mime_type` | `metadata.mime_type` | For attachments |

**Revisions (`post_type='revision'`):**
- [ ] Map to `content_versions` table
- [ ] `post_parent` → `content_id`
- [ ] Version number from `post_name` (format: `123-revision-v1`) or sequential

**Checklist:**
- [ ] Batch insert `content` with `ON CONFLICT (tenant_id, type, slug) DO UPDATE` for idempotency
- [ ] Build `wp_post_id → okcms_content_id` map in memory + persist to temp table for downstream mappers
- [ ] Handle `post_type='attachment'` → also create `media` record (see 2.6)
- [ ] Handle `post_type='nav_menu_item'` → also create `menus` items (see 2.9)

#### 2.3.1 HTML → JSONB Body Transformation
WordPress stores content as raw HTML (classic editor) or `<!-- wp:block -->` comments (Gutenberg).
- [ ] **Classic Editor**: Wrap in `{ "type": "classic", "html": "<p>...</p>" }`
- [ ] **Gutenberg**: Parse `<!-- wp:block -->` comments into structured blocks array (reuse `@wordpress/blocks` parser or custom)
- [ ] **Shortcodes**: Convert known shortcodes (`[gallery]`, `[video]`, `[contact-form]`) to block equivalents or store in `data.shortcodes`
- [ ] **Embeds** (oEmbed): Detect URLs on own lines → `embed` blocks
- [ ] **Images**: Extract `<img>` tags → reference `media` by filename/ID mapping

### 2.4 Post Meta Migration (`wp_postmeta` → `field_values` / `body` / `data`)
This is the most complex mapping. Strategy:

**Decision Matrix for each meta_key:**
| Meta Key Pattern | Target | Rationale |
|------------------|--------|-----------|
| `_wp_*` (WP internal) | `metadata` JSONB or skip | `_wp_page_template`, `_wp_old_slug`, `_edit_lock`, etc. |
| `_thumbnail_id` | `featured_image_id` (FK to media) | Map via attachment ID mapping |
| `_edit_last`, `_edit_lock` | `metadata` | Editorial tracking |
| ACF fields (`field_XXXXXX` or custom keys) | `field_values` (preferred) OR `data` JSONB | If field_definitions exist for ACF field groups |
| Yoast/SEO meta (`_yoast_*`, `_rank_math_*`) | `seo_title`, `seo_description`, `metadata.seo` | Extract known keys |
| Custom plugin meta | `data` JSONB (catch-all) | Preserve without schema |

**Implementation:**
- [ ] **Phase A — Classification**: Scan all distinct `meta_key` values, classify by prefix/pattern
- [ ] **Phase B — Field Definition Creation**: For ACF-like structured fields, create `field_groups` + `field_definitions` mirroring ACF field groups (name, key, type, config)
- [ ] **Phase C — Value Migration**:
  - Unserialize PHP serialized strings (`a:2:{i:0;s:5:"hello";...}`) → JSON
  - For each meta row: determine target (field_values vs body vs data vs metadata)
  - Batch insert `field_values` with `entity_type='content'`
- [ ] **Phase D — Validation**: Run mapped values through `field_definitions.config` JSON Schema validator

**Special Cases:**
- [ ] **ACF Repeaters / Flexible Content** → `flexible_layouts` + nested `field_values`
- [ ] **ACF Gallery** → Array of media IDs in `field_values.value`
- [ ] **ACF Relationship / Post Object** → Store target `wp_post_id` → resolve to OkCMS UUID after content migration
- [ ] **Serialized objects** (WP_User, WP_Post, etc.) → Extract ID, store reference

### 2.5 Taxonomy Migration (`wp_terms` + `wp_term_taxonomy` + `wp_term_relationships` → `taxonomies` + `taxonomy_terms` + `content_taxonomy_terms`)

| WP Tables | OkCMS Tables |
|-----------|--------------|
| `wp_terms` (term_id, name, slug, term_group) | `taxonomy_terms` (id, name, slug, description, parent_id, meta) |
| `wp_term_taxonomy` (term_taxonomy_id, term_id, taxonomy, description, parent, count) | `taxonomies` (id, name, slug, hierarchical, attach_to, labels, meta) + `taxonomy_terms.taxonomy_id` |
| `wp_term_relationships` (object_id, term_taxonomy_id, term_order) | `content_taxonomy_terms` (content_id, term_id) |

**Mapping Logic:**
- [ ] Group `wp_term_taxonomy` by `taxonomy` column → create `taxonomies` entries
  - `taxonomy='category'` → `taxonomies` with `hierarchical=true`, `attach_to=['post']`
  - `taxonomy='post_tag'` → `hierarchical=false`, `attach_to=['post']`
  - Custom taxonomies → infer `hierarchical` from `wp_term_taxonomy.parent` usage
- [ ] For each term: create `taxonomy_terms` with `taxonomy_id` FK
  - Map `wp_terms.name/slug` → `taxonomy_terms.name/slug`
  - `wp_term_taxonomy.parent` → `taxonomy_terms.parent_id` (via term mapping)
  - `wp_term_taxonomy.description` → `taxonomy_terms.description`
- [ ] Migrate `wp_termmeta` → `taxonomy_terms.meta` JSONB + `field_values` if field definitions exist
- [ ] Build `wp_term_taxonomy_id → okcms_term_id` map
- [ ] Populate `content_taxonomy_terms` via `wp_term_relationships` using content ID map + term ID map

**Checklist:**
- [ ] Preserve term order (`term_order`) in `content_taxonomy_terms` if needed (add `sort_order` column future)
- [ ] Handle duplicate slugs across taxonomies (OkCMS: unique per taxonomy)
- [ ] Map `nav_menu` taxonomy → `menus` table (see 2.9)

### 2.6 Media Migration (`wp_posts` where `post_type='attachment'` → `media`)

| WP Column | OkCMS Column | Transform |
|-----------|--------------|-----------|
| `ID` | — (generate UUID) | Map `wp_attachment_id → okcms_media_id` |
| `post_title` | `title` | Direct |
| `post_content` | `description` | Direct |
| `post_excerpt` | `caption` | Direct |
| `post_mime_type` | `mime_type` | Direct |
| `guid` | `url` | May need filesystem path resolution |
| `post_parent` | — | Link to parent content via `metadata.attached_to` |
| `_wp_attached_file` (meta) | `path` / `filename` | Extract from meta |
| `_wp_attachment_metadata` (meta) | `metadata` JSONB | Unserialize: sizes, image_meta, filesize, etc. |
| `post_author` | `uploaded_by` | Map via user ID map |

**Checklist:**
- [ ] Download/copy files from WP `wp-content/uploads/` to OkCMS media storage (local/S3) — **optional flag `--copy-files`**
- [ ] If `--copy-files` not set: store original URL in `media.url`, mark `metadata.external=true`
- [ ] Generate thumbnails per `metadata.sizes` if copying files
- [ ] Handle missing files gracefully (log warning, create media record with `metadata.missing=true`)

### 2.7 Comments Migration (`wp_comments` + `wp_commentmeta` → `comments` + `comment_meta`)

| WP Column | OkCMS Column | Transform |
|-----------|--------------|-----------|
| `comment_ID` | — (generate UUID) | Map `wp_comment_id → okcms_comment_id` |
| `comment_post_ID` | `content_id` | Map via content ID map |
| `comment_author` | `author_name` | Direct |
| `comment_author_email` | `author_email` | Direct |
| `comment_author_url` | `author_url` | Direct |
| `comment_author_IP` | `ip_address` | Direct |
| `comment_agent` | `user_agent` | Direct |
| `comment_date` / `comment_date_gmt` | `created_at` | Parse to timestamptz |
| `comment_content` | `body` | Direct (HTML allowed) |
| `comment_karma` | `metadata.karma` | Integer |
| `comment_approved` | `status` | `1`→`APPROVED`, `0`→`PENDING`, `spam`→`SPAM`, `trash`→`TRASHED` |
| `comment_type` | `metadata.type` | `comment`, `pingback`, `trackback` |
| `comment_parent` | `parent_id` | Map via comment ID map |
| `user_id` | `author_id` | Map via user ID map (0 = anonymous) |

**Checklist:**
- [ ] Threaded comments: ensure parent inserted before children (topological sort or two-pass)
- [ ] Migrate `wp_commentmeta` → `comment_meta` (key/value JSONB)
- [ ] Apply RLS: all comments inherit tenant from parent content

### 2.8 Options Migration (`wp_options` → `settings`)

| WP Column | OkCMS Column | Transform |
|-----------|--------------|-----------|
| `option_name` | `key` | Direct |
| `option_value` | `value` (JSONB) | Unserialize PHP → JSON; booleans, numbers, arrays preserved |
| `autoload` | `metadata.autoload` | Boolean |
| — | `group` | Categorize: `general`, `writing`, `reading`, `discussion`, `media`, `permalink`, `privacy`, `plugin:<slug>`, `theme:<slug>` |
| — | `type` | Infer: `string`, `number`, `boolean`, `json`, `array` |

**Known Core Options to Map Explicitly:**
- [ ] `siteurl`, `home` → `settings` group `general` + `metadata.is_site_url`
- [ ] `blogname`, `blogdescription` → `settings` group `general`
- [ ] `admin_email` → `settings` group `general`
- [ ] `permalink_structure` → `settings` group `permalink` + generate `url_redirects` for old structure
- [ ] `timezone_string`, `date_format`, `time_format` → `settings` group `general`
- [ ] `default_category`, `default_post_format` → `settings` group `writing`
- [ ] `posts_per_page`, `show_on_front`, `page_on_front`, `page_for_posts` → `settings` group `reading`
- [ ] `default_ping_status`, `default_comment_status`, `require_name_email`, `comment_registration`, `close_comments_for_old_posts`, `close_comments_days_old`, `thread_comments`, `thread_comments_depth`, `page_comments`, `comments_per_page`, `default_comments_page`, `comment_order` → `settings` group `discussion`
- [ ] `thumbnail_size_w/h`, `medium_size_w/h`, `large_size_w/h` → `settings` group `media`
- [ ] Plugin/theme options → `group: 'plugin:<slug>'` or `group: 'theme:<slug>'`

### 2.9 Menus Migration (`wp_posts` where `post_type='nav_menu_item'` + `wp_term_taxonomy` where `taxonomy='nav_menu'` → `menus`)

**WP Structure:**
- Menu = term in `nav_menu` taxonomy
- Menu items = posts with `post_type='nav_menu_item'`
- Item meta in `wp_postmeta`: `_menu_item_type`, `_menu_item_object_id`, `_menu_item_object`, `_menu_item_target`, `_menu_item_classes`, `_menu_item_xfn`, `_menu_item_url`, `_menu_item_orphaned`

**Mapping:**
- [ ] For each `nav_menu` term → create `menus` record (`name` = term name, `slug` = term slug)
- [ ] For each nav_menu_item → create menu item in `menus.items` JSONB array
  - Parse `_menu_item_type` → `type`: `custom`, `post_type`, `taxonomy`
  - Resolve `_menu_item_object_id` via content/term ID maps
  - Build hierarchical structure via `post_parent` (menu item parent)
- [ ] Store `menus.settings` with WP menu locations (`theme_location` → `locations` map)

---

## ⚙️ Phase 3 — Transformers & Utilities

### 3.1 PHP Serialized String Parser
- [ ] Implement robust PHP `unserialize()` in TypeScript (handle: strings, integers, floats, arrays, objects, null, boolean)
- [ ] Handle WP-specific: `WP_Post`, `WP_Term`, `WP_User` objects → extract ID
- [ ] Handle nested serialization (meta values that are serialized arrays containing serialized strings)
- [ ] **Security**: Never `eval` — pure parser. Limit depth, size.

### 3.2 Date/Time Normalization
- [ ] WP stores dates as `YYYY-MM-DD HH:MM:SS` in site timezone + `post_date_gmt` in UTC
- [ ] Convert all to `TIMESTAMPTZ` (UTC) for OkCMS
- [ ] Read `timezone_string` from `wp_options` for correct interpretation

### 3.3 Slug Generation & Collision Resolution
- [ ] WP `sanitize_title()` → OkCMS slug (lowercase, hyphens, no accents)
- [ ] Ensure uniqueness per `(tenant_id, type, slug)` — append `-2`, `-3` if collision
- [ ] Store `wp_post_name → okcms_slug` map for redirect generation

### 3.4 HTML → Structured Content (Gutenberg/Classic)
- [ ] Use `@wordpress/blocks` parser if available, or custom regex-based parser
- [ ] Output: `{ blocks: [ { name: 'core/paragraph', attributes: { content: '...' }, innerBlocks: [] } ] }`
- [ ] Fallback: `{ type: 'classic', html: '...' }`

---

## 📦 Phase 4 — Execution Engine

### 4.1 Migration Runner
- [ ] **Sequential Phases** (dependency order):
  1. Tenant + Roles + Users
  2. Content Types
  3. Taxonomies + Terms
  4. Content (posts/pages/custom)
  5. Post Meta (field_values, body, data)
  6. Media (attachments)
  7. Content-Taxonomy relationships
  8. Comments
  9. Menus
  10. Options/Settings
  11. URL Redirects (from permalink changes + `_wp_old_slug`)
- [ ] **Checkpointing**: After each phase, write progress to `wp_migration_checkpoints` temp table (or JSON file)
- [ ] **Resume**: `--resume-from` loads checkpoint, skips completed phases
- [ ] **Idempotency**: All inserts use `ON CONFLICT DO UPDATE` with checksum comparison

### 4.2 Batch Processing
- [ ] Configurable batch size (default 500 for content, 2000 for meta)
- [ ] Use `postgres`/`mysql2` batch inserts (`INSERT ... VALUES (...), (...)`)
- [ ] Progress bars via `cli-progress` or similar

### 4.3 Error Handling & Reporting
- [ ] **Error Classes**: `WPConnectionError`, `WPSchemaError`, `MappingError`, `ValidationError`, `InsertError`
- [ ] **Error Collection**: Accumulate non-fatal errors (e.g., missing media file, unresolvable post reference) — continue migration
- [ ] **Final Report**: JSON + console summary with:
  - Counts per entity (created/updated/skipped/failed)
  - Error list with context (WP ID, table, field)
  - Unmapped meta keys (for manual review)
  - Duration per phase

---

## 📚 Phase 5 — Conceptual Mapping Documentation

### 5.1 Document Structure: `docs/wordpress-conceptual-mapping.md`

```markdown
# WordPress → OkCMS Conceptual Mapping

> Reference for developers migrating from WordPress or building WP-compatible tools.

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
```

### 5.2 Content Requirements per Section

#### 1. Core Philosophy
- [ ] Explain: WP = "Everything is a post + meta (EAV)" vs OkCMS = "Domain-driven normalized + JSONB + structured EAV"
- [ ] Multi-tenancy: WP Multisite (table prefixes) vs OkCMS RLS (single DB, row-level isolation)
- [ ] Extensibility: WP hooks/filters + PHP plugins vs OkCMS Field Types + React components + TypeScript plugins

#### 2. Entity Mapping Table (Complete)
| WordPress Concept | OkCMS Equivalent | Key Differences |
|-------------------|------------------|-----------------|
| `wp_posts` (all post_types) | `content` + `content_types` registry | Types registered explicitly; revisions in separate table |
| `wp_postmeta` | `field_values` (typed) + `body`/`data`/`metadata` (JSONB) | Typed, validated, indexed; not pure EAV |
| `wp_terms` + `wp_term_taxonomy` | `taxonomies` (registry) + `taxonomy_terms` (instances) | Taxonomy is first-class entity; terms belong to one taxonomy |
| `wp_term_relationships` | `content_taxonomy_terms` | Direct M:N, no intermediate taxonomy_id |
| `wp_users` + `wp_usermeta` | `users` + `tenant_users` + `roles` | RBAC with JSONB permissions; multi-tenant native |
| `wp_comments` + `wp_commentmeta` | `comments` + `comment_meta` | Threaded, moderated, RLS |
| `wp_options` | `settings` | Typed, grouped, tenant-scoped |
| `wp_links` | — | Deprecated in WP; not migrated |
| `wp_posts` (attachment) | `media` | Dedicated table, structured metadata |
| `wp_posts` (nav_menu_item) + `nav_menu` taxonomy | `menus` + `menus.items` JSONB | Hierarchical JSONB instead of flat posts |
| `wp_postmeta` (`_wp_page_template`) | `content.layout` + `metadata.template` | Template → layout field |
| `wp_postmeta` (`_thumbnail_id`) | `content.featured_image_id` | FK to `media` |
| `wp_usermeta` (`wp_capabilities`) | `roles.permissions` | Capabilities → permission slugs |
| `wp_usermeta` (ACF fields on user) | `field_values` (entity_type='user' — future) | Currently: `users.metadata` |

#### 3. Field-Level Mapping (Detailed)
- [ ] Table: WP post columns → OkCMS content columns
- [ ] Table: Common meta keys → OkCMS targets
- [ ] ACF field types → OkCMS field types mapping table

#### 4. Taxonomy System
- [ ] WP: Terms shared across taxonomies (term_id reused) vs OkCMS: Terms bound to single taxonomy
- [ ] Hierarchical: WP `parent` in `wp_term_taxonomy` vs OkCMS `parent_id` in `taxonomy_terms`
- [ ] Term meta: WP `wp_termmeta` vs OkCMS `taxonomy_terms.meta` + `field_values`

#### 5. User & Permission Model
- [ ] WP roles/capabilities (flat strings) vs OkCMS roles (JSONB permissions, hierarchical)
- [ ] WP `current_user_can()` vs OkCMS `permissions.check()`
- [ ] Application passwords vs API keys (rotation, scopes)

#### 6. Media & Files
- [ ] WP: Attachment posts + `_wp_attachment_metadata` serialized
- [ ] OkCMS: `media` table with `metadata` JSONB (sizes, EXIF, focal point)
- [ ] File storage: WP local uploads vs OkCMS configurable (local/S3/Azure/GCS)

#### 7. Settings & Options
- [ ] WP `wp_options` (autoload, serialized) vs OkCMS `settings` (typed, grouped, no autoload)
- [ ] Site URL / Home URL handling (OkCMS uses tenant domain/subdomain)

#### 8. Menus & Navigation
- [ ] WP: `nav_menu` taxonomy + `nav_menu_item` posts + postmeta
- [ ] OkCMS: `menus` table with `items` JSONB (hierarchical, typed)

#### 9. Comments
- [ ] Near parity: status, threading, meta, author (user/anonymous)
- [ ] OkCMS adds: RLS, `comment_meta` with JSONB values

#### 10. Extensibility: Plugins → Field Types
- [ ] WP: PHP hooks, meta boxes, ACF fields
- [ ] OkCMS: `field_type_extensions` table, `api.addFieldType()`, React components (`adminComponentPath`, `adminRendererPath`), JSON Schema config
- [ ] Migration path: ACF field group → `field_group` + `field_definitions` + custom field type plugin

#### 11. Query API Comparison
- [ ] `WP_Query` → OkCMS `ContentService.query()` / `FieldValueService.query()`
- [ ] `WP_Meta_Query` → `field_values` with JSONB operators (`@>`, `?`, `||`)
- [ ] `WP_Tax_Query` → `content_taxonomy_terms` joins
- [ ] `get_posts()` / `get_pages()` → `ContentService.findByType()`
- [ ] `get_post_meta()` → `FieldValueService.getByEntity()`

#### 12. Common Migration Gotchas
- [ ] Serialized PHP strings in meta — must unserialize
- [ ] Gutenberg block comments in `post_content` — parse or wrap as classic
- [ ] `_wp_old_slug` meta → URL redirects
- [ ] Orphaned postmeta (post deleted, meta remains) — skip or log
- [ ] Duplicate slugs across post types — OkCMS unique per type+tenant
- [ ] Term slug collisions across taxonomies — OkCMS unique per taxonomy
- [ ] Missing media files — flag, don't fail
- [ ] Multisite — not supported in v1
- [ ] Polylang/WPML translations — map to separate content entries with `metadata.locale` + future i18n linking

---

## ✅ Phase 6 — Testing Strategy

### 6.1 Unit Tests (Per Mapper)
- [ ] `wp-migrate/mappers/users.test.ts` — user + role mapping
- [ ] `wp-migrate/mappers/content-types.test.ts` — post_type → content_type
- [ ] `wp-migrate/mappers/content.test.ts` — post → content + versions
- [ ] `wp-migrate/mappers/postmeta.test.ts` — meta classification + field_values
- [ ] `wp-migrate/mappers/taxonomies.test.ts` — terms → taxonomies/terms
- [ ] `wp-migrate/mappers/media.test.ts` — attachments → media
- [ ] `wp-migrate/mappers/comments.test.ts` — comments + meta
- [ ] `wp-migrate/mappers/options.test.ts` — options → settings
- [ ] `wp-migrate/mappers/menus.test.ts` — nav menus → menus
- [ ] `wp-migrate/transformers/*.test.ts` — each transformer

### 6.2 Integration Tests
- [ ] **Fixture WP Database**: Create test fixture (SQL dump) with:
  - Users (admin, editor, author)
  - Posts, pages, custom post type (e.g., `product`)
  - Categories, tags, custom taxonomy (`product_cat`)
  - ACF field groups on posts + custom post type
  - Media attachments (with `_wp_attachment_metadata`)
  - Comments (threaded, approved/pending/spam)
  - Menus (nested items)
  - Options (permalinks, reading, discussion)
  - Yoast SEO meta
- [ ] **Full Migration Test**: Run `okcms wp import` against fixture, verify:
  - All entities created in OkCMS DB
  - Counts match (within expected losses: revisions, auto-drafts)
  - Content renders correctly (body JSONB structure)
  - Taxonomy terms linked correctly
  - Media references resolved
  - Field values validated against field_definitions
- [ ] **Idempotency Test**: Run migration twice → second run = 0 creates, 0 errors
- [ ] **Resume Test**: Kill migration mid-phase, resume → completes correctly

### 6.3 Performance Benchmarks
- [ ] Benchmark on WP DB with 10k posts, 50k postmeta, 5k terms
- [ ] Target: < 5 min for full import (excluding file copy)
- [ ] Memory: < 512MB peak

### 6.4 Documentation Tests
- [ ] Verify all mapping tables in `wordpress-conceptual-mapping.md` are accurate
- [ ] Code examples compile (TypeScript)
- [ ] Links to API docs work

---

## 🚀 Phase 7 — Polish & Release

### 7.1 CLI Polish
- [ ] Help text: `okcms wp import --help` with examples
- [ ] Interactive mode: `okcms wp import --interactive` (prompts for credentials)
- [ ] Dry-run default: `okcms wp import --dry-run` shows plan without writing
- [ ] Color output, progress bars, ETA
- [ ] Exit codes: 0=success, 1=validation error, 2=connection error, 3=migration error

### 7.2 Documentation
- [ ] `docs/wordpress-migration-guide.md` — Step-by-step tutorial
- [ ] `docs/wordpress-conceptual-mapping.md` — Reference (Phase 5)
- [ ] Update `packages/cli/README.md` with `wp` command docs
- [ ] Add migration troubleshooting section

### 7.3 Example / Demo
- [ ] Provide sample WP export (XML or SQL) in `docs/examples/wordpress-sample.sql`
- [ ] Document: `okcms wp import --wp-database wordpress_sample --tenant demo`

### 7.4 CI/CD
- [ ] Add GitHub Action: spin up MySQL + WP fixture, run migrator, verify counts
- [ ] Test against MySQL 8.0 and MariaDB 11.4

---

## 📅 Timeline Estimate

| Phase | Effort | Dependencies |
|-------|--------|--------------|
| Phase 0: Prerequisites | 1 day | — |
| Phase 1: Architecture | 2 days | Phase 0 |
| Phase 2: Mappers (10 domains) | 10 days | Phase 1 |
| Phase 3: Transformers | 3 days | Phase 1 |
| Phase 4: Execution Engine | 3 days | Phase 2, 3 |
| Phase 5: Documentation | 2 days | Phase 2 |
| Phase 6: Testing | 5 days | Phase 4 |
| Phase 7: Polish | 2 days | Phase 6 |
| **Total** | **~28 days** | — |

---

## 🔗 Related Files & References

- **Database Schema**: `packages/database/src/schema/schema.sql`
- **Migration Runner**: `packages/database/src/migrations/runner.ts`
- **CLI Commands**: `packages/cli/src/commands.ts`, `packages/cli/src/command-registry.ts`
- **Field System**: `packages/core/src/fields/` (FieldTypeExtensionService, FieldDefinitionService)
- **Content Service**: `packages/core/src/content/` (ContentService, ContentTypeService)
- **Taxonomy Service**: `packages/core/src/taxonomy/`
- **Media Service**: `packages/core/src/media/`
- **Settings Service**: `packages/core/src/settings/`
- **User/Auth**: `packages/auth/src/`
- **Existing Migration Docs**: `docs/migration-recovery.md`, `docs/custom-fields-migration.md`

---

## 📝 Notes & Decisions

### Out of Scope (v1)
- [ ] WordPress Multisite → OkCMS multi-tenant mapping
- [ ] WPML/Polylang translation migration (requires i18n linking in OkCMS)
- [ ] Widget migration (WP widgets → OkCMS components/blocks)
- [ ] Custom table migration (plugin-specific tables)
- [ ] Real-time sync / incremental migration (one-time import only)
- [ ] File copy from remote WP server (assumes local filesystem access)

### Future Enhancements
- [ ] `--watch` mode for incremental sync
- [ ] WP REST API source (not just direct DB)
- [ ] Visual field mapping UI in Admin
- [ ] Rollback command (`okcms wp rollback <migration-id>`)

---

## ✅ Master Checklist

### Planning & Setup
- [ ] Phase 0 complete: Prerequisites verified, WP schema documented
- [ ] Phase 1 complete: Project structure created, CLI command registered

### Core Mapping Implementation
- [ ] 2.1 Tenant & Users
- [ ] 2.2 Content Types
- [ ] 2.3 Content + Revisions
- [ ] 2.4 Post Meta (classification, field defs, values)
- [ ] 2.5 Taxonomies + Terms
- [ ] 2.6 Media
- [ ] 2.7 Comments
- [ ] 2.8 Options
- [ ] 2.9 Menus

### Transformers
- [ ] 3.1 PHP Unserialize
- [ ] 3.2 Date Normalization
- [ ] 3.3 Slug Generation
- [ ] 3.4 HTML → JSONB

### Execution Engine
- [ ] 4.1 Sequential Runner + Checkpoints
- [ ] 4.2 Batch Processing
- [ ] 4.3 Error Handling + Reporting

### Documentation
- [ ] 5.1 `docs/wordpress-conceptual-mapping.md` created
- [ ] 5.2 All 12 sections complete with tables + code examples

### Testing
- [ ] 6.1 Unit tests for all mappers/transformers
- [ ] 6.2 Integration test with fixture WP DB
- [ ] 6.3 Idempotency + Resume tests
- [ ] 6.4 Performance benchmark

### Release
- [ ] 7.1 CLI Polish
- [ ] 7.2 Migration Guide + Conceptual Mapping docs published
- [ ] 7.3 Example fixture provided
- [ ] 7.4 CI/CD pipeline passing

---

## 🎉 Definition of Done

The feature is complete when:

1. **`okcms wp import`** runs successfully against a real WordPress database (MySQL/MariaDB), producing a fully functional OkCMS tenant with all content, users, taxonomies, media, menus, settings, and comments migrated.
2. **`docs/wordpress-conceptual-mapping.md`** exists and accurately documents every mapping with tables and code examples.
3. All tests pass (unit + integration).
4. Migration is idempotent and resumable.
5. Documentation is published and linked from CLI help.

---

*End of Plan — Ready for Implementation*