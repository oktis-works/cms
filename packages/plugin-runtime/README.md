# @oktis-works/plugin-runtime

Plugin runtime — loader, registry, hook system, block/pattern rendering.

## Architecture

### PluginLoader

```typescript
const loader = new PluginLoader({
  pluginsDir: '/path/to/plugins',
  platformPluginsDir: '/path/to/platform/plugins',
});
await loader.loadAll(tenantId);
```

**Load order:**
1. Platform plugins (tenant_id = null)
2. Tenant-specific plugins
3. Sort by priority (lower first)

**Validation:**
- `manifest.compatibility.okcms` semver check (throws if not satisfied)
- Entry point exists and exports `register`

### PluginRegistry

Stores loaded plugins:

```typescript
interface PluginRegistry {
  plugins: Map<string, LoadedPlugin>;
  blocks: Map<string, BlockDefinition>;
  patterns: Map<string, PatternDefinition>;
  fieldTypes: Map<string, FieldTypeDefinition>;
  hooks: HookRegistry;
  adminPages: Map<string, AdminPageDefinition>;
  adminMenuItems: Map<string, AdminMenuItemDefinition>;
}
```

### HookRegistry

```typescript
class HookRegistry {
  addFilter(hook: string, fn: FilterFn, priority?: number): void;
  addAction(hook: string, fn: ActionFn, priority?: number): void;
  applyFilters(hook: string, value: unknown, ...args: unknown[]): unknown;
  applyFiltersAsync(hook: string, value: unknown, ...args: unknown[]): Promise<unknown>;
  doAction(hook: string, context: unknown): Promise<void>;
}
```

**Core hooks:**
- `theme:head` — inject into `<head>`
- `theme:before:render` — transform render data
- `theme:after:render` — post-process HTML
- `before_save_content:{type}` — pre-save filter
- `after_save_content:{type}` — post-save action
- `content_query` — filter list queries

### Block Rendering

```typescript
const rendered = await renderPluginBlocks(
  data._blocks,           // array of { type, attrs }
  blockCatalog,           // from ThemeRenderData.pluginBlocks
  resolveExtensionDirectory('plugin'),
  patterns
);
```

- Resolves block renderer via `resolveExtensionDirectory('plugin')` + `rendererPath`
- Renders each block to HTML string
- Returns concatenated HTML

### Pattern Rendering

Patterns are pre-built block arrays inserted in editor:

```typescript
api.addPattern({
  name: 'hero-pattern',
  label: 'Hero Section',
  content: [
    { type: 'core/heading', attrs: { level: 1, content: 'Title' } },
    { type: 'core/paragraph', attrs: { content: 'Subtitle' } }
  ]
});
```

### Extension Resolution

```typescript
resolveExtensionDirectory('plugin')  // → '/path/to/plugins/{name}/dist'
```

Used for:
- Block renderers
- Pattern components
- Admin components (FieldType, Editor, etc.)

### Admin Component Host

```tsx
<PluginComponentHost
  componentId="my-plugin/MyField"
  extraProps={{ value, config, field }}
/>
```

- Dynamically imports component via `resolveExtensionDirectory('plugin')`
- Renders in editor slots (replace-body, below, metaboxes)
- Error boundary: fallback to JSON editor / textarea

## Field Type Runtime

### Registration

Field types registered via `api.addFieldType()` in plugin SDK → stored in `PluginRegistry.fieldTypes`.

### Admin FieldTypePicker

Loads all registered field types + core types → shows in field group editor.

### Admin FieldSettingsEditor

```tsx
<FieldSettingsEditor
  field={field}
  config={field.config}
  onChange={newConfig => setFieldConfig(newConfig)}
/>
```

Dynamically imports `adminComponentPath` from plugin.

### Frontend FieldRenderer

```tsx
<FieldRenderer
  field={field}
  value={value}
  onChange={newValue => setData({ ...data, [field.name]: newValue })}
/>
```

Dynamically imports `adminRendererPath` (or `adminComponentPath` fallback).

**Fallbacks:**
- Config component fails → JSON editor
- Renderer fails → `<textarea>` with raw JSON

## Hook Points (Reference)

| Hook | Type | Context | Used By |
|------|------|---------|---------|
| `theme:head` | filter | `{ settings, activeTheme }` | plugins inject `<head>` tags |
| `theme:before:render` | filter | `{ template, contentType, slug, ... }` | transform render data |
| `theme:after:render` | filter | `{ html, ... }` | post-process HTML |
| `before_save_content:{type}` | filter | `{ operation, title, slug, id? }` | validate/transform input |
| `after_save_content:{type}` | action | `{ content, operation, previousVersion? }` | side effects |
| `content_query` | filter | `Content[]` | filter list results |

## Hook Priority

```typescript
api.addFilter('hook', fn, priority);  // lower = runs first
```

Default priority: 10.

## Phase 4 Integration

Custom field types from plugins:
1. Registered via `api.addFieldType()` in `register(api)`
2. Stored in `PluginRegistry.fieldTypes`
3. Available in `FieldTypePicker` (admin)
4. Config via `adminComponentPath` → `FieldSettingsEditor`
5. Render via `adminRendererPath` → `FieldRenderer`
5. Fallback: JSON editor / textarea