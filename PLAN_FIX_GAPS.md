# PLAN_FIX_GAPS.md — Plano de Correção de Gaps

**Branch:** `release/v1.0.4` (criada a partir de `main`, atualizada)
**Versão de produto alvo:** `1.0.4` (root `package.json`)
**Status:** Em execução — nada subido ao GitHub ainda

---

## Resumo das decisões do usuário (por gap)

| Gap | Decisão | Ação |
|-----|---------|------|
| GAP-01 | Ignorar | Sem ação |
| GAP-02 | Ignorar | Sem ação |
| GAP-03 | Prosseguir + exigir changeset na PR + reforçar AGENTS.md | Criar changesets p/ pacotes alterados, rodar `version-packages`, bumpar root, exigir changeset em CI/PR |
| GAP-04 | Remover publish por tag, deixar apenas automação via PR | Remover `push: tags: ['v*']` do ci.yml e o job `trigger-publish`; publicar apenas via `publish-on-merge.yml` (merge na main) |
| GAP-05 | Atualizar AGENTS.md para nova estrutura | Reescrever seções de versionamento, CI/CD, release checklist |
| GAP-06 | Garantir build antes de typecheck/test em CI (fresh checkout) | Garantir `bun run build` antes de `typecheck` e `test:run` no CI; script de fresh-checkout sanity check |
| GAP-07 | Deixar de lado | Sem ação |
| GAP-08 | Deletar testes `.js` duplicados (manter `.ts`) | Remover 37 arquivos `*.test.js` que têm par `.test.ts` |
| GAP-09 | Deletar rotas `index.js` duplicadas (manter `.ts`), sem perder funcionalidade | Remover 22 arquivos `index.js` sob `apps/api/src/routes/` que têm par `index.ts` |
| GAP-10 | Migrar para `oxlint` definitivo; CI roda oxlint | Substituir eslint por oxlint, atualizar scripts e CI |
| GAP-11 | Manter apenas `vitest.config.ts`; deletar `.js`, `.d.ts`, `.map` | Remover `vitest.config.js`, `vitest.config.d.ts`, `vitest.config.js.map`, `vitest.config.d.ts.map` |
| GAP-12 | Traduzir comentários/mensagens para inglês | Varrer código-fonte por strings/comentários em português e traduzir |
| GAP-13 | Não usar SDD por enquanto | Sem ação |
| GAP-14 | test-utils é interno | Sem ação |
| GAP-15 | CI com containers MySQL/MariaDB | Garantir que CI suba containers antes de `test:providers` |
| GAP-16 | Deixar para depois | Sem ação |
| GAP-17 | Manter validação `compatibility.okcms` | Confirmar que loader já valida (já existe) |
| GAP-18 | Coberto pelo GAP-04 (remover trigger de tag) | Sem ação extra |

---

## Checklist de execução

### Fase 0 — Preparação (branch + plano)
- [x] Criar branch `release/v1.0.4` a partir de `main` atualizada
- [x] Criar `PLAN_FIX_GAPS.md` com plano completo e checklist

### Fase 1 — Changesets + versão (GAP-03)
- [ ] Criar changesets `.changeset/*.md` para todos os pacotes alterados nesta release
- [ ] Rodar `bun run version-packages` (bumpa pacotes + sync-version + generate-versions)
- [ ] Bumpar versão root `package.json` para `1.0.4`
- [ ] Rodar `bun run sync-version --write` (sincroniza CMS_VERSION nas 3 âncoras)
- [ ] Rodar `bun run sync-version` (validate mode) para confirmar alinhamento
- [ ] Adicionar gate de CI que exija changeset em PR que altere código de pacote

### Fase 2 — CI/CD: remover trigger de tag (GAP-04 + GAP-06 + GAP-15)
- [ ] Editar `.github/workflows/ci.yml`: remover `push: tags: ['v*']`, manter apenas `pull_request`
- [ ] Editar `.github/workflows/ci.yml`: remover job `trigger-publish` (apenas tag)
- [ ] Garantir que `typecheck` e `lint` jobs rodem `bun run build` antes (fresh checkout)
- [ ] Garantir que CI suba containers MySQL/MariaDB antes de `test:providers` (já estão, confirmar)
- [ ] Editar `.github/workflows/create-release-pr.yml`: atualizar body do PR (não mencionar tag manual)
- [ ] Adicionar script de fresh-checkout sanity check (opcional)

### Fase 3 — Lint: migrar para oxlint (GAP-10)
- [ ] Instalar `oxlint` como devDependency no root
- [ ] Substituir `eslint` por `oxlint` no script `lint` do root `package.json`
- [ ] Remover `.eslintrc.json` e `eslint.config.mjs`
- [ ] Criar `.oxlintrc.json` com regras equivalentes (ignorar `scaffold.test.js`, `dist/`, `node_modules/`, etc.)
- [ ] Atualizar CI `lint` job para rodar `bun run lint` (oxlint)
- [ ] Atualizar AGENTS.md §5 (lint) para mencionar oxlint

### Fase 4 — Testes: remover duplicados (GAP-08 + GAP-09 + GAP-11)
- [ ] Deletar 37 arquivos `*.test.js` que têm par `*.test.ts`
- [ ] Deletar 22 arquivos `index.js` sob `apps/api/src/routes/` que têm par `index.ts`
- [ ] Deletar `vitest.config.js`, `vitest.config.d.ts`, `vitest.config.js.map`, `vitest.config.d.ts.map`
- [ ] Manter apenas `vitest.config.ts`
- [ ] Ajustar `vitest.config.ts` se necessário (include já aponta para `.test.ts`)

### Fase 5 — Idioma: traduzir para inglês (GAP-12)
- [ ] Varrer código-fonte por comentários/mensagens de erro em português
- [ ] Traduzir para inglês (ex.: `incompatível (plugin)` → `incompatible (plugin)`)
- [ ] Manter documentação opcional em PT-BR separada (README.pt-BR.md, docs/*pt-BR.md)

### Fase 6 — AGENTS.md (GAP-05)
- [ ] Atualizar §1 (commit) se necessário
- [ ] Atualizar §2 (versionamento) se necessário
- [ ] Atualizar §3 (CI/CD): remover menção a trigger de tag, deixar apenas PR
- [ ] Atualizar §5 (Build & Lint): oxlint, build order com theme-builder
- [ ] Atualizar §6 (Cross-Package Import Rules): incluir theme-builder na ordem
- [ ] Atualizar §16 (Pre-Tag Validation): ajustar para fluxo via PR

### Fase 7 — Validação local (não subir para GitHub)
- [ ] `bun run build`
- [ ] `bun run test:run`
- [ ] `bun run lint` (oxlint)
- [ ] `bun run typecheck`
- [ ] `bun run sync-version` (validate)
- [ ] Confirmar working tree limpo e commits feitos na branch

---

## Notas
- Nenhuma alteração será subida ao GitHub (`git push`) nesta execução. A branch fica local até o usuário decidir publicar.
- O publish continua automatizado via `publish-on-merge.yml` quando um PR é mergeado na `main`.
- Não há tag criada nesta release (fluxo é via PR + merge na main).
