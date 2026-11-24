# @oktis-works/theme-builder

Builds compiled React/Solid themes into self-contained Vite SSR artifacts.

## Build Output

```
themes/meu-tema/
├── dist/
│   ├── theme.css              # CSS isolado [data-theme="meu-tema"]
│   ├── theme-components.css   # CSS dos componentes (scoped)
│   ├── server/
│   │   └── entry.js           # SSR bundle (ESM, target node22)
│   ├── client/
│   │   └── entry.js           # Client bundle (se hydration: islands)
│   └── theme-build.json       # Manifest do artifact (buildId, templates, client, styles)
```

## Source Maps

**Produção (`sourcemap: false` no server bundle):**

| Aspecto | Decisão |
|---------|---------|
| Tamanho bundle | ~30-50% menor sem `.js.map` |
| Segurança | Código fonte não exposto em erro/stack |
| Debug prod | Stack trace minificado |
| Error tracking | Requer upload manual se usar APM |

**Quando habilitar (`sourcemap: true`):** Se integrar **Sentry/Datadog/outro APM** que aceite upload automático de source maps. Sem APM configurado, `false` é melhor (menor superfície, bundle menor).

**Dev:** Não usa Vite HMR — usa polling rebuild + full SSR rebuild (paridade exata com prod, captura erros de build que HMR não pega, funciona em containers sem WebSocket issues).

## CLI

```bash
# Build único (prod/CI)
okcms theme:build --name meu-tema

# Watch mode (dev)
okcms theme:dev --name meu-tema
```

## API

```typescript
import { buildTheme, watchTheme, verifyThemeBuild } from '@oktis-works/theme-builder';

// Build único
const result = await buildTheme({ themesRoot, themeName: 'meu-tema', mode: 'all' });

// Watch (dev)
const stop = await watchTheme(
  { themesRoot, themeName: 'meu-tema' },
  (event) => { if (event.type === 'build') console.log('rebuilt', event.result.buildId); }
);
```

## Theme Manifest (theme.json)

```json
{
  "name": "meu-tema",
  "version": "1.0.0",
  "type": "theme",
  "render": {
    "engine": "react",
    "apiVersion": 1,
    "hydration": "none",
    "entry": "src/entry-server.tsx"
  }
}
```

### Hydration Modes

| Mode | Client Bundle | Uso |
|------|---------------|-----|
| `none` | Não | SSR puro, HTML estático |
| `islands` | Sim (`dist/client/entry.js`) | Hidratação seletiva de componentes interativos |

### Entry Points

- **Server (obrigatório):** `src/entry-server.tsx` — exporta `templateKeys: string[]` e `render(key, data): { html: string }`
- **Client (opcional):** `src/entry-client.tsx` — necessário para `hydration: "islands"`, exporta `hydrateRoot()` / `hydrate()`