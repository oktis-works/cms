# @oktis-works/types

Shared TypeScript types — entities, DTOs, enums, API contracts.

## Entity Types (`entities/index.ts`)

### Content

```typescript
interface Content extends Timestamps {
  id: UUID;
  tenantId: UUID;
  type: string;                    // 'post', 'page', 'project', custom
  title: string;
  slug: string;                    // globally unique
  body?: Record<string, unknown>;  // JSONB logical values
  excerpt?: string;
  status: ContentStatus;           // 'DRAFT' | 'PUBLISHED' | 'ARCHIVED' | 'TRASHED'
  authorId: UUID;
  featuredImageId?: UUID;
  seoTitle?: string;
  seoDescription?: string;
  metadata?: Record<string, unknown>;  // Phase 1: hub_type, etc.
  layout?: string | null;
  parentId?: UUID | null;          // Phase 1: hierarchical parent
  publishedAt?: Date;
  version: number;
}
```

### ContentVersion

```typescript
interface ContentVersion {
  id: UUID;
  contentId: UUID;
  version: number;
  title: string;
  slug?: string | null;
  excerpt?: string | null;
  body?: Record<string, unknown>;
  featuredImageId?: UUID;
  seoTitle?: string;
  seoDescription?: string;
  metadata?: Record<string, unknown>;
  authorId?: UUID;
  createdAt: Date;
}
```

### ContentStatus

```typescript
type ContentStatus = 'DRAFT' | 'PUBLISHED' | 'ARCHIVED' | 'TRASHED';
```

### ContentTypeDefinition

```typescript
interface ContentTypeDefinition {
  name: string;
  slug: string;                    // 'post', 'page', 'project'
  pluralLabel: string;             // 'Posts'
  singularLabel: string;           // 'Post'
  hasArchive: boolean;             // enables listing at /{base}/
  singleton: boolean;              // only one instance allowed
  public: boolean;                 // visible in admin/API
  menuIcon: string;                // admin icon
  supports: string[];              // ['title', 'editor', 'excerpt', 'thumbnail']
  defaultFields?: string[];
  source: 'CORE' | 'PLUGIN' | 'ADMIN';
}
```

### FieldTypeDefinition (Phase 4)

```typescript
interface FieldTypeDefinition {
  type: string;                    // unique identifier
  label: string;
  category: string;                // 'text', 'media', 'choice', 'relational', etc.
  icon: string;
  adminComponentPath: string;      // path to config component
  adminRendererPath?: string;      // path to renderer component
  configSchema: JSONSchema;        // validates field config
}
```

### Media

```typescript
interface Media {
  id: UUID;
  tenantId: UUID;
  filename: string;
  title: string;
  mimeType: string;
  size: number;
  path: string;
  url: string;
  alt?: string;
  caption?: string;
  description?: string;
  metadata?: Record<string, unknown>;
  uploadedBy: UUID;
  createdAt: Date;
  updatedAt: Date;
}
```

### Taxonomy & Terms

```typescript
interface Taxonomy {
  id: UUID;
  tenantId: UUID;
  name: string;
  slug: string;
  hierarchical: boolean;
  attachTo: string[];      // content types
  labels?: Record<string, string>;
  source: 'CORE' | 'PLUGIN' | 'ADMIN';
}

interface Term {
  id: UUID;
  tenantId: UUID;
  taxonomyId: UUID;
  parentId?: UUID | null;    // hierarchical taxonomies
  name: string;
  slug: string;
  description?: string;
}
```

### Menus

```typescript
interface Menu {
  id: UUID;
  tenantId: UUID;
  name: string;
  slug: string;
  items: MenuItem[];
}

interface MenuItem {
  id: UUID;
  menuId: UUID;
  parentId?: UUID | null;
  label: string;
  url: string;
  target?: '_blank' | '_self';
  title?: string;
  cssClasses?: string;
  xfn?: string;
  order: number;
}
```

### Users & Auth

```typescript
interface User extends Timestamps {
  id: UUID;
  email: string;
  name: string;
  passwordHash: string;
  avatar?: string;
  status: 'ACTIVE' | 'INACTIVE' | 'LOCKED';
  locale?: string;
  lastLoginAt?: Date;
}

interface Role {
  id: UUID;
  tenantId?: UUID;
  name: string;
  slug: string;
  isSystem: boolean;
  permissions: string[];   // ['content:read', 'content:create', ...]
}
```

### Settings

```typescript
interface Setting {
  id: UUID;
  tenantId?: UUID;
  key: string;
  value: string | number | boolean | object;
  group: string;        // 'reading', 'general', 'writing', 'media', 'permalinks'
  type: 'string' | 'number' | 'boolean' | 'json';
}
```

### Theme

```typescript
interface Theme {
  id: UUID;
  name: string;
  version?: string;
  status: 'ACTIVE' | 'INACTIVE' | 'DELETED';
  manifest?: ThemeManifest;
  config?: Record<string, unknown>;  // customizer settings
  parentManifests?: ThemeManifest[]; // parent theme chain
}
```

## DTOs (`dto/index.ts`)

### Request/Response

```typescript
interface CreateContentRequest {
  type: string;
  title: string;
  slug?: string;
  body?: Record<string, unknown>;
  excerpt?: string;
  status?: ContentStatus;
  featuredImageId?: string;
  seoTitle?: string;
  seoDescription?: string;
  metadata?: Record<string, unknown>;
  layout?: string | null;
  parentId?: string;      // Phase 1
}

interface UpdateContentRequest extends Partial<CreateContentRequest> {
  parentId?: string | null;   // Phase 1: null = remove
}

interface ContentResponse extends Content {
  author?: { id: UUID; name: string; email: string; avatar?: string } | null;
  parent?: ContentResponse;   // Phase 1: populated parent
}
```

## Enums & Constants

```typescript
const CONTENT_STATUSES = ['DRAFT', 'PUBLISHED', 'ARCHIVED', 'TRASHED'] as const;
const DEFAULT_CONTENT_TYPES = ['post', 'page'];
const SYSTEM_ROLES = ['superadmin', 'admin', 'editor', 'author', 'contributor'];
```

## Timestamps

```typescript
interface Timestamps {
  createdAt: Date;
  updatedAt: Date;
}
```

## Phase 1 Additions

| Type | Addition |
|------|----------|
| `Content` | `parentId?: UUID \| null` |
| `CreateContentRequest` | `parentId?: string` |
| `UpdateContentRequest` | `parentId?: string \| null` |
| `ContentResponse` | `parent?: ContentResponse` |