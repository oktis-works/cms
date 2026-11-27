# PLAN_FIX_GAPS.md — Plano de Correção de Gaps

**Branch:** `release/v1.0.4` (criada a partir de `main`, atualizada)
**Commit:** `c4d828c chore(release): apply gap corrections for v1.0.4`
**Versão de produto:** `1.0.4` (root `package.json`)
**Status:** CONCLUÍDO — todas as modificações estão na branch local, nada subido ao GitHub

---

## Resumo das decisões e ações executadas

| Gap | Decisão | Status | Ação executada |
|-----|---------|--------|----------------|
| GAP-01 | Ignorar | ⏭️ Pulado | Sem ação |
| GAP-02 | Ignorar | ⏭️ Pulado | Sem ação |
| GAP-03 | Changesets + versão + exigir changeset na PR | ✅ Concluído | Criado changeset para todos os 18 pacotes, rodado `version-packages`, root bumpado para 1.0.4, `sync-version --write` executado, validação passou |
| GAP-04 | Remover publish por tag, deixar apenas PR | ✅ Concluído | Removido `push: tags: ['v*']` do ci.yml, removido job `trigger-publish`, atualizado `create-release-pr.yml` (body do PR não menciona tag manual) |
| GAP-05 | Atualizar AGENTS.md | ✅ Concluído | Reescrito §3 (CI/CD sem tag), §5 (build order + oxlint), §16 (pré-merge validation), checklist atualizado |
| GAP-06 | Build antes de typecheck/test no CI | ✅ Concluído | Adicionado `bun run build` antes de `test:run` e `lint` no ci.yml; containers MySQL/MariaDB já estavam configurados |
| GAP-07 | Deixar de lado | ⏭️ Pulado | Sem ação |
| GAP-08 | Deletar testes `.js` duplicados | ✅ Concluído | 37 arquivos `*.test.js` deletados (mantidos `.ts`) |
| GAP-09 | Deletar rotas `index.js` duplicadas | ✅ Concluído | 22 arquivos `index.js` sob `apps/api/src/routes/` deletados (mantidos `.ts`) |
| GAP-10 | Migrar para oxlint | ✅ Concluído | `oxlint@1.95.0` instalado, `.eslintrc.json` e `eslint.config.mjs` removidos, `.oxlintrc.json` + `.oxlintignore` criados, script `lint` atualizado, CI atualizado |
| GAP-11 | Consolidar Vitest config | ✅ Concluído | `vitest.config.js`, `vitest.config.d.ts`, `.map` deletados; mantido apenas `vitest.config.ts` |
| GAP-12 | Traduzir para inglês | ✅ Concluído | Mensagens de erro em `validation/src/basic.ts`, `client-validate.ts`, `conditional.ts`, `compatibility.ts`, `config/src/index.ts`, `core/src/content/*`, `core/src/plugin/service.ts`, `core/src/storage/index.ts`, `database/src/migrations/bootstrap.ts` traduzidas |
| GAP-13 | Não usar SDD | ⏭️ Pulado | Sem ação |
| GAP-14 | test-utils interno | ⏭️ Pulado | Sem ação |
| GAP-15 | CI containers MySQL/MariaDB | ✅ Confirmado | Já configurados no ci.yml (serviços mysql + mariadb) |
| GAP-16 | Deixar para depois | ⏭️ Pulado | Sem ação |
| GAP-17 | Validação compatibility.okcms | ✅ Confirmado | Loader já valida (já existia) |
| GAP-18 | Coberto pelo GAP-04 | ⏭️ Pulado | Sem ação extra |

---

## Checklist de execução (todos concluídos)

### Fase 0 — Preparação
- [x] Branch `release/v1.0.4` criada a partir de `main` atualizada
- [x] `PLAN_FIX_GAPS.md` criado

### Fase 1 — Changesets + versão (GAP-03)
- [x] Changeset `.changeset/fix-gaps-v1.0.4.md` criado para todos os 18 pacotes
- [x] `bun run version-packages` executado (bumpou pacotes + sync + generate-versions)
- [x] Root `package.json` bumpado para `1.0.4`
- [x] `bun run sync-version --write` executado (CMS_VERSION nas 3 âncoras)
- [x] `bun run sync-version` (validate) passou

### Fase 2 — CI/CD (GAP-04 + GAP-06 + GAP-15)
- [x] `.github/workflows/ci.yml`: removido `push: tags: ['v*']`, mantido apenas `pull_request`
- [x] `.github/workflows/ci.yml`: job `trigger-publish` removido
- [x] `.github/workflows/ci.yml`: `bun run build` adicionado antes de `test:run` e `lint`
- [x] `.github/workflows/create-release-pr.yml`: body do PR atualizado (sem menção a tag manual)
- [x] CI já sobe containers MySQL + MariaDB antes de `test:providers`

### Fase 3 — Lint: oxlint (GAP-10)
- [x] `oxlint@1.95.0` instalado como devDependency
- [x] `.eslintrc.json` e `eslint.config.mjs` removidos
- [x] `.oxlintrc.json` e `.oxlintignore` criados
- [x] Script `lint` atualizado para `oxlint .`
- [x] CI `lint` job roda `bun run lint` (oxlint)
- [x] AGENTS.md §5 atualizado para mencionar oxlint

### Fase 4 — Testes e config (GAP-08 + GAP-09 + GAP-11)
- [x] 37 arquivos `*.test.js` duplicados deletados
- [x] 22 arquivos `index.js` de rotas duplicados deletados
- [x] `vitest.config.js`, `vitest.config.d.ts`, `.map` deletados
- [x] Apenas `vitest.config.ts` mantido

### Fase 5 — Idioma (GAP-12)
- [x> Mensagens de erro e comentários expostos traduzidos para inglês nos arquivos de validação, config, core, database e plugin service

### Fase 6 — AGENTS.md (GAP-05)
- [x] §3: CI/CD reescrito para fluxo via PR apenas
- [x] §5: Build order inclui theme-builder, lint menciona oxlint
- [x] §16: Pré-merge validation (sem tag), 3 runs limpos antes de push da branch

### Fase 7 — Validação local
- [x] `bun run build` — passou (14 pacotes)
- [x] `bun run test:run` — passou (138 files, 1367 tests)
- [x] `bun run lint` — passou (apenas warnings, sem erros)
- [x] `bun run typecheck` — passou (sem erros)
- [x] `bun run sync-version` — passou (âncoras sincronizadas)

---

## Estado atual

- **Branch:** `release/v1.0.4` (local)
- **Último commit:** `c4d828c`
- **138 arquivos alterados** (523 inserções, 9846 deleções)
- **Nada subido ao GitHub** — a branch está pronta para `git push origin release/v1.0.4`
- **Não há tag criada** (fluxo é via PR + merge na main)

---

## Próximos passos (quando decidir publicar)

1. `git push origin release/v1.0.4` — isso dispara o workflow `create-release-pr.yml` que abre um PR para `main`
2. Revisar e aprovar o PR no GitHub
3. Fazer merge do PR para `main` — isso dispara `publish-on-merge.yml` → `repository_dispatch` → `publish.yml` (npm publish automático)
4. Acompanhar o CI no main; quando verde, o publish roda automaticamente

**Não é necessário criar tag `v1.0.4`** — o publish é 100% automatizado via PR + merge na `main`.
