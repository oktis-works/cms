# PLANO DE IMPLEMENTAÇÃO: THEME CUSTOMIZER 100% PRODUCTION-READY

**Projeto:** blacklotuscms-v2  
**Data:** 2025-10-24  
**Versão Atual:** 0.32.0  
**Próxima Versão:** 0.33.0 (Minor - novas funcionalidades Fase 3)

---

## 📋 RESUMO EXECUTIVO

O Theme Customizer já possui tipos de campo avançados (Fase 1-2 concluídas). Faltam: herança parent/child, conditional logic, tabs/accordion, export/import, versionamento, permissões granulares, audit log, testes E2E e documentação completa.

Este plano cobre **TODAS as fases 3, 4 e 5** para entregar 100% production-ready.

---

## 🎯 FASES DE IMPLEMENTAÇÃO

### FASE 1: FUNDAÇÃO E SEGURANÇA (✅ CONCLUÍDA - v0.31.0/v0.31.1)
### FASE 2: TIPOS DE CAMPO AVANÇADOS (✅ CONCLUÍDA - v0.32.0)

---

### FASE 3: HERANÇA E ARQUITETURA AVANÇADA (Semana 3)
**Objetivo:** Parent/child themes, conditional logic, organização visual

| # | Item | Implementação Detalhada | Arquivos | Esforço | Prioridade |
|---|------|------------------------|----------|---------|------------|
| 3.1 | **Parent/Child Settings Merge** | `buildThemeSettings(manifest, config, parentManifest?)` faz deep merge: parent defaults → child defaults → child config. `getInheritanceChain()` no ThemeService resolve cadeia. | `packages/core/src/theme/service.ts`, `apps/web/src/rendering.ts`, `ThemeCustomizer.tsx` | 8h | 🔴 P0 |
| 3.2 | **Conditional Logic** | Reutiliza `isFieldVisible(field, values)` do FieldRenderer. No Customizer: `createMemo(() => fields().filter(f => isFieldVisible(f, draft())))`. Avalia no cliente ao mudar valores. | `ThemeCustomizer.tsx`, `apps/admin/src/components/content/FieldRenderer.tsx` | 6h | 🟠 P1 |
| 3.3 | **Tabs/Accordion Groups** | Schema: `group` (string) + `groupOrder` (number) no ThemeSettingField. Customizer agrupa por `group`, renderiza tabs se >1 grupo, accordion se 1 grupo. | `ThemeCustomizer.tsx`, `apps/admin/src/styles/global.css` | 4h | 🟠 P1 |
| 3.4 | **Ordenação por sort_order** | Fields ordenados por `sort_order` do manifesto, fallback alfabético. | `ThemeCustomizer.tsx` | 2h | 🟡 P2 |

---

### FASE 4: OPERAÇÕES AVANÇADAS (Semana 4)
**Objetivo:** Export/Import, versionamento, auditoria, permissões

| # | Item | Implementação Detalhada | Arquivos | Esforço | Prioridade |
|---|------|------------------------|----------|---------|------------|
| 4.1 | **Export/Import Config** | Botão "Export" → JSON `{ settings: config, manifestVersion, exportedAt, themeName }`. Botão "Import" → file input, valida contra manifest atual, opções: merge/replace. API: `GET /themes/:id/config/export`, `POST /themes/:id/config/import`. | `ThemeCustomizer.tsx`, `apps/api/src/routes/themes/index.ts`, `ThemeService.exportConfig()`, `ThemeService.importConfig()` | 6h | 🟠 P1 |
| 4.2 | **History/Versioning** | Migration: `theme_config_versions (id, theme_id, config, user_id, change_summary, created_at)`. `updateConfig()` cria versão antes de salvar. UI: aba "History" com diff visual (antes/depois), botão "Restore" para versão anterior. | Migration SQL, `ThemeService`, `ThemeCustomizer.tsx` (aba History), API `GET /themes/:id/config/history` | 10h | 🟡 P2 |
| 4.3 | **Permissão `theme:customize`** | Nova permission no auth (`theme:customize`), separada de `theme:update`. Middleware `requirePermission('theme:customize')` na rota `PATCH /themes/:id/config`. Default: concedida a roles com `theme:update`. | `packages/auth`, `apps/api/src/middleware/auth.ts`, `apps/api/src/routes/themes/index.ts` | 4h | 🟡 P2 |
| 4.4 | **Audit Log** | Em `updateConfig()`: `auditLog.log({ action: 'theme.config.update', resourceType: 'theme', resourceId: themeId, changes: diff(before, after), userId, ip })`. Diff usa implementação própria. | `ThemeService.updateConfig`, `auditLog` | 3h | 🟡 P2 |
| 4.5 | **Restore Defaults** | Botão "Restore Defaults" (separado de "Reset Draft"). Recarrega defaults do manifesto no draft. Confirmação modal. | `ThemeCustomizer.tsx` | 2h | 🟢 P3 |

---

### FASE 5: POLIMENTO, TESTES E DOCUMENTAÇÃO (Semana 5)
**Objetivo:** Qualidade, testes automatizados, documentação completa

| # | Item | Implementação Detalhada | Arquivos | Esforço | Prioridade |
|---|------|------------------------|----------|---------|------------|
| 5.1 | **Testes Unitários ThemeService** | Cobertura: `validateThemeConfig` (todos tipos, required, ranges, nested), `buildThemeSettings` (herança, merge), `updateConfig` (validação, sanitização), `exportConfig`/`importConfig`. Target: >90% coverage. | `packages/core/src/theme/service.test.ts` | 6h | 🟠 P1 |
| 5.2 | **Testes Integração API** | `POST /themes/:id/config` (validação sucesso/falha), `GET /export`, `POST /import`, `GET /history`, permissões. | `apps/api/src/routes/themes/index.test.ts` | 4h | 🟠 P1 |
| 5.3 | **Testes E2E Customizer** | Playwright: fluxo completo (load → edit all types → preview updates → save → export → import → history restore). Testes por tipo de campo. | `e2e/theme-customizer.test.ts` | 8h | 🟠 P1 |
| 5.4 | **Testes Regressão Visual** | Screenshots: customizer vazio, com settings, preview iframe, tabs/accordion, conditional logic. Chromatic ou pixelmatch. | `e2e/visual-regression.test.ts` | 4h | 🟡 P2 |
| 5.5 | **Documentação THEME.md** | Schema completo `manifest.settings`, todos 21 tipos com exemplos, herança parent/child, conditional logic, tabs/groups, API endpoints, CLI `theme:create`, troubleshooting. | `THEME.md` (raiz) | 6h | 🟠 P1 |
| 5.6 | **Guia Migração** | Como adicionar `settings[]` a `theme.json` legado, migrar templates para usar `settings.theme.xxx`, validar compatibilidade. | `docs/THEME_MIGRATION.md` | 3h | 🟡 P2 |
| 5.7 | **CHANGELOG** | Atualizar com todas as mudanças por pacote. | `CHANGELOG.md` | 1h | 🟢 P3 |

---

## 📦 ENTREGÁVEIS POR FASE

### Fase 3 - Entregáveis
- [ ] `buildThemeSettings()` aceita `parentManifest` e faz deep merge
- [ ] `getInheritanceChain()` no ThemeService funcional
- [ ] Conditional logic filtrando campos no Customizer em tempo real
- [ ] Tabs/Accordion renderizados no painel lateral baseado em `group`
- [ ] Fields ordenados por `sort_order` do manifesto

### Fase 4 - Entregáveis
- [ ] Botão "Export" baixa JSON válido
- [ ] Botão "Import" valida contra manifest, opções merge/replace
- [ ] Tabela `theme_config_versions` criada por migration
- [ ] Aba "History" com diff visual + botão "Restore"
- [ ] Permissão `theme:customize` separada funcionando
- [ ] Audit log gravando diff em `updateConfig()`
- [ ] Botão "Restore Defaults" funcional

### Fase 5 - Entregáveis
- [ ] >90% coverage nos testes unitários ThemeService
- [ ] Testes API passando (validação, export, import, history, perms)
- [ ] Testes E2E Playwright passando (fluxo completo)
- [ ] Testes regressão visual passando
- [ ] `THEME.md` completa na raiz
- [ ] `docs/THEME_MIGRATION.md` criada
- [ ] `CHANGELOG.md` atualizado

---

## 🔧 DETALHES TÉCNICOS CRÍTICOS

### 1. Schema Estendido `ThemeSettingField` (já existe em `packages/types/src/entities/index.ts`)
```typescript
export interface ThemeSettingField {
  name: string;
  type?: ThemeSettingType;
  label?: string;
  default?: unknown;
  options?: Array<string | { value: string; label: string }>;
  // Validation & UI hints
  required?: boolean;
  placeholder?: string;
  description?: string;
  min?: number;
  max?: number;
  step?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  // Conditional logic (same as field definitions)
  conditionalLogic?: {
    groups?: Array<{
      match?: 'ALL' | 'ANY';
      rules?: Array<{
        field: string;
        operator: 'eq' | 'neq' | 'gt' | 'lt' | 'contains' | 'pattern_matches' | 'has_any_value' | 'has_no_value';
        value: unknown;
      }>;
    }>;
  };
  // Grouping for tabs/accordion in customizer UI
  group?: string;
  groupOrder?: number;
  // Nested fields for complex types
  subFields?: ThemeSettingField[];
  // Layouts for flexible_content
  layouts?: Array<{
    name: string;
    label?: string;
    subFields?: ThemeSettingField[];
  }>;
}
```

### 2. Herança Parent→Child (Merge Deep)
```typescript
// apps/web/src/rendering.ts - buildThemeSettings()
export function buildThemeSettings(
  manifest: ThemeManifest | null,
  config: Record<string, unknown> | null,
  parentManifest?: ThemeManifest | null  // NOVO
): Record<string, unknown> {
  let settings = mergeDefaults(manifest?.settings);
  if (parentManifest) {
    settings = deepMerge(mergeDefaults(parentManifest.settings), settings);
  }
  return deepMerge(settings, config ?? {});
}
```

### 3. Conditional Logic (reutiliza engine existente)
```typescript
// apps/admin/src/components/content/FieldRenderer.tsx - já existe
export function isFieldVisible(field: ResolvedFieldDefinition, values: Record<string, unknown>): boolean
// No Customizer:
const visibleFields = createMemo(() => 
  fields().filter(f => isFieldVisible(f, draft()))
)
```

### 4. Tabs/Accordion Groups
```typescript
// Schema: group (string) + groupOrder (number) no ThemeSettingField
// Customizer agrupa por group, renderiza:
// - tabs se >1 grupo único
// - accordion se 1 grupo
```

---

## 📊 CRONOGRAMA ESTIMADO

| Fase | Duração | Esforço Total | Entrega Parcial |
|------|---------|---------------|-----------------|
| 3 - Herança/Logic | 4 dias | ~20h | Parent/child + conditional + tabs |
| 4 - Operações | 4 dias | ~25h | Export/Import + History + Permissions |
| 5 - Qualidade | 4 dias | ~26h | Testes + Docs + Polish |
| **TOTAL** | **12 dias** | **~71h** | **100% PRODUCTION-READY** |

---

## ✅ CRITÉRIOS DE "DONE" (Definition of Done)

### Para cada item:
- [ ] Código implementado + tipado (TypeScript strict)
- [ ] Testes unitários passando (>90% cobertura no serviço)
- [ ] Testes de integração API passando
- [ ] Testes E2E Playwright passando (cenários happy + edge)
- [ ] Lint + Typecheck limpos
- [ ] Documentação atualizada (THEME.md + JSDoc)
- [ ] CHANGELOG atualizado
- [ ] Build passa (`bun run build`)
- [ ] CI verde localmente

### Para a Release Final:
- [ ] Todas as 3 fases (3, 4, 5) concluídas
- [ ] `bun run test:run` → 100% passing
- [ ] `bun run build` → success
- [ ] `bun run lint` → clean
- [ ] `bun run typecheck` → clean
- [ ] `prepare-publish --check --tag v0.33.0` → success
- [ ] Tag `v0.33.0` pushada → GitHub Actions publica no npm

---

## 🚀 PROCESSO DE RELEASE FINAL

```bash
# 1. Após TODAS as fases implementadas e testadas:
bun run version-packages        # consome changesets, bumpa versões dos pacotes
# Editar package.json root: "version": "0.33.0"
bun run sync-version --write    # sincroniza CMS_VERSION
node scripts/prepare-publish.mjs --check --tag v0.33.0
bun run build && bun run test:run && bun run lint && bun run typecheck

# 2. Commit + Tag + Push
git add -A
git commit -m "feat(theme): complete production-ready Theme Customizer (v0.33.0)"
git tag v0.33.0
git push origin main --tags

# 3. APAGAR PLANO
rm PLANO-THEME-CUSTOMIZER-PRODUCTION.md
git add PLANO-THEME-CUSTOMIZER-PRODUCTION.md  # staged deletion
git commit -m "chore: remove implementation plan"
git push origin main
```

---

## 📝 CHANGESETS NECESSÁRIOS (um por pacote afetado)

| Pacote | Tipo | Descrição Resumida |
|--------|------|-------------------|
| `@oktis-works/core` | minor | ThemeService: inheritance, conditional logic, export/import, history, audit |
| `@oktis-works/database` | patch | Migration `theme_config_versions` table |
| `@oktis-works/api` | minor | Rotas themes: export/import, validation, permission `theme:customize` |
| `@oktis-works/admin` | minor | Customizer: conditional logic, tabs, export/import, history UI, restore defaults |
| `@oktis-works/theme-runtime` | patch | `buildThemeSettings` herança parent/child |
| `@oktis-works/web` | patch | `mergePreviewSettings` validação whitelist |
| `@oktis-works/cms` | minor | CLI: theme:create compatibilidade |
| `@oktis-works/types` | minor | `ThemeSettingField` estendido (conditionalLogic, group, groupOrder, sort_order) |

---

## ⚠️ RISCOS E MITIGAÇÕES

| Risco | Probabilidade | Impacto | Mitigação |
|-------|---------------|---------|-----------|
| Breaking change na API de settings | Média | Alto | Validar schema estrito, migrar dados existentes com script |
| Performance Customizer com muitos campos | Baixa | Médio | Lazy load componentes pesados (MediaPicker, Wysiwyg) |
| Conflito herança parent/child | Média | Alto | Testes exaustivos merge deep, precedência clara |
| Migration theme_config_versions falha | Baixa | Alto | Idempotente, testar em staging antes |
| Permissão `theme:customize` quebra admin existente | Baixa | Alto | Default: conceder a quem tem `theme:update` |

---

## 🎯 APROVAÇÃO NECESSÁRIA

**Antes de iniciar qualquer implementação, preciso da sua aprovação explícita:**

1. **Confirmar escopo** - Todas as 3 fases (3, 4, 5) conforme acima?
2. **Confirmar prioridades** - P0/P1/P2/P3 como definidas?
3. **Confirmar versão** - 0.33.0 (Minor) para próxima release?
4. **Confirmar processo** - Implementar tudo → apagar .md → tag v0.33.0 → push → publish?

**Responda "APROVADO" para eu começar a Fase 3, ou indique ajustes no plano.**