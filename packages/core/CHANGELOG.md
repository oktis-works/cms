# @oktis-works/core

## 0.5.7

### Patch Changes

- Correções do sistema de temas (ativação, descoberta, scaffold e customizador):
  
  - **`updated_at` no banco (crítico)**: a tabela `themes` ganhou `updated_at` (schema + migração `V010__core__harden_themes_lifecycle.sql`), índices `UNIQUE(name)` e o índice parcial de **um único tema ativo por tenant** — as rotas de ativar/desativar/instalar sempre falhavam por coluna inexistente, e `deactivate` referenciava também `deactivated_at`, que nunca existiu.
  - **Fonte única de ativação (crítico)**: o app web resolve o tema ativo **por request** lendo `status = 'ACTIVE'` do banco (fallback para `ACTIVE_THEME`), em vez de uma leitura única no boot — ativar pela tela Temas agora reflete no site sem restart. `ThemeService.activate` desativa os demais numa única sequência, `getActive` ordena por `activated_at DESC`, e a CLI `theme:manage --set-active` grava config **e** banco (mesma verdade).
  - **Fallback `manifest.json` (crítico)**: `syncFromDirectory` e o `ThemeLoader` aceitam `theme.json` **ou** `manifest.json` (o formato legado que o tema default distribuído usa); `theme:manage --info` também. O manifesto do tema default agora declara `type: "theme"`.
  - **Tema default no scaffold (crítico)**: `okcms init` copia `themes/default` pronto (manifesto + 6 templates `.astro` + `dist/theme.css` servível) para o projeto novo — nunca mais diretório `themes/` vazio; re-init não sobrescreve tema editado.
  - **Scaffold de tema no formato do runtime**: `theme:create` gera os templates da hierarquia (`home/index/single/page/archive/404.astro`) **na raiz do tema** com o contexto real (`items`, `content`, `site`), `provides.layouts`, e no engine `css` entrega `dist/theme.css` já servível (nada de `templates/*.html` com `{{#each posts}}` que o web ignora). Docs (`THEME.md`, `theme-development.md`) alinhados.
  - **Dados enriquecidos chegam ao render**: a resolução de rota carrega `data`/`record` vindos do `findByPath` (mídia real + `_terms`) — o web parou de re-consultar a row crua; itens de archive/home ganham enriquecimento de mídia em lote (uma query para a lista inteira).
  - **Tela Temas do admin**: badge usa `status === 'ACTIVE'` (não mais `isActive` inexistente), erros são limpos antes de cada operação, botão **Sincronizar**, **Desinstalar com confirmação**, preview do manifesto quando declarado e **painel de configurações do tema** (`manifest.settings` editável → `PATCH /api/v1/themes/:id/config`), com os defaults sobrescritos pelo config salvo expostos aos templates como `settings.theme`.
  - **API de temas honesta**: `activate`/`DELETE` respondem 404 quando o tema não existe; `install` valida o manifesto (BUSI-022: `type` + `compatibility.okcms`, nome seguro e único) e a listagem não esconde mais linhas do banco quando o diretório está vazio.
  - **Runner de migrações**: `applyMigration` executava o arquivo inteiro — inclusive a seção `-- +migrate Down`, desfazendo a própria migration no mesmo commit; agora executa apenas o bloco Up (`extractUpSection`).
  - **Polimentos**: `lang` do documento vem da setting `language` (fallback `pt-BR`), o `<link>` de `dist/theme.css` só sai quando o arquivo existe (cadeia ativo → `_shared` → `default`), `wireThemeHooks` é aguardado no boot (sem janela sem hooks), cache de templates do renderer com teto FIFO (200) e a página de fallback do tema exibe os dados reais num HTML legível em vez de JSON cru.
- Updated dependencies
  - @oktis-works/database@0.5.6

## 0.5.6

### Patch Changes

- Sidebar: estilos do DashboardLayout agora são `is:global` — os links dinâmicos de content-types (criados por JS) não recebem data-astro-cid e ficavam sem estilo (link dourado padrão, desalinhado); agora são idênticos aos links normais. Modais do field-builder (fb-modal/fb-browse-modal) enquadrados entre a AdminBar e o rodapé com altura ajustável e corpo com scroll. Core: content type CORE `page` com labels em inglês (Pages/Page) — alinhado ao seed V003 (migration V009 corrige bancos existentes com os labels em português).

## 0.5.5

### Patch Changes

- Updated dependencies []:
  - @oktis-works/config@0.5.5
  - @oktis-works/database@0.5.5
  - @oktis-works/plugin-runtime@0.5.5
  - @oktis-works/types@0.5.5
  - @oktis-works/validation@0.5.5

## 0.3.3

### Patch Changes

- Patch alignment 0.3.3 (interactive install prompt + live dependency loader shipped via `@oktis-works/cms`)

## 0.3.2

### Patch Changes

- Patch alignment 0.3.2 (docker build hardening + admin SSR fix shipped via `@oktis-works/cms` and `@oktis-works/ui`)

## 0.3.1

### Patch Changes

- Fix @oktis-works/admin missing bin/admin.js entry point for standalone Astro server

## 0.3.0

### Minor Changes

- Release 0.3.0, aligned with tag v0.3.0: interactive arrow-key menus and English
  output across the `okcms` CLI, plus a third deploy target (simple containers in
  front of the proxy) next to blue/green and PM2.

## 0.2.1

### Minor Changes

- Histórico/rollback unificado, comando deploy (Docker/PM2), docs auto-atualizadas no update/deploy
## 0.2.0

### Patch Changes

- Updated dependencies []:
  - @oktis-works/config@0.2.0
  - @oktis-works/database@0.2.0
  - @oktis-works/plugin-runtime@0.2.0
  - @oktis-works/types@0.2.0

## 0.1.14

### Patch Changes

- Fases A–D do TODO: publisher real nas rotas de conteúdo (publish/unpublish com revisions + eventBus + cache), QueueProducer no core com degradação silenciosa (fila opcional), processamento real de mídia com sharp e build Docker real no worker, renderização real do site público (templates do tema + settings), design-system Solid no @oktis-works/ui (Button/Input/Select/Card/Badge/Modal/Toast/Table/Pagination) consumido pelo admin, fluxo de auth híbrido completo (tokens no body + cookies HttpOnly) e limpeza de legado (rota /me duplicada, stub de validação).
- Updated dependencies []:
  - @oktis-works/config@0.1.14
  - @oktis-works/database@0.1.14
  - @oktis-works/plugin-runtime@0.1.14
  - @oktis-works/types@0.1.14

## 0.1.13

### Patch Changes

- Updated dependencies []:
  - @oktis-works/config@0.1.13
  - @oktis-works/database@0.1.13
  - @oktis-works/plugin-runtime@0.1.13
  - @oktis-works/types@0.1.13

## 0.1.12

### Patch Changes

- F1–F10: Admin panel completo
  
  - F1 RBAC: seed 5 roles (SUPER_ADMIN, TENANT_ADMIN, EDITOR, AUTHOR, VIEWER); register atribui TENANT_ADMIN ao 1º usuário; login resolve slug→UUID e devolve tenantId no JWT
  - F2 Media: upload local-disk (UPLOAD_DIR), layout tenant/uuid.ext, GET /file público (cache imutável), 25MB, traversal bloqueado
  - F3 Settings: seed 4 configurações (siteTitle, siteDescription, language, timezone) grupo general
  - F4 Admin api-client tipado (AuthApiClient, MediaApiClient, UsersApiClient, SettingsApiClient, ContentApiClient)
  - F5 MediaLibrary: grid, upload drag-and-drop, preview modal, busca, paginação
  - F6 Users: lista com roles, criação com roleId, troca de senha, papel EDITOR
  - F7 Settings: GeneralSettings (siteTitle, siteDescription, language, timezone) com PUT array
  - F8 Dashboard + ContentList (Solid islands), ContentEditor modo edição (?id=), redirect /dashboard → /
  - F9 DashboardLayout: sidebar ativa por pathname, submenu Settings sempre visível, session guard + logout funcional
  - E2E API 25/25 (register/login/RBAC/upload/settings/traversal/content/users/boundaries/401)
  - E2E Admin 13/13 (login/dashboard/media/users/settings/content/logout/session guard)
  - Fix sistêmico jsonb: params crus (driver serializa 1×), boolean via CASE WHEN, tenant_id em media/content
  - Gates: lint ✅ typecheck 0 ✅ 484 testes ✅ build 17/17 ✅
- Updated dependencies []:
  - @oktis-works/database@0.1.12
  - @oktis-works/types@0.1.12
  - @oktis-works/config@0.1.12
  - @oktis-works/plugin-runtime@0.1.12

## 0.1.11

### Patch Changes

- Updated dependencies []:
  - @oktis-works/validation@0.1.11
  - @oktis-works/plugin-runtime@0.1.11
  - @oktis-works/types@0.1.11
  - @oktis-works/config@0.1.11
  - @oktis-works/database@0.1.11

## 0.1.10

### Patch Changes

- Updated dependencies []:
  - @oktis-works/database@0.1.10
  - @oktis-works/config@0.1.10
  - @oktis-works/plugin-runtime@0.1.10
  - @oktis-works/types@0.1.10

## 0.1.9

### Patch Changes

- Updated dependencies []:
  - @oktis-works/database@0.1.9
  - @oktis-works/validation@0.1.9
  - @oktis-works/plugin-runtime@0.1.9
  - @oktis-works/types@0.1.9
  - @oktis-works/config@0.1.9

## 0.1.8

### Patch Changes

- Updated dependencies []:
  - @oktis-works/validation@0.1.8
  - @oktis-works/plugin-runtime@0.1.8
  - @oktis-works/types@0.1.8
  - @oktis-works/config@0.1.8
  - @oktis-works/database@0.1.8

## 0.1.7

### Patch Changes

- Updated dependencies []:
  - @oktis-works/validation@0.1.7
  - @oktis-works/plugin-runtime@0.1.7
  - @oktis-works/types@0.1.7
  - @oktis-works/config@0.1.7
  - @oktis-works/database@0.1.7

## 0.1.6

### Patch Changes

- Updated dependencies []:
  - @oktis-works/validation@0.1.6
  - @oktis-works/plugin-runtime@0.1.6
  - @oktis-works/types@0.1.6
  - @oktis-works/config@0.1.6
  - @oktis-works/database@0.1.6

## 0.1.5

### Patch Changes

- Updated dependencies []:
  - @oktis-works/validation@0.1.5
  - @oktis-works/plugin-runtime@0.1.5
  - @oktis-works/types@0.1.5
  - @oktis-works/config@0.1.5
  - @oktis-works/database@0.1.5

## 0.1.4

### Patch Changes

- Updated dependencies []:
  - @oktis-works/config@0.1.4
  - @oktis-works/validation@0.1.4
  - @oktis-works/database@0.1.4
  - @oktis-works/plugin-runtime@0.1.4
  - @oktis-works/types@0.1.4

## 0.1.3

### Patch Changes

- Updated dependencies []:
  - @oktis-works/validation@0.1.3
  - @oktis-works/plugin-runtime@0.1.3
  - @oktis-works/types@0.1.3
  - @oktis-works/config@0.1.3
  - @oktis-works/database@0.1.3
