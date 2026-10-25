> 📄 **English** · [Português](./plugin-development.pt-BR.md)

# Developing a Plugin

A plugin is the extension that registers with the CMS runtime and takes part
in the **hooks and filters** system (transform data, react to content events,
etc.). The catalogue of available hooks is served by the API at
`GET /api/v1/hooks/catalog`.

> The commands use `npx` with the project's local CLI (no global
> install). With the global CLI (`bun add -g @oktis-works/cms`), run
> `okcms ...` directly.

## Generated structure

```bash
okcms plugin:create --name my-plugin
```

```
plugins/my-plugin/
├── manifest.json   # identity + permissions + compatibility
├── index.js        # entrypoint: module.exports.register(registry)
└── README.md
```

### manifest.json

```json
{
  "name": "my-plugin",
  "version": "0.1.0",
  "description": "my-plugin plugin for OkCMS",
  "type": "plugin",
  "main": "index.js",
  "scope": "tenant",
  "permissions": [],
  "compatibility": { "okcms": "^0.5.5" }
}
```

| Field | Meaning |
|---|---|
| `type` | `"plugin"` (fixed — themes use `"theme"`) |
| `main` | Entry file with the registration |
| `scope` | Scope of action in the multi-tenant setup (e.g. `tenant`) |
| `permissions` | Permissions the plugin requests (empty = none) |
| `compatibility.okcms` | Required semver range of the CMS. **The scaffold fills it in with the current version automatically** and the value is validated at scaffold time and on every install — an incompatible manifest is rejected. |

### index.js

```js
'use strict';

module.exports.register = function register(registry) {
  // Real filter: runs on every content listing (e.g. GET /api/v1/content)
  registry.addFilter('content:query', (items) => items);

  // Real action: fired after publishing a "post" entry
  registry.addAction('after_publish_content_post', (content) => {
    console.log('[my-plugin] published:', content.slug);
  });
};
```

`register(registry)` is called when the plugin is loaded. Use the registry
to expose filters (transformations) — see what exists at
`GET /api/v1/hooks/catalog` for the available names and contracts.

Loading happens at the boot of every process (API, web and worker): plugins
with `ACTIVATED` status in the database get `register` called and their hooks
enter the shared registry. Activating/deactivating via the API reloads the
API process in place; web/worker pick the change up on the next restart.
A plugin that fails to load is isolated: the failure is logged and never
breaks the boot of the other plugins or of the process.

## Database migrations

If the plugin creates or changes tables, the SQL lives **inside the plugin**:

```bash
plugins/my-plugin/
└── migrations/
    ├── V001__my_plugin__tables.sql
    └── V002__my_plugin__columns.sql
```

The name follows the runner's pattern — `V<number>__<owner>__<name>.sql` — and
the `owner` (here `my_plugin`) is what marks the migration as the plugin's:
tracking is per `owner:version`, so each plugin has its own
version row.

The SQL is **not** applied straight from the plugin directory. `okcms redeploy`
copies `plugins/<n>/migrations/*.sql` into `migrations/` (the only directory
the runner reads) and the deploy's `db:migrate` applies it — so the plugin's
schema stays versioned and reviewable in the project repository.

Two rules the redeploy enforces:

- a file outside the `V###__owner__name.sql` pattern is **never** copied (and one
  already in `migrations/` would break every `db:migrate` — the command
  fails before touching Docker and tells you which file to rename);
- an applied migration is immutable: if a new plugin ships different content
  under the same name, the redeploy does **not** overwrite the file already
  in `migrations/`, it only warns. Ship a `V00n+1`.

## Development workflow

```bash
# 1. Create it (in the project's ./plugins, or an external workspace with --dir)
okcms plugin:create --name my-plugin

# 2. Implement plugins/my-plugin/index.js

# 3. If you created it OUTSIDE the project, install it (validates compatibility and copies into plugins/)
okcms plugin:install --name ../my-plugin-source

# 4. Management
okcms plugin:list                                # installed + local state
okcms plugin:manage -n my-plugin --info          # manifest information
okcms plugin:manage -n my-plugin --disable       # marks as disabled in the local state (.okcms/extensions.json)
okcms plugin:manage -n my-plugin --enable        # marks as enabled again (same local state)
okcms plugin:manage -n my-plugin --uninstall     # removes the project files
# Runtime effect comes from the admin: activate/deactivate flips the database
# status loaded at boot (web/worker on the next restart).

# 5. Search npm (packages with the okcms-plugin keyword)
okcms plugin:search -q gallery

# 6. Published/updated? Stage the SQL + build the themes + deploy (saved target)
okcms redeploy --dry-run   # only shows the plan
okcms redeploy
```

## Publishing

Package the plugin directory as an npm package with the keyword
`okcms-plugin` (that is what `okcms plugin:search` queries) and keep
`compatibility.okcms` up to date for the CMS line you support.

---

## Extending the API — Custom Routes

### Runtime trust model

The current runtime applies capability checks, path validation, request limits,
and callback timeouts, but it loads plugin modules in the application process.
Plugins must therefore be treated as trusted server code. The runtime guard is
not a process or filesystem sandbox; deploy untrusted extensions in a separate
worker or service boundary.

Plugins can register their own HTTP endpoints under `/api/v1/plugins/<plugin>/...`.
Routes are private by default and require the `routes:register` permission.

```js
module.exports.register = function register(api) {
  // registerRoutes is the compatibility batch alias for addRoute.
  api.registerRoutes([
    {
      method: 'GET',
      path: '/meu-plugin/ping',
      handler: async (context, api) => {
        // context is the Hono request context and api is the plugin API.
        // Return a Response or a JSON-serializable object.
        return { ok: true, message: 'pong' };
      },
    },
    {
      method: 'POST',
      path: '/meu-plugin/acao',
      requiredPermissions: ['content:write'],
      handler: async (context, api) => {
        const body = await context.req.json();
        return { success: true };
      },
    },
  ]);
};
```

**RouteDefinition**

| Campo | Tipo | Obrigatório? |
|-------|------|--------------|
| `method` | `'GET' \| 'POST' \| 'PUT' \| 'DELETE' \| 'PATCH' \| 'OPTIONS'` | Yes |
| `path` | `string` (ex: `/meu-plugin/ping`) | Sim |
| `handler` | `async (context, request) => Promise<unknown>` | Sim |

O handler roda **dentro do router da API** (Hono). O `context` expõe:

| Propriedade | Descrição |
|-------------|-----------|
| `context.api.query(sql, params?)` | Executa SQL parametrizado (precisa permissão `db:query`) |
| `context.api.emit(event, payload)` | Dispara evento no event bus interno |
| `context.api.getTenant()` | Info do tenant atual |
| `context.api.getUser()` | Info do usuário autenticado |
| `context.tenantId` / `context.userId` | IDs resolvidos |

> **Segurança:** rotas registradas por plugin herdam o middleware de autenticação/CSRF/rate-limit da API. Se o plugin precisa de acesso público (webhook, callback), adicione `public: true` na rota (veja `RouteDefinition` no SDK).

---

## Admin UI Extensions — Declarative Slots

Plugins podem estender o painel administrativo **sem iframe** — componentes SolidJS rodam nativamente no admin (que já é SolidJS).  
Use `api.adminApi` (instância de `PluginAdminApi`) no callback `register`.

### 1. Nova página de menu (Menu Page)

```js
module.exports.register = function register(api) {
  api.adminApi.addMenuPage({
    slug: 'minha-ferramenta',           // URL final: /settings/minha-ferramenta
    label: 'Minha Ferramenta',          // Texto no menu lateral
    capability: 'manage:minha-ferramenta', // Permissão RBAC (obrigatória)
    icon: '🔧',                         // Emoji ou classe CSS
    position: 50,                       // Ordem no menu (menor = mais acima)
  });
};
```

A página renderiza um **componente SolidJS** que você registra via `componentId` (veja abaixo).  
O `slug` define a rota: `/settings/<slug>`.

### 2. Submenu (aba dentro de uma página existente)

```js
api.adminApi.addSubmenuPage({
  parentSlug: 'settings',      // ou outro slug de menu page
  slug: 'minha-aba',
  label: 'Minha Aba',
  capability: 'manage:minha-ferramenta',
  position: 10,
});
```

### 3. Widget no Dashboard

```js
api.adminApi.addDashboardWidget({
  id: 'meu-widget-unico',              // ID único
  title: 'Métricas do Meu Plugin',     // Título no card
  render: 'component',                 // Sempre 'component'
  componentId: 'meu-plugin:dashboard-widget', // componentId registrado no runtime
  columnsSpan: 2,                      // 1 | 2 | 3 | 4 (grid 12 colunas)
});
```

### 4. Meta Box no Editor de Conteúdo

```js
api.adminApi.addMetaBox({
  id: 'meu-metabox',
  title: 'Configurações do Plugin',
  screens: ['post', 'page'],           // Tipos de conteúdo onde aparece
  context: 'normal',                   // 'normal' | 'side' | 'advanced'
  priority: 'high',                    // 'high' | 'default' | 'low'
  componentId: 'meu-plugin:metabox-config',
});
```

Aparece no editor de posts/pages (aba lateral ou central).

### 5. Notices (avisos globais)

```js
api.adminApi.addNotice({
  level: 'info',                       // 'info' | 'success' | 'warning' | 'error'
  message: 'Plugin configurado com sucesso!',
  dismissible: true,
});

// Remover depois:
api.adminApi.removeNotice('meu-plugin:1234567');
```

### 6. Colunas personalizadas nas listas de conteúdo

```js
// Adiciona coluna
api.adminApi.manageColumns('post', {
  key: 'meu-campo',
  label: 'Meu Campo',
  position: 'after_title',             // 'before_title' | 'after_title' | 'end'
});

// Define como renderizar (componentId deve ser um componente SolidJS)
api.adminApi.renderColumn('post', 'meu-campo', 'meu-plugin:coluna-meu-campo');
```

### 7. Links de ação rápidos

```js
api.adminApi.addActionLinks([
  { label: 'Configurar', url: '/settings/minha-ferramenta' },
  { label: 'Documentação', url: 'https://meuplugin.com/docs' },
]);
```

---

## Componentes SolidJS — `componentId` e Registro

O admin carrega componentes via **ID declarativo** (`componentId`).  
No plugin-runtime, o componente é registrado no estado `AdminExtensionsState` e resolvido via **dynamic import** no lado do admin.

### Estrutura recomendada no plugin

```
plugins/meu-plugin/
├── manifest.json
├── index.js              # entrypoint (register)
├── admin/
│   ├── components/
│   │   ├── DashboardWidget.tsx
│   │   ├── MetaboxConfig.tsx
│   │   └── MinhaPagina.tsx
│   └── index.ts          # registra componentIds
└── migrations/
```

### Registro dos componentes (`admin/index.ts`)

```ts
// plugins/meu-plugin/admin/index.ts
import { createPluginAdminApi } from '@oktis-works/plugin-sdk';

// O plugin-runtime injeta o estado global (AdminExtensionsState)
// e expõe uma API para registrar componentes via ID.
// No bootstrap do plugin, você recebe o `adminApi` e pode
// popular o estado com os componentIds que seus componentes usarão.

export function registerAdminComponents(adminApi) {
  // Apenas declara os IDs — o admin faz dynamic import
  // baseando-se na convenção: <plugin-id>:<component-name>
  // Ex: 'meu-plugin:dashboard-widget' → importa de
  // '@/plugins/meu-plugin/admin/components/DashboardWidget'
  //
  // O plugin-runtime resolve isso via import map / Vite.
}
```

> **Como o admin resolve o componente:**  
> O `componentId` segue o padrão `<plugin-slug>:<kebab-name>`.  
> O admin tenta importar de:  
> `/src/plugins/<plugin-slug>/admin/components/<KebabName>.tsx`  
> (configurado no `vite.config.ts` do admin via `resolve.alias`).

### Exemplo de componente SolidJS (`DashboardWidget.tsx`)

```tsx
// plugins/meu-plugin/admin/components/DashboardWidget.tsx
import { createSignal, onMount } from 'solid-js';
import { Card, Button } from '@oktis-works/ui';
import { apiClient } from '../../lib/api'; // cliente admin tipado

export default function DashboardWidget() {
  const [data, setData] = createSignal(null);

  onMount(async () => {
    const res = await apiClient.get('/api/v1/meu-plugin/ping');
    setData(res);
  });

  return (
    <Card>
      <h3>Meu Plugin — Status</h3>
      <p>{data ? 'Online ✅' : 'Carregando…'}</p>
      <Button onClick={() => setData(null)}>Recarregar</Button>
    </Card>
  );
}
```

> **Dica:** use `@oktis-works/ui` (já disponível no admin) para consistência visual.  
> O `apiClient` do admin já envia cookies HttpOnly + CSRF automaticamente.

---

## Permissões no Manifest

Para usar as APIs acima, declare as permissões no `manifest.json`:

```json
{
  "name": "meu-plugin",
  "version": "1.0.0",
  "permissions": [
    "db:query",              // para api.query() nas rotas
    "manage:minha-ferramenta", // capability customizada (você define)
    "read:content",          // ler conteúdo
    "write:content"          // criar/atualizar conteúdo
  ],
  "compatibility": { "okcms": "^0.15.0" }
}
```

A capability `manage:minha-ferramenta` é **definida por você** — use no `addMenuPage`, `addSubmenuPage`, etc. O RBAC do admin verifica se o usuário logado tem essa permissão no tenant atual.

---

## Exemplo Completo — Plugin "Minha Ferramenta"

### `manifest.json`
```json
{
  "name": "minha-ferramenta",
  "version": "1.0.0",
  "description": "Exemplo completo de plugin com rotas, admin UI e componentes",
  "type": "plugin",
  "main": "index.js",
  "scope": "tenant",
  "permissions": ["db:query", "manage:minha-ferramenta"],
  "compatibility": { "okcms": "^0.15.0" }
}
```

### `index.js`
```js
'use strict';

module.exports.register = function register(api) {
  // 1. Rotas API
  api.registerRoutes([
    {
      method: 'GET',
      path: '/minha-ferramenta/status',
      handler: async (ctx) => ({ status: 'ok', tenant: ctx.tenantId }),
    },
    {
      method: 'POST',
      path: '/minha-ferramenta/acao',
      handler: async (ctx, req) => {
        const body = await req.json();
        // processa...
        return { ok: true };
      },
    },
  ]);

  // 2. Admin UI
  api.adminApi.addMenuPage({
    slug: 'minha-ferramenta',
    label: 'Minha Ferramenta',
    capability: 'manage:minha-ferramenta',
    icon: '🔧',
    position: 60,
  });

  api.adminApi.addDashboardWidget({
    id: 'minha-ferramenta-status',
    title: 'Status da Ferramenta',
    render: 'component',
    componentId: 'minha-ferramenta:dashboard-status',
    columnsSpan: 2,
  });

  api.adminApi.addMetaBox({
    id: 'minha-ferramenta-config',
    title: 'Configuração Rápida',
    screens: ['post', 'page'],
    context: 'side',
    priority: 'high',
    componentId: 'minha-ferramenta:metabox-config',
  });
};
```

### `admin/components/DashboardStatus.tsx`
```tsx
import { createSignal, onMount } from 'solid-js';
import { Card, Stat } from '@oktis-works/ui';
import { apiClient } from '../../lib/api';

export default function DashboardStatus() {
  const [status, setStatus] = createSignal('checking…');

  onMount(async () => {
    try {
      const res = await apiClient.get('/api/v1/minha-ferramenta/status');
      setStatus(res.status === 'ok' ? '✅ Online' : '❌ Offline');
    } catch {
      setStatus('❌ Erro');
    }
  });

  return (
    <Card>
      <Stat label="Minha Ferramenta" value={status()} />
    </Card>
  );
}
```

---

## Hooks de Ciclo de Vida (Lifecycle Hooks)

Além de `addAction`/`addFilter`, o plugin recebe hooks de ciclo de vida via `api.registerHook`:

```js
module.exports.register = function register(api) {
  // Executado na instalação do plugin (uma vez por tenant)
  api.registerHook('onInstall', async (context, payload) => {
    await context.api.query(`
      CREATE TABLE IF NOT EXISTS minha_ferramenta_dados (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        chave VARCHAR(255) NOT NULL,
        valor JSONB NOT NULL DEFAULT '{}',
        criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_mft_tenant ON minha_ferramenta_dados(tenant_id);
    `);
  });

  // Executado quando o plugin é ativado para um tenant
  api.registerHook('onActivate', async (context, payload) => {
    console.log('[minha-ferramenta] ativado para tenant', context.tenantId);
  });

  // Executado antes de criar conteúdo
  api.registerHook('beforeContentCreate', async (context, payload) => {
    // payload = { content: {...}, type: 'post' }
    // pode modificar payload.content antes de persistir
  });
};
```

**HookTypes disponíveis** (em `@oktis-works/plugin-sdk`):

| HookType | Ação Interna | Quando Dispara |
|----------|--------------|----------------|
| `BEFORE_CONTENT_CREATE` | `okcms.content.before-create` | Antes de INSERT no content |
| `AFTER_CONTENT_CREATE` | `okcms.content.after-create` | Após INSERT |
| `BEFORE_CONTENT_UPDATE` | `okcms.content.before-update` | Antes de UPDATE |
| `AFTER_CONTENT_UPDATE` | `okcms.content.after-update` | Após UPDATE |
| `BEFORE_CONTENT_DELETE` | `okcms.content.before-delete` | Antes de DELETE (soft) |
| `AFTER_CONTENT_DELETE` | `okcms.content.after-delete` | Após DELETE |
| `ON_CONTENT_PUBLISH` | `okcms.content.published` | Status → PUBLISHED |
| `ON_CONTENT_UNPUBLISH` | `okcms.content.unpublished` | Status → DRAFT |
| `ON_INSTALL` | `plugin.install` | `okcms plugin:install` |
| `ON_ACTIVATE` | `plugin.activate` | Admin ativa plugin no tenant |
| `ON_DEACTIVATE` | `plugin.deactivate` | Admin desativa |
| `ON_UNINSTALL` | `plugin.uninstall` | `okcms plugin:manage --uninstall` |
| `ON_ADMIN_MENU` | `okcms.admin.menu` | Construção do menu lateral |

---

## Debug & Logs

```bash
# Ver plugins carregados no boot (API, web, worker)
grep 'plugin.*loaded' logs/api.log

# Ver hooks registrados
curl -H "Authorization: Bearer $TOKEN" http://localhost:3000/api/v1/hooks/catalog

# Testar rota do plugin
curl -H "Authorization: Bearer $TOKEN" http://localhost:3000/api/v1/minha-ferramenta/status
```

---

## Custom Field Types

Plugins podem registrar **novos tipos de campo** que aparecem no editor de Custom Fields (`/settings/custom-fields`) e renderizam componentes customizados na edição de conteúdo.

### 1. Declarar no Manifest

```json
{
  "name": "meu-plugin",
  "version": "1.0.0",
  "fieldTypes": [
    {
      "type": "mermaid",
      "label": "Diagrama Mermaid",
      "category": "conteudo",
      "icon": "git-merge",
      "supportsConditions": true,
      "adminComponentPath": "@/plugins/meu-plugin/admin/components/MermaidField.tsx",
      "adminRendererPath": "@/plugins/meu-plugin/admin/components/MermaidFieldRenderer.tsx",
      "configSchema": {
        "type": "object",
        "properties": {
          "theme": { "type": "string", "enum": ["default", "dark"], "default": "default" },
          "editable": { "type": "boolean", "default": true }
        }
      }
    }
  ],
  "permissions": ["field-types:register"]
}
```

### 2. Componente de Configuração (`adminComponentPath`)

Usado quando o admin cria/edita o campo no Custom Fields:

```tsx
// plugins/meu-plugin/admin/components/MermaidField.tsx
import { createSignal } from 'solid-js';
import { Select, Textarea, Card } from '@oktis-works/ui';

export default function MermaidFieldConfig(props) {
  const { config, onChange } = props;
  const [theme, setTheme] = createSignal(config.theme ?? 'default');
  const [code, setCode] = createSignal(config.diagramCode ?? '');

  const sync = () => onChange({ config: { theme: theme(), diagramCode: code() } });

  return (
    <Card>
      <Select value={theme()} onChange={(v) => { setTheme(v); sync(); }}
        options={[{value:'default',label:'Default'},{value:'dark',label:'Dark'}]} />
      <Textarea value={code()} onInput={(e) => { setCode(e.currentTarget.value); sync(); }} rows={10} />
    </Card>
  );
}
```

**Props:** `config`, `schema`, `onChange(patch)`, `t`

### 3. Componente de Renderização (`adminRendererPath`)

Usado na edição de conteúdo (`/content/*/edit`):

```tsx
// plugins/meu-plugin/admin/components/MermaidFieldRenderer.tsx
import { onMount } from 'solid-js';
import mermaid from 'mermaid';

export default function MermaidFieldRenderer(props) {
  const { field, value, onChange, disabled } = props;
  const [svg, setSvg] = createSignal('');

  onMount(async () => {
    if (!value) return;
    mermaid.initialize({ theme: field.config?.theme ?? 'default', securityLevel: 'loose' });
    const { svg: s } = await mermaid.render(`m-${field.name}`, value);
    setSvg(s);
  });

  return (
    <div class="mermaid-renderer">
      {svg() ? <div innerHTML={svg()} /> : <div>Carregando...</div>}
      <textarea class="input" value={value} onInput={(e) => onChange(e.currentTarget.value)}
        disabled={disabled} rows={8} placeholder="graph TD\n  A --> B" />
    </div>
  );
}
```

**Props:** `field`, `value`, `onChange`, `disabled`, `t`

### 4. Permissão Obrigatória

```json
{ "permissions": ["field-types:register"] }
```

### 5. Convenção de Arquivos

```
plugins/meu-plugin/
├── manifest.json
├── index.js
└── admin/
    └── components/
        ├── MermaidField.tsx          # Config no Custom Fields
        └── MermaidFieldRenderer.tsx  # Render na edição de conteúdo
```

### 6. Fallbacks

- Se componente falhar ao carregar → editor JSON bruto (config) / textarea (render)
- Plugin desativado → tipo fica `deprecated`, não aparece para novos campos
- Plugin desinstalado → campos existentes mantêm dados, renderizam fallback texto

---

## Limitações & Boas Práticas

| Tópico | Detalhe |
|--------|---------|
| **Nada de iframe** | Componentes rodam no mesmo processo do admin (SolidJS nativo) |
| **Estilo isolado** | Use `scopePluginCss` (re-exportado do plugin-sdk) para evitar vazamento de CSS |
| **Permissões** | Sempre declare `capability` customizada; o RBAC valida no admin |
| **Migrações** | SQL dentro de `plugins/<nome>/migrations/` — `okcms redeploy` copia para `migrations/` |
| **Hot reload** | Em dev (`bun run dev`), alterações em `plugins/<n>/` recarregam o plugin automaticamente |
| **TypeScript** | Use `@oktis-works/plugin-sdk` types; o `index.js` pode ser `.ts` se o projeto tiver `tsx` configurado |
