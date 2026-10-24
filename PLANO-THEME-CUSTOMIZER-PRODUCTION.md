# PLANO DE IMPLEMENTAÇÃO: THEME CUSTOMIZER 100% PRODUCTION-READY

**Projeto:** blacklotuscms-v2  
**Data:** 2025-10-24  
**Versão Atual:** 0.31.1  
**Próxima Versão:** 0.32.0 (Minor - novas funcionalidades)

---

## 📋 RESUMO EXECUTIVO

O Theme Customizer atual funciona para casos básicos (text, color, select, checkbox, textarea, number) mas **NÃO está production-ready** para uso real em projetos clientes. Faltam: validação robusta, tipos de campo avançados (image, wysiwyg, relationship), herança parent/child, segurança no preview, integração UI, export/import, permissões granulares, e documentação/exemplos funcionais.

Este plano cobre **TUDO** para entregar 100% completo.

---

## 🎯 FASES DE IMPLEMENTAÇÃO

### FASE 1: FUNDAÇÃO E SEGURANÇA (Crítico - Semana 1)
**Objetivo:** Base sólida, validação, segurança, integração UI mínima

| # | Item | Arquivos | Esforço | Prioridade |
|---|------|----------|---------|------------|
| 1.1 | **Validar `preview_settings` contra `manifest.settings` no web** | `apps/web/src/rendering.ts` | 2h | 🔴 P0 |
| 1.2 | **Validar config no save (`ThemeService.updateConfig`) contra schema do manifesto** | `packages/core/src/theme/service.ts` | 4h | 🔴 P0 |
| 1.3 | **Estender `ThemeSettingField` schema** (required, min/max, pattern, conditionalLogic, group, tabs, description, placeholder) | `packages/types/src/entities/index.ts`, `apps/admin/src/lib/api.ts`, `apps/api/src/routes/themes/index.ts` | 6h | 🔴 P0 |
| 1.4 | **Botão "Customize" no card do tema ativo no ThemeManager + deep link `/customize?theme=<id>`** | `apps/admin/src/components/apps/themes/ThemeManager.tsx`, `apps/admin/src/pages/customize.astro` | 3h | 🔴 P0 |
| 1.5 | **Theme:create gerar 3 settings de exemplo** (color `primaryColor`, text `siteTitle`, select `headerLayout`) | `packages/cli/src/extension-scaffold.ts` | 2h | 🟠 P1 |
| 1.6 | **Tema default usar `{{settings.theme.xxx}}` nos templates** (index.astro, page.astro, single.astro) | `themes/default/*.astro` | 2h | 🟠 P1 |

---

### FASE 2: TIPOS DE CAMPO AVANÇADOS (Core - Semana 2)
**Objetivo:** Customizer suportar todos os 21 tipos de campo que o FieldRenderer suporta

| # | Tipo | Componente | Funcionalidades | Arquivos | Esforço | Prioridade |
|---|------|------------|-----------------|----------|---------|------------|
| 2.1 | `image` / `file` / `gallery` | `MediaPickerCustomizer` | Upload, seleção da Media Library, preview, remoção, multiple para gallery | `ThemeCustomizer.tsx`, `MediaPickerCustomizer.tsx`, `apps/admin/src/lib/api.ts` (media upload) | 8h | 🔴 P0 |
| 2.2 | `wysiwyg` | `RichTextCustomizer` | Toolbar completa (formatBlock H1-H4, bold, italic, underline, lists, link), sanitização onBlur, reutiliza RichTextEditor do ContentEditor | `ThemeCustomizer.tsx`, `RichTextCustomizer.tsx`, `RichTextEditor.tsx` (compartilhado) | 8h | 🔴 P0 |
| 2.3 | `date_picker` / `date_time_picker` / `time_picker` | `DateTimeCustomizer` | Inputs nativos com value binding, formatação ISO | `ThemeCustomizer.tsx`, `DateTimeCustomizer.tsx` | 2h | 🟠 P1 |
| 2.4 | `google_map` | `GoogleMapCustomizer` | Address autocomplete (OpenStreetMap/Nominatim), lat/lng inputs, preview map iframe | `ThemeCustomizer.tsx`, `GoogleMapCustomizer.tsx` | 3h | 🟠 P1 |
| 2.5 | `link` | `LinkCustomizer` | URL + target (_self/_blank) | `ThemeCustomizer.tsx`, `LinkCustomizer.tsx` | 2h | 🟠 P1 |
| 2.6 | `relationship` / `post_object` | `RelationshipCustomizer` | Busca de conteúdo por tipo, seleção single/multiple, reutiliza RelationshipPicker | `ThemeCustomizer.tsx`, `RelationshipCustomizer.tsx` | 6h | 🟠 P1 |
| 2.7 | `taxonomy` / `user` | `EntitySelectorCustomizer` | Dropdown com busca, multi/single, reutiliza RelationshipSelector | `ThemeCustomizer.tsx`, `EntitySelectorCustomizer.tsx` | 3h | 🟡 P2 |
| 2.8 | `repeater` | `RepeaterCustomizer` | Linhas adicionáveis/removíveis/ordenáveis (drag), subcampos recursivos | `ThemeCustomizer.tsx`, `RepeaterCustomizer.tsx` | 10h | 🟡 P2 |
| 2.9 | `flexible_content` | `FlexibleContentCustomizer` | Layouts selecionáveis, cada layout com subcampos, drag-reorder rows | `ThemeCustomizer.tsx`, `FlexibleContentCustomizer.tsx` | 12h | 🟡 P2 |
| 2.10 | `group` | `GroupCustomizer` | Fieldset colapsável, tabs/accordion, subcampos | `ThemeCustomizer.tsx`, `GroupCustomizer.tsx` | 4h | 🟡 P2 |

**Infraestrutura compartilhada:**
- `RichTextEditor.tsx` — componente base reutilizado por ContentEditor + WYSIWYG customizer
- `MediaPickerCustomizer.tsx` — wrapper no MediaPickerInput existente
- `FieldRendererFactory.tsx` — factory que mapeia type → componente renderizador

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
| 4.4 | **Audit Log** | Em `updateConfig()`: `auditLog.log({ action: 'theme.config.update', resourceType: 'theme', resourceId: themeId, changes: diff(before, after), userId, ip })`. Diff usa `deep-diff` ou implementação própria. | `ThemeService.updateConfig`, `auditLog` | 3h | 🟡 P2 |
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

### Fase 1 - Entregáveis
- [ ] `preview_settings` validado no web (reject keys não declaradas)
- [ ] `updateConfig` valida schema completo (tipos, required, enum, ranges)
- [ ] `ThemeSettingField` estendido com todos metadados necessários
- [ ] Botão "Customize" no ThemeManager + deep link funcionando
- [ ] `theme:create` gera settings de exemplo
- [ ] Tema default usa settings nos templates (siteTitle, contactText, etc.)

### Fase 2 - Entregáveis
- [ ] MediaPicker (image/file/gallery) no Customizer
- [ ] Wysiwyg (RichText compartilhado) no Customizer
- [ ] Date/Time pickers
- [ ] Google Map
- [ ] Link (url + target)
- [ ] Relationship/PostObject picker
- [ ] Taxonomy/User selectors
- [ ] Repeater
- [ ] Flexible Content
- [ ] Group/Fieldset

### Fase 3 - Entregáveis
- [ ] Settings herdados parent→child (merge deep)
- [ ] Conditional logic (show/hide fields) funcionando
- [ ] Tabs/Accordion no painel lateral
- [ ] Ordenação por sort_order

### Fase 4 - Entregáveis
- [ ] Export/Import config JSON
- [ ] Histórico de versões do config (auditoria)
- [ ] Permissão `theme:customize` separada
- [ ] Audit log automático com diff
- [ ] Botão "Restore Defaults"

### Fase 5 - Entregáveis
- [ ] 100% cobertura testes unitários ThemeService
- [ ] Testes integração API + E2E Customizer
- [ ] Documentação THEME.md completa
- [ ] CHANGELOG atualizado

---

## 🔧 DETALHES TÉCNICOS CRÍTICOS

### 1. Schema Estendido `ThemeSettingField`
```typescript
// packages/types/src/entities/index.ts
export interface ThemeSettingField {
  name: string;
  type: 'text' | 'textarea' | 'select' | 'checkbox' | 'color' | 'number' 
       | 'image' | 'file' | 'gallery' | 'wysiwyg' 
       | 'date_picker' | 'date_time_picker' | 'time_picker'
       | 'google_map' | 'link' 
       | 'relationship' | 'post_object' | 'taxonomy' | 'user'
       | 'repeater' | 'flexible_content' | 'group';
  label: string;
  default?: unknown;
  options?: Array<string | { value: string; label: string }>;
  // NOVOS:
  required?: boolean;
  placeholder?: string;
  description?: string;
  min?: number; max?: number; step?: number;           // number/date
  minLength?: number; maxLength?: number;              // text/textarea
  pattern?: string;                                    // text validation regex
  conditionalLogic?: ConditionalLogic;                 // show/hide rules
  group?: string;                                      // tab/accordion group
  groupOrder?: number;                                 // order within group
  // Para repeater/flexible_content/group:
  subFields?: ThemeSettingField[];
  layouts?: { name: string; label?: string; subFields: ThemeSettingField[] }[];
}
```

### 2. Validação no Save (`ThemeService.updateConfig`)
```typescript
async updateConfig(id: string, config: unknown): Promise<Theme | null> {
  const theme = await this.getById(id);
  if (!theme) return null;
  
  const manifest = theme.manifest as ThemeManifest;
  const validated = validateThemeConfig(config, manifest.settings); // NOVA FUNÇÃO
  // validated = { valid: boolean, errors: string[], sanitized: Record<string, unknown> }
  
  if (!validated.valid) {
    throw new Error(`Theme config validation failed: ${validated.errors.join('; ')}`);
  }
  
  // Sanitiza HTML nos campos wysiwyg/textarea
  const sanitized = sanitizeThemeConfig(validated.sanitized, manifest.settings);
  
  // Persiste
  const sql = getConnection();
  const result = await sql.unsafe(...);
  return result[0] as Theme;
}
```

### 3. Herança Parent→Child (Merge Deep)
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

### 4. Preview Seguro
```typescript
// apps/web/src/rendering.ts - mergePreviewSettings()
export function mergePreviewSettings(
  saved: Record<string, unknown> | null,
  previewParam: string | undefined,
  allowedKeys: string[]  // NOVO: vindos do manifest.settings.map(s => s.name)
): Record<string, unknown> | null {
  // ... parse existente ...
  // FILTRAR: apenas chaves permitidas
  const filtered = Object.fromEntries(
    Object.entries(parsed).filter(([k]) => allowedKeys.includes(k))
  );
  return { ...(saved ?? {}), ...filtered };
}
```

---

## 📊 CRONOGRAMA ESTIMADO

| Fase | Duração | Esforço Total | Entrega Parcial |
|------|---------|---------------|-----------------|
| 1 - Fundação | 5 dias | ~19h | Customizer seguro + validado + UI integrada |
| 2 - Campos Avançados | 7 dias | ~58h | Todos 15+ tipos de campo funcionando |
| 3 - Herança/Logic | 4 dias | ~20h | Parent/child + conditional + tabs |
| 4 - Operações | 4 dias | ~25h | Export/Import + History + Permissions |
| 5 - Qualidade | 4 dias | ~26h | Testes + Docs + Polish |
| **TOTAL** | **24 dias** | **~148h** | **100% PRODUCTION-READY** |

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
- [ ] Todas as 5 fases concluídas
- [ ] `bun run test:run` → 100% passing
- [ ] `bun run build` → success
- [ ] `bun run lint` → clean
- [ ] `bun run typecheck` → clean
- [ ] `prepare-publish --check --tag v0.32.0` → success
- [ ] Tag `v0.32.0` pushada → GitHub Actions publica no npm

---

## 🚀 PROCESSO DE RELEASE FINAL

```bash
# 1. Após TODAS as fases implementadas e testadas:
bun run version-packages        # consome changesets, bumpa versões dos pacotes
# Editar package.json root: "version": "0.32.0"
bun run sync-version --write    # sincroniza CMS_VERSION
node scripts/prepare-publish.mjs --check --tag v0.32.0
bun run build && bun run test:run && bun run lint && bun run typecheck

# 2. Commit + Tag + Push
git add -A
git commit -m "feat(theme): complete production-ready Theme Customizer (v0.32.0)"
git tag v0.32.0
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
| `@oktis-works/core` | minor | ThemeService: validation, inheritance, export/import, history, audit |
| `@oktis-works/database` | patch | Migration `theme_config_versions` table |
| `@oktis-works/api` | minor | Rotas themes: export/import, validation, permission `theme:customize` |
| `@oktis-works/admin` | minor | Customizer: todos 15+ tipos, conditional logic, tabs, export/import, history UI |
| `@oktis-works/theme-runtime` | patch | `buildThemeSettings` herança parent/child |
| `@oktis-works/web` | patch | `mergePreviewSettings` validação whitelist |
| `@oktis-works/cms` | minor | CLI: theme:create com settings exemplo, theme-migrate compatibilidade |
| `@oktis-works/types` | minor | `ThemeSettingField` estendido |

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

1. **Confirmar escopo** - Todas as 5 fases conforme acima?
2. **Confirmar prioridades** - P0/P1/P2/P3 como definidas?
3. **Confirmar versão** - 0.32.0 (Minor) para próxima release?
4. **Confirmar processo** - Implementar tudo → apagar .md → tag v0.32.0 → push → publish?

**Responda "APROVADO" para eu começar a Fase 1, ou indique ajustes no plano.**