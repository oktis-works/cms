# @oktis-works/api

REST API — Hono-based, JWT auth, multi-tenant, permission-gated.

## Base URL

```
/api/v1
```

## Authentication

- **JWT** in `Authorization: Bearer <token>`
- **Tenant** from JWT claim or `X-Tenant-ID` header
- **Permissions** via `requirePermission(action, resource)` middleware

## Content Routes (`/content`)

| Method | Path | Permission | Description |
|--------|------|------------|-------------|
| `GET` | `/content` | `read:content` | List (pagination, filter by type/status/search) |
| `GET` | `/content/:id` | `read:content` | Get by ID |
| `GET` | `/content/slug/:slug` | `read:content` | Get by slug (optional `?type=`) |
| `GET` | `/content/singleton/:type` | `read:content` | Get singleton content |
| `POST` | `/content` | `create:content` | Create content |
| `PUT` | `/content/:id` | `update:content` | Update content |
| `DELETE` | `/content/:id` | `delete:content` | Delete content |
| `POST` | `/content/:id/publish` | `update:content` | Publish (sync or `?mode=async`) |
| `POST` | `/content/:id/unpublish` | `update:content` | Unpublish |

### Create Content (`POST /content`)

```json
{
  "type": "post",
  "title": "Hello World",
  "slug": "hello-world",           // optional, auto-generated
  "body": { "html": "<p>...</p>" },
  "excerpt": "Optional excerpt",
  "status": "DRAFT",              // DRAFT | PUBLISHED | ARCHIVED | TRASHED
  "featuredImageId": "uuid",
  "seoTitle": "SEO Title",
  "seoDescription": "SEO Description",
  "metadata": { "hub_type": "project" },  // for hub pages
  "layout": "custom-layout",      // optional
  "parentId": "uuid"              // Phase 1: hierarchical parent
}
```

**Response:** `201 Created` with content object.

### Update Content (`PUT /content/:id`)

Same fields as create (all optional). `parentId: null` removes parent.

**Validation:**
- `parentId` must be same type, same tenant
- No cycles (server-side)
- Max depth 5

### List Content (`GET /content`)

Query params:
- `page=1`, `limit=20`
- `type=post`
- `status=PUBLISHED`
- `search=query` (title/slug)
- `include=author` — attaches author object

## Content Types (`/content-types`)

| Method | Path | Permission |
|--------|------|------------|
| `GET` | `/content-types` | `read:content-types` |
| `POST` | `/content-types` | `create:content-types` |
| `PUT` | `/content-types/:slug` | `update:content-types` |
| `DELETE` | `/content-types/:slug` | `delete:content-types` |

## Settings (`/settings`)

| Method | Path | Permission |
|--------|------|------------|
| `GET` | `/settings/:group` | `read:settings` |
| `PUT` | `/settings` | `update:settings` |

Groups: `reading`, `general`, `writing`, `media`, `permalinks`.

## Media (`/media`)

| Method | Path | Permission |
|--------|------|------------|
| `GET` | `/media` | `read:media` |
| `POST` | `/media` | `create:media` (multipart) |
| `DELETE` | `/media/:id` | `delete:media` |

## Tenants (`/tenants`)

| Method | Path | Permission |
|--------|------|------------|
| `GET` | `/tenants` | `read:tenants` (superadmin) |
| `POST` | `/tenants` | `create:tenants` (superadmin) |

## Phase 1 Integration

### Parent ID in Content API

```json
// POST /content or PUT /content/:id
{
  "parentId": "uuid-of-parent-item"
}
```

Passed directly to `contentService.create/update`.

### Hub Page Metadata

```json
// PUT /content/:pageId
{
  "metadata": { "hub_type": "project" }
}
```

Sets page as hub for content type `project`. Slug becomes URL base (`/projects/`).

## Error Responses

```json
// 400 Bad Request
{ "error": "Validation failed: ..." }

// 401 Unauthorized
{ "error": "Invalid or expired token" }

// 403 Forbidden
{ "error": "Insufficient permissions" }

// 404 Not Found
{ "error": "Content not found" }

// 409 Conflict
{ "error": "Parent assignment would create a cycle" }
```

## Multi-tenant

- `tenantId` injected from JWT (never from request body)
- All queries scoped via `runWithTenantTransaction(tenantId, fn)`
- RLS enforces isolation at DB level

## Rate Limiting

- Not implemented yet (TODO)