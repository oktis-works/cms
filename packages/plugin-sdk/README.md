# @oktis-works/plugin-sdk

Plugin SDK — API for plugins to extend the CMS.

## Plugin Manifest

```json
{
  "name": "my-plugin",
  "version": "1.0.0",
  "description": "Does something cool",
  "entry": "dist/index.js",
  "permissions": [
    "content:read",
    "content:create",
    "settings:read",
    "field-types:register"    // for custom field types
  ],
  "fieldTypes": [
    {
      "type": "my_custom_field",
      "label": "My Custom Field",
      "category": "media",
      "icon": "image",
      "adminComponentPath": "./admin/components/MyField.tsx",
      "adminRendererPath": "./admin/components/MyFieldRenderer.tsx",
      "configSchema": { "type": "object", "properties": { "option1": { "type": "string" } } }
    }
  ],
  "blocks": [
    { "type": "hero", "label": "Hero Section", "rendererPath": "./blocks/Hero.tsx" }
  ],
  "patterns": [
    { "name": "hero-pattern", "label": "Hero Pattern", "content": [...] }
  ]
}
```

## Plugin API (`api` parameter in `register(api)`)

### Content Types

```typescript
api.addContentType(definition: ContentTypeDefinition): void;
```

### Field Types (Phase 4 — Custom Fields)

```typescript
api.addFieldType(definition: FieldTypeDefinition): void;
```

**FieldTypeDefinition:**
```typescript
{
  type: string;              // unique identifier
  label: string;
  category: string;          // 'text', 'media', 'choice', 'relational', etc.
  icon: string;              // admin icon
  adminComponentPath: string; // path to config component (relative to plugin entry)
  adminRendererPath?: string; // path to renderer component (fallback to adminComponentPath)
  configSchema: JSONSchema;  // validates field config in admin
}
```

### Blocks (Editor)

```typescript
api.addBlock(block: BlockDefinition): void;
```

**BlockDefinition:**
```typescript
{
  type: string;              // unique (namespaced: 'my-plugin/hero')
  label: string;
  rendererPath: string;      // path to block renderer component
  defaultAttrs?: Record<string, unknown>;
}
```

### Patterns (Editor)

```typescript
api.addPattern(pattern: PatternDefinition): void;
```

### Settings

```typescript
api.addSettingsSection(section: SettingsSectionDefinition): void;
```

### Hooks

```typescript
api.addFilter(hook: string, fn: (value: unknown, context: unknown) => unknown): void;
api.addAction(hook: string, fn: (context: unknown) => void): void;
```

**Common hooks:**
- `theme:head` — inject `<head>` tags
- `theme:before:render` / `theme:after:render` — transform render data
- `before_save_content:{type}` / `after_save_content:{type}` — content mutations
- `content_query` — filter list queries

### Admin UI

```typescript
api.addAdminPage(page: AdminPageDefinition): void;
api.addAdminMenuItem(item: AdminMenuItemDefinition): void;
api.addAdminNotice(notice: AdminNotice): void;
```

### Assets

```typescript
api.enqueueStyle(handle: string, src: string, deps?: string[], version?: string): void;
api.enqueueScript(handle: string, src: string, deps?: string[], version?: string, strategy?: 'defer' | 'async'): void;
```

Assets rendered in theme via `theme:head` filter.

## Vite Alias

Plugin admin components resolved via `@/plugins/*` → `../../../plugins/*/admin`.

```typescript
// In plugin admin component
import MyField from '@/plugins/my-plugin/admin/components/MyField.tsx';
```

## Plugin Lifecycle

1. **Load** — `import(plugin.entry)` → get `register(api)`
2. **Register** — `register(api)` called with PluginAPI
3. **Boot** — `api.onBoot?.()` called after all plugins registered
4. **Runtime** — hooks, blocks, field types active

## Field Type Registration (Phase 4)

Custom field types registered via `api.addFieldType()` in `register()`.

**Backend:** Stored in `field_type_extensions` table via `FieldTypeExtensionService`.

**Admin Config:** `adminComponentPath` component receives `{ value, config, field }`, returns JSX.

**Renderer:** `adminRendererPath` (or fallback to adminComponentPath) receives `{ value, config, field }`.

**Fallbacks:**
- Config failed → JSON editor
- Render failed → `<textarea>` with raw JSON

## Plugin Loader

`PluginLoader.loadPlugin(manifest)`:
1. Validates `compatibility.okcms` semver range
2. Dynamic imports entry point
3. Calls `register(api)`
4. Stores in registry

Throws if CMS version not satisfied.

## Permissions

Declared in manifest, checked at API route level:

```typescript
requirePermission('content:create', 'content');
```

## Multi-tenant

Plugins loaded per-tenant via `ensureTenantPluginsLoaded(tenantId)`.

Platform plugins (tenant_id=null) + tenant plugins merged.

## Phase 4 Integration

Custom field types → registered via `api.addFieldType()` → available in admin FieldTypePicker → stored in `field_type_extensions` → renderer used in `FieldRenderer` via dynamic import.