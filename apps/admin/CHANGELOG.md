# @oktis-works/admin

## 0.8.5

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

## 0.8.4

### Patch Changes

- c5cb19a: - **Admin bar**: o header nav passa a usar a nova logo horizontal (`/logo-horizontal.svg` — mascote + wordmark OkCMS lado a lado, SVG original do CorelDRAW com viewBox ajustado para a caixa da arte), substituindo a logo vertical 28px e o texto `OkCMS` duplicado ao lado.
  - **Footer**: removido o badge de versão (`v{versão}`) do footer do admin — ficam apenas "OkCMS", os links e o crédito.

## 0.8.3

### Patch Changes

- 02ce591: fix(layout): .layout em 100vh puro com offset da AdminBar aplicado dentro
  
  - `.layout` agora usa `height: 100vh` (antes `calc(100vh - 46px)`) e o
    `padding-top: 46px` no `<html>` foi removido — o documento começa em y=0 e a
    barra fixa sobrepõe o topo.
  - `.content-wrapper` (corpo de cada página): `height: calc(100% - 46px)` +
    `margin-top: 46px` (via `--admin-bar-h`), reservando a faixa da barra em
    todas as páginas do admin com uma regra só.
  - `.sidebar` (e o estado colapsada) ganhou `padding-top` com a mesma
    compensação, para o conteúdo da sidebar não ficar sob a barra.

## 0.8.2

### Patch Changes

- 4b3e5d7: fix(login): proxy /api standalone, join sem prefixo duplicado, logo sem caixa dourado e favicon versionado
  
  - **404 no login (`api/api/v1/auth/csrf`)**: o `okcms dev/start` roda o Admin como
    build pré-compilado, onde o `vite.server.proxy` não existe — o modo
    recomendado do scaffold (`PUBLIC_API_URL=/api`) respondia 404 em todo `/api/*`.
    Novo middleware `proxyApiRequest` encaminha `/api/*` para
    `ADMIN_API_PROXY_TARGET` (mesma variável do modo dev), preservando Set-Cookie,
    streams (uploads) e status; API fora do ar responde 502 JSON.
  - **Join normalizado**: `joinApiUrl` remove a duplicação `/api` + `/api/v1/...`
    no client (`request`, `requestRaw`, csrf e uploads) e no fetch de locale do
    middleware (que também falhava com base relativa).
  - **Login**: removido o caixa dourado ao redor da logo e o texto `OkCMS` (a
    wordmark já está no SVG); logo ampliada para 96px com alt acessível.
  - **Favicon**: `href` com `?v=<versão>` — browsers guardam favicon pela URL;
    a cada release a URL muda e a logo oficial aparece sem limpar cache.

## 0.8.1

### Patch Changes

- 8dbb6f3: Logo oficial em todos os pontos da UI (favicon, admin bar, sidebar e login).
  
  - Novo `public/logo.svg`: SVG original do CorelDRAW com cores e paths
    preservados; apenas o `viewBox` foi ajustado para o caixa real da arte
    (`44817.69 -304.8 30309.6 30309.6`) — o export A4 colocava a arte fora
    do viewBox antigo (`0 0 21000 29700`) e nada aparecia.
  - `favicon.svg` agora é a logo oficial (era um mark placeholder dourado).
  - Admin bar, sidebar colapsada e login passam a usar `<img src="/logo.svg">`
    no lugar dos SVGs inline antigos, com os tamanhos de cada contexto
    (28px na barra/sidebar, 48px no login).

## 0.8.0

### Minor Changes

- Bump to 0.8.0 for monorepo sync with CLI 0.8.0 (DB engine selection + container control).

## 0.7.0

### Minor Changes

- Bump to 0.7.0 for monorepo sync with CLI 0.7.0 (interactive wizard release).

## 0.6.6

### Patch Changes

- Settings → General: idioma agora lista TODOS os locales suportados (18) com bandeiras, e ao salvar aplica de verdade — grava o cookie `admin_locale` e recarrega a página nas traduções novas; timezone virou dropdown buscável estilo WordPress `(UTC-03:00) America/Sao_Paulo` (zonas IANA completas, ordenadas por offset, salva o id IANA, pré-preenche com o fuso do navegador). Field builder: as abas de configuração do campo (General/Validation/Presentation/…) não voltam mais para General a cada interação — memória de aba por field + `patchField` preservando referências (sem remontar linhas irmãs).

## 0.6.5

### Patch Changes

- Sidebar: estilos do DashboardLayout agora são `is:global` — os links dinâmicos de content-types (criados por JS) não recebem data-astro-cid e ficavam sem estilo (link dourado padrão, desalinhado); agora são idênticos aos links normais. Modais do field-builder (fb-modal/fb-browse-modal) enquadrados entre a AdminBar e o rodapé com altura ajustável e corpo com scroll. Core: content type CORE `page` com labels em inglês (Pages/Page) — alinhado ao seed V003 (migration V009 corrige bancos existentes com os labels em português).

## 0.6.4

### Patch Changes

- Fixes de layout/estilização: links de content-types na sidebar iguais aos demais; grid de formulários global (post-types, taxonomies e webhooks agora renderizam corretamente dentro das ilhas Solid); layout formulário-esquerda/tabela-direita em post-types e taxonomies com tabelas em card; checkbox de Active dos webhooks corrigido; seletor de tipo de campo (field-type-picker) estilizado; títulos duplicados removidos em /themes e /plugins; widgets do dashboard alinhados ao container dos cards; h3 duplicado removido em Settings → General.

## 0.6.3

### Patch Changes

- Modal agora se enquadra na viewport menos a barra preta e o rodapé (com folga), em vez de ser cortado por eles; altura máxima ajustável via CSS vars (--admin-bar-h / --admin-footer-h)

## 0.6.2

### Patch Changes

- Fix white bar below the black nav header: body padding-top was stacking on top of the viewport-propagated html padding (double 46px offset)

## 0.6.1

### Patch Changes

- Fix SSR crash "document is not defined" on Modal cleanup during server render
- Updated dependencies []:
  - @oktis-works/ui@0.5.6

## 0.6.0

### Minor Changes

- Unify admin page layouts to match /settings/custom-fields pattern
  
  ## Changes
  - Created shared `PageHeader` component with consistent layout (eyebrow, title, description, actions, toolbar)
  - Applied PageHeader to all settings pages, users, media, content, plugins, themes pages
  - Removed white background bar between header and sidebar by making main-content transparent
  - Moved content padding from .content-wrapper to .content for cleaner layout
  - All pages now follow the same visual pattern as /settings/custom-fields

## 0.5.5

### Patch Changes

- Fix "Missing refresh token" error on login in local development
  
  ## Problem
  When running OkCMS locally with `okcms start`, the admin (port 3011) and API (port 3000) run on different ports. The auth cookies (including refresh_token) were set with `SameSite=lax`, which blocks cookies on cross-origin fetch requests. This caused the refresh token to not be sent when the admin made API calls, resulting in "Missing refresh token" errors.
  
  ## Solution
  1. **Added Vite proxy to admin** (`apps/admin/astro.config.mjs`): In development, the admin now proxies `/api/*` requests to the API server. This makes admin and API same-origin (both on port 3011), allowing cookies to work with `SameSite=lax`.
  
  2. **Updated scaffold** (`packages/cli/src/scaffold.ts`): New projects now get a complete `.env` with all auth configuration variables:
     - `AUTH_COOKIE_DOMAIN`, `AUTH_COOKIE_SAMESITE`, `AUTH_COOKIE_SECURE`
     - `AUTH_COOKIE_ACCESS_MAXAGE`, `AUTH_COOKIE_REFRESH_MAXAGE`
     - `JWT_EXPIRES_IN=15m` (access token), `REFRESH_TOKEN_EXPIRES_IN=7d` (refresh token)
     - `BCRYPT_ROUNDS`, `AUTH_CSRF_*` settings
     - `ADMIN_API_PROXY_TARGET` for the Vite proxy
     - `PUBLIC_API_URL=/api` to use relative URLs via proxy
  
  3. **Fixed JWT expiry confusion** in template `env.example`: Was `JWT_EXPIRES_IN=7d` (wrong for access token), now correctly `JWT_EXPIRES_IN=15m` and `REFRESH_TOKEN_EXPIRES_IN=7d`.
  
  4. **Updated admin API client** (`apps/admin/src/lib/api.ts`): Supports relative `PUBLIC_API_URL` (e.g., `/api`) for proxy usage.
  
  ## For existing projects
  Add to `.env`:
  ```bash
  # Enable Vite proxy (simpler than lvh.me)
  PUBLIC_API_URL=/api
  ADMIN_API_PROXY_TARGET=http://localhost:3000
  # Ensure these are set:
  AUTH_COOKIE_SAMESITE=lax
  AUTH_COOKIE_SECURE=false
  JWT_EXPIRES_IN=15m
  REFRESH_TOKEN_EXPIRES_IN=7d
  ```
  Then restart with `okcms start`.
- Updated dependencies []:
  - @oktis-works/plugin-sdk@0.5.5
  - @oktis-works/types@0.5.5
  - @oktis-works/ui@0.5.5
  - @oktis-works/validation@0.5.5
