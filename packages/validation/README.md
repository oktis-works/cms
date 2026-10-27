# @oktis-works/validation

Field validation — field groups, logical values, custom field support.

## Core Concepts

### Field Groups

Logical collections of fields attached to content types.

```typescript
interface FieldGroup {
  key: string;                    // 'seo', 'hero', 'custom'
  title: string;
  description?: string;
  position: 'normal' | 'side' | 'advanced';
  displayStyle: 'standard' | 'accordion' | 'tabs';
  fields: FieldDefinition[];
  active: boolean;
  attachTo: string[];            // content type slugs
  source: 'CORE' | 'PLUGIN' | 'ADMIN';
}
```

### Field Definitions

```typescript
interface FieldDefinition {
  name: string;                   // unique within group
  label: string;
  type: string;                   // 'text', 'textarea', 'select', 'media', 'repeater', 'custom', etc.
  required?: boolean;
  defaultValue?: unknown;
  options?: Record<string, unknown>;  // select options, validation rules, etc.
  validation?: ValidationRule[];
}
```

### Validation Rules

```typescript
interface ValidationRule {
  type: 'required' | 'minLength' | 'maxLength' | 'pattern' | 'custom';
  params?: Record<string, unknown>;
  message?: string;
}
```

## Logical Values Normalization

```typescript
function normalizeLogicalValues(input: {
  body?: Record<string, unknown>;
  data?: Record<string, unknown>;
  native?: Record<string, unknown>;
}): Record<string, unknown>;
```

- Merges `body` (editor content), `data` (custom fields), `native` (direct fields)
- Resolves field groups into flat logical values
- Used before save and before render

## Body Serialization

```typescript
function logicalValuesToBody(logical: Record<string, unknown>): Record<string, unknown>;
function logicalValuesToNative(logical: Record<string, unknown>): Record<string, unknown>;
```

- `logicalValuesToBody` → JSONB stored in `content.body`
- `logicalValuesToNative` → flat object for template context

## Field Group Service

```typescript
class FieldGroupService {
  async list(type: string): Promise<ResolvedFieldGroup[]>;
  async get(key: string): Promise<FieldGroup | null>;
  async validateValues(context: { contentType: string; contentSlug?: string; postStatus?: string }, values: Record<string, unknown>): Promise<ValidationIssue[]>;
}
```

## Custom Fields (Phase 4)

Custom field types from plugins:

1. Registered via `api.addFieldType()` in plugin SDK
2. Stored in `field_type_extensions` table
3. Loaded by `FieldGroupService` alongside core fields
4. Config validated against `configSchema` (JSON Schema)
5. Rendered in admin via dynamic import of `adminComponentPath`
6. Frontend render via `adminRendererPath` (or fallback)

## Phase 1 Integration

- Parent field (`parentId`) added to content create/update
- Validation ensures same type, same tenant, no cycles, max depth 5
- Logical values include `parentId` in native object

## Custom Field Registration (Plugin SDK)

```typescript
api.addFieldType({
  type: 'my_custom_field',
  label: 'My Custom Field',
  category: 'media',
  icon: 'image',
  adminComponentPath: './admin/components/MyField.tsx',
  adminRendererPath: './admin/components/MyFieldRenderer.tsx',
  configSchema: {
    type: 'object',
    properties: {
      option1: { type: 'string', title: 'Option 1' }
    },
    required: ['option1']
  }
});
```

## Field Groups in Templates

Available as `fields` object in template context:

```astro
---
const { fields } = Astro.props;
---
<div class="hero">
  <h1>{fields.hero?.title}</h1>
  <img src={fields.hero?.image?.url} alt={fields.hero?.image?.alt} />
</div>
```

## Field Group Positions

| Position | Use Case |
|----------|----------|
| `normal` | Main content area (below editor) |
| `side` | Sidebar (publish panel, attributes) |
| `advanced` | Collapsed advanced section |

## Display Styles

| Style | Behavior |
|-------|----------|
| `standard` | Fields stacked vertically |
| `accordion` | Collapsible sections |
| `tabs` | Tabbed interface |

## Validation Flow

1. **Admin save** → `stripUnsupportedFields` (removes unsupported fields per type)
2. **Hook** → `before_save_content:{type}` filter
3. **Normalize** → `normalizeLogicalValues` merges body/data/native
4. **Validate** → `validateCustomFields` against field group schemas
5. **Serialize** → `logicalValuesToBody` → stored in `content.body`
6. **Native** → `logicalValuesToNative` → template context