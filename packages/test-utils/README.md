# @oktis-works/test-utils

Use the logical-key runtime resolver in tests:

```ts
import { ThemeTemplateResolver, RuntimeRouter } from '@oktis-works/theme-runtime';

const resolver = new ThemeTemplateResolver({
  has: (key) => ['home', 'index', '404'].includes(key),
});
const router = new RuntimeRouter(lookup, resolver);
```

Tests should use a unique tenant context and provide a compiled-theme catalog
fixture. Do not create source-file template fixtures or process-global theme
providers.
