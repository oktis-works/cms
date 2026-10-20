# Plano de Implementação: Seed Demo + Static Front Page + Tema Default

**Versão alvo:** 0.19.0 (minor — breaking change no comportamento da home)

---

## ✅ Checklist de Fases

### Fase 1: Core — Theme Runtime (Static Front Page Logic)
- [x] `packages/theme-runtime/src/routing.ts` — implementar lógica de `static_front_page` e `page_for_posts` no `resolve()`
- [x] `packages/theme-runtime/src/routing.test.ts` — testes da nova lógica
- [x] `packages/theme-runtime/src/template-resolver.test.ts` — testes hierarquia (manter hífen)
- [x] `bun run build` + `bun run test:run` (packages/theme-runtime)

### Fase 2: Database — Seed Demo Content
- [x] `packages/database/src/migrations/seed.ts` — exportar `seedDemoContent(tenantId, authorId)`
  - Cria páginas: `home`, `sobre`, `blog`
  - Cria posts: `primeiro-post`, `segundo-post`
  - Cria menus: `header` (Home, Sobre, Blog), `footer`
  - Configura settings: `static_front_page` (home page ID), `page_for_posts` (blog page ID)
- [x] `packages/database/src/index.ts` — exportar `seedDemoContent`
- [x] `packages/database/src/migrations/seed.test.ts` — testes do novo seed
- [x] `bun run test:run` (packages/database)

### Fase 3: CLI — Integração no Init e Seed
- [x] `packages/cli/src/db-prepare.ts` — chamar `seedDemoContent` no `prepareDb()`
- [x] `packages/cli/src/commands.ts` — handler `seed` chamar `seedDemoContent`
- [x] `bun run test:run` (packages/cli)

### Fase 4: Admin — Settings → Reading UI
- [x] `apps/admin/src/components/apps/settings/ReadingSettings.tsx` — novo componente
- [x] `apps/admin/src/pages/settings/reading.astro` — nova página
- [x] `apps/admin/src/pages/settings/index.astro` — card "Reading" adicionado
- [x] `apps/admin/src/i18n/locales/en.json` + `pt-BR.json` — chaves `reading.*`
- [x] `bun run build` + `bun run test:run` (apps/admin)

### Fase 5: Tema Default — Templates + CSS
- [x] `themes/default/page-home.astro` — template específico home
- [x] `themes/default/page-sobre.astro` — template específico sobre
- [x] `themes/default/page-blog.astro` — template específico blog (page_for_posts)
- [x] `themes/default/post-primeiro-post.astro` — template específico post 1
- [x] `themes/default/post-segundo-post.astro` — template específico post 2
- [x] `themes/default/page.astro` — fallback genérico page
- [x] `themes/default/single.astro` — fallback genérico post
- [x] `themes/default/archive.astro` — fallback archive
- [x] `themes/default/index.astro` — fallback final
- [x] `themes/default/404.astro` — not found
- [x] `themes/default/home.astro` — **REMOVIDO**
- [x] `themes/default/theme.json` — +settings navegação/contato, compatibility ^0.19.0
- [x] `themes/default/src/theme.css` — source CSS
- [x] `themes/default/dist/theme.css` — gerado no build (via CLI theme-build)

### Fase 6: Testes Ponta-a-Ponta + Validação Completa
- [x] `bun run build` (todos os packages)
- [x] `bun run test:run` (1289 testes)
- [x] `bun run lint`
- [x] `bun run typecheck`

### Fase 7: Release
- [ ] Changeset (tipos: core=minor, admin=minor, theme-runtime=minor, database=minor, cli=patch)
- [ ] `bun run version-packages` + `bun run sync-version --write`
- [ ] Bump root `package.json` para 0.19.0
- [ ] `bun run sync-version --write` + validação
- [ ] `node scripts/prepare-publish.mjs --check --tag v0.19.0`
- [ ] Commit + tag `v0.19.0` + push origin main --tags
- [ ] Acompanhar CI/CD → Publish to npm
- [ ] Remover `PLANO_SEED_TEMA.md`

---

## 🎯 Critérios de Sucesso por Fase

| Fase | Validação |
|---|---|
| 1 | `resolve('/')` retorna página configurada em `static_front_page`; `resolve('/blog')` usa `page_for_posts` |
| 2 | `seedDemoContent` idempotente; cria 3 pages + 2 posts + 2 menus + 2 settings |
| 3 | `okcms init` + `okcms start` já tem conteúdo demo funcionando |
| 4 | Admin → Settings → Reading mostra selects e salva corretamente |
| 5 | Templates resolvem corretamente via hierarquia `type-slug.astro` |
| 6 | Todos os gates CI passam |
| 7 | Publish no npm com versões 0.19.0 (core, admin, theme-runtime, database) |

---

## 📝 Notas Importantes

- **Separador de template:** HÍFEN (`page-home.astro`, `post-primeiro-post.astro`) — **não mudar**
- **Static Front Page:** Implementado via settings `static_front_page` (UUID da page) + `page_for_posts` (UUID da page)
- **Home.astro:** Removido do tema default (não mais prioritário)
- **Compatibilidade:** Fallback para archive de posts se settings não configurados
- **Seed:** Idempotente via `ON CONFLICT (tenant_id, type, slug)` para content + `ON CONFLICT (key, tenant_id)` para settings

---

## 📦 Pacotes Afetados (versões esperadas)

| Pacote | Versão Atual | Nova Versão | Tipo |
|---|---|---|---|
| @oktis-works/theme-runtime | 0.6.4 | 0.7.0 | minor |
| @oktis-works/database | 0.8.0 | 0.9.0 | minor |
| @oktis-works/admin | 0.15.0 | 0.16.0 | minor |
| @oktis-works/core | 0.8.0 | 0.9.0 | minor |
| @oktis-works/cli | 0.x | patch | patch |

---

*Arquivo criado para validação contínua. Será removido ao final da Fase 7.*