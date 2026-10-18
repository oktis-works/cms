# @oktis-works/plugin-runtime

## 0.5.10

### Patch Changes

- Updated dependencies
  - @oktis-works/types@0.7.0
  - @oktis-works/plugin-sdk@0.5.8

## 0.5.9

### Patch Changes

- Updated dependencies
  - @oktis-works/types@0.6.0
  - @oktis-works/plugin-sdk@0.5.7

## 0.5.8

### Patch Changes

- Updated dependencies
  - @oktis-works/validation@0.6.0
  - @oktis-works/types@0.5.6

## 0.5.7

### Patch Changes

- fix(lint): remove imports/vars não usados que quebravam `bun run lint` no CI
  
  `eslint .` falhava com 7 erros de `no-unused-vars` em arquivos committados
  (`apps/api/src/index.ts`, `packages/core/src/plugin/load.ts`,
  `packages/plugin-runtime/src/plugin-api-rls.test.ts`) — o gate de lint do CI
  ficava vermelho em qualquer tag. Removidos os símbolos sem uso, sem mudança
  de comportamento.
  
  Inclui também a limpeza do `apps/web/src/rendering.ts`: `getScopedContainer` e
  `buildTheme` eram helpers exportados porém **nunca consumidos** pelo app
  (duplicavam o style-engine do pacote) — removidos junto com os imports órfãos.

## 0.5.6

### Patch Changes

- 2f2919f: - **Plugins no boot**: novo `bootstrapPlugins` — lê do banco os plugins habilitados (ACTIVATED/RUNNING), chama `register(registry)`, descarrega os desabilitados e isola falhas (plugin quebrado não derruba o boot nem dos outros nem do processo). `core.bootstrap()` chama `syncEnabledPlugins` e cobre API, web e worker num ponto só; ativar/desativar pela API sincroniza o processo na hora.
  - **Loader**: descobre o `manifest.json` gerado pelo scaffold (fallback atrás de `package.json` de pacotes npm).
  - **CLI**: comando `okcms prerender`/SSG removido por completo (comando, wizard, parser e docs do scaffold).
  - **Admin**: `AtGlanceWidget` sem versão de app — Storage vira stat próprio; removidos `lib/version.ts` e a chave i18n `dashboard.widgets.version`.
  - **Docs**: auditoria de promessas falsas em todos os `.md` do projeto e nos templates gerados — exemplo de plugin com hooks reais (`content:query`, `after_publish_content_post`), `plugin:manage/theme:manage --disable` descrito como estado local, `update/redeploy` sem assumir blue/green, SSR-only e "sandbox" não anunciado como isolamento de execução.
- Updated dependencies [2f2919f]
  - @oktis-works/plugin-sdk@0.5.6

## 0.5.5

### Patch Changes

- Updated dependencies []:
  - @oktis-works/plugin-sdk@0.5.5
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
  - @oktis-works/plugin-sdk@0.2.0
  - @oktis-works/types@0.2.0

## 0.1.14

### Patch Changes

- Updated dependencies []:
  - @oktis-works/plugin-sdk@0.1.14
  - @oktis-works/types@0.1.14

## 0.1.13

### Patch Changes

- Updated dependencies []:
  - @oktis-works/plugin-sdk@0.1.13
  - @oktis-works/types@0.1.13

## 0.1.12

### Patch Changes

- Updated dependencies []:
  - @oktis-works/types@0.1.12
  - @oktis-works/plugin-sdk@0.1.12

## 0.1.11

### Patch Changes

- Updated dependencies []:
  - @oktis-works/validation@0.1.11
  - @oktis-works/types@0.1.11
  - @oktis-works/plugin-sdk@0.1.11

## 0.1.10

### Patch Changes

- Updated dependencies []:
  - @oktis-works/plugin-sdk@0.1.10
  - @oktis-works/types@0.1.10

## 0.1.9

### Patch Changes

- Updated dependencies []:
  - @oktis-works/validation@0.1.9
  - @oktis-works/types@0.1.9
  - @oktis-works/plugin-sdk@0.1.9

## 0.1.8

### Patch Changes

- Updated dependencies []:
  - @oktis-works/validation@0.1.8
  - @oktis-works/types@0.1.8
  - @oktis-works/plugin-sdk@0.1.8

## 0.1.7

### Patch Changes

- Updated dependencies []:
  - @oktis-works/validation@0.1.7
  - @oktis-works/types@0.1.7
  - @oktis-works/plugin-sdk@0.1.7

## 0.1.6

### Patch Changes

- Updated dependencies []:
  - @oktis-works/validation@0.1.6
  - @oktis-works/types@0.1.6
  - @oktis-works/plugin-sdk@0.1.6

## 0.1.5

### Patch Changes

- Updated dependencies []:
  - @oktis-works/validation@0.1.5
  - @oktis-works/types@0.1.5
  - @oktis-works/plugin-sdk@0.1.5

## 0.1.4

### Patch Changes

- Updated dependencies []:
  - @oktis-works/validation@0.1.4
  - @oktis-works/types@0.1.4
  - @oktis-works/plugin-sdk@0.1.4

## 0.1.3

### Patch Changes

- Updated dependencies []:
  - @oktis-works/validation@0.1.3
  - @oktis-works/types@0.1.3
  - @oktis-works/plugin-sdk@0.1.3
