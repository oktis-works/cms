# @oktis-works/test-utils

Shared test utilities — Vitest setup, mocks, fixtures, helpers.

## Vitest Configuration

```typescript
// vitest.config.ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['**/*.test.ts'],
    setupFiles: ['@oktis-works/test-utils/setup'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
    },
  },
});
```

## Setup (`setup.ts`)

```typescript
import { vi } from 'vitest';
import { getHookRegistry } from '@oktis-works/plugin-runtime';

// Shared hook registry mock
vi.mock('@oktis-works/plugin-runtime', () => ({
  getHookRegistry: () => ({
    addFilter: vi.fn(),
    addAction: vi.fn(),
    applyFilters: vi.fn((hook, value) => value),
    applyFiltersAsync: vi.fn(async (hook, value) => value),
    doAction: vi.fn(async () => {}),
  }),
}));

// Database mock
vi.mock('@oktis-works/database', () => ({
  getConnection: vi.fn(() => ({
    unsafe: vi.fn(async () => []),
  })),
}));
```

## Shared Mocks

### `sharedRegistry` (for render tests)

```typescript
const { sharedRegistry } = vi.hoisted(() => ({
  sharedRegistry: {
    addFilter: vi.fn(),
    doAction: vi.fn(),
    applyFilters: vi.fn((hook, value) => value),
  },
}));

vi.mock('@oktis-works/plugin-runtime', () => ({
  getHookRegistry: () => sharedRegistry,
}));
```

### Database Connection

```typescript
vi.mock('@oktis-works/database', () => ({
  getConnection: vi.fn(() => ({
    unsafe: vi.fn(async (query: string, params: unknown[]) => {
      if (query.includes('FROM content')) return [];
      if (query.includes('FROM settings')) return [];
      return [];
    }),
  })),
}));
```

## Test Helpers

### `makeRouter(lookup, templateFiles)`

```typescript
import { RuntimeRouter } from '@oktis-works/theme-runtime';
import { TemplateHierarchyResolver } from '@oktis-works/theme-runtime';

function makeRouter(lookup: ContentLookup, files: string[]): RuntimeRouter {
  const set = new Set(files);
  const resolver = new TemplateHierarchyResolver({
    exists: (file) => set.has(file),
  });
  return new RuntimeRouter(lookup, resolver);
}
```

### `stubHubMethods(lookup)` — Phase 1

```typescript
function stubHubMethods(lookup: Partial<ContentLookup>): ContentLookup {
  return {
    ...lookup,
    getHubPages: vi.fn().mockResolvedValue([]),
    findParent: vi.fn().mockResolvedValue(null),
    findRedirect: vi.fn().mockResolvedValue(null),
  } as ContentLookup;
}
```

## Fixtures

### Content Row

```typescript
const createContentRow = (overrides = {}) => ({
  id: 'content-1',
  tenant_id: 'tenant-1',
  type: 'post',
  title: 'Test Post',
  slug: 'test-post',
  body: { html: '<p>Content</p>' },
  data: {},
  excerpt: 'Excerpt',
  status: 'PUBLISHED',
  author_id: 'user-1',
  featured_image_id: null,
  seo_title: null,
  seo_description: null,
  metadata: {},
  layout: null,
  parent_id: null,      // Phase 1
  published_at: new Date().toISOString(),
  version: 1,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  ...overrides,
});
```

### Hub Page Row

```typescript
const createHubPageRow = (overrides = {}) => ({
  id: 'page-hub-1',
  tenant_id: 'tenant-1',
  type: 'page',
  title: 'Blog',
  slug: 'blog',
  body: {},
  data: {},
  status: 'PUBLISHED',
  author_id: 'user-1',
  metadata: { hub_type: 'post' },   // Phase 1
  ...overrides,
});
```

## Test Patterns

### Router Tests

```typescript
it('resolves hub page listing', async () => {
  const lookup = stubHubMethods({
    findByPath: vi.fn(),
    listTypes: vi.fn().mockResolvedValue([]),
    findById: vi.fn().mockResolvedValue({ type: 'page', slug: 'blog', data: {}, record: {} }),
    getSetting: vi.fn().mockResolvedValue(null),
  });
  const router = makeRouter(lookup, ['posts.astro', 'page.astro']);
  const result = await router.resolve('/blog');
  expect(result.matched).toBe(true);
  expect(result.hubBase).toBe('blog');
});
```

### Hook Tests

```typescript
it('applies theme:before:render filter', () => {
  const registry = getHookRegistry();
  registry.addFilter('theme:before:render', (data) => ({ ...data, injected: true }));
  const result = registry.applyFilters('theme:before:render', { foo: 'bar' });
  expect(result.injected).toBe(true);
});
```

### Async Hook Tests

```typescript
it('applies async filter', async () => {
  const registry = getHookRegistry();
  registry.addFilter('hook', async (value) => {
    await new Promise(r => setTimeout(r, 10));
    return { ...value, async: true };
  });
  const result = await registry.applyFiltersAsync('hook', { foo: 'bar' });
  expect(result.async).toBe(true);
});
```

## Phase 1 Test Additions

| Feature | Test Location |
|---------|---------------|
| Hub map building | `packages/theme-runtime/src/routing.test.ts` |
| Walk-up validation | `packages/theme-runtime/src/routing.test.ts` |
| Redirect store | `packages/theme-runtime/src/routing.test.ts` |
| Parent chain | `apps/web/src/rendering.test.ts` |
| Sitemap generation | `apps/web/src/rendering.test.ts` (integration) |
| Feed generation | `apps/web/src/rendering.test.ts` (integration) |
| JSON-LD output | `apps/web/src/rendering.test.ts` |
| Parent select UI | `apps/admin/src/components/content/ContentEditor.test.tsx` |
| Hub pages UI | `apps/admin/src/components/apps/settings/ReadingSettings.test.tsx` |

## Running Tests

```bash
# All tests
bun run test:run

# Single package
bun run test:run --filter=@oktis-works/theme-runtime

# Watch mode
bun run test

# Coverage
bun run test:coverage
```