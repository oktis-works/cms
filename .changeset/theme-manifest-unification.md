---
"@oktis-works/cms": patch
"@oktis-works/theme-runtime": patch
"@oktis-works/core": patch
---

- **Unificação do manifesto de tema — `theme.json` é o canônico único**: fim da redundância `manifest.json`/`theme.json` (o tema default nascia com o nome legado enquanto `theme:create` já gerava o novo).
  - `okcms init` agora grava `themes/default/theme.json` (antes: `manifest.json`).
  - **Migração automática nos projetos existentes**: os entry points do CLI — `okcms update`, `okcms redeploy` (execução real, nunca `--dry-run`), `okcms dev`, `okcms start`, `okcms theme:build` e `okcms theme:manage` — renomeiam `manifest.json` → `theme.json` onde o legado ainda existe (novo `theme-migrate.ts`: idempotente, nunca sobrescreve um `theme.json` já presente, sem permissão de escrita = tenta na próxima execução).
  - **Fallbacks removidos dos leitores**: `themeManifestPath` (theme-build), `theme:manage --info`, `ThemeLoader` (theme-runtime) e `ThemeService.syncFromDirectory` (core) leem só `theme.json`.
  - `manifest.json` continua canônico apenas para **plugins** (caso legítimo de pacotes npm) — fora deste escopo.
