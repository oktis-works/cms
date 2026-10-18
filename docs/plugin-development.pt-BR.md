> 📄 **Português (Brasil)** · [English](./plugin-development.md)

# Desenvolvendo um Plugin

Plugin é a extensão que se registra no runtime do CMS e participa do sistema
de **hooks e filters** (transformar dados, reagir a eventos de conteúdo etc.).
O catálogo de hooks disponíveis é servido pela API em
`GET /api/v1/hooks/catalog`.

> Os comandos usam `npx` com a CLI local do projeto (sem instalação
> global). Com a CLI global (`bun add -g @oktis-works/cms`), rode
> `okcms ...` direto.

## Estrutura gerada

```bash
okcms plugin:create --name meu-plugin
```

```
plugins/meu-plugin/
├── manifest.json   # identidade + permissões + compatibilidade
├── index.js        # entrypoint: module.exports.register(registry)
└── README.md
```

### manifest.json

```json
{
  "name": "meu-plugin",
  "version": "0.1.0",
  "description": "Plugin meu-plugin para OkCMS",
  "type": "plugin",
  "main": "index.js",
  "scope": "tenant",
  "permissions": [],
  "compatibility": { "okcms": "^0.5.5" }
}
```

| Campo | Significado |
|---|---|
| `type` | `"plugin"` (fixo — temas usam `"theme"`) |
| `main` | Arquivo de entrada com o registro |
| `scope` | Escopo de atuação no multi-tenant (ex.: `tenant`) |
| `permissions` | Permissões que o plugin pede (vazio = nenhuma) |
| `compatibility.okcms` | Range semver exigido do CMS. **O scaffold preenche com a versão atual automaticamente** e o valor é validado no scaffold e em cada instalação — manifesto incompatível é rejeitado. |

### index.js

```js
'use strict';

module.exports.register = function register(registry) {
  // Filtro real: roda em toda listagem de conteúdo (ex.: GET /api/v1/content)
  registry.addFilter('content:query', (items) => items);

  // Action real: disparada após publicar um conteúdo do tipo "post"
  registry.addAction('after_publish_content_post', (content) => {
    console.log('[meu-plugin] publicado:', content.slug);
  });
};
```

O `register(registry)` é chamado quando o plugin é carregado. Use o registro
para expor filters (transformações) — veja o que existe em
`GET /api/v1/hooks/catalog` para os nomes e contratos disponíveis.

O carregamento acontece no boot de todos os processos (API, web e worker):
plugins com status `ACTIVATED` no banco têm o `register` chamado e os hooks
entram no registry compartilhado. Ativar/desativar pela API recarrega no
próprio processo da API na hora; web/worker pegam a mudança no próximo
restart. Um plugin que falha ao carregar é isolado: a falha é reportada no
log e nunca derruba o boot dos outros plugins nem do processo.

## Migrations do banco

Se o plugin cria ou altera tabelas, o SQL mora **dentro do plugin**:

```bash
plugins/meu-plugin/
└── migrations/
    ├── V001__meu_plugin__tabelas.sql
    └── V002__meu_plugin__colunas.sql
```

O nome segue o padrão do runner — `V<numero>__<owner>__<nome>.sql` — e o
`owner` (aqui `meu_plugin`) é o que marca a migration como do plugin: o
rastreamento é por `owner:version`, então cada plugin tem a sua própria
linha de versão.

O SQL **não** é aplicado direto do diretório do plugin. O `okcms redeploy`
copia `plugins/<n>/migrations/*.sql` para `migrations/` (o único diretório
que o runner lê) e o `db:migrate` do deploy aplica — assim o schema do plugin
fica versionado e revisável no repositório do projeto.

Duas regras que o redeploy impõe:

- arquivo fora do padrão `V###__owner__nome.sql` **nunca** é copiado (e um
  já existente em `migrations/` quebraria todo `db:migrate` — o comando
  falha antes de tocar no Docker e diz qual arquivo renomear);
- uma migration já aplicada é imutável: se o plugin novo trouxer outro
  conteúdo com o mesmo nome, o redeploy **não** sobrescreve o arquivo que já
  está em `migrations/`, só avisa. Publique uma `V00n+1`.

## Fluxo de desenvolvimento

```bash
# 1. Crie (em ./plugins do projeto, ou num workspace externo com --dir)
okcms plugin:create --name meu-plugin

# 2. Implemente plugins/meu-plugin/index.js

# 3. Se criou FORA do projeto, instale (valida compatibilidade e copia para plugins/)
okcms plugin:install --name ../meu-plugin-fonte

# 4. Gestão
okcms plugin:list                                # instalados + estado local
okcms plugin:manage -n meu-plugin --info         # informações do manifesto
okcms plugin:manage -n meu-plugin --disable      # marca como desabilitado no estado local (.okcms/extensions.json)
okcms plugin:manage -n meu-plugin --enable       # marca como habilitado de novo (mesmo estado local)
okcms plugin:manage -n meu-plugin --uninstall    # remove os arquivos do projeto
# O runtime lê o status no banco: ative/desative pelo admin (carregado no boot).

# 5. Busca no npm (pacotes com a keyword okcms-plugin)
okcms plugin:search -q galeria

# 6. Publicou/atualizou? Stage do SQL + build dos temas + deploy (destino salvo)
okcms redeploy --dry-run   # só mostra o plano
okcms redeploy
```

## Publicando

Empacote o diretório do plugin como pacote npm com a keyword
`okcms-plugin` (é o que o `okcms plugin:search` consulta) e mantenha
`compatibility.okcms` atualizado para a linha do CMS que você suporta.

---

## Estendendo a API — Rotas Personalizadas

Plugins podem registrar seus próprios endpoints HTTP sob `/api/v1/...`.  
A API passa uma função `registerRoutes` para o callback `register` do plugin.

```js
module.exports.register = function register(api) {
  // api.registerRoutes recebe um array de objetos RouteDefinition
  api.registerRoutes([
    {
      method: 'GET',
      path: '/meu-plugin/ping',
      handler: async (context, request) => {
        // context.api.query() → SQL seguro (precisa permissão db:query no manifest)
        // context.api.emit() → dispara eventos internos
        // request → body/query/params do Hono
        return { ok: true, message: 'pong' };
      },
    },
    {
      method: 'POST',
      path: '/meu-plugin/acao',
      handler: async (context, request) => {
        const body = await request.json(); // request do Hono
        // faça algo...
        return { success: true };
      },
    },
  ]);
};
```

**RouteDefinition**

| Campo | Tipo | Obrigatório? |
|-------|------|--------------|
| `method` | `'GET' \| 'POST' \| 'PUT' \| 'DELETE' \| 'PATCH'` | Sim |
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

## Extensões do Admin — Slots Declarativos

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

## Limitações & Boas Práticas

| Tópico | Detalhe |
|--------|---------|
| **Nada de iframe** | Componentes rodam no mesmo processo do admin (SolidJS nativo) |
| **Estilo isolado** | Use `scopePluginCss` (re-exportado do plugin-sdk) para evitar vazamento de CSS |
| **Permissões** | Sempre declare `capability` customizada; o RBAC valida no admin |
| **Migrações** | SQL dentro de `plugins/<nome>/migrations/` — `okcms redeploy` copia para `migrations/` |
| **Hot reload** | Em dev (`bun run dev`), alterações em `plugins/<n>/` recarregam o plugin automaticamente |
| **TypeScript** | Use `@oktis-works/plugin-sdk` types; o `index.js` pode ser `.ts` se o projeto tiver `tsx` configurado |
