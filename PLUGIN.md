# PLUGIN.md

> Especificação técnica completa do sistema de plugins do OkCMS.

---

## 1. Visão Geral

O sistema de plugins do OkCMS permite estender o CMS de três formas principais:

1. **Hooks & Filters** — Transformar dados, reagir a eventos (content create/update/delete, publish, etc.)
2. **Admin UI Extensions** — Adicionar páginas de menu, submenus, widgets de dashboard, meta boxes, colunas customizadas
3. **Custom Field Types** — Registrar novos tipos de campo que aparecem no editor de Custom Fields e renderizam componentes customizados na edição de conteúdo

Este documento foca na **especificação completa** para desenvolvedores de plugins.

---

## 2. Manifesto do Plugin (`manifest.json`)

```json
{
  "name": "meu-plugin",
  "version": "1.0.0",
  "description": "Descrição do plugin",
  "type": "plugin",
  "main": "index.js",
  "scope": "tenant",
  "permissions": [
    "db:query",
    "settings:read",
    "settings:write",
    "events:emit",
    "field-types:register"
  ],
  "compatibility": { "okcms": "^0.16.0" },
  "fieldTypes": [
    {
      "type": "mermaid",
      "label": "Diagrama Mermaid",
      "category": "conteudo",
      "icon": "git-merge",
      "supportsConditions": true,
      "isLayout": false,
      "adminComponentPath": "@/plugins/meu-plugin/admin/components/MermaidField.tsx",
      "adminRendererPath": "@/plugins/meu-plugin/admin/components/MermaidFieldRenderer.tsx",
      "configSchema": {
        "type": "object",
        "properties": {
          "theme": {
            "type": "string",
            "enum": ["default", "dark", "forest", "neutral"],
            "default": "default"
          },
          "editable": {
            "type": "boolean",
            "default": true
          }
        }
      }
    }
  ]
}
```

### Campos do `fieldTypes[]`

| Campo | Obrigatório? | Descrição |
|-------|--------------|-----------|
| `type` | **Sim** | Identificador único (ex: `mermaid`, `chart`). Deve ser único globalmente. |
| `label` | **Sim** | Label amigável exibido no admin. |
| `category` | **Sim** | Categoria: `basico`, `conteudo`, `escolha`, `relacional`, `estrutura`. |
| `icon` | **Sim** | Nome do ícone Lucide (ex: `git-merge`, `chart-bar`, `code`). |
| `supportsConditions` | Não | Se suporta lógica condicional. Default: `true`. |
| `isLayout` | Não | Se é tipo de layout (message, accordion, tab). Default: `false`. |
| `adminComponentPath` | **Sim** | Caminho para componente de configuração no admin (ex: `@/plugins/meu-plugin/admin/components/MermaidField.tsx`). |
| `adminRendererPath` | Não | Caminho para componente de renderização na edição de conteúdo. Se omitido, usa `adminComponentPath` como fallback. |
| `configSchema` | Não | JSON Schema para validação da configuração do campo no admin. |

### 2.1 Manifesto v2 (retrocompatível)

Opcional — um manifesto v1 continua válido. Declare `"manifestVersion": 2` e
use os campos adicionais:

| Campo | Descrição |
|-------|-----------|
| `blocks[]` | Blocos customizados do editor: `{ type, label, icon, category?, attrsSchema?, adminComponentPath, rendererPath?, supports?: { fields?: boolean } }` |
| `postTypes[]` | Custom Post Types declarados: `{ key, label, plural?, icon?, hierarchy?, revisions?, restBase? }` |
| `taxonomies[]` | Custom Taxonomies: `{ key, label, postTypes: string[], hierarchical? }` |
| `scheduleJobs[]` | Jobs recorrentes: `{ name, every (ms) \| cron }` |
| `httpPolicy` | `{ allowHosts?: string[] }` — allowlist estrita para `api.http` |
| `rateLimit` | `{ rpm?: number }` — limite das rotas do plugin |
| `migrations[]` | Caminhos de arquivos SQL aplicados em ordem no `onInstall` (relativos ao plugin) |

---

## 3. Entrypoint do Plugin (`index.js`)

```javascript
'use strict';

module.exports.register = function register(api) {
  // 1. Registrar tipo de campo customizado
  api.addFieldType({
    type: 'mermaid',
    label: 'Diagrama Mermaid',
    category: 'conteudo',
    icon: 'git-merge',
    supportsConditions: true,
    adminComponentPath: '@/plugins/meu-plugin/admin/components/MermaidField.tsx',
    adminRendererPath: '@/plugins/meu-plugin/admin/components/MermaidFieldRenderer.tsx',
    configSchema: {
      type: 'object',
      properties: {
        theme: { type: 'string', enum: ['default', 'dark'], default: 'default' },
        editable: { type: 'boolean', default: true }
      }
    }
  });

  // 2. Registrar rotas API (opcional)
  api.registerRoutes([
    {
      method: 'GET',
      path: '/meu-plugin/mermaid/preview',
      handler: async (ctx) => ({ ok: true, html: '<div>preview</div>' })
    }
  ]);

  // 3. Hooks de lifecycle (opcional)
  api.registerHook('onInstall', async (context, payload) => {
    await context.api.query(`
      CREATE TABLE IF NOT EXISTS meu_plugin_dados (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        data JSONB NOT NULL DEFAULT '{}'
      );
    `);
  });
};
```

### Métodos da `PluginAPI` para Field Types

| Método | Descrição |
|--------|-----------|
| `addFieldType(definition)` | Registra novo tipo de campo. Requer permissão `field-types:register`. |

---

## 4. Componentes Admin (SolidJS)

### 4.1 Componente de Configuração (`adminComponentPath`)

Usado na tela **Custom Fields > Novo/Editar Grupo** quando o usuário seleciona o tipo.

```tsx
// plugins/meu-plugin/admin/components/MermaidField.tsx
import { createSignal } from 'solid-js';
import { Select, Textarea, Card } from '@oktis-works/ui';

export default function MermaidFieldConfig(props) {
  const { config, schema, onChange, t } = props;

  const [theme, setTheme] = createSignal(config.theme ?? 'default');
  const [editable, setEditable] = createSignal(config.editable ?? true);
  const [diagramCode, setDiagramCode] = createSignal(config.diagramCode ?? '');

  const handleChange = () => {
    onChange({
      config: {
        theme: theme(),
        editable: editable(),
        diagramCode: diagramCode()
      }
    });
  };

  return (
    <Card>
      <div class="field-group">
        <label>Tema</label>
        <Select
          value={theme()}
          onChange={(v) => { setTheme(v); handleChange(); }}
          options={[
            { value: 'default', label: 'Default' },
            { value: 'dark', label: 'Dark' },
            { value: 'forest', label: 'Forest' },
            { value: 'neutral', label: 'Neutral' }
          ]}
        />
      </div>

      <div class="field-group">
        <label>
          <input
            type="checkbox"
            checked={editable()}
            onChange={(e) => { setEditable(e.currentTarget.checked); handleChange(); }}
          />
          Editável no editor de conteúdo
        </label>
      </div>

      <div class="field-group">
        <label>Código Mermaid (padrão)</label>
        <Textarea
          value={diagramCode()}
          onInput={(e) => { setDiagramCode(e.currentTarget.value); handleChange(); }}
          rows={10}
          placeholder="graph TD\n  A --> B"
        />
      </div>
    </Card>
  );
}
```

**Props recebidas:**
- `config` — Configuração atual do campo (do `field.config`)
- `schema` — JSON Schema do `configSchema` (para validação/UI)
- `onChange(patch)` — Função para atualizar configuração: `onChange({ config: { ... } })`
- `t` — Função de tradução

### 4.2 Componente de Renderização (`adminRendererPath`)

Usado na tela **Edição de Conteúdo** quando o campo é exibido.

```tsx
// plugins/meu-plugin/admin/components/MermaidFieldRenderer.tsx
import { onMount, createSignal } from 'solid-js';
import mermaid from 'mermaid';

export default function MermaidFieldRenderer(props) {
  const { field, value, onChange, disabled, t } = props;
  const [rendered, setRendered] = createSignal(false);
  const [svg, setSvg] = createSignal('');
  const [error, setError] = createSignal('');

  const diagramCode = value ?? field.config?.diagramCode ?? '';
  const theme = field.config?.theme ?? 'default';
  const editable = field.config?.editable !== false;

  onMount(async () => {
    if (!diagramCode.trim()) return;
    try {
      mermaid.initialize({ theme, securityLevel: 'loose' });
      const { svg } = await mermaid.render(`mermaid-${field.name}`, diagramCode);
      setSvg(svg);
      setRendered(true);
    } catch (e) {
      setError(e.message);
    }
  });

  if (error()) {
    return (
      <div class="mermaid-error">
        <pre>{error()}</pre>
        {editable && (
          <textarea
            class="input"
            value={diagramCode}
            onInput={(e) => onChange(e.currentTarget.value)}
            disabled={disabled}
            rows={10}
          />
        )}
      </div>
    );
  }

  return (
    <div class="mermaid-renderer">
      {rendered() ? (
        <div class="mermaid-diagram" innerHTML={svg()} />
      ) : (
        <div class="mermaid-loading">Renderizando...</div>
      )}
      {editable && (
        <textarea
          class="input mermaid-source"
          value={diagramCode}
          onInput={(e) => onChange(e.currentTarget.value)}
          disabled={disabled}
          rows={8}
          placeholder="graph TD\n  A --> B"
        />
      )}
    </div>
  );
}
```

**Props recebidas:**
- `field` — Definição completa do campo (`ResolvedFieldDefinition`)
- `value` — Valor atual do campo
- `onChange(value)` — Função para atualizar valor
- `disabled` — Se o campo está desabilitado
- `t` — Função de tradução

---

## 5. Convenção de Caminhos dos Componentes

O admin resolve componentes via **dynamic import** usando o alias Vite:

```
@/plugins/{plugin-slug}/admin/components/{ComponentName}.tsx
```

Exemplos:
- `@/plugins/meu-plugin/admin/components/MermaidField.tsx`
- `@/plugins/meu-plugin/admin/components/MermaidFieldRenderer.tsx`
- `@/plugins/charts/admin/components/ChartField.tsx`

### Estrutura recomendada no plugin:

```
plugins/meu-plugin/
├── manifest.json
├── index.js
├── admin/
│   ├── index.ts           # (opcional) registro de componentIds legados
│   └── components/
│       ├── MermaidField.tsx
│       └── MermaidFieldRenderer.tsx
└── migrations/
    └── V001__meu_plugin__tables.sql
```

---

## 6. Permissões Necessárias

Catálogo centralizado em `@oktis-works/plugin-sdk` (`PERMISSIONS`). Permissões
desconhecadas são **rejeitadas na instalação** (validação em modo strict).

| Permissão | Uso |
|-----------|-----|
| `field-types:register` | **Obrigatória** para usar `api.addFieldType()` |
| `db:query` | Para migrations, queries customizadas |
| `settings:read` / `settings:write` | Para settings do plugin |
| `events:emit` | Para disparar eventos internos |
| `post-types:register` | Para `api.addPostType()` |
| `taxonomies:register` | Para `api.addTaxonomy()` |
| `cache:read` / `cache:write` | Para `api.cache.*` (transient por plugin) |
| `jobs:schedule` | Para `api.jobs.*` (cron/filas) |
| `http:fetch` | Para `api.http.*` (requisições externas protegidas contra SSRF) |
| `blocks:register` | Para `api.registerBlock()` (editor de blocos) |
| `roles:create` | Para `api.roles.add()` |
| `assets:enqueue` | Para `api.assets.enqueueStyle/Script` |
| `mail:send` | Para `api.mail.send()` |
| `health:register` | Para `api.health.register()` |

Declare no `manifest.json`:

```json
{
  "permissions": ["field-types:register", "db:query", "settings:read", "settings:write"]
}
```

---

## 7. Ciclo de Vida

```
1. Plugin instalado (okcms plugin:install / admin)
   ↓
2. Plugin ativado para tenant (admin > Plugins > Ativar)
   ↓
3. Bootstrap do processo (API, Web, Worker)
   - syncEnabledPlugins() / ensureTenantPluginsLoaded()
   - Carrega manifesto
   - Chama register(api)
   - api.addFieldType() → registra no registry em memória + persiste no BD
   ↓
4. Admin carrega /api/v1/field-types
   - Retorna tipos built-in + tipos de plugins ativos do tenant
   ↓
5. Usuário cria Custom Field com tipo do plugin
   - FieldTypePicker mostra o tipo
   - FieldSettingsEditor carrega componente via dynamic import
   - Salva field.config com adminComponentPath, configSchema, etc.
   ↓
6. Edição de conteúdo
   - FieldRenderer detecta isPluginType
   - Carrega PluginFieldRenderer via dynamic import
   - Renderiza componente customizado do plugin
```

---

## 8. Desativação/Desinstalação

| Ação | Efeito nos Field Types |
|------|------------------------|
| **Desativar plugin** | Tipos ficam `deprecated: true` no registry. Ainda aparecem para campos existentes, mas **não** no dropdown de novos campos. |
| **Desinstalar plugin** | Tipos são removidos do registry e BD. Campos existentes mantêm dados mas **não renderizam** (fallback para input texto). |

---

## 9. Troubleshooting

| Problema | Causa | Solução |
|----------|-------|---------|
| Tipo não aparece no dropdown | Plugin não ativado / permissão faltando | Verifique `field-types:register` no manifest e ativação no tenant |
| Componente não carrega (404) | Caminho errado no `adminComponentPath` | Use `@/plugins/{slug}/admin/components/{Component}.tsx` |
| Erro "JSON inválido" no config | Schema rejeita valor | Valide contra `configSchema` ou use fallback JSON |
| Diagrama não renderiza | mermaid não inicializado | Chame `mermaid.initialize()` no `onMount` do renderer |
| Tipo duplicado | Dois plugins com mesmo `type` | Use prefixo único: `meuplugin_mermaid` |

---

## 10. Exemplo Completo: `mermaid-field`

### `manifest.json`
```json
{
  "name": "mermaid-field",
  "version": "1.0.0",
  "description": "Campo para diagramas Mermaid.js",
  "type": "plugin",
  "main": "index.js",
  "scope": "tenant",
  "permissions": ["field-types:register"],
  "compatibility": { "okcms": "^0.16.0" },
  "fieldTypes": [
    {
      "type": "mermaid",
      "label": "Diagrama Mermaid",
      "category": "conteudo",
      "icon": "git-merge",
      "supportsConditions": true,
      "adminComponentPath": "@/plugins/mermaid-field/admin/components/MermaidField.tsx",
      "adminRendererPath": "@/plugins/mermaid-field/admin/components/MermaidFieldRenderer.tsx",
      "configSchema": {
        "type": "object",
        "properties": {
          "theme": { "type": "string", "enum": ["default", "dark", "forest", "neutral"], "default": "default" },
          "editable": { "type": "boolean", "default": true },
          "diagramCode": { "type": "string", "default": "" }
        }
      }
    }
  ]
}
```

### `index.js`
```javascript
'use strict';
module.exports.register = function register(api) {
  // Field type já declarado no manifest - registro automático no bootstrap
  // Opcional: hooks extras, rotas, etc.
};
```

### `admin/components/MermaidField.tsx` — ver seção 4.1
### `admin/components/MermaidFieldRenderer.tsx` — ver seção 4.2

---

## 11. Versionamento

| Versão OkCMS | Mudanças |
|--------------|----------|
| `0.16.0` | Introduzido `fieldTypes[]` no manifest, `addFieldType()`, componentes dinâmicos |

---

*Documentação gerada automaticamente — mantenha sincronizada com o código.*